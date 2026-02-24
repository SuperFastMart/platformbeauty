import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, TextField, CircularProgress,
  Alert, ToggleButtonGroup, ToggleButton, Paper
} from '@mui/material';
import { Favorite, CheckCircle } from '@mui/icons-material';
import api from '../../api/client';

export default function TipPage() {
  const { slug, token } = useParams();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [tenantName, setTenantName] = useState('');
  const [stripeKey, setStripeKey] = useState('');
  const [alreadyTipped, setAlreadyTipped] = useState(false);
  const [error, setError] = useState('');

  const [tipOption, setTipOption] = useState(null);
  const [customTip, setCustomTip] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.get(`/t/${slug}/tip/${token}`)
      .then(({ data }) => {
        if (data.alreadyTipped) {
          setAlreadyTipped(true);
          setBooking(data.booking);
        } else {
          setBooking(data.booking);
          setTenantName(data.tenantName);
          setStripeKey(data.stripePublishableKey);
        }
      })
      .catch(err => {
        setError(err.response?.data?.error || 'This link is invalid or has expired');
      })
      .finally(() => setLoading(false));
  }, [slug, token]);

  const tipAmount = tipOption === 'custom'
    ? (parseFloat(customTip) || 0)
    : tipOption ? parseFloat(tipOption) : 0;

  const handleTip = async () => {
    if (tipAmount <= 0) return;
    setProcessing(true);
    setError('');

    try {
      // Create payment intent
      const { data } = await api.post(`/t/${slug}/tip/${token}`, { amount: tipAmount });

      if (!stripeKey) {
        setError('Online payments are not configured for this business');
        setProcessing(false);
        return;
      }

      // Load Stripe and confirm payment
      const stripe = window.Stripe?.(stripeKey);
      if (!stripe) {
        // Dynamically load Stripe.js
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://js.stripe.com/v3/';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      const stripeInstance = window.Stripe(stripeKey);

      // Use payment element to collect card details
      const elements = stripeInstance.elements({ clientSecret: data.clientSecret });
      const paymentElement = elements.create('payment');

      // Mount to a hidden container, then confirm
      const container = document.getElementById('stripe-payment-container');
      if (container) {
        paymentElement.mount(container);
        // Wait for element to be ready
        await new Promise(resolve => paymentElement.on('ready', resolve));
      }

      const { error: stripeError } = await stripeInstance.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      });

      if (stripeError) {
        setError(stripeError.message);
        setProcessing(false);
        return;
      }

      // Confirm tip on our backend
      await api.post(`/t/${slug}/tip/${token}/confirm`, { amount: tipAmount });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error && !booking) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" p={3}>
        <Alert severity="error" sx={{ maxWidth: 400 }}>{error}</Alert>
      </Box>
    );
  }

  if (alreadyTipped) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" p={3}>
        <Card sx={{ maxWidth: 420, textAlign: 'center' }}>
          <CardContent sx={{ p: 4 }}>
            <CheckCircle sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} mb={1}>
              Tip Already Received
            </Typography>
            <Typography color="text.secondary">
              Thank you — a tip of £{parseFloat(booking.tip_amount).toFixed(2)} has already been recorded for this booking.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (success) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" p={3}>
        <Card sx={{ maxWidth: 420, textAlign: 'center' }}>
          <CardContent sx={{ p: 4 }}>
            <Favorite sx={{ fontSize: 48, color: '#D4A853', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} mb={1}>
              Thank You!
            </Typography>
            <Typography color="text.secondary" mb={1}>
              Your tip of £{tipAmount.toFixed(2)} has been received. We truly appreciate your generosity.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              — {tenantName}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" p={3}>
      <Card sx={{ maxWidth: 460, width: '100%' }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Box textAlign="center" mb={3}>
            <Favorite sx={{ fontSize: 40, color: '#D4A853', mb: 1 }} />
            <Typography variant="h5" fontWeight={700}>
              Leave a Tip
            </Typography>
            <Typography color="text.secondary" mt={0.5}>
              {tenantName}
            </Typography>
          </Box>

          <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Booking:</strong> {booking.service_names}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Date:</strong> {new Date(booking.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Typography>
          </Paper>

          <Typography variant="body2" color="text.secondary" mb={2} textAlign="center">
            Your stylist would appreciate any tip you'd like to leave
          </Typography>

          <ToggleButtonGroup
            value={tipOption} exclusive fullWidth
            onChange={(_, v) => { if (v !== null) setTipOption(v); }}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="2">£2</ToggleButton>
            <ToggleButton value="5">£5</ToggleButton>
            <ToggleButton value="10">£10</ToggleButton>
            <ToggleButton value="custom">Custom</ToggleButton>
          </ToggleButtonGroup>

          {tipOption === 'custom' && (
            <TextField
              fullWidth size="small" type="number" label="Tip amount (£)"
              value={customTip} onChange={e => setCustomTip(e.target.value)}
              inputProps={{ min: 0.5, step: 0.5 }}
              sx={{ mb: 2 }}
            />
          )}

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <div id="stripe-payment-container" style={{ marginBottom: tipOption ? 16 : 0 }} />

          <Button
            variant="contained" fullWidth size="large"
            onClick={handleTip}
            disabled={!tipOption || tipAmount <= 0 || processing}
            sx={{
              bgcolor: '#D4A853', color: '#1a1a1a', fontWeight: 700,
              '&:hover': { bgcolor: '#c49a3f' },
              minHeight: 48,
            }}
          >
            {processing ? <CircularProgress size={24} /> : `Tip £${tipAmount.toFixed(2)}`}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

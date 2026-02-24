import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, TextField, CircularProgress,
  Alert, ToggleButtonGroup, ToggleButton, Grid, Paper
} from '@mui/material';
import { CardGiftcard, CheckCircle } from '@mui/icons-material';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';

const stripeCache = {};
function getStripe(key) {
  if (!stripeCache[key]) stripeCache[key] = loadStripe(key);
  return stripeCache[key];
}

function GiftCardPaymentForm({ onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    if (error) {
      onError(error.message);
    } else {
      onSuccess();
    }
    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <Button
        type="submit" variant="contained" fullWidth size="large"
        disabled={!stripe || processing}
        sx={{ mt: 2, bgcolor: '#D4A853', color: '#1a1a1a', fontWeight: 700, '&:hover': { bgcolor: '#c49a3f' }, minHeight: 48 }}
      >
        {processing ? <CircularProgress size={24} /> : 'Complete Purchase'}
      </Button>
    </form>
  );
}

export default function GiftCardPurchase() {
  const { slug } = useParams();
  const tenant = useTenant();
  const [step, setStep] = useState('form'); // form, payment, success
  const [amountOption, setAmountOption] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [form, setForm] = useState({
    senderName: '', senderEmail: '',
    recipientName: '', recipientEmail: '',
    message: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [giftCardCode, setGiftCardCode] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');

  const amount = amountOption === 'custom'
    ? (parseFloat(customAmount) || 0)
    : amountOption ? parseFloat(amountOption) : 0;

  const handlePurchase = async () => {
    if (amount <= 0) return setError('Please select an amount');
    if (!form.senderName || !form.senderEmail) return setError('Your name and email are required');
    if (!form.recipientName || !form.recipientEmail) return setError('Recipient name and email are required');

    setLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/t/${slug}/gift-cards/purchase`, {
        amount,
        senderName: form.senderName,
        senderEmail: form.senderEmail,
        recipientName: form.recipientName,
        recipientEmail: form.recipientEmail,
        message: form.message,
      });
      setClientSecret(data.clientSecret);
      setGiftCardCode(data.giftCardCode);
      setPaymentIntentId(data.paymentIntentId);
      setStep('payment');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initiate purchase');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async () => {
    try {
      await api.post(`/t/${slug}/gift-cards/confirm-purchase`, {
        paymentIntentId,
        code: giftCardCode,
        amount,
        senderName: form.senderName,
        senderEmail: form.senderEmail,
        recipientName: form.recipientName,
        recipientEmail: form.recipientEmail,
        message: form.message,
      });
      setStep('success');
    } catch (err) {
      setError(err.response?.data?.error || 'Purchase confirmation failed');
    }
  };

  if (step === 'success') {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" p={3}>
        <Card sx={{ maxWidth: 460, textAlign: 'center' }}>
          <CardContent sx={{ p: 4 }}>
            <CheckCircle sx={{ fontSize: 56, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} mb={1}>Gift Card Sent!</Typography>
            <Typography color="text.secondary" mb={2}>
              A £{amount.toFixed(2)} gift card has been emailed to <strong>{form.recipientName}</strong> at {form.recipientEmail}.
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', mb: 2 }}>
              <Typography variant="body2" color="text.secondary" mb={0.5}>Gift Card Code</Typography>
              <Typography variant="h6" fontWeight={700} sx={{ fontFamily: 'monospace', letterSpacing: 2 }}>
                {giftCardCode}
              </Typography>
            </Paper>
            <Typography variant="body2" color="text.secondary">
              They can use this code when making a booking at {tenant?.name}.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const stripeKey = tenant?.stripe_publishable_key;

  return (
    <Box display="flex" justifyContent="center" py={4} px={2}>
      <Card sx={{ maxWidth: 520, width: '100%' }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Box textAlign="center" mb={3}>
            <CardGiftcard sx={{ fontSize: 44, color: '#D4A853', mb: 1 }} />
            <Typography variant="h5" fontWeight={700}>
              Gift Card
            </Typography>
            <Typography color="text.secondary" mt={0.5}>
              Send a gift card to a friend or loved one
            </Typography>
          </Box>

          {step === 'form' && (
            <>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>Select Amount</Typography>
              <ToggleButtonGroup
                value={amountOption} exclusive fullWidth
                onChange={(_, v) => { if (v !== null) setAmountOption(v); }}
                sx={{ mb: 2 }}
              >
                <ToggleButton value="25">£25</ToggleButton>
                <ToggleButton value="50">£50</ToggleButton>
                <ToggleButton value="100">£100</ToggleButton>
                <ToggleButton value="custom">Custom</ToggleButton>
              </ToggleButtonGroup>

              {amountOption === 'custom' && (
                <TextField
                  fullWidth size="small" type="number" label="Amount (£)"
                  value={customAmount} onChange={e => setCustomAmount(e.target.value)}
                  inputProps={{ min: 5, step: 5 }}
                  sx={{ mb: 2 }}
                />
              )}

              <Typography variant="subtitle2" fontWeight={600} mb={1} mt={2}>Your Details</Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth size="small" label="Your Name" required
                    value={form.senderName} onChange={e => setForm(f => ({ ...f, senderName: e.target.value }))} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth size="small" label="Your Email" type="email" required
                    value={form.senderEmail} onChange={e => setForm(f => ({ ...f, senderEmail: e.target.value }))} />
                </Grid>
              </Grid>

              <Typography variant="subtitle2" fontWeight={600} mb={1} mt={2}>Recipient Details</Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth size="small" label="Recipient Name" required
                    value={form.recipientName} onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth size="small" label="Recipient Email" type="email" required
                    value={form.recipientEmail} onChange={e => setForm(f => ({ ...f, recipientEmail: e.target.value }))} />
                </Grid>
              </Grid>

              <TextField
                fullWidth size="small" label="Personal Message (optional)" multiline rows={2}
                value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                sx={{ mt: 1.5 }}
                placeholder="Happy birthday! Enjoy a treatment on me..."
              />

              {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

              <Button
                variant="contained" fullWidth size="large"
                onClick={handlePurchase}
                disabled={!amountOption || amount <= 0 || loading}
                sx={{ mt: 3, bgcolor: '#D4A853', color: '#1a1a1a', fontWeight: 700, '&:hover': { bgcolor: '#c49a3f' }, minHeight: 48 }}
              >
                {loading ? <CircularProgress size={24} /> : `Purchase £${amount.toFixed(2)} Gift Card`}
              </Button>
            </>
          )}

          {step === 'payment' && clientSecret && stripeKey && (
            <Elements stripe={getStripe(stripeKey)} options={{ clientSecret }}>
              <Typography variant="subtitle2" fontWeight={600} mb={2}>
                £{amount.toFixed(2)} Gift Card for {form.recipientName}
              </Typography>
              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
              <GiftCardPaymentForm
                onSuccess={handlePaymentSuccess}
                onError={msg => setError(msg)}
              />
              <Button
                variant="text" fullWidth onClick={() => { setStep('form'); setError(''); }}
                sx={{ mt: 1 }}
              >
                Go Back
              </Button>
            </Elements>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

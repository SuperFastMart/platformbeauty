import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Card, CardContent, CircularProgress, Alert, Chip, Divider } from '@mui/material';
import { CheckCircle, Schedule, CreditCard, ErrorOutline } from '@mui/icons-material';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';
import CardSetupForm from '../../components/CardSetupForm';

const stripeCache = {};
const getStripePromise = (key) => {
  if (!stripeCache[key]) stripeCache[key] = loadStripe(key);
  return stripeCache[key];
};

export default function CardConfirmation() {
  const { slug, token } = useParams();
  const tenant = useTenant();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [setupIntent, setSetupIntent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadyConfirmed, setAlreadyConfirmed] = useState(false);

  useEffect(() => {
    api.get(`/t/${slug}/bookings/confirm-card/${token}`)
      .then(({ data }) => {
        if (data.booking.status !== 'pending_confirmation') {
          setAlreadyConfirmed(true);
          setBooking(data.booking);
        } else {
          setBooking(data.booking);
          // Create SetupIntent
          return api.post(`/t/${slug}/bookings/confirm-card/${token}/setup-intent`);
        }
      })
      .then(res => {
        if (res?.data) {
          setSetupIntent(res.data);
        }
      })
      .catch(err => {
        const msg = err.response?.data?.error;
        if (msg === 'Confirmation link has expired') {
          setError('This confirmation link has expired. Please contact the business to request a new one.');
        } else if (err.response?.status === 404) {
          setError('This confirmation link is not valid. It may have already been used or the booking no longer exists.');
        } else {
          setError(msg || 'Something went wrong. Please try again later.');
        }
      })
      .finally(() => setLoading(false));
  }, [slug, token]);

  const handleCardSaved = async (paymentMethodId) => {
    setSaving(true);
    try {
      await api.post(`/t/${slug}/bookings/confirm-card/${token}/save-card`, {
        paymentMethodId,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save card. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const primaryColor = tenant?.primary_color || '#8B2635';

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box maxWidth={500} mx="auto" mt={6} px={2}>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <ErrorOutline sx={{ fontSize: 48, color: 'error.main', mb: 2 }} />
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Unable to Confirm
            </Typography>
            <Typography color="text.secondary">{error}</Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (success) {
    return (
      <Box maxWidth={500} mx="auto" mt={6} px={2}>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircle sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Booking Confirmed
            </Typography>
            <Typography color="text.secondary" mb={2}>
              Your card has been saved and your appointment is now confirmed.
              You won't be charged — this is only for no-show protection.
            </Typography>
            {booking && (
              <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2, mt: 2 }}>
                <Typography fontWeight={600}>{booking.service_names}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {dayjs(booking.date).format('dddd, D MMMM YYYY')} at {booking.start_time?.slice(0, 5)}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (alreadyConfirmed) {
    return (
      <Box maxWidth={500} mx="auto" mt={6} px={2}>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircle sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Already Confirmed
            </Typography>
            <Typography color="text.secondary">
              This booking has already been confirmed. No further action is needed.
            </Typography>
            {booking && (
              <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2, mt: 2 }}>
                <Typography fontWeight={600}>{booking.service_names}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {dayjs(booking.date).format('dddd, D MMMM YYYY')} at {booking.start_time?.slice(0, 5)}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box maxWidth={500} mx="auto" mt={4} px={2} pb={4}>
      <Typography variant="h5" fontWeight={700} textAlign="center" mb={1}>
        Confirm Your Booking
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
        Save a card to confirm your appointment with {tenant?.name}
      </Typography>

      {/* Booking summary */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Schedule sx={{ color: 'text.secondary', fontSize: 20 }} />
            <Typography fontWeight={600}>Appointment Details</Typography>
          </Box>

          <Typography variant="body2" fontWeight={500}>
            {booking.service_names}
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {dayjs(booking.date).format('dddd, D MMMM YYYY')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {booking.start_time?.slice(0, 5)} – {booking.end_time?.slice(0, 5)}
          </Typography>

          {booking.total_price && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Total</Typography>
                <Typography variant="body2" fontWeight={600}>
                  £{parseFloat(booking.total_price).toFixed(2)}
                </Typography>
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      {/* Card form */}
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <CreditCard sx={{ color: 'text.secondary', fontSize: 20 }} />
            <Typography fontWeight={600}>Save Card</Typography>
          </Box>

          <Alert severity="info" sx={{ mb: 2 }}>
            Your card will <strong>not</strong> be charged. It's saved securely for no-show protection only.
            A fee will only apply if you miss your appointment without cancelling.
          </Alert>

          {setupIntent && (
            <Elements stripe={getStripePromise(setupIntent.stripePublishableKey)}>
              <CardSetupForm
                clientSecret={setupIntent.clientSecret}
                onSuccess={handleCardSaved}
                primaryColor={primaryColor}
              />
            </Elements>
          )}

          {saving && (
            <Box display="flex" justifyContent="center" mt={2}>
              <CircularProgress size={24} />
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

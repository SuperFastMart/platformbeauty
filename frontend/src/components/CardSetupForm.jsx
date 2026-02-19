import { useState } from 'react';
import { Box, Typography, Button, Alert, CircularProgress } from '@mui/material';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

export default function CardSetupForm({ clientSecret, onSuccess, primaryColor }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError('');

    const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: elements.getElement(CardElement) },
    });

    if (stripeError) {
      setError(stripeError.message);
      setLoading(false);
      return;
    }

    if (setupIntent.status === 'succeeded') {
      onSuccess(setupIntent.payment_method);
    }
    setLoading(false);
  };

  const cardStyle = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': { color: '#aab7c4' },
      },
      invalid: { color: '#9e2146' },
    },
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Typography variant="subtitle2" color="text.secondary" mb={2}>
        A card on file is required to secure your booking. You won't be charged now — this is only used for no-show protection.
      </Typography>

      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, mb: 2 }}>
        <CardElement options={cardStyle} />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Button
        type="submit"
        variant="contained"
        disabled={!stripe || loading}
        fullWidth
      >
        {loading ? <CircularProgress size={20} /> : 'Save Card & Complete Booking'}
      </Button>
    </Box>
  );
}

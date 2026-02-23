import { useState } from 'react';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { Box, Button, Typography, Alert, CircularProgress } from '@mui/material';

const cardStyle = {
  style: {
    base: {
      fontSize: '16px',
      color: '#333',
      fontFamily: '"Inter", "Roboto", sans-serif',
      '::placeholder': { color: '#999' },
    },
    invalid: { color: '#d32f2f' },
  },
};

export default function DepositPaymentForm({ clientSecret, depositAmount, onSuccess, disabled }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handlePay = async () => {
    if (!stripe || !elements) return;

    setProcessing(true);
    setError('');

    const cardElement = elements.getElement(CardElement);
    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (stripeError) {
      setError(stripeError.message);
      setProcessing(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      onSuccess(paymentIntent.id);
    } else {
      setError('Payment was not completed. Please try again.');
      setProcessing(false);
    }
  };

  return (
    <Box>
      <Box
        sx={{
          p: 2,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: '#fafafa',
          mb: 2,
        }}
      >
        <CardElement options={cardStyle} />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      <Button
        variant="contained"
        fullWidth
        onClick={handlePay}
        disabled={!stripe || processing || disabled}
        sx={{ minHeight: 48, fontWeight: 600, fontSize: '1rem' }}
      >
        {processing ? (
          <CircularProgress size={22} color="inherit" />
        ) : (
          `Confirm & Pay £${depositAmount.toFixed(2)} Deposit`
        )}
      </Button>

      <Typography variant="caption" color="text.secondary" textAlign="center" display="block" mt={1}>
        Remaining balance payable at your appointment
      </Typography>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, Alert, CircularProgress, Chip, TextField
} from '@mui/material';
import api from '../api/client';

export default function NoShowChargeModal({ open, onClose, booking, onSuccess }) {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [charging, setCharging] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [chargePercent, setChargePercent] = useState(100);
  const [customAmount, setCustomAmount] = useState('');

  const bookingPrice = booking ? parseFloat(booking.total_price) : 0;
  const chargeAmount = customAmount ? parseFloat(customAmount) : (bookingPrice * chargePercent / 100);

  useEffect(() => {
    if (!open || !booking) return;
    setLoading(true);
    setError('');
    setSuccess(false);
    setChargePercent(100);
    setCustomAmount('');

    api.get(`/admin/bookings/${booking.id}/payment-methods`)
      .then(({ data }) => setPaymentMethods(data))
      .catch(() => setError('Could not load payment methods'))
      .finally(() => setLoading(false));
  }, [open, booking]);

  const handleCharge = async () => {
    if (!paymentMethods.length) return;
    setCharging(true);
    setError('');

    try {
      await api.post(`/admin/bookings/${booking.id}/charge-noshow`, {
        paymentMethodId: paymentMethods[0].id,
        amount: chargeAmount,
      });
      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to charge card');
    } finally {
      setCharging(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Charge No-Show Fee</DialogTitle>
      <DialogContent>
        {booking && (
          <Box mb={2}>
            <Typography variant="body2"><strong>Customer:</strong> {booking.customer_name}</Typography>
            <Typography variant="body2"><strong>Service:</strong> {booking.service_names}</Typography>
            <Typography variant="body2"><strong>Booking Total:</strong> £{bookingPrice.toFixed(2)}</Typography>
          </Box>
        )}

        {loading ? (
          <Box textAlign="center" py={2}><CircularProgress /></Box>
        ) : paymentMethods.length === 0 ? (
          <Alert severity="warning">No saved payment method found for this customer.</Alert>
        ) : (
          <>
            <Typography variant="subtitle2" mb={1}>Saved Card</Typography>
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, mb: 2 }}>
              <Typography variant="body2">
                {paymentMethods[0].brand?.toUpperCase()} •••• {paymentMethods[0].last4}
                {' '}(exp {paymentMethods[0].expMonth}/{paymentMethods[0].expYear})
              </Typography>
            </Box>

            <Typography variant="subtitle2" mb={1}>Charge Amount</Typography>
            <Box display="flex" gap={1} mb={2}>
              {[50, 75, 100].map(pct => (
                <Chip
                  key={pct}
                  label={`${pct}% — £${(bookingPrice * pct / 100).toFixed(2)}`}
                  onClick={() => { setChargePercent(pct); setCustomAmount(''); }}
                  variant={!customAmount && chargePercent === pct ? 'filled' : 'outlined'}
                  color={!customAmount && chargePercent === pct ? 'primary' : 'default'}
                />
              ))}
            </Box>
            <TextField
              size="small" label="Custom amount (£)" type="number"
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value)}
              inputProps={{ min: 0, max: bookingPrice, step: 0.01 }}
              sx={{ width: 180 }}
            />

            <Box mt={2} p={2} bgcolor="warning.light" borderRadius={1}>
              <Typography variant="body2" fontWeight={600}>
                Charge: £{chargeAmount.toFixed(2)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                This will charge the customer's saved card immediately.
              </Typography>
            </Box>
          </>
        )}

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mt: 2 }}>No-show fee charged successfully!</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained" color="error"
          onClick={handleCharge}
          disabled={charging || loading || paymentMethods.length === 0 || success}
        >
          {charging ? <CircularProgress size={20} /> : `Charge £${chargeAmount.toFixed(2)}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Button, TextField,
  ToggleButton, ToggleButtonGroup, Snackbar, Alert, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider
} from '@mui/material';
import { Check, Close, SwapHoriz, CurrencyPound, CreditCardOff, CreditCard, Add } from '@mui/icons-material';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import NoShowChargeModal from '../../components/NoShowChargeModal';

const statusColors = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'success',
  rejected: 'error',
  cancelled: 'default',
};

export default function Bookings() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // No-show modal
  const [noshowBooking, setNoshowBooking] = useState(null);

  // Complete service dialog
  const [completeDialog, setCompleteDialog] = useState(false);
  const [completeBooking, setCompleteBooking] = useState(null);
  const [completeLoading, setCompleteLoading] = useState(false);

  // Reject dialog
  const [rejectDialog, setRejectDialog] = useState(false);
  const [rejectBookingId, setRejectBookingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectAlternative, setRejectAlternative] = useState('');

  // Request response dialog
  const [requestDialog, setRequestDialog] = useState(false);
  const [currentRequest, setCurrentRequest] = useState(null);
  const [requestResponse, setRequestResponse] = useState('');

  const fetchBookings = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (statusFilter !== 'all') params.append('status', statusFilter);

    Promise.all([
      api.get(`/admin/bookings?${params}`),
      api.get('/admin/bookings/requests?status=pending'),
    ])
      .then(([bookingsRes, requestsRes]) => {
        setBookings(bookingsRes.data);
        setRequests(requestsRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchBookings(); }, [date, statusFilter]);

  const updateStatus = async (id, status, reason, alternative) => {
    try {
      await api.put(`/admin/bookings/${id}/status`, { status, reason, alternative });
      setSnackbar({ open: true, message: `Booking ${status}`, severity: 'success' });
      fetchBookings();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error', severity: 'error' });
    }
  };

  const openRejectDialog = (id) => {
    setRejectBookingId(id);
    setRejectReason('');
    setRejectAlternative('');
    setRejectDialog(true);
  };

  const handleReject = () => {
    updateStatus(rejectBookingId, 'rejected', rejectReason, rejectAlternative);
    setRejectDialog(false);
  };

  const handleCashPayment = async (id) => {
    try {
      await api.post(`/admin/bookings/${id}/cash-payment`);
      setSnackbar({ open: true, message: 'Cash payment recorded', severity: 'success' });
      fetchBookings();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error', severity: 'error' });
    }
  };

  const handleChargeComplete = async () => {
    if (!completeBooking) return;
    setCompleteLoading(true);
    try {
      // Get payment methods
      const { data: methods } = await api.get(`/admin/bookings/${completeBooking.id}/payment-methods`);
      if (!methods.length) {
        setSnackbar({ open: true, message: 'No saved card found for this customer', severity: 'error' });
        setCompleteDialog(false);
        setCompleteLoading(false);
        return;
      }
      await api.post(`/admin/bookings/${completeBooking.id}/charge-complete`, {
        paymentMethodId: methods[0].id,
      });
      setSnackbar({ open: true, message: 'Card charged — service completed', severity: 'success' });
      setCompleteDialog(false);
      fetchBookings();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Charge failed', severity: 'error' });
    } finally {
      setCompleteLoading(false);
    }
  };

  const handleRequestAction = async (action) => {
    try {
      await api.post(`/admin/bookings/requests/${currentRequest.id}/${action}`, {
        adminResponse: requestResponse,
      });
      setSnackbar({ open: true, message: `Request ${action}d`, severity: 'success' });
      setRequestDialog(false);
      fetchBookings();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error', severity: 'error' });
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Bookings</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/admin/bookings/create')}>
          Create Booking
        </Button>
      </Box>

      {/* Pending Booking Requests */}
      {requests.length > 0 && (
        <Box mb={4}>
          <Typography variant="subtitle1" fontWeight={600} mb={1} display="flex" alignItems="center" gap={1}>
            <SwapHoriz color="warning" />
            Customer Requests ({requests.length})
          </Typography>
          {requests.map(r => (
            <Card key={r.id} sx={{ mb: 1.5, borderLeft: 3, borderColor: 'warning.main' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box display="flex" justifyContent="space-between" alignItems="start">
                  <Box>
                    <Typography fontWeight={600}>
                      {r.request_type === 'cancel' ? 'Cancellation' : 'Amendment'} — {r.customer_name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {r.service_names} — {dayjs(r.booking_date).format('D MMM YYYY')} at {r.booking_time?.slice(0, 5)}
                    </Typography>
                    {r.reason && <Typography variant="body2" mt={0.5}>Reason: {r.reason}</Typography>}
                    {r.requested_date && (
                      <Typography variant="body2">
                        Wants: {dayjs(r.requested_date).format('D MMM YYYY')} at {r.requested_time?.slice(0, 5)}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {parseFloat(r.hours_notice).toFixed(0)}h notice — submitted {dayjs(r.created_at).format('D MMM HH:mm')}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1}>
                    <Button size="small" variant="contained" color="success"
                      onClick={() => { setCurrentRequest(r); setRequestResponse(''); setRequestDialog(true); }}>
                      Review
                    </Button>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
          <Divider sx={{ mt: 2 }} />
        </Box>
      )}

      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap" alignItems="center">
        <TextField
          type="date" size="small" label="Date"
          value={date} onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <ToggleButtonGroup
          value={statusFilter} exclusive
          onChange={(e, v) => v && setStatusFilter(v)}
          size="small"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="pending">Pending</ToggleButton>
          <ToggleButton value="confirmed">Confirmed</ToggleButton>
          <ToggleButton value="rejected">Rejected</ToggleButton>
        </ToggleButtonGroup>
        <Button variant="text" size="small" onClick={() => { setDate(''); setStatusFilter('all'); }}>
          Clear Filters
        </Button>
      </Box>

      {/* Booking cards */}
      {loading ? (
        <Typography>Loading...</Typography>
      ) : bookings.length === 0 ? (
        <Typography color="text.secondary">No bookings found</Typography>
      ) : (
        <Grid container spacing={2}>
          {bookings.map(b => (
            <Grid item xs={12} md={6} key={b.id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={1}>
                    <Box>
                      <Typography fontWeight={600}>{b.customer_name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {b.customer_email} {b.customer_phone && `| ${b.customer_phone}`}
                      </Typography>
                    </Box>
                    <Chip label={b.status} color={statusColors[b.status] || 'default'} size="small" />
                  </Box>

                  <Typography variant="body2" mt={1}>
                    {b.service_names}
                  </Typography>

                  <Box display="flex" gap={2} mt={1} flexWrap="wrap" alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      {dayjs(b.date).format('ddd D MMM YYYY')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {b.start_time?.slice(0, 5)} - {b.end_time?.slice(0, 5)}
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      £{parseFloat(b.total_price).toFixed(2)}
                    </Typography>
                    {b.discount_code && (
                      <Chip
                        label={`${b.discount_code} -£${parseFloat(b.discount_amount).toFixed(2)}`}
                        size="small" color="success" variant="outlined"
                      />
                    )}
                  </Box>

                  {b.notes && (
                    <Typography variant="body2" color="text.secondary" mt={1} fontStyle="italic">
                      Note: {b.notes}
                    </Typography>
                  )}

                  {b.status === 'pending' && (
                    <Box display="flex" gap={1} mt={2}>
                      <Button
                        size="small" variant="contained" color="success"
                        startIcon={<Check />}
                        onClick={() => updateStatus(b.id, 'confirmed')}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small" variant="outlined" color="error"
                        startIcon={<Close />}
                        onClick={() => openRejectDialog(b.id)}
                      >
                        Reject
                      </Button>
                    </Box>
                  )}

                  {b.status === 'confirmed' && (
                    <Box display="flex" gap={1} mt={2} flexWrap="wrap">
                      <Button
                        size="small" variant="contained" color="success"
                        startIcon={<CreditCard />}
                        onClick={() => { setCompleteBooking(b); setCompleteDialog(true); }}
                      >
                        Complete
                      </Button>
                      <Button
                        size="small" variant="contained"
                        startIcon={<CurrencyPound />}
                        onClick={() => handleCashPayment(b.id)}
                      >
                        Cash Paid
                      </Button>
                      <Button
                        size="small" variant="outlined" color="error"
                        startIcon={<CreditCardOff />}
                        onClick={() => setNoshowBooking(b)}
                      >
                        No-Show
                      </Button>
                    </Box>
                  )}

                  {b.marked_noshow && (
                    <Chip label="No-Show" size="small" color="error" variant="outlined" sx={{ mt: 1 }} />
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialog} onClose={() => setRejectDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Booking</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Reason for rejection (optional)" margin="normal"
            value={rejectReason} onChange={e => setRejectReason(e.target.value)} multiline rows={2} />
          <TextField fullWidth label="Suggest alternative (optional)" margin="normal"
            value={rejectAlternative} onChange={e => setRejectAlternative(e.target.value)}
            placeholder="e.g. Try Tuesday at 2pm instead" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialog(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleReject}>Reject Booking</Button>
        </DialogActions>
      </Dialog>

      {/* Request Review Dialog */}
      <Dialog open={requestDialog} onClose={() => setRequestDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Review Customer Request</DialogTitle>
        <DialogContent>
          {currentRequest && (
            <Box mb={2}>
              <Chip label={currentRequest.request_type === 'cancel' ? 'Cancellation' : 'Amendment'}
                size="small" color="warning" sx={{ mb: 1 }} />
              <Typography variant="body2"><strong>Customer:</strong> {currentRequest.customer_name}</Typography>
              <Typography variant="body2"><strong>Booking:</strong> {currentRequest.service_names}</Typography>
              <Typography variant="body2">
                <strong>Date:</strong> {dayjs(currentRequest.booking_date).format('D MMM YYYY')} at {currentRequest.booking_time?.slice(0, 5)}
              </Typography>
              {currentRequest.reason && (
                <Typography variant="body2"><strong>Reason:</strong> {currentRequest.reason}</Typography>
              )}
              {currentRequest.requested_date && (
                <Typography variant="body2">
                  <strong>Requested:</strong> {dayjs(currentRequest.requested_date).format('D MMM YYYY')} at {currentRequest.requested_time?.slice(0, 5)}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {parseFloat(currentRequest.hours_notice).toFixed(0)} hours notice
              </Typography>
            </Box>
          )}
          <TextField fullWidth label="Response to customer (optional)" margin="normal"
            value={requestResponse} onChange={e => setRequestResponse(e.target.value)} multiline rows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRequestDialog(false)}>Close</Button>
          <Button variant="outlined" color="error" onClick={() => handleRequestAction('reject')}>
            Reject
          </Button>
          <Button variant="contained" color="success" onClick={() => handleRequestAction('approve')}>
            Approve
          </Button>
        </DialogActions>
      </Dialog>

      {/* Complete Service Dialog */}
      <Dialog open={completeDialog} onClose={() => !completeLoading && setCompleteDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Complete Service</DialogTitle>
        <DialogContent>
          {completeBooking && (
            <Box>
              <Typography variant="body2" mb={1}>
                <strong>{completeBooking.customer_name}</strong> — {completeBooking.service_names}
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                {dayjs(completeBooking.date).format('D MMM YYYY')} at {completeBooking.start_time?.slice(0, 5)}
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                Charge: £{parseFloat(completeBooking.total_price).toFixed(2)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                The customer's saved card will be charged the full amount.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteDialog(false)} disabled={completeLoading}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleChargeComplete} disabled={completeLoading}>
            {completeLoading ? 'Charging...' : 'Charge Card'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* No-Show Charge Modal */}
      <NoShowChargeModal
        open={!!noshowBooking}
        onClose={() => setNoshowBooking(null)}
        booking={noshowBooking}
        onSuccess={() => {
          setSnackbar({ open: true, message: 'No-show charge processed', severity: 'success' });
          fetchBookings();
        }}
      />

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

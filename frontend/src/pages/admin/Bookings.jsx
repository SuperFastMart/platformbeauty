import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Button, TextField,
  ToggleButton, ToggleButtonGroup, Snackbar, Alert, Grid, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider,
  useMediaQuery, useTheme, Tooltip
} from '@mui/material';
import { Check, Close, SwapHoriz, CurrencyPound, CreditCardOff, CreditCard, Add, Upload, ReportProblem, ListAlt, CalendarMonth, ChevronLeft, ChevronRight, Repeat, DeleteSweep, FilterList } from '@mui/icons-material';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import NoShowChargeModal from '../../components/NoShowChargeModal';
import BookingImportDialog from '../../components/BookingImportDialog';
import BookingDetailDrawer from '../../components/BookingDetailDrawer';
import ConfirmDialog from '../../components/ConfirmDialog';
import RecurringDetectionDialog from '../../components/RecurringDetectionDialog';
import WeekCalendar from '../../components/WeekCalendar';
import useTerminology from '../../hooks/useTerminology';
import useCurrency, { formatCurrency } from '../../hooks/useCurrency';

const statusColors = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'success',
  rejected: 'error',
  cancelled: 'default',
  pending_confirmation: 'info',
};
const statusLabels = { pending_confirmation: 'Awaiting Card' };

export default function Bookings() {
  const { person } = useTerminology();
  const currency = useCurrency();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [deleteImportedOpen, setDeleteImportedOpen] = useState(false);
  const [deletingImported, setDeletingImported] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
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

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [detectRecurringOpen, setDetectRecurringOpen] = useState(false);

  // Booking detail drawer
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  // Calendar view
  const [viewMode, setViewMode] = useState('list');
  const [weekStart, setWeekStart] = useState(dayjs().startOf('isoWeek'));
  const [categoryColors, setCategoryColors] = useState({});

  // Load category colours from site settings
  useEffect(() => {
    api.get('/admin/site-settings').then(({ data }) => {
      if (data.category_colors) {
        const colors = typeof data.category_colors === 'string' ? JSON.parse(data.category_colors) : data.category_colors;
        setCategoryColors(colors);
      }
    }).catch(() => {});
  }, []);

  // Auto-assign colours to new categories from bookings
  useEffect(() => {
    if (bookings.length === 0) return;
    const palette = ['#E91E63', '#2196F3', '#9C27B0', '#FF9800', '#4CAF50', '#00BCD4', '#F44336', '#3F51B5', '#8BC34A', '#FF5722'];
    const categories = [...new Set(bookings.map(b => b.primary_category).filter(Boolean))];
    const newColors = { ...categoryColors };
    let changed = false;
    let nextIdx = Object.keys(newColors).length;
    for (const cat of categories) {
      if (!newColors[cat]) {
        newColors[cat] = palette[nextIdx % palette.length];
        nextIdx++;
        changed = true;
      }
    }
    if (changed) {
      setCategoryColors(newColors);
      api.put('/admin/site-settings', { category_colors: newColors }).catch(() => {});
    }
  }, [bookings]);

  const fetchBookings = () => {
    setLoading(true);
    const params = new URLSearchParams();

    if (viewMode === 'week') {
      params.append('from', weekStart.format('YYYY-MM-DD'));
      params.append('to', weekStart.add(6, 'day').format('YYYY-MM-DD'));
    } else {
      if (date) params.append('date', date);
    }
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (sourceFilter !== 'all') params.append('source', sourceFilter);

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

  useEffect(() => { fetchBookings(); }, [date, statusFilter, sourceFilter, viewMode, weekStart]);

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

  const handleDeleteImported = async () => {
    setDeletingImported(true);
    try {
      const res = await api.delete('/admin/bookings/bulk-delete-imported');
      setSnackbar({ open: true, message: res.data.message, severity: 'success' });
      setDeleteImportedOpen(false);
      fetchBookings();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error deleting', severity: 'error' });
    } finally {
      setDeletingImported(false);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={600}>Bookings</Typography>
        <Box display="flex" gap={1} alignItems="center">
          <ToggleButtonGroup value={viewMode} exclusive onChange={(_, v) => v && setViewMode(v)} size="small">
            <ToggleButton value="list"><ListAlt sx={{ fontSize: 18 }} /></ToggleButton>
            <ToggleButton value="week"><CalendarMonth sx={{ fontSize: 18 }} /></ToggleButton>
          </ToggleButtonGroup>
          <Button variant="outlined" size="small" startIcon={<Upload />} onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button variant="outlined" size="small" startIcon={<Repeat />} onClick={() => setDetectRecurringOpen(true)}>
            {isMobile ? '' : 'Recurring'}
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/admin/bookings/create')} sx={{ minHeight: 44 }}>
            {isMobile ? 'New' : 'Create Booking'}
          </Button>
        </Box>
      </Box>

      {/* Week navigation (calendar view) */}
      {viewMode === 'week' && (
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <IconButton size="small" onClick={() => setWeekStart(s => s.subtract(1, 'week'))}><ChevronLeft /></IconButton>
          <Button size="small" variant="text" onClick={() => setWeekStart(dayjs().startOf('isoWeek'))}>Today</Button>
          <Typography fontWeight={600} variant="body2">
            {weekStart.format('D')} – {weekStart.add(6, 'day').format('D MMM YYYY')}
          </Typography>
          <IconButton size="small" onClick={() => setWeekStart(s => s.add(1, 'week'))}><ChevronRight /></IconButton>
        </Box>
      )}

      {/* Pending Booking Requests */}
      {requests.length > 0 && (
        <Box mb={4}>
          <Typography variant="subtitle1" fontWeight={600} mb={1} display="flex" alignItems="center" gap={1}>
            <SwapHoriz color="warning" />
            {person} Requests ({requests.length})
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
          <ToggleButton value="all" sx={{ px: { xs: 1, sm: 2 } }}>All</ToggleButton>
          <ToggleButton value="pending" sx={{ px: { xs: 1, sm: 2 } }}>Pending</ToggleButton>
          <ToggleButton value="confirmed" sx={{ px: { xs: 1, sm: 2 } }}>Confirmed</ToggleButton>
          <ToggleButton value="rejected" sx={{ px: { xs: 1, sm: 2 } }}>Rejected</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          value={sourceFilter} exclusive
          onChange={(e, v) => v && setSourceFilter(v)}
          size="small"
        >
          <ToggleButton value="all" sx={{ px: { xs: 1, sm: 2 } }}>All Sources</ToggleButton>
          <ToggleButton value="import" sx={{ px: { xs: 1, sm: 2 } }}>Imported</ToggleButton>
          <ToggleButton value="direct" sx={{ px: { xs: 1, sm: 2 } }}>Direct</ToggleButton>
        </ToggleButtonGroup>
        <Button variant="text" size="small" onClick={() => { setDate(''); setStatusFilter('all'); setSourceFilter('all'); }}>
          Clear Filters
        </Button>
        {sourceFilter === 'import' && (
          <Button
            variant="outlined"
            size="small"
            color="error"
            startIcon={<DeleteSweep />}
            onClick={() => setDeleteImportedOpen(true)}
          >
            Delete All Imported
          </Button>
        )}
      </Box>

      {/* Calendar view */}
      {viewMode === 'week' && (
        <WeekCalendar
          bookings={bookings}
          weekStart={weekStart}
          loading={loading}
          categoryColors={categoryColors}
          onBookingClick={(id) => setSelectedBookingId(id)}
          onEmptySlotClick={(date, time) => navigate('/admin/bookings/create', { state: { date, time } })}
        />
      )}

      {/* Booking cards (list view) */}
      {viewMode === 'list' && (loading ? (
        <Typography>Loading...</Typography>
      ) : bookings.length === 0 ? (
        <Typography color="text.secondary">No bookings found</Typography>
      ) : (
        <Grid container spacing={2}>
          {bookings.map(b => (
            <Grid item xs={12} md={6} key={b.id}>
              <Card sx={{ cursor: 'pointer', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.08)' } }}
                onClick={() => setSelectedBookingId(b.id)}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={1}>
                    <Box>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <Typography fontWeight={600}>{b.customer_name}</Typography>
                        {b.customer_allergies && (
                          <Tooltip title={`Allergies: ${b.customer_allergies}`} arrow>
                            <ReportProblem sx={{ fontSize: 18, color: 'warning.main' }} />
                          </Tooltip>
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {b.customer_email} {b.customer_phone && `| ${b.customer_phone}`}
                      </Typography>
                    </Box>
                    <Chip label={statusLabels[b.status] || b.status} color={statusColors[b.status] || 'default'} size="small" />
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
                      {formatCurrency(b.total_price, currency)}
                    </Typography>
                    {b.discount_code && (
                      <Chip
                        label={`${b.discount_code} -${formatCurrency(b.discount_amount, currency)}`}
                        size="small" color="success" variant="outlined"
                      />
                    )}
                  </Box>

                  {b.notes && (
                    <Typography variant="body2" color="text.secondary" mt={1} fontStyle="italic">
                      Note: {b.notes}
                    </Typography>
                  )}

                  {parseFloat(b.deposit_amount) > 0 && (
                    <Chip
                      label={`Deposit: ${formatCurrency(b.deposit_amount, currency)} (${b.deposit_status})`}
                      size="small"
                      color={b.deposit_status === 'paid' ? 'info' : 'warning'}
                      sx={{ mt: 1 }}
                    />
                  )}

                  {b.intake_responses && Array.isArray(b.intake_responses) && b.intake_responses.length > 0 && (
                    <Box mt={1.5} p={1.5} bgcolor="grey.50" borderRadius={2}>
                      <Typography variant="caption" fontWeight={600} color="text.secondary" mb={0.5} display="block">
                        Intake Responses
                      </Typography>
                      {b.intake_responses.map((r, i) => (
                        <Box key={i} mb={i < b.intake_responses.length - 1 ? 0.5 : 0}>
                          <Typography variant="caption" color="text.secondary">{r.question_text}</Typography>
                          <Typography variant="body2" fontWeight={500}>
                            {Array.isArray(r.answer) ? r.answer.join(', ') : r.answer || '—'}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}

                  {b.status === 'pending' && (
                    <Box display="flex" gap={1} mt={2} onClick={e => e.stopPropagation()}>
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
                    <Box display="flex" gap={1} mt={2} flexWrap="wrap" onClick={e => e.stopPropagation()}>
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
      ))}

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
        <DialogTitle>Review {person} Request</DialogTitle>
        <DialogContent>
          {currentRequest && (
            <Box mb={2}>
              <Chip label={currentRequest.request_type === 'cancel' ? 'Cancellation' : 'Amendment'}
                size="small" color="warning" sx={{ mb: 1 }} />
              <Typography variant="body2"><strong>{person}:</strong> {currentRequest.customer_name}</Typography>
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
          <TextField fullWidth label={`Response to ${person.toLowerCase()} (optional)`} margin="normal"
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
                Charge: {formatCurrency(completeBooking.total_price, currency)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                The {person.toLowerCase()}'s saved card will be charged the full amount.
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

      {/* Booking Import Dialog */}
      <BookingImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={fetchBookings}
      />

      {/* Recurring Detection Dialog */}
      <RecurringDetectionDialog
        open={detectRecurringOpen}
        onClose={() => setDetectRecurringOpen(false)}
        onComplete={fetchBookings}
      />

      {/* Delete Imported Confirmation */}
      <ConfirmDialog
        open={deleteImportedOpen}
        onClose={() => setDeleteImportedOpen(false)}
        onConfirm={handleDeleteImported}
        title="Delete All Imported Bookings"
        message="This will permanently delete all bookings that were imported (booking source = import). This action cannot be undone."
        confirmLabel="Delete All Imported"
        confirmColor="error"
        warning="This is a destructive action. Manual and online bookings will not be affected."
        loading={deletingImported}
      />

      {/* Booking Detail Drawer */}
      <BookingDetailDrawer
        open={!!selectedBookingId}
        bookingId={selectedBookingId}
        onClose={() => setSelectedBookingId(null)}
        onUpdate={fetchBookings}
      />

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Chip, Button, TextField, IconButton, Divider,
  Autocomplete, CircularProgress, Checkbox, FormControlLabel, Switch,
  Accordion, AccordionSummary, AccordionDetails, Alert, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import {
  Close, Edit, Save, ArrowBack, ExpandMore, Check, CreditCard,
  CurrencyPound, CreditCardOff, ReportProblem, Event, AccessTime,
  Person, ContentCut, Send, Email, Sms, Repeat, Delete, Add
} from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../api/client';
import CalendarGrid from './CalendarGrid';
import useTerminology from '../hooks/useTerminology';
import useCurrency, { formatCurrency } from '../hooks/useCurrency';

const statusColors = {
  pending: 'warning', confirmed: 'success', completed: 'success',
  rejected: 'error', cancelled: 'default', pending_confirmation: 'info',
};
const statusLabels = { pending_confirmation: 'Awaiting Card' };

export default function BookingDetailDrawer({ open, bookingId, onClose, onUpdate }) {
  const { person } = useTerminology();
  const currency = useCurrency();
  const [booking, setBooking] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Edit state
  const [allServices, setAllServices] = useState([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [editDate, setEditDate] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(dayjs());
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [editTime, setEditTime] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [priceOverride, setPriceOverride] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);

  // Delete booking
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add service panel
  const [addServiceOpen, setAddServiceOpen] = useState(false);

  // Slots for time picker
  const [slots, setSlots] = useState([]);
  const [slotsLoading2, setSlotsLoading2] = useState(false);

  // Recurring edit scope dialog
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [pendingSaveBody, setPendingSaveBody] = useState(null);

  // Communication log
  const [comms, setComms] = useState([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [sendingNotification, setSendingNotification] = useState(false);

  // Customer search
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    if (!open || !bookingId) {
      setBooking(null);
      setIsEditing(false);
      return;
    }
    setLoading(true);
    setError('');
    api.get(`/admin/bookings/${bookingId}`)
      .then(({ data }) => {
        setBooking(data);
        setServices(data.services || []);
      })
      .catch(() => setError('Failed to load booking'))
      .finally(() => setLoading(false));
    // Fetch communication log
    setCommsLoading(true);
    api.get(`/admin/bookings/${bookingId}/communications`)
      .then(({ data }) => setComms(data))
      .catch(() => setComms([]))
      .finally(() => setCommsLoading(false));
  }, [open, bookingId]);

  const handleSendNotification = async () => {
    setSendingNotification(true);
    try {
      const { data } = await api.post(`/admin/bookings/${bookingId}/send-notification`);
      setError('');
      // Refresh comms log
      api.get(`/admin/bookings/${bookingId}/communications`)
        .then(({ data: c }) => setComms(c)).catch(() => {});
      // Temporarily show success via the error state (repurpose with a success alert)
      setBooking(prev => ({ ...prev, _notificationSent: true }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send notification');
    } finally {
      setSendingNotification(false);
    }
  };

  // Enter edit mode
  const startEditing = () => {
    if (!booking) return;
    setSelectedServiceIds(booking.service_ids ? booking.service_ids.split(',').map(Number) : []);
    const dateStr = dayjs(booking.date).format('YYYY-MM-DD');
    setEditDate(dateStr);
    setCalendarMonth(dayjs(booking.date));
    setEditTime(booking.start_time?.slice(0, 5) || '');
    setEditNotes(booking.notes || '');
    setEditPrice(parseFloat(booking.total_price).toFixed(2));
    setPriceOverride(false);
    setNotifyCustomer(true);
    setSelectedCustomer({
      id: booking.customer_id, name: booking.customer_name,
      email: booking.customer_email, phone: booking.customer_phone,
    });
    // Load all services
    api.get('/admin/services').then(({ data }) => setAllServices(data)).catch(() => {});
    setIsEditing(true);
  };

  // Fetch slots when date changes in edit mode
  useEffect(() => {
    if (!isEditing || !editDate) return;
    setSlotsLoading(true);
    api.get(`/admin/slots?date=${editDate}`)
      .then(({ data }) => { setAvailableSlots(data); setSlots(data); })
      .catch(() => { setAvailableSlots([]); setSlots([]); })
      .finally(() => setSlotsLoading(false));
  }, [isEditing, editDate]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/admin/bookings/${bookingId}`);
      setDeleteConfirm(false);
      onUpdate?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete booking');
      setDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  // Customer search
  useEffect(() => {
    if (!customerSearch || customerSearch.length < 2) return;
    const t = setTimeout(() => {
      api.get(`/admin/customers/search?q=${encodeURIComponent(customerSearch)}`)
        .then(({ data }) => setCustomerOptions(data))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  // Compute selected services total
  const selectedServicesData = useMemo(() => {
    return allServices.filter(s => selectedServiceIds.includes(s.id));
  }, [allServices, selectedServiceIds]);

  const computedPrice = useMemo(() => {
    return selectedServicesData.reduce((sum, s) => sum + parseFloat(s.price || 0), 0);
  }, [selectedServicesData]);

  const computedDuration = useMemo(() => {
    return selectedServicesData.reduce((sum, s) => sum + (s.duration || 0), 0);
  }, [selectedServicesData]);

  // Group services by category
  const servicesByCategory = useMemo(() => {
    const groups = {};
    allServices.filter(s => s.active).forEach(s => {
      const cat = s.category || 'Uncategorised';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, [allServices]);

  const buildSaveBody = () => {
    const body = {
      serviceIds: selectedServiceIds,
      date: editDate,
      startTime: editTime,
      notes: editNotes,
      notifyCustomer,
    };
    if (selectedCustomer?.id && selectedCustomer.id !== booking.customer_id) {
      body.customerId = selectedCustomer.id;
      body.customerName = selectedCustomer.name;
      body.customerEmail = selectedCustomer.email;
      body.customerPhone = selectedCustomer.phone;
    }
    if (priceOverride) {
      body.priceOverride = parseFloat(editPrice);
    }
    return body;
  };

  const executeSave = async (body) => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/admin/bookings/${bookingId}`, body);
      setBooking(data);
      setServices([]);
      setIsEditing(false);
      if (onUpdate) onUpdate();
      api.get(`/admin/bookings/${bookingId}`).then(({ data: d }) => {
        setBooking(d);
        setServices(d.services || []);
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (selectedServiceIds.length === 0) {
      setError('Please select at least one service');
      return;
    }
    if (!editDate || !editTime) {
      setError('Please select a date and time');
      return;
    }

    const body = buildSaveBody();

    // If booking is recurring, ask about scope
    if (booking.is_recurring && booking.recurring_group_id) {
      setPendingSaveBody(body);
      setScopeDialogOpen(true);
      return;
    }

    await executeSave(body);
  };

  const handleScopeChoice = async (scope) => {
    setScopeDialogOpen(false);
    if (pendingSaveBody) {
      await executeSave({ ...pendingSaveBody, updateScope: scope });
      setPendingSaveBody(null);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <Box
        onClick={onClose}
        sx={{
          position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,0.3)',
          zIndex: 1299, opacity: open ? 1 : 0, transition: 'opacity 0.3s ease',
        }}
      />

      {/* Drawer panel */}
      <Box
        sx={{
          position: 'fixed', right: 0, top: 0, height: '100vh',
          width: { xs: '100%', md: '540px' }, bgcolor: 'background.paper',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.12)', zIndex: 1300,
          overflowY: 'auto', transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
        }}
      >
        {/* Header */}
        <Box display="flex" alignItems="center" gap={1} p={2} borderBottom={1} borderColor="divider" position="sticky" top={0} bgcolor="background.paper" zIndex={1}>
          {isEditing ? (
            <IconButton onClick={() => setIsEditing(false)} size="small"><ArrowBack /></IconButton>
          ) : null}
          <Typography variant="h6" fontWeight={600} flex={1} noWrap>
            {isEditing ? 'Edit Booking' : (booking?.customer_name || 'Booking Detail')}
          </Typography>
          {booking && !isEditing && (
            <Chip
              label={statusLabels[booking.status] || booking.status}
              color={statusColors[booking.status] || 'default'}
              size="small"
            />
          )}
          <IconButton onClick={onClose} size="small"><Close /></IconButton>
        </Box>

        <Box p={3}>
          {loading && (
            <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
          )}

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {booking && !loading && !isEditing && (
            <>
              {/* Payment policy alert */}
              {booking.status === 'pending_confirmation' && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Awaiting card confirmation — the {person.toLowerCase()} has been sent a link to save their card.
                </Alert>
              )}

              {/* Notification sent success */}
              {booking._notificationSent && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setBooking(prev => ({ ...prev, _notificationSent: false }))}>
                  Notification sent successfully
                </Alert>
              )}

              {/* Customer */}
              <Box mb={2.5}>
                <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                  <Person sx={{ fontSize: 18, color: 'text.secondary' }} />
                  <Typography variant="subtitle2" color="text.secondary">{person}</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={0.5}>
                  <Typography fontWeight={600}>{booking.customer_name}</Typography>
                  {booking.customer_allergies && (
                    <Tooltip title={`Allergies: ${booking.customer_allergies}`} arrow>
                      <ReportProblem sx={{ fontSize: 18, color: 'warning.main' }} />
                    </Tooltip>
                  )}
                </Box>
                {booking.customer_email && (
                  <Typography variant="body2" color="text.secondary">{booking.customer_email}</Typography>
                )}
                {booking.customer_phone && (
                  <Typography variant="body2" color="text.secondary">{booking.customer_phone}</Typography>
                )}
              </Box>

              <Divider sx={{ mb: 2.5 }} />

              {/* Services */}
              <Box mb={2.5}>
                <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                  <ContentCut sx={{ fontSize: 18, color: 'text.secondary' }} />
                  <Typography variant="subtitle2" color="text.secondary">Services</Typography>
                </Box>
                {services.length > 0 ? services.map(s => (
                  <Box key={s.id} display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2">{s.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {s.duration}min — {formatCurrency(s.price, currency)}
                    </Typography>
                  </Box>
                )) : (
                  <Typography variant="body2">{booking.service_names}</Typography>
                )}
              </Box>

              <Divider sx={{ mb: 2.5 }} />

              {/* Date & Time */}
              <Box mb={2.5}>
                <Box display="flex" gap={3}>
                  <Box>
                    <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                      <Event sx={{ fontSize: 18, color: 'text.secondary' }} />
                      <Typography variant="subtitle2" color="text.secondary">Date</Typography>
                    </Box>
                    <Typography variant="body2">{dayjs(booking.date).format('ddd D MMM YYYY')}</Typography>
                  </Box>
                  <Box>
                    <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                      <AccessTime sx={{ fontSize: 18, color: 'text.secondary' }} />
                      <Typography variant="subtitle2" color="text.secondary">Time</Typography>
                    </Box>
                    <Typography variant="body2">
                      {booking.start_time?.slice(0, 5)} – {booking.end_time?.slice(0, 5)} ({booking.total_duration}min)
                    </Typography>
                  </Box>
                </Box>
              </Box>

              <Divider sx={{ mb: 2.5 }} />

              {/* Price */}
              <Box mb={2.5}>
                <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{currency.symbol}</Typography>
                  <Typography variant="subtitle2" color="text.secondary">Price</Typography>
                </Box>
                <Typography variant="h6" fontWeight={700}>
                  {formatCurrency(booking.total_price, currency)}
                </Typography>
                {parseFloat(booking.deposit_amount) > 0 && (
                  <Chip
                    label={`Deposit: ${formatCurrency(booking.deposit_amount, currency)} (${booking.deposit_status})`}
                    size="small" color={booking.deposit_status === 'paid' ? 'info' : 'warning'}
                    sx={{ mt: 0.5 }}
                  />
                )}
                {booking.discount_code && (
                  <Chip
                    label={`${booking.discount_code} -${formatCurrency(booking.discount_amount, currency)}`}
                    size="small" color="success" variant="outlined" sx={{ mt: 0.5, ml: 0.5 }}
                  />
                )}
              </Box>

              {/* Notes */}
              {booking.notes && (
                <>
                  <Divider sx={{ mb: 2.5 }} />
                  <Box mb={2.5}>
                    <Typography variant="subtitle2" color="text.secondary" mb={0.5}>Notes</Typography>
                    <Typography variant="body2" fontStyle="italic">{booking.notes}</Typography>
                  </Box>
                </>
              )}

              {/* Recurring info */}
              {booking.is_recurring && (
                <>
                  <Divider sx={{ mb: 2.5 }} />
                  <Box mb={2.5} display="flex" alignItems="center" gap={1}>
                    <Repeat sx={{ fontSize: 18, color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      Recurring — {booking.recurring_frequency === 'weekly' ? 'Weekly' : booking.recurring_frequency === 'fortnightly' ? 'Fortnightly' : booking.recurring_frequency === '4-weekly' ? 'Every 4 weeks' : booking.recurring_frequency === 'monthly' ? 'Monthly' : booking.recurring_frequency}
                    </Typography>
                  </Box>
                </>
              )}

              {/* Intake responses */}
              {booking.intake_responses && Array.isArray(booking.intake_responses) && booking.intake_responses.length > 0 && (
                <>
                  <Divider sx={{ mb: 2.5 }} />
                  <Box mb={2.5} p={1.5} bgcolor="grey.50" borderRadius={2}>
                    <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.5}>
                      Intake Responses
                    </Typography>
                    {booking.intake_responses.map((r, i) => (
                      <Box key={i} mb={0.5}>
                        <Typography variant="caption" color="text.secondary">{r.question_text}</Typography>
                        <Typography variant="body2" fontWeight={500}>
                          {Array.isArray(r.answer) ? r.answer.join(', ') : r.answer || '—'}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              )}

              <Divider sx={{ mb: 2.5 }} />

              {/* Actions */}
              <Box display="flex" gap={1} flexWrap="wrap">
                {['pending', 'confirmed', 'pending_confirmation'].includes(booking.status) && (
                  <Button variant="outlined" startIcon={<Edit />} onClick={startEditing}>
                    Edit
                  </Button>
                )}

                {booking.status === 'pending' && (
                  <>
                    <Button variant="contained" color="success" startIcon={<Check />}
                      onClick={async () => {
                        await api.put(`/admin/bookings/${bookingId}/status`, { status: 'confirmed' });
                        onUpdate?.();
                        api.get(`/admin/bookings/${bookingId}`).then(({ data }) => { setBooking(data); setServices(data.services || []); });
                      }}>
                      Approve
                    </Button>
                  </>
                )}

                {booking.status === 'pending_confirmation' && (
                  <>
                    <Button variant="contained" color="success" startIcon={<Check />}
                      onClick={async () => {
                        await api.put(`/admin/bookings/${bookingId}/status`, { status: 'confirmed' });
                        onUpdate?.();
                        api.get(`/admin/bookings/${bookingId}`).then(({ data }) => { setBooking(data); setServices(data.services || []); });
                      }}>
                      Confirm Without Card
                    </Button>
                    <Button variant="outlined" size="small" startIcon={<Send />}
                      onClick={handleSendNotification} disabled={sendingNotification}>
                      {sendingNotification ? 'Sending...' : 'Resend Card Link'}
                    </Button>
                  </>
                )}

                {booking.status === 'confirmed' && (
                  <>
                    <Button variant="outlined" size="small" startIcon={<Send />}
                      onClick={handleSendNotification} disabled={sendingNotification}>
                      {sendingNotification ? 'Sending...' : 'Send Confirmation'}
                    </Button>
                    <Button variant="contained" color="success" size="small" startIcon={<CreditCard />}
                      onClick={async () => {
                        try {
                          const { data: methods } = await api.get(`/admin/bookings/${bookingId}/payment-methods`);
                          if (!methods.length) { setError('No saved card found'); return; }
                          await api.post(`/admin/bookings/${bookingId}/charge-complete`, { paymentMethodId: methods[0].id });
                          onUpdate?.();
                          api.get(`/admin/bookings/${bookingId}`).then(({ data }) => { setBooking(data); setServices(data.services || []); });
                        } catch (err) { setError(err.response?.data?.error || 'Charge failed'); }
                      }}>
                      Complete
                    </Button>
                    <Button variant="contained" size="small" startIcon={<CurrencyPound />}
                      onClick={async () => {
                        try {
                          await api.post(`/admin/bookings/${bookingId}/cash-payment`);
                          onUpdate?.();
                          api.get(`/admin/bookings/${bookingId}`).then(({ data }) => { setBooking(data); setServices(data.services || []); });
                        } catch (err) { setError(err.response?.data?.error || 'Error'); }
                      }}>
                      Cash Paid
                    </Button>
                    <Button variant="outlined" size="small" color="error" startIcon={<CreditCardOff />}
                      onClick={() => { /* Open no-show modal from parent */ }}>
                      No-Show
                    </Button>
                  </>
                )}
              </Box>

              {/* Delete booking */}
              <Box mt={2}>
                <Button variant="outlined" color="error" size="small" startIcon={<Delete />}
                  onClick={() => setDeleteConfirm(true)}>
                  Delete Booking
                </Button>
              </Box>

              {/* Meta info */}
              <Box mt={3} pt={2} borderTop={1} borderColor="divider">
                <Typography variant="caption" color="text.secondary">
                  Created {dayjs(booking.created_at).format('D MMM YYYY HH:mm')} · {booking.created_by === 'admin' ? 'By admin' : 'By customer'}
                  {booking.booking_source && booking.booking_source !== 'direct' && ` · Source: ${booking.booking_source}`}
                </Typography>
              </Box>

              {/* Communication History */}
              <Box mt={3} pt={2} borderTop={1} borderColor="divider">
                <Typography variant="subtitle2" fontWeight={600} mb={1}>
                  Communication History
                </Typography>
                {commsLoading ? (
                  <Box display="flex" justifyContent="center" py={2}><CircularProgress size={20} /></Box>
                ) : comms.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No messages sent for this booking</Typography>
                ) : (
                  comms.map((c, i) => (
                    <Box key={`${c.channel}-${c.id}`} sx={{ mb: 1.5, p: 1.5, bgcolor: 'grey.50', borderRadius: 1.5 }}>
                      <Box display="flex" alignItems="center" gap={0.5} mb={0.3}>
                        {c.channel === 'email' ? (
                          <Email sx={{ fontSize: 14, color: 'info.main' }} />
                        ) : (
                          <Sms sx={{ fontSize: 14, color: 'success.main' }} />
                        )}
                        <Typography variant="caption" fontWeight={600}>
                          {(c.email_type || c.sms_type || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </Typography>
                        <Chip
                          label={c.status || 'sent'}
                          size="small"
                          color={c.status === 'sent' ? 'success' : c.status === 'failed' ? 'error' : 'default'}
                          sx={{ height: 18, fontSize: '0.65rem', ml: 'auto' }}
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {c.subject || c.message_preview || (c.channel === 'email' ? c.recipient_email : c.recipient_phone)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {dayjs(c.created_at).format('D MMM YYYY HH:mm')}
                        {c.status === 'failed' && c.error_message && (
                          <Typography component="span" variant="caption" color="error.main"> — {c.error_message}</Typography>
                        )}
                      </Typography>
                    </Box>
                  ))
                )}
              </Box>
            </>
          )}

          {/* EDIT MODE */}
          {booking && isEditing && (
            <>
              {/* Customer picker */}
              <Box mb={3}>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>{person}</Typography>
                <Autocomplete
                  size="small"
                  options={customerOptions}
                  getOptionLabel={o => `${o.name}${o.email ? ` (${o.email})` : ''}${o.phone ? ` ${o.phone}` : ''}`}
                  value={selectedCustomer}
                  onChange={(_, v) => v && setSelectedCustomer(v)}
                  onInputChange={(_, v) => setCustomerSearch(v)}
                  isOptionEqualToValue={(o, v) => o.id === v.id}
                  renderInput={(params) => <TextField {...params} placeholder="Search customer..." />}
                  freeSolo={false}
                />
              </Box>

              {/* Service picker */}
              <Box mb={3}>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Services</Typography>
                {/* Selected services */}
                {selectedServicesData.map(s => (
                  <Box key={s.id} display="flex" justifyContent="space-between" alignItems="center"
                    py={0.75} px={1} mb={0.5} bgcolor="action.hover" borderRadius={1.5}>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{s.duration}min · {formatCurrency(s.price, currency)}</Typography>
                    </Box>
                    <IconButton size="small" onClick={() => setSelectedServiceIds(prev => prev.filter(id => id !== s.id))}>
                      <Close fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                {selectedServicesData.length > 0 && (
                  <Typography variant="body2" color="text.secondary" mb={1}>
                    Total: {computedDuration}min · {formatCurrency(computedPrice, currency)}
                  </Typography>
                )}
                {/* Add service */}
                <Accordion expanded={addServiceOpen} onChange={(_, v) => setAddServiceOpen(v)}
                  sx={{ boxShadow: 'none', border: '1px dashed', borderColor: 'divider', borderRadius: '8px !important', '&:before': { display: 'none' } }}>
                  <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Add fontSize="small" color="primary" />
                      <Typography variant="body2" color="primary.main" fontWeight={500}>Add service</Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0, maxHeight: 260, overflowY: 'auto' }}>
                    {Object.entries(servicesByCategory).map(([cat, catServices]) => {
                      const available = catServices.filter(s => !selectedServiceIds.includes(s.id));
                      if (!available.length) return null;
                      return (
                        <Box key={cat} mb={1}>
                          <Typography variant="caption" fontWeight={700} color="text.secondary"
                            sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat}</Typography>
                          {available.map(s => (
                            <Box key={s.id} display="flex" justifyContent="space-between" alignItems="center"
                              py={0.5} px={0.5} sx={{ cursor: 'pointer', borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
                              onClick={() => { setSelectedServiceIds(prev => [...prev, s.id]); }}>
                              <Typography variant="body2">{s.name}</Typography>
                              <Typography variant="caption" color="text.secondary" ml={1}>{s.duration}min · {formatCurrency(s.price, currency)}</Typography>
                            </Box>
                          ))}
                        </Box>
                      );
                    })}
                  </AccordionDetails>
                </Accordion>
              </Box>

              {/* Date & Time */}
              <Box mb={3}>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Date & Time</Typography>
                <TextField
                  type="date" size="small" fullWidth label="Date"
                  value={editDate}
                  onChange={e => {
                    setEditDate(e.target.value);
                    if (e.target.value) setCalendarMonth(dayjs(e.target.value));
                  }}
                  InputLabelProps={{ shrink: true }}
                  sx={{ mb: 1.5 }}
                />
                <CalendarGrid
                  calendarMonth={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  selectedDate={editDate}
                  onDateSelect={(d) => { setEditDate(d); setCalendarMonth(dayjs(d)); }}
                  disablePast={false}
                  compact
                />
                <Box mt={2}>
                  <TextField
                    type="time" size="small" label="Appointment time"
                    value={editTime} onChange={e => setEditTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                    helperText="Any time — not limited to available slots"
                    sx={{ minWidth: 160 }}
                  />
                  {slotsLoading && <CircularProgress size={14} sx={{ ml: 1, mt: 1.5 }} />}
                  {!slotsLoading && slots.length > 0 && (
                    <Box mt={1}>
                      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                        Available slots:
                      </Typography>
                      <Box display="flex" flexWrap="wrap" gap={0.5}>
                        {slots.map(slot => (
                          <Chip key={slot.id} label={slot.start_time.slice(0, 5)} size="small"
                            variant={editTime === slot.start_time.slice(0, 5) ? 'filled' : 'outlined'}
                            color={editTime === slot.start_time.slice(0, 5) ? 'primary' : 'default'}
                            onClick={() => setEditTime(slot.start_time.slice(0, 5))}
                            sx={{ cursor: 'pointer' }}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Price */}
              <Box mb={3}>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Price</Typography>
                <FormControlLabel
                  control={<Switch size="small" checked={priceOverride} onChange={e => {
                    setPriceOverride(e.target.checked);
                    if (!e.target.checked) setEditPrice(computedPrice.toFixed(2));
                  }} />}
                  label={<Typography variant="body2">Custom price</Typography>}
                />
                {priceOverride && (
                  <TextField
                    size="small" type="number" fullWidth
                    label={`Price (${currency.symbol})`} value={editPrice}
                    onChange={e => setEditPrice(e.target.value)}
                    inputProps={{ min: 0, step: 0.01 }}
                    sx={{ mt: 1 }}
                  />
                )}
                {!priceOverride && (
                  <Typography variant="body2" color="text.secondary">
                    {formatCurrency(computedPrice, currency)} (from services)
                  </Typography>
                )}
              </Box>

              {/* Notes */}
              <Box mb={3}>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Notes</Typography>
                <TextField
                  fullWidth multiline rows={3} size="small"
                  placeholder="Add notes..."
                  value={editNotes} onChange={e => setEditNotes(e.target.value)}
                />
              </Box>

              {/* Notify toggle */}
              <FormControlLabel
                control={<Switch checked={notifyCustomer} onChange={e => setNotifyCustomer(e.target.checked)} />}
                label={<Typography variant="body2">Notify {person.toLowerCase()} of changes</Typography>}
                sx={{ mb: 3 }}
              />

              {/* Save */}
              <Box display="flex" gap={1}>
                <Button variant="contained" fullWidth startIcon={<Save />} onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outlined" onClick={() => setIsEditing(false)} disabled={saving}>
                  Cancel
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Booking?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>This cannot be undone.</Alert>
          <Typography>
            Permanently delete this booking for <strong>{booking?.customer_name}</strong>?
            {['pending', 'confirmed', 'pending_confirmation'].includes(booking?.status) && (
              ' The time slot will be freed up.'
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(false)} disabled={deleting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Recurring edit scope dialog */}
      <Dialog open={scopeDialogOpen} onClose={() => setScopeDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Edit Recurring Booking</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This booking is part of a recurring series ({booking?.recurring_frequency === 'weekly' ? 'Weekly' : booking?.recurring_frequency === 'fortnightly' ? 'Fortnightly' : booking?.recurring_frequency === '4-weekly' ? 'Every 4 weeks' : booking?.recurring_frequency === 'monthly' ? 'Monthly' : booking?.recurring_frequency}). Would you like to update just this appointment, or this and all future appointments in the series?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setScopeDialogOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={() => handleScopeChoice('this')} variant="outlined">Just This One</Button>
          <Button onClick={() => handleScopeChoice('future')} variant="contained">This &amp; Future</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

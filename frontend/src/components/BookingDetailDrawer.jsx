import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Chip, Button, TextField, IconButton, Divider,
  Autocomplete, CircularProgress, Checkbox, FormControlLabel, Switch,
  Accordion, AccordionSummary, AccordionDetails, Alert, Tooltip
} from '@mui/material';
import {
  Close, Edit, Save, ArrowBack, ExpandMore, Check, CreditCard,
  CurrencyPound, CreditCardOff, ReportProblem, Event, AccessTime,
  Person, ContentCut, AttachMoney
} from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../api/client';
import CalendarGrid from './CalendarGrid';
import TimeSlotPicker from './TimeSlotPicker';
import useTerminology from '../hooks/useTerminology';

const statusColors = {
  pending: 'warning', confirmed: 'success', completed: 'success',
  rejected: 'error', cancelled: 'default', pending_confirmation: 'info',
};
const statusLabels = { pending_confirmation: 'Awaiting Card' };

export default function BookingDetailDrawer({ open, bookingId, onClose, onUpdate }) {
  const { person } = useTerminology();
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
  }, [open, bookingId]);

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
      .then(({ data }) => setAvailableSlots(data))
      .catch(() => setAvailableSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [isEditing, editDate]);

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

  const handleSave = async () => {
    if (selectedServiceIds.length === 0) {
      setError('Please select at least one service');
      return;
    }
    if (!editDate || !editTime) {
      setError('Please select a date and time');
      return;
    }
    setSaving(true);
    setError('');
    try {
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
      const { data } = await api.put(`/admin/bookings/${bookingId}`, body);
      setBooking(data);
      setServices([]); // Will re-fetch
      setIsEditing(false);
      if (onUpdate) onUpdate();
      // Re-fetch to get services
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
                      {s.duration}min — £{parseFloat(s.price).toFixed(2)}
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
                  <AttachMoney sx={{ fontSize: 18, color: 'text.secondary' }} />
                  <Typography variant="subtitle2" color="text.secondary">Price</Typography>
                </Box>
                <Typography variant="h6" fontWeight={700}>
                  £{parseFloat(booking.total_price).toFixed(2)}
                </Typography>
                {parseFloat(booking.deposit_amount) > 0 && (
                  <Chip
                    label={`Deposit: £${parseFloat(booking.deposit_amount).toFixed(2)} (${booking.deposit_status})`}
                    size="small" color={booking.deposit_status === 'paid' ? 'info' : 'warning'}
                    sx={{ mt: 0.5 }}
                  />
                )}
                {booking.discount_code && (
                  <Chip
                    label={`${booking.discount_code} -£${parseFloat(booking.discount_amount).toFixed(2)}`}
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
                  <Button variant="contained" color="success" startIcon={<Check />}
                    onClick={async () => {
                      await api.put(`/admin/bookings/${bookingId}/status`, { status: 'confirmed' });
                      onUpdate?.();
                      api.get(`/admin/bookings/${bookingId}`).then(({ data }) => { setBooking(data); setServices(data.services || []); });
                    }}>
                    Confirm Without Card
                  </Button>
                )}

                {booking.status === 'confirmed' && (
                  <>
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

              {/* Meta info */}
              <Box mt={3} pt={2} borderTop={1} borderColor="divider">
                <Typography variant="caption" color="text.secondary">
                  Created {dayjs(booking.created_at).format('D MMM YYYY HH:mm')} · {booking.created_by === 'admin' ? 'By admin' : 'By customer'}
                  {booking.booking_source && booking.booking_source !== 'direct' && ` · Source: ${booking.booking_source}`}
                </Typography>
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
                <Typography variant="subtitle2" fontWeight={600} mb={1}>
                  Services ({selectedServiceIds.length})
                </Typography>
                {Object.entries(servicesByCategory).map(([cat, catServices]) => (
                  <Accordion key={cat} defaultExpanded={catServices.some(s => selectedServiceIds.includes(s.id))}
                    sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: '8px !important', mb: 1, '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                      <Typography variant="body2" fontWeight={500}>{cat}</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                      {catServices.map(s => (
                        <FormControlLabel key={s.id}
                          control={
                            <Checkbox size="small" checked={selectedServiceIds.includes(s.id)}
                              onChange={(e) => {
                                setSelectedServiceIds(prev =>
                                  e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                                );
                              }}
                            />
                          }
                          label={
                            <Box display="flex" justifyContent="space-between" width="100%">
                              <Typography variant="body2">{s.name}</Typography>
                              <Typography variant="body2" color="text.secondary" ml={1}>{s.duration}min · £{parseFloat(s.price).toFixed(2)}</Typography>
                            </Box>
                          }
                          sx={{ display: 'flex', width: '100%', mr: 0 }}
                        />
                      ))}
                    </AccordionDetails>
                  </Accordion>
                ))}
                {selectedServiceIds.length > 0 && (
                  <Typography variant="body2" color="text.secondary" mt={1}>
                    {selectedServiceIds.length} service{selectedServiceIds.length > 1 ? 's' : ''} · {computedDuration}min · £{computedPrice.toFixed(2)}
                  </Typography>
                )}
              </Box>

              {/* Date & Time */}
              <Box mb={3}>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Date & Time</Typography>
                <CalendarGrid
                  calendarMonth={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  selectedDate={editDate}
                  onDateSelect={setEditDate}
                  compact
                />
                <Box mt={2}>
                  <TimeSlotPicker
                    slots={availableSlots}
                    selectedSlot={editTime}
                    onSlotSelect={setEditTime}
                    loading={slotsLoading}
                    totalDuration={computedDuration}
                  />
                  {!slotsLoading && availableSlots.length === 0 && editDate && (
                    <Box mt={1}>
                      <Typography variant="caption" color="text.secondary">
                        No pre-generated slots. Enter time manually:
                      </Typography>
                      <TextField
                        type="time" size="small" fullWidth
                        value={editTime} onChange={e => setEditTime(e.target.value)}
                        sx={{ mt: 0.5 }}
                      />
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
                    label="Price (£)" value={editPrice}
                    onChange={e => setEditPrice(e.target.value)}
                    inputProps={{ min: 0, step: 0.01 }}
                    sx={{ mt: 1 }}
                  />
                )}
                {!priceOverride && (
                  <Typography variant="body2" color="text.secondary">
                    £{computedPrice.toFixed(2)} (from services)
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
    </>
  );
}

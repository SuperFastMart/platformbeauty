import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Stepper, Step, StepLabel, Button, Card, CardContent,
  TextField, Checkbox, Chip, Alert, CircularProgress, IconButton, Grid,
  Accordion, AccordionSummary, AccordionDetails, ThemeProvider, createTheme, CssBaseline
} from '@mui/material';
import { ChevronLeft, ChevronRight, ExpandMore, CheckCircle } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';

const steps = ['Services', 'Date', 'Time', 'Details', 'Confirm'];

function groupSlotsByPeriod(slots) {
  const morning = [], afternoon = [], evening = [];
  for (const slot of slots) {
    const hour = parseInt(slot.start_time?.slice(0, 2));
    if (hour < 12) morning.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }
  return { morning, afternoon, evening };
}

export default function BookingWidget() {
  const { slug } = useParams();
  const [tenant, setTenant] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [allServices, setAllServices] = useState([]);
  const [grouped, setGrouped] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [error, setError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(dayjs().startOf('month'));

  // Create theme from tenant settings
  const theme = useMemo(() => createTheme({
    palette: {
      primary: { main: tenant?.primary_color || '#8B2635' },
      secondary: { main: '#D4A853' },
    },
    typography: { fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif' },
  }), [tenant?.primary_color]);

  // Load tenant info
  useEffect(() => {
    api.get(`/t/${slug}/info`).then(({ data }) => setTenant(data)).catch(() => {});
  }, [slug]);

  // Load services
  useEffect(() => {
    api.get(`/t/${slug}/services`)
      .then(({ data }) => { setAllServices(data.services); setGrouped(data.grouped); })
      .catch(console.error);
  }, [slug]);

  // Load slots when date changes
  useEffect(() => {
    if (!selectedDate) return;
    setSlotsLoading(true);
    api.get(`/t/${slug}/slots?date=${selectedDate}`)
      .then(({ data }) => setSlots(data))
      .catch(console.error)
      .finally(() => setSlotsLoading(false));
  }, [slug, selectedDate]);

  const selectedServices = allServices.filter(s => selectedIds.includes(s.id));
  const totalPrice = selectedServices.reduce((sum, s) => sum + parseFloat(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);

  const availableSlots = useMemo(() => {
    if (slots.length === 0 || totalDuration <= 0) return slots;
    const first = slots[0];
    if (!first?.start_time || !first?.end_time) return slots;
    const startMins = parseInt(first.start_time.slice(0, 2)) * 60 + parseInt(first.start_time.slice(3, 5));
    const endMins = parseInt(first.end_time.slice(0, 2)) * 60 + parseInt(first.end_time.slice(3, 5));
    const slotDuration = endMins - startMins || 30;
    const slotsNeeded = Math.ceil(totalDuration / slotDuration);
    if (slotsNeeded <= 1) return slots;
    return slots.filter((slot, i) => {
      if (i + slotsNeeded > slots.length) return false;
      for (let j = 1; j < slotsNeeded; j++) {
        const prev = slots[i + j - 1];
        const next = slots[i + j];
        if (prev.end_time?.slice(0, 5) !== next.start_time?.slice(0, 5)) return false;
      }
      return true;
    });
  }, [slots, totalDuration]);

  const slotGroups = useMemo(() => groupSlotsByPeriod(availableSlots), [availableSlots]);

  const computedEndTime = useMemo(() => {
    if (!selectedSlot || totalDuration <= 0) return null;
    const [h, m] = selectedSlot.split(':').map(Number);
    const endMinutes = h * 60 + m + totalDuration;
    return `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
  }, [selectedSlot, totalDuration]);

  const toggleService = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const calendarDays = useMemo(() => {
    const start = calendarMonth.startOf('week');
    const end = calendarMonth.endOf('month').endOf('week');
    const days = [];
    let current = start;
    while (current.isBefore(end) || current.isSame(end, 'day')) {
      days.push(current);
      current = current.add(1, 'day');
    }
    return days;
  }, [calendarMonth]);

  const today = dayjs().startOf('day');

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/t/${slug}/bookings`, {
        customerName: customerForm.name,
        customerEmail: customerForm.email,
        customerPhone: customerForm.phone,
        serviceIds: selectedIds,
        date: selectedDate,
        startTime: selectedSlot,
        notes: customerForm.notes,
      });
      setBookingResult(data);
      setActiveStep(5);
      // Notify parent window of booking completion
      window.parent?.postMessage({ type: 'booking-complete', bookingId: data.id }, '*');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create booking.');
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (activeStep) {
      case 0: return selectedIds.length > 0;
      case 1: return !!selectedDate;
      case 2: return !!selectedSlot;
      case 3: return customerForm.name && customerForm.email;
      default: return true;
    }
  };

  // Auto-resize iframe
  useEffect(() => {
    const sendHeight = () => {
      window.parent?.postMessage({ type: 'booking-widget-height', height: document.body.scrollHeight + 40 }, '*');
    };
    sendHeight();
    const observer = new MutationObserver(sendHeight);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, []);

  if (bookingResult) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={700} color="success.main" gutterBottom>
            Booking Confirmed!
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Your booking request has been submitted. You'll receive a confirmation email.
          </Typography>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="body2">Reference: #{bookingResult.id}</Typography>
              <Typography variant="body2">{bookingResult.service_names}</Typography>
              <Typography variant="body2">{dayjs(bookingResult.date).format('dddd D MMMM YYYY')}</Typography>
              <Typography variant="body2">
                {bookingResult.start_time?.slice(0, 5)} - {bookingResult.end_time?.slice(0, 5)}
              </Typography>
              <Typography variant="body2" fontWeight={600} mt={1}>
                Total: £{parseFloat(bookingResult.total_price).toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
          <Button variant="outlined" sx={{ mt: 2 }} onClick={() => {
            setBookingResult(null);
            setActiveStep(0);
            setSelectedIds([]);
            setSelectedDate(null);
            setSelectedSlot(null);
            setCustomerForm({ name: '', email: '', phone: '', notes: '' });
          }}>
            Book Again
          </Button>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ p: 2, maxWidth: 520, mx: 'auto' }}>
        {tenant && (
          <Typography variant="subtitle1" fontWeight={700} textAlign="center" mb={1} color="primary">
            {tenant.name}
          </Typography>
        )}

        <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 2 }} size="small">
          {steps.map(label => (
            <Step key={label}>
              <StepLabel><Typography variant="caption">{label}</Typography></StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {/* Step 0: Services */}
        {activeStep === 0 && (
          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>Select Services</Typography>
            <Box sx={{ '& .MuiAccordion-root': { boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: '8px !important', mb: 1, '&:before': { display: 'none' } } }}>
              {Object.entries(grouped).map(([category, services]) => {
                const selected = services.filter(s => selectedIds.includes(s.id)).length;
                return (
                  <Accordion key={category} defaultExpanded={false}>
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Box display="flex" alignItems="center" gap={1} width="100%">
                        <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>{category}</Typography>
                        {selected > 0 && <Chip icon={<CheckCircle sx={{ fontSize: 12 }} />} label={selected} size="small" sx={{ bgcolor: 'rgba(46,125,50,0.85)', color: 'white', height: 20, '& .MuiChip-icon': { color: 'white' } }} />}
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 0 }}>
                      {services.map((s, idx) => (
                        <Box key={s.id} onClick={() => toggleService(s.id)} sx={{ display: 'flex', alignItems: 'center', p: 1.5, cursor: 'pointer', borderTop: idx === 0 ? '1px solid' : 'none', borderBottom: '1px solid', borderColor: 'divider', bgcolor: selectedIds.includes(s.id) ? 'rgba(46,125,50,0.06)' : 'transparent', '&:hover': { bgcolor: 'action.hover' } }}>
                          <Checkbox checked={selectedIds.includes(s.id)} size="small" sx={{ p: 0.5, mr: 1 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{s.duration} min</Typography>
                          </Box>
                          <Typography variant="body2" fontWeight={700} color="primary">£{parseFloat(s.price).toFixed(2)}</Typography>
                        </Box>
                      ))}
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Step 1: Date */}
        {activeStep === 1 && (
          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>Select Date</Typography>
            <Card variant="outlined">
              <CardContent sx={{ p: 1.5 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <IconButton size="small" onClick={() => setCalendarMonth(m => m.subtract(1, 'month'))}><ChevronLeft /></IconButton>
                  <Typography variant="body2" fontWeight={600}>{calendarMonth.format('MMMM YYYY')}</Typography>
                  <IconButton size="small" onClick={() => setCalendarMonth(m => m.add(1, 'month'))}><ChevronRight /></IconButton>
                </Box>
                <Grid container columns={7}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <Grid item xs={1} key={i}><Typography variant="caption" textAlign="center" display="block" color="text.secondary">{d}</Typography></Grid>
                  ))}
                  {calendarDays.map((day, i) => {
                    const isToday = day.isSame(today, 'day');
                    const isPast = day.isBefore(today);
                    const isCurrentMonth = day.month() === calendarMonth.month();
                    const isSelected = selectedDate === day.format('YYYY-MM-DD');
                    return (
                      <Grid item xs={1} key={i}>
                        <Box
                          onClick={() => !isPast && isCurrentMonth && setSelectedDate(day.format('YYYY-MM-DD'))}
                          sx={{
                            textAlign: 'center', py: 0.5, mx: 0.25, my: 0.25,
                            borderRadius: '50%', cursor: isPast || !isCurrentMonth ? 'default' : 'pointer',
                            opacity: !isCurrentMonth ? 0.3 : isPast ? 0.4 : 1,
                            bgcolor: isSelected ? 'primary.main' : isToday ? 'primary.light' : 'transparent',
                            color: isSelected ? 'white' : isToday ? 'white' : 'text.primary',
                            '&:hover': !isPast && isCurrentMonth ? { bgcolor: isSelected ? 'primary.dark' : 'action.hover' } : {},
                          }}
                        >
                          <Typography variant="caption">{day.date()}</Typography>
                        </Box>
                      </Grid>
                    );
                  })}
                </Grid>
              </CardContent>
            </Card>
          </Box>
        )}

        {/* Step 2: Time */}
        {activeStep === 2 && (
          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              Select Time — {dayjs(selectedDate).format('ddd D MMM')}
            </Typography>
            {slotsLoading ? (
              <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>
            ) : availableSlots.length === 0 ? (
              <Alert severity="info">No available slots for this date.</Alert>
            ) : (
              Object.entries(slotGroups).map(([period, periodSlots]) => periodSlots.length > 0 && (
                <Box key={period} mb={2}>
                  <Typography variant="caption" color="text.secondary" textTransform="capitalize" mb={0.5} display="block">{period}</Typography>
                  <Box display="flex" gap={0.5} flexWrap="wrap">
                    {periodSlots.map(slot => {
                      const time = slot.start_time?.slice(0, 5);
                      const isSelected = selectedSlot === time;
                      return (
                        <Chip
                          key={slot.id} label={time} size="small"
                          onClick={() => setSelectedSlot(time)}
                          color={isSelected ? 'primary' : 'default'}
                          variant={isSelected ? 'filled' : 'outlined'}
                          sx={{ cursor: 'pointer' }}
                        />
                      );
                    })}
                  </Box>
                </Box>
              ))
            )}
            {selectedSlot && computedEndTime && (
              <Alert severity="info" sx={{ mt: 1 }}>
                {selectedSlot} — {computedEndTime} ({totalDuration} min)
              </Alert>
            )}
          </Box>
        )}

        {/* Step 3: Details */}
        {activeStep === 3 && (
          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>Your Details</Typography>
            <TextField fullWidth size="small" label="Name *" margin="dense" value={customerForm.name} onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))} />
            <TextField fullWidth size="small" label="Email *" margin="dense" type="email" value={customerForm.email} onChange={e => setCustomerForm(f => ({ ...f, email: e.target.value }))} />
            <TextField fullWidth size="small" label="Phone" margin="dense" value={customerForm.phone} onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))} />
            <TextField fullWidth size="small" label="Notes" margin="dense" multiline rows={2} value={customerForm.notes} onChange={e => setCustomerForm(f => ({ ...f, notes: e.target.value }))} />
          </Box>
        )}

        {/* Step 4: Confirm */}
        {activeStep === 4 && (
          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>Confirm Booking</Typography>
            <Card variant="outlined">
              <CardContent sx={{ p: 2 }}>
                {selectedServices.map(s => (
                  <Box key={s.id} display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2">{s.name} ({s.duration}min)</Typography>
                    <Typography variant="body2">£{parseFloat(s.price).toFixed(2)}</Typography>
                  </Box>
                ))}
                <Box borderTop="1px solid" borderColor="divider" mt={1} pt={1}>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600}>Total</Typography>
                    <Typography variant="body2" fontWeight={700} color="primary">£{totalPrice.toFixed(2)}</Typography>
                  </Box>
                </Box>
                <Box mt={2}>
                  <Typography variant="body2">{dayjs(selectedDate).format('dddd D MMMM YYYY')}</Typography>
                  <Typography variant="body2">{selectedSlot} — {computedEndTime}</Typography>
                  <Typography variant="body2">{customerForm.name} · {customerForm.email}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}

        {/* Navigation */}
        <Box display="flex" justifyContent="space-between" mt={2}>
          <Button variant="text" disabled={activeStep === 0} onClick={() => setActiveStep(s => s - 1)}>
            Back
          </Button>
          {activeStep < 4 ? (
            <Button variant="contained" disabled={!canProceed()} onClick={() => setActiveStep(s => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <CircularProgress size={20} color="inherit" /> : 'Confirm Booking'}
            </Button>
          )}
        </Box>

        {/* Floating tally */}
        {activeStep === 0 && selectedIds.length > 0 && (
          <Box sx={{ position: 'sticky', bottom: 0, left: 0, right: 0, bgcolor: 'white', borderTop: '2px solid', borderColor: 'primary.main', p: 1.5, mt: 2, borderRadius: 2, boxShadow: '0 -2px 10px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">{selectedIds.length} services · {totalDuration} min</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="body1" fontWeight={700} color="primary">£{totalPrice.toFixed(2)}</Typography>
              <Button size="small" variant="contained" onClick={() => setActiveStep(1)}>Continue</Button>
            </Box>
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}

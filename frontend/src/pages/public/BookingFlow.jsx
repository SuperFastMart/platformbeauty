import { useState, useEffect, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stepper, Step, StepLabel, Button, Card, CardContent,
  TextField, Checkbox, Container, Chip, Alert, CircularProgress,
  IconButton, Grid, useMediaQuery, useTheme,
  Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import { ChevronLeft, ChevronRight, Search, ExpandMore, CheckCircle, Add } from '@mui/icons-material';
import dayjs from 'dayjs';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';
import CardSetupForm from '../../components/CardSetupForm';

const steps = ['Services', 'Date', 'Time', 'Details', 'Confirm'];

// Cache Stripe instance per publishable key
const stripeCache = {};
function getStripePromise(publishableKey) {
  if (!publishableKey) return null;
  if (!stripeCache[publishableKey]) {
    stripeCache[publishableKey] = loadStripe(publishableKey);
  }
  return stripeCache[publishableKey];
}

function groupSlotsByPeriod(slots) {
  const morning = [];
  const afternoon = [];
  const evening = [];
  for (const slot of slots) {
    const hour = parseInt(slot.start_time?.slice(0, 2));
    if (hour < 12) morning.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }
  return { morning, afternoon, evening };
}

export default function BookingFlow() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const tenant = useTenant();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const preSelectedIds = location.state?.selectedServiceIds || [];
  const [activeStep, setActiveStep] = useState(preSelectedIds.length > 0 ? 1 : 0);
  const [allServices, setAllServices] = useState([]);
  const [grouped, setGrouped] = useState({});
  const [selectedIds, setSelectedIds] = useState(preSelectedIds);
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [error, setError] = useState('');
  const [cardSetup, setCardSetup] = useState(null);
  const [cardSaved, setCardSaved] = useState(false);

  // Discount code
  const [discountInput, setDiscountInput] = useState('');
  const [discountResult, setDiscountResult] = useState(null);
  const [discountError, setDiscountError] = useState('');
  const [discountLoading, setDiscountLoading] = useState(false);

  // Calendar month navigation
  const [calendarMonth, setCalendarMonth] = useState(dayjs().startOf('month'));

  // Find next available
  const [findingNext, setFindingNext] = useState(false);

  // Load services
  useEffect(() => {
    api.get(`/t/${slug}/services`)
      .then(({ data }) => {
        setAllServices(data.services);
        setGrouped(data.grouped);
      })
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
  const discountAmount = discountResult?.discount_amount || 0;
  const finalPrice = Math.max(0, totalPrice - discountAmount);

  // Filter slots to only show those with enough consecutive availability
  const availableSlots = useMemo(() => {
    if (slots.length === 0 || totalDuration <= 0) return slots;
    // Determine slot duration from first slot
    const first = slots[0];
    if (!first?.start_time || !first?.end_time) return slots;
    const startMins = parseInt(first.start_time.slice(0, 2)) * 60 + parseInt(first.start_time.slice(3, 5));
    const endMins = parseInt(first.end_time.slice(0, 2)) * 60 + parseInt(first.end_time.slice(3, 5));
    const slotDuration = endMins - startMins || 30;
    const slotsNeeded = Math.ceil(totalDuration / slotDuration);
    if (slotsNeeded <= 1) return slots;

    // Check consecutive availability for each slot
    return slots.filter((slot, i) => {
      if (i + slotsNeeded > slots.length) return false;
      for (let j = 1; j < slotsNeeded; j++) {
        const prev = slots[i + j - 1];
        const next = slots[i + j];
        // Check consecutive: prev end_time === next start_time
        if (prev.end_time?.slice(0, 5) !== next.start_time?.slice(0, 5)) return false;
      }
      return true;
    });
  }, [slots, totalDuration]);

  const slotGroups = useMemo(() => groupSlotsByPeriod(availableSlots), [availableSlots]);

  // Compute end time for selected slot
  const computedEndTime = useMemo(() => {
    if (!selectedSlot || totalDuration <= 0) return null;
    const [h, m] = selectedSlot.split(':').map(Number);
    const endMinutes = h * 60 + m + totalDuration;
    const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
    const endM = String(endMinutes % 60).padStart(2, '0');
    return `${endH}:${endM}`;
  }, [selectedSlot, totalDuration]);

  const validateDiscount = async () => {
    if (!discountInput.trim()) return;
    setDiscountLoading(true);
    setDiscountError('');
    setDiscountResult(null);
    try {
      const { data } = await api.post(`/t/${slug}/discount/validate`, {
        code: discountInput,
        total_price: totalPrice,
      });
      setDiscountResult(data);
    } catch (err) {
      setDiscountError(err.response?.data?.error || 'Invalid code');
    } finally {
      setDiscountLoading(false);
    }
  };

  const clearDiscount = () => {
    setDiscountInput('');
    setDiscountResult(null);
    setDiscountError('');
  };

  const toggleService = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Calendar helpers
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

  const handleFindNext = async () => {
    if (selectedIds.length === 0) return;
    setFindingNext(true);
    setError('');
    try {
      const { data } = await api.get(`/t/${slug}/next-available?serviceIds=${selectedIds.join(',')}`);
      if (data.found) {
        setSelectedDate(data.date);
        setSelectedSlot(data.time?.slice(0, 5));
        setCalendarMonth(dayjs(data.date).startOf('month'));
        setActiveStep(2); // Go to time step
      } else {
        setError('No available slots found in the next 30 days. Please try again later.');
      }
    } catch (err) {
      setError('Failed to find available slots. Please try manually.');
    } finally {
      setFindingNext(false);
    }
  };

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
        discountCode: discountResult?.code || null,
      });
      setBookingResult(data);
      setActiveStep(5);

      try {
        const { data: setupData } = await api.post(`/t/${slug}/bookings/${data.id}/setup-intent`);
        if (setupData.available && setupData.clientSecret) {
          setCardSetup(setupData);
        }
      } catch {
        // Card setup not available
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create booking. Please try again.');
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

  // Success view
  if (bookingResult) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="h4" fontWeight={700} gutterBottom color={cardSetup && !cardSaved ? 'warning.main' : 'success.main'}>
          {cardSetup && !cardSaved ? 'Almost There!' : 'Booking Confirmed!'}
        </Typography>
        <Typography variant="body1" color="text.secondary" mb={4}>
          {cardSetup && !cardSaved
            ? 'Your booking has been received. Please save a card below to complete your booking.'
            : "Your booking request has been submitted. You'll receive a confirmation once it's approved."}
        </Typography>

        <Card>
          <CardContent>
            <Typography fontWeight={600} gutterBottom>Booking Details</Typography>
            <Typography variant="body2">Reference: #{bookingResult.id}</Typography>
            <Typography variant="body2">{bookingResult.service_names}</Typography>
            <Typography variant="body2">
              {dayjs(bookingResult.date).format('dddd D MMMM YYYY')}
            </Typography>
            <Typography variant="body2">
              {bookingResult.start_time?.slice(0, 5)} - {bookingResult.end_time?.slice(0, 5)}
            </Typography>
            <Typography variant="body2" fontWeight={600} mt={1}>
              Total: £{parseFloat(bookingResult.total_price).toFixed(2)}
            </Typography>
          </CardContent>
        </Card>

        {cardSetup && !cardSaved && cardSetup.stripePublishableKey && (
          <Card sx={{ mt: 3, textAlign: 'left' }}>
            <CardContent>
              <Typography fontWeight={600} gutterBottom>Card Required</Typography>
              <Elements stripe={getStripePromise(cardSetup.stripePublishableKey)}>
                <CardSetupForm
                  clientSecret={cardSetup.clientSecret}
                  onSuccess={async (paymentMethodId) => {
                    try {
                      await api.post(`/t/${slug}/bookings/${bookingResult.id}/save-card`, { paymentMethodId });
                      setCardSaved(true);
                    } catch {
                      setCardSaved(true);
                    }
                  }}
                />
              </Elements>
            </CardContent>
          </Card>
        )}

        {cardSaved && (
          <Alert severity="success" sx={{ mt: 2 }}>Card saved. Thank you!</Alert>
        )}

        {(!cardSetup || cardSaved) && (
          <Button variant="outlined" sx={{ mt: 3 }} onClick={() => navigate(`/t/${slug}`)}>
            Back to {tenant?.name}
          </Button>
        )}
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: isMobile ? 2 : 4 }}>
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 3 }}>
        {steps.map(label => (
          <Step key={label}>
            <StepLabel>{isMobile && label.length > 6 ? label.slice(0, 4) + '.' : label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Step 0: Services — Accordion by category */}
      {activeStep === 0 && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={2}>Select Services</Typography>
          <Box sx={{
            '& .MuiAccordion-root': {
              boxShadow: 'none',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '12px !important',
              mb: 1.5,
              '&:before': { display: 'none' },
              '&.Mui-expanded': { margin: '0 0 12px 0' },
            },
            '& .MuiAccordionSummary-root': {
              minHeight: 56,
              '&.Mui-expanded': { minHeight: 56 },
            },
            '& .MuiAccordionSummary-content': {
              margin: '12px 0',
              '&.Mui-expanded': { margin: '12px 0' },
            },
          }}>
            {Object.entries(grouped).map(([category, services]) => {
              const selectedInCategory = services.filter(s => selectedIds.includes(s.id)).length;
              return (
                <Accordion key={category} defaultExpanded={Object.keys(grouped).length <= 4}>
                  <AccordionSummary
                    expandIcon={<ExpandMore />}
                    sx={{
                      bgcolor: 'background.paper',
                      '&:hover': { bgcolor: 'rgba(139, 38, 53, 0.04)' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                      <Typography fontWeight={600} sx={{ flex: 1 }}>{category}</Typography>
                      {selectedInCategory > 0 && (
                        <Chip
                          icon={<CheckCircle sx={{ fontSize: 14 }} />}
                          label={selectedInCategory}
                          size="small"
                          sx={{
                            bgcolor: 'rgba(46, 125, 50, 0.85)',
                            color: 'white',
                            fontWeight: 600,
                            height: 24,
                            '& .MuiChip-icon': { color: 'white' },
                          }}
                        />
                      )}
                      <Chip
                        label={services.length}
                        size="small"
                        sx={{
                          bgcolor: 'rgba(139, 38, 53, 0.1)',
                          color: 'primary.main',
                          fontWeight: 600,
                          height: 24,
                        }}
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 0 }}>
                    {services.map((s, idx) => {
                      const isSelected = selectedIds.includes(s.id);
                      return (
                        <Box
                          key={s.id}
                          onClick={() => toggleService(s.id)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            p: 2,
                            cursor: 'pointer',
                            borderTop: idx === 0 ? '1px solid' : 'none',
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            transition: 'all 0.15s ease',
                            bgcolor: isSelected ? 'rgba(46, 125, 50, 0.08)' : 'transparent',
                            '&:hover': {
                              bgcolor: isSelected ? 'rgba(46, 125, 50, 0.12)' : 'action.hover',
                            },
                            '&:last-child': {
                              borderBottom: 'none',
                              borderRadius: '0 0 12px 12px',
                            },
                          }}
                        >
                          <Checkbox
                            checked={isSelected}
                            sx={{
                              mr: 1,
                              color: 'grey.400',
                              '&.Mui-checked': { color: 'success.main' },
                            }}
                          />
                          <Box sx={{ flex: 1, pr: 2 }}>
                            <Typography
                              fontWeight={isSelected ? 600 : 500}
                              sx={{
                                fontSize: { xs: '0.9rem', sm: '1rem' },
                                color: isSelected ? 'success.dark' : 'text.primary',
                              }}
                            >
                              {s.name}
                            </Typography>
                            {s.description && (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                  mt: 0.5,
                                  fontSize: '0.8rem',
                                  display: { xs: 'none', sm: '-webkit-box' },
                                  WebkitLineClamp: 1,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                              >
                                {s.description}
                              </Typography>
                            )}
                          </Box>
                          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                            <Typography
                              fontWeight={700}
                              color="primary.main"
                              sx={{ fontSize: { xs: '0.95rem', sm: '1.1rem' } }}
                            >
                              £{parseFloat(s.price).toFixed(2)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                              {s.duration} min
                            </Typography>
                          </Box>
                          {!isSelected && (
                            <Add sx={{ ml: 1, color: 'grey.400', fontSize: 20 }} />
                          )}
                        </Box>
                      );
                    })}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>

          {allServices.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              No services available.
            </Box>
          )}

          {/* Floating tally bar */}
          {selectedIds.length > 0 && (
            <Box
              sx={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                bgcolor: 'white',
                borderTop: '2px solid',
                borderColor: 'success.main',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
                p: 2,
                zIndex: 1000,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {selectedIds.length} service{selectedIds.length !== 1 ? 's' : ''} • {totalDuration} min
                </Typography>
                <Typography fontWeight={700} fontSize="1.25rem" color="primary.main">
                  £{totalPrice.toFixed(2)}
                </Typography>
              </Box>
              <Button
                variant="contained"
                size="large"
                onClick={() => setActiveStep(1)}
                sx={{ px: 4, py: 1.5, minHeight: 48 }}
              >
                Continue
              </Button>
            </Box>
          )}

          {/* Spacer for fixed tally bar */}
          {selectedIds.length > 0 && <Box sx={{ height: 100 }} />}
        </Box>
      )}

      {/* Step 1: Date — Calendar Grid */}
      {activeStep === 1 && (
        <Box>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" fontWeight={600}>Choose a Date</Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={findingNext ? <CircularProgress size={16} /> : <Search />}
              onClick={handleFindNext}
              disabled={findingNext || selectedIds.length === 0}
              sx={{ minHeight: 40 }}
            >
              {findingNext ? 'Searching...' : 'Find Next Available'}
            </Button>
          </Box>

          {/* Pre-selected services summary */}
          {preSelectedIds.length > 0 && (
            <Box mb={2} p={1.5} bgcolor="grey.50" borderRadius={2}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  {selectedServices.map(s => s.name).join(', ')} — {totalDuration} min — £{totalPrice.toFixed(2)}
                </Typography>
                <Button size="small" variant="text" onClick={() => setActiveStep(0)} sx={{ minWidth: 'auto' }}>
                  Change
                </Button>
              </Box>
            </Box>
          )}

          {/* Calendar navigation */}
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <IconButton
              onClick={() => setCalendarMonth(m => m.subtract(1, 'month'))}
              disabled={calendarMonth.isSame(dayjs().startOf('month'))}
              size="small"
            >
              <ChevronLeft />
            </IconButton>
            <Typography fontWeight={600}>{calendarMonth.format('MMMM YYYY')}</Typography>
            <IconButton
              onClick={() => setCalendarMonth(m => m.add(1, 'month'))}
              size="small"
            >
              <ChevronRight />
            </IconButton>
          </Box>

          {/* Day headers */}
          <Grid container>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <Grid item xs={12 / 7} key={d}>
                <Typography variant="caption" color="text.secondary" textAlign="center" display="block" fontWeight={600}>
                  {d}
                </Typography>
              </Grid>
            ))}
          </Grid>

          {/* Calendar days */}
          <Grid container>
            {calendarDays.map(d => {
              const dateStr = d.format('YYYY-MM-DD');
              const isCurrentMonth = d.month() === calendarMonth.month();
              const isPast = d.isBefore(today) || d.isSame(today);
              const isSelected = selectedDate === dateStr;
              const isToday = d.isSame(today);

              return (
                <Grid item xs={12 / 7} key={dateStr}>
                  <Box
                    onClick={() => {
                      if (!isPast && isCurrentMonth) {
                        setSelectedDate(dateStr);
                        setSelectedSlot(null);
                      }
                    }}
                    sx={{
                      py: 1.2,
                      textAlign: 'center',
                      cursor: isPast || !isCurrentMonth ? 'default' : 'pointer',
                      borderRadius: 2,
                      mx: 0.3,
                      my: 0.3,
                      bgcolor: isSelected ? 'primary.main' : 'transparent',
                      color: isSelected ? 'white' : !isCurrentMonth ? 'text.disabled' : isPast ? 'text.disabled' : 'text.primary',
                      fontWeight: isSelected || isToday ? 700 : 400,
                      border: isToday && !isSelected ? '1px solid' : 'none',
                      borderColor: 'primary.main',
                      '&:hover': {
                        bgcolor: isPast || !isCurrentMonth ? 'transparent' : isSelected ? 'primary.dark' : 'action.hover',
                      },
                      transition: 'background-color 0.15s',
                    }}
                  >
                    <Typography variant="body2" fontWeight="inherit" color="inherit">
                      {d.date()}
                    </Typography>
                  </Box>
                </Grid>
              );
            })}
          </Grid>

          {selectedDate && (
            <Box mt={2} p={1.5} bgcolor="primary.50" borderRadius={2} textAlign="center"
              sx={{ bgcolor: 'rgba(139, 38, 53, 0.08)' }}>
              <Typography variant="body2" fontWeight={600}>
                Selected: {dayjs(selectedDate).format('dddd D MMMM YYYY')}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Step 2: Time — Grouped slots */}
      {activeStep === 2 && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={1}>Choose a Time</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {dayjs(selectedDate).format('dddd D MMMM YYYY')} — {totalDuration} min needed
            {selectedSlot && computedEndTime && (
              <Typography component="span" fontWeight={600} color="primary.main">
                {' '}({selectedSlot} - {computedEndTime})
              </Typography>
            )}
          </Typography>

          {slotsLoading ? (
            <Box textAlign="center" py={4}><CircularProgress /></Box>
          ) : slots.length === 0 ? (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>No available slots for this date.</Alert>
              <Button variant="outlined" onClick={() => setActiveStep(1)}>
                Choose Another Date
              </Button>
            </Box>
          ) : (
            <Box>
              {[
                { label: 'Morning', slots: slotGroups.morning },
                { label: 'Afternoon', slots: slotGroups.afternoon },
                { label: 'Evening', slots: slotGroups.evening },
              ].map(group => group.slots.length > 0 && (
                <Box key={group.label} mb={2}>
                  <Typography variant="subtitle2" color="text.secondary" mb={1}>
                    {group.label}
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={1}>
                    {group.slots.map(slot => {
                      const time = slot.start_time?.slice(0, 5);
                      const isSelected = selectedSlot === time;
                      return (
                        <Button
                          key={slot.id}
                          variant={isSelected ? 'contained' : 'outlined'}
                          onClick={() => setSelectedSlot(time)}
                          sx={{
                            minWidth: 80,
                            minHeight: 44,
                            fontSize: '0.95rem',
                            fontWeight: isSelected ? 700 : 400,
                          }}
                        >
                          {time}
                        </Button>
                      );
                    })}
                  </Box>
                </Box>
              ))}

              <Box mt={2}>
                <Button
                  variant="text"
                  size="small"
                  startIcon={<Search />}
                  onClick={handleFindNext}
                  disabled={findingNext}
                >
                  {findingNext ? 'Searching...' : 'Find Next Available'}
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Step 3: Details */}
      {activeStep === 3 && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={2}>Your Details</Typography>
          <TextField fullWidth label="Full Name" margin="normal" required
            value={customerForm.name}
            onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))} />
          <TextField fullWidth label="Email" type="email" margin="normal" required
            value={customerForm.email}
            onChange={e => setCustomerForm(f => ({ ...f, email: e.target.value }))} />
          <TextField fullWidth label="Phone" margin="normal"
            value={customerForm.phone}
            onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))} />
          <TextField fullWidth label="Notes (optional)" margin="normal" multiline rows={2}
            value={customerForm.notes}
            onChange={e => setCustomerForm(f => ({ ...f, notes: e.target.value }))} />

          {/* Discount code */}
          <Box mt={2} p={2} bgcolor="grey.50" borderRadius={2}>
            <Typography variant="subtitle2" mb={1}>Discount Code</Typography>
            <Box display="flex" gap={1}>
              <TextField
                size="small"
                placeholder="Enter code"
                value={discountInput}
                onChange={e => setDiscountInput(e.target.value.toUpperCase())}
                disabled={!!discountResult}
                inputProps={{ style: { fontFamily: 'monospace', fontWeight: 600 } }}
                fullWidth
              />
              {!discountResult ? (
                <Button
                  variant="outlined" size="small"
                  onClick={validateDiscount}
                  disabled={!discountInput.trim() || discountLoading}
                  sx={{ minWidth: 80, minHeight: 40 }}
                >
                  {discountLoading ? '...' : 'Apply'}
                </Button>
              ) : (
                <Button variant="outlined" size="small" color="error" onClick={clearDiscount} sx={{ minWidth: 80, minHeight: 40 }}>
                  Remove
                </Button>
              )}
            </Box>
            {discountError && (
              <Typography variant="caption" color="error" mt={0.5} display="block">{discountError}</Typography>
            )}
            {discountResult && (
              <Alert severity="success" sx={{ mt: 1 }} variant="outlined">
                {discountResult.discount_type === 'percentage'
                  ? `${discountResult.discount_value}% off`
                  : `£${discountResult.discount_value.toFixed(2)} off`}
                {' — '}you save £{discountResult.discount_amount.toFixed(2)}
              </Alert>
            )}
          </Box>
        </Box>
      )}

      {/* Step 4: Confirm */}
      {activeStep === 4 && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={2}>Confirm Your Booking</Typography>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Services</Typography>
              {selectedServices.map(s => (
                <Box key={s.id} display="flex" justifyContent="space-between" py={0.5}>
                  <Typography variant="body2">{s.name} ({s.duration} min)</Typography>
                  <Typography variant="body2">£{parseFloat(s.price).toFixed(2)}</Typography>
                </Box>
              ))}
              {discountResult && (
                <Box display="flex" justifyContent="space-between" py={0.5}>
                  <Typography variant="body2" color="success.main">
                    Discount ({discountResult.code})
                  </Typography>
                  <Typography variant="body2" color="success.main">
                    -£{discountAmount.toFixed(2)}
                  </Typography>
                </Box>
              )}
              <Box display="flex" justifyContent="space-between" pt={1} mt={1} borderTop={1} borderColor="divider">
                <Typography fontWeight={600}>Total</Typography>
                <Typography fontWeight={600}>£{finalPrice.toFixed(2)} — {totalDuration} min</Typography>
              </Box>

              <Box mt={3}>
                <Typography variant="subtitle2" color="text.secondary">Date & Time</Typography>
                <Typography>{dayjs(selectedDate).format('dddd D MMMM YYYY')} at {selectedSlot}</Typography>
              </Box>

              <Box mt={2}>
                <Typography variant="subtitle2" color="text.secondary">Your Details</Typography>
                <Typography>{customerForm.name}</Typography>
                <Typography variant="body2">{customerForm.email}</Typography>
                {customerForm.phone && <Typography variant="body2">{customerForm.phone}</Typography>}
                {customerForm.notes && (
                  <Typography variant="body2" fontStyle="italic" mt={0.5}>{customerForm.notes}</Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Navigation */}
      <Box display="flex" justifyContent="space-between" mt={4}>
        <Button
          variant="outlined"
          disabled={activeStep === 0 || (activeStep === 1 && preSelectedIds.length > 0)}
          onClick={() => setActiveStep(s => s - 1)}
          sx={{ minHeight: 44 }}
        >
          Back
        </Button>

        {activeStep < 4 ? (
          <Button
            variant="contained"
            disabled={!canProceed()}
            onClick={() => setActiveStep(s => s + 1)}
            sx={{ minHeight: 44 }}
          >
            Continue
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting}
            sx={{ minHeight: 44 }}
          >
            {submitting ? 'Submitting...' : 'Confirm Booking'}
          </Button>
        )}
      </Box>
    </Container>
  );
}

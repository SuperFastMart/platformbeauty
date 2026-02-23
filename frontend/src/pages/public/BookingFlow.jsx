import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stepper, Step, StepLabel, Button, Card, CardContent,
  TextField, Checkbox, Container, Chip, Alert, CircularProgress,
  IconButton, Grid, useMediaQuery, useTheme,
  Accordion, AccordionSummary, AccordionDetails, FormControlLabel,
  FormGroup, ToggleButtonGroup, ToggleButton, Divider
} from '@mui/material';
import { ChevronLeft, ChevronRight, Search, ExpandMore, CheckCircle, Add, Gavel, EventBusy, ReportProblem, Security, Article } from '@mui/icons-material';
import dayjs from 'dayjs';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';
import CardSetupForm from '../../components/CardSetupForm';
import DepositPaymentForm from '../../components/DepositPaymentForm';

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
  const [phoneError, setPhoneError] = useState('');
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

  // Policies
  const [siteSettings, setSiteSettings] = useState({});
  const [policyAgreed, setPolicyAgreed] = useState(false);

  // Intake questions
  const [intakeQuestions, setIntakeQuestions] = useState([]);
  const [intakeResponses, setIntakeResponses] = useState({});

  // Deposit
  const [depositIntent, setDepositIntent] = useState(null); // { clientSecret, paymentIntentId, depositAmount, stripePublishableKey }

  const hasPolicies = !!(siteSettings.policy_cancellation || siteSettings.policy_noshow
    || siteSettings.policy_privacy || siteSettings.policy_terms);

  // Load services & site settings
  useEffect(() => {
    api.get(`/t/${slug}/services`)
      .then(({ data }) => {
        setAllServices(data.services);
        setGrouped(data.grouped);
      })
      .catch(console.error);
    api.get(`/t/${slug}/settings`)
      .then(({ data }) => setSiteSettings(data))
      .catch(() => {});
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

  // Load intake questions when selected services change
  useEffect(() => {
    if (selectedIds.length === 0) {
      setIntakeQuestions([]);
      setIntakeResponses({});
      return;
    }
    api.get(`/t/${slug}/intake-questions?serviceIds=${selectedIds.join(',')}`)
      .then(({ data }) => {
        setIntakeQuestions(data);
        // Initialise responses for new questions
        setIntakeResponses(prev => {
          const next = { ...prev };
          data.forEach(q => {
            if (next[q.id] === undefined) {
              next[q.id] = q.question_type === 'checkbox' ? [] : '';
            }
          });
          return next;
        });
      })
      .catch(() => setIntakeQuestions([]));
  }, [slug, selectedIds.join(',')]);

  const selectedServices = allServices.filter(s => selectedIds.includes(s.id));
  const totalPrice = selectedServices.reduce((sum, s) => sum + parseFloat(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);
  const discountAmount = discountResult?.discount_amount || 0;
  const finalPrice = Math.max(0, totalPrice - discountAmount);

  // Deposit calculation
  const totalDeposit = useMemo(() => {
    let dep = 0;
    for (const svc of selectedServices) {
      if (svc.deposit_enabled) {
        if (svc.deposit_type === 'percentage') {
          dep += parseFloat(svc.price) * (parseFloat(svc.deposit_value) / 100);
        } else {
          dep += parseFloat(svc.deposit_value);
        }
      }
    }
    return Math.round(dep * 100) / 100;
  }, [selectedServices]);

  const depositRequired = totalDeposit > 0;
  const remainingBalance = Math.max(0, finalPrice - totalDeposit);

  // Dynamic steps
  const hasIntake = intakeQuestions.length > 0;
  const stepsArr = useMemo(() => {
    const s = ['Services', 'Date', 'Time'];
    if (hasIntake) s.push('Questions');
    s.push('Details', 'Confirm');
    return s;
  }, [hasIntake]);

  const STEP_SERVICES = 0;
  const STEP_DATE = 1;
  const STEP_TIME = 2;
  const STEP_INTAKE = hasIntake ? 3 : -1;
  const STEP_DETAILS = hasIntake ? 4 : 3;
  const STEP_CONFIRM = hasIntake ? 5 : 4;
  const STEP_SUCCESS = STEP_CONFIRM + 1;

  // Filter slots to only show those with enough consecutive availability
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
        setActiveStep(STEP_TIME);
      } else {
        setError('No available slots found in the next 30 days. Please try again later.');
      }
    } catch (err) {
      setError('Failed to find available slots. Please try manually.');
    } finally {
      setFindingNext(false);
    }
  };

  // Create booking (optionally with deposit payment intent)
  const createBooking = useCallback(async (depositPaymentIntentId = null) => {
    setSubmitting(true);
    setError('');
    try {
      // Build intake responses array for storage
      const formattedResponses = intakeQuestions.length > 0
        ? intakeQuestions.map(q => ({
            question_id: q.id,
            question_text: q.question_text,
            question_type: q.question_type,
            answer: intakeResponses[q.id] || '',
          }))
        : null;

      const { data } = await api.post(`/t/${slug}/bookings`, {
        customerName: customerForm.name,
        customerEmail: customerForm.email,
        customerPhone: customerForm.phone,
        serviceIds: selectedIds,
        date: selectedDate,
        startTime: selectedSlot,
        notes: customerForm.notes,
        discountCode: discountResult?.code || null,
        depositPaymentIntentId,
        intakeResponses: formattedResponses,
      });
      setBookingResult(data);
      setActiveStep(STEP_SUCCESS);

      // Only offer card setup if no deposit was paid
      if (!depositPaymentIntentId) {
        try {
          const { data: setupData } = await api.post(`/t/${slug}/bookings/${data.id}/setup-intent`);
          if (setupData.available && setupData.clientSecret) {
            setCardSetup(setupData);
          }
        } catch {
          // Card setup not available
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [slug, customerForm, selectedIds, selectedDate, selectedSlot, discountResult, intakeQuestions, intakeResponses, STEP_SUCCESS]);

  const handleSubmit = async () => {
    if (depositRequired) {
      // For deposits, we need to create the intent first
      setSubmitting(true);
      setError('');
      try {
        const { data } = await api.post(`/t/${slug}/deposit-intent`, {
          serviceIds: selectedIds,
          customerEmail: customerForm.email,
        });
        if (data.required && data.available && data.clientSecret) {
          setDepositIntent({
            clientSecret: data.clientSecret,
            paymentIntentId: data.paymentIntentId,
            depositAmount: data.depositAmount,
            stripePublishableKey: data.stripePublishableKey,
          });
        } else if (!data.required) {
          // No deposit actually needed (services may have changed)
          await createBooking();
        } else {
          setError('Card payments are not set up for this business. Please contact them directly.');
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to set up deposit payment.');
      } finally {
        setSubmitting(false);
      }
    } else {
      await createBooking();
    }
  };

  const handleDepositSuccess = async (paymentIntentId) => {
    await createBooking(paymentIntentId);
  };

  const canProceed = () => {
    if (activeStep === STEP_SERVICES) return selectedIds.length > 0;
    if (activeStep === STEP_DATE) return !!selectedDate;
    if (activeStep === STEP_TIME) return !!selectedSlot;
    if (activeStep === STEP_INTAKE) {
      // Validate required intake questions
      return intakeQuestions.every(q => {
        if (!q.required) return true;
        const answer = intakeResponses[q.id];
        if (q.question_type === 'checkbox') return Array.isArray(answer) && answer.length > 0;
        return answer && String(answer).trim() !== '';
      });
    }
    if (activeStep === STEP_DETAILS) return customerForm.name && customerForm.email;
    return true;
  };

  // Group intake questions by service
  const intakeByService = useMemo(() => {
    const map = {};
    for (const q of intakeQuestions) {
      if (!map[q.service_id]) map[q.service_id] = { name: q.service_name, questions: [] };
      map[q.service_id].questions.push(q);
    }
    return Object.values(map);
  }, [intakeQuestions]);

  // Success view
  if (bookingResult) {
    const depositPaid = parseFloat(bookingResult.deposit_amount) > 0 && bookingResult.deposit_status === 'paid';
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
            {depositPaid && (
              <Box mt={1.5} p={1.5} bgcolor="success.50" borderRadius={2} sx={{ bgcolor: 'rgba(46, 125, 50, 0.08)' }}>
                <Typography variant="body2" color="success.main" fontWeight={600}>
                  Deposit paid: £{parseFloat(bookingResult.deposit_amount).toFixed(2)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Remaining £{(parseFloat(bookingResult.total_price) - parseFloat(bookingResult.deposit_amount)).toFixed(2)} payable at your appointment
                </Typography>
              </Box>
            )}
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
        {stepsArr.map(label => (
          <Step key={label}>
            <StepLabel>{isMobile && label.length > 6 ? label.slice(0, 4) + '.' : label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Step 0: Services — Accordion by category */}
      {activeStep === STEP_SERVICES && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={0.5}>Select Services</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Choose the treatments you'd like. You can select multiple services for one appointment.
          </Typography>
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
            {(() => {
              const order = siteSettings.category_order || [];
              const entries = Object.entries(grouped);
              if (order.length > 0) {
                entries.sort((a, b) => {
                  const ai = order.indexOf(a[0]);
                  const bi = order.indexOf(b[0]);
                  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                });
              }
              return entries;
            })().map(([category, services]) => {
              const selectedInCategory = services.filter(s => selectedIds.includes(s.id)).length;
              return (
                <Accordion key={category} defaultExpanded={false}>
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
                bgcolor: 'background.paper',
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
                {depositRequired && (
                  <Typography variant="caption" color="info.main" fontWeight={600}>
                    Deposit: £{totalDeposit.toFixed(2)}
                  </Typography>
                )}
              </Box>
              <Button
                variant="contained"
                size="large"
                onClick={() => setActiveStep(STEP_DATE)}
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
      {activeStep === STEP_DATE && (
        <Box>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Box>
              <Typography variant="h6" fontWeight={600}>Choose a Date</Typography>
              <Typography variant="body2" color="text.secondary">
                Select your preferred date. Grey dates are unavailable.
              </Typography>
            </Box>
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
                <Button size="small" variant="text" onClick={() => setActiveStep(STEP_SERVICES)} sx={{ minWidth: 'auto' }}>
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
      {activeStep === STEP_TIME && (
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
              <Button variant="outlined" onClick={() => setActiveStep(STEP_DATE)}>
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

      {/* Intake Questions Step (conditional) */}
      {activeStep === STEP_INTAKE && STEP_INTAKE >= 0 && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={0.5}>A Few Questions</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Please answer the following to help your practitioner prepare for your appointment.
          </Typography>

          {intakeByService.map(group => (
            <Card key={group.name} variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={600} color="primary.main" mb={1.5}>
                  {group.name}
                </Typography>
                {group.questions.map((q, qIdx) => (
                  <Box key={q.id} mb={qIdx < group.questions.length - 1 ? 2.5 : 0}>
                    <Typography variant="body2" fontWeight={500} mb={0.5}>
                      {q.question_text}{q.required && <span style={{ color: '#d32f2f' }}> *</span>}
                    </Typography>

                    {q.question_type === 'text' && (
                      <TextField
                        fullWidth
                        size="small"
                        multiline
                        minRows={1}
                        maxRows={4}
                        value={intakeResponses[q.id] || ''}
                        onChange={e => setIntakeResponses(prev => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="Your answer..."
                      />
                    )}

                    {q.question_type === 'yes_no' && (
                      <ToggleButtonGroup
                        value={intakeResponses[q.id] || ''}
                        exclusive
                        onChange={(_, v) => v !== null && setIntakeResponses(prev => ({ ...prev, [q.id]: v }))}
                        size="small"
                      >
                        <ToggleButton value="Yes" sx={{ px: 3 }}>Yes</ToggleButton>
                        <ToggleButton value="No" sx={{ px: 3 }}>No</ToggleButton>
                      </ToggleButtonGroup>
                    )}

                    {q.question_type === 'checkbox' && q.options && (
                      <FormGroup>
                        {(Array.isArray(q.options) ? q.options : []).map(opt => (
                          <FormControlLabel
                            key={opt}
                            control={
                              <Checkbox
                                size="small"
                                checked={(intakeResponses[q.id] || []).includes(opt)}
                                onChange={e => {
                                  setIntakeResponses(prev => {
                                    const current = Array.isArray(prev[q.id]) ? [...prev[q.id]] : [];
                                    if (e.target.checked) {
                                      current.push(opt);
                                    } else {
                                      const idx = current.indexOf(opt);
                                      if (idx > -1) current.splice(idx, 1);
                                    }
                                    return { ...prev, [q.id]: current };
                                  });
                                }}
                              />
                            }
                            label={<Typography variant="body2">{opt}</Typography>}
                          />
                        ))}
                      </FormGroup>
                    )}
                  </Box>
                ))}
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Details Step */}
      {activeStep === STEP_DETAILS && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={0.5}>Your Details</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            We use your details to confirm your booking and send appointment reminders.
            Your information is kept private and only shared with the business.
          </Typography>
          <TextField fullWidth label="Full Name" margin="normal" required
            value={customerForm.name}
            onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))} />
          <TextField fullWidth label="Email" type="email" margin="normal" required
            value={customerForm.email}
            onChange={e => setCustomerForm(f => ({ ...f, email: e.target.value }))} />
          <TextField fullWidth label="Phone" margin="normal"
            value={customerForm.phone}
            onChange={e => { setCustomerForm(f => ({ ...f, phone: e.target.value })); setPhoneError(''); }}
            onBlur={() => {
              if (customerForm.phone) {
                const clean = customerForm.phone.replace(/[\s\-\(\)]/g, '');
                if (!/^\+?[0-9]{7,15}$/.test(clean)) setPhoneError('Enter a valid phone number (7-15 digits)');
              }
            }}
            error={!!phoneError} helperText={phoneError} />
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

      {/* Confirm Step */}
      {activeStep === STEP_CONFIRM && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={0.5}>Confirm Your Booking</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Please review your booking details before confirming.
          </Typography>
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

              {depositRequired && (
                <Box mt={1.5} p={1.5} borderRadius={2} sx={{ bgcolor: 'rgba(25, 118, 210, 0.08)' }}>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600} color="info.main">Deposit due now</Typography>
                    <Typography variant="body2" fontWeight={600} color="info.main">£{totalDeposit.toFixed(2)}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Remaining at appointment</Typography>
                    <Typography variant="body2" color="text.secondary">£{remainingBalance.toFixed(2)}</Typography>
                  </Box>
                </Box>
              )}

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

          {hasPolicies && (
            <Box mt={2}>
              <Accordion
                disableGutters
                sx={{
                  border: 'none', borderRadius: '12px !important',
                  bgcolor: '#f8f9fa', '&:before': { display: 'none' }, boxShadow: 'none', mb: 1,
                }}
              >
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography variant="body2" fontWeight={600} display="flex" alignItems="center" gap={0.5}>
                    <Gavel fontSize="small" /> View Policies
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  {[
                    { key: 'policy_cancellation', label: 'Cancellation Policy', icon: EventBusy, tint: '#FFF3E0' },
                    { key: 'policy_noshow', label: 'No-Show Policy', icon: ReportProblem, tint: '#FBE9E7' },
                    { key: 'policy_privacy', label: 'Privacy Policy', icon: Security, tint: '#E8F5E9' },
                    { key: 'policy_terms', label: 'Terms & Conditions', icon: Article, tint: '#E3F2FD' },
                  ].filter(p => siteSettings[p.key]).map(({ key, label, icon: Icon, tint }) => (
                    <Box key={key} mb={2} p={2} sx={{ bgcolor: tint, borderRadius: 2 }}>
                      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                        <Icon sx={{ fontSize: 18, opacity: 0.7 }} />
                        <Typography variant="subtitle2" fontWeight={600}>{label}</Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary" whiteSpace="pre-line" lineHeight={1.6}>
                        {siteSettings[key]}
                      </Typography>
                    </Box>
                  ))}
                </AccordionDetails>
              </Accordion>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={policyAgreed}
                    onChange={e => setPolicyAgreed(e.target.checked)}
                    size="small"
                  />
                }
                label={
                  <Typography variant="body2">
                    I have read and agree to the cancellation, no-show, and privacy policies
                  </Typography>
                }
              />
            </Box>
          )}

          {/* Deposit payment form */}
          {depositRequired && depositIntent && depositIntent.stripePublishableKey && (
            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Typography fontWeight={600} mb={1.5}>Card Payment</Typography>
                <Elements stripe={getStripePromise(depositIntent.stripePublishableKey)}>
                  <DepositPaymentForm
                    clientSecret={depositIntent.clientSecret}
                    depositAmount={depositIntent.depositAmount}
                    onSuccess={handleDepositSuccess}
                    disabled={hasPolicies && !policyAgreed}
                  />
                </Elements>
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {/* Navigation */}
      <Box display="flex" justifyContent="space-between" mt={4}>
        <Button
          variant="outlined"
          disabled={activeStep === STEP_SERVICES || (activeStep === STEP_DATE && preSelectedIds.length > 0)}
          onClick={() => setActiveStep(s => s - 1)}
          sx={{ minHeight: 44 }}
        >
          Back
        </Button>

        {activeStep < STEP_CONFIRM ? (
          <Button
            variant="contained"
            disabled={!canProceed()}
            onClick={() => setActiveStep(s => s + 1)}
            sx={{ minHeight: 44 }}
          >
            Continue
          </Button>
        ) : depositRequired && !depositIntent ? (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || (hasPolicies && !policyAgreed)}
            sx={{ minHeight: 44 }}
          >
            {submitting ? 'Setting up payment...' : `Pay £${totalDeposit.toFixed(2)} Deposit`}
          </Button>
        ) : !depositRequired ? (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || (hasPolicies && !policyAgreed)}
            sx={{ minHeight: 44 }}
          >
            {submitting ? 'Submitting...' : 'Confirm Booking'}
          </Button>
        ) : null}
      </Box>
    </Container>
  );
}

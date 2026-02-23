import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Stepper, Step, StepLabel, Button, Card, CardContent,
  TextField, Chip, Alert, CircularProgress, Autocomplete, Checkbox,
  FormControlLabel, ToggleButton, ToggleButtonGroup, Divider,
  useMediaQuery, useTheme,
} from '@mui/material';
import { ArrowBack, Search } from '@mui/icons-material';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import CalendarGrid from '../../components/CalendarGrid';
import TimeSlotPicker from '../../components/TimeSlotPicker';

const steps = ['Customer', 'Service', 'Date & Time', 'Confirm'];

const FREQUENCY_OPTIONS = [
  { value: 'specific', label: 'Specific Days' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: '4weekly', label: '4 Weekly' },
];

export default function AdminBookingCreate() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [activeStep, setActiveStep] = useState(0);

  // Customer
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' });
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Services
  const [services, setServices] = useState([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);

  // Date & Time
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Booking
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Next available
  const [findingNext, setFindingNext] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(dayjs().startOf('month'));
  const [showManualTime, setShowManualTime] = useState(false);

  // Recurring
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState('weekly');
  const [recurringCount, setRecurringCount] = useState(4);
  const [recurringDates, setRecurringDates] = useState([]); // For 'specific' mode

  // Load services
  useEffect(() => {
    api.get('/admin/services').then(({ data }) => setServices(data)).catch(console.error);
  }, []);

  // Search customers
  useEffect(() => {
    if (customerSearch.length < 2) { setCustomers([]); return; }
    api.get(`/admin/customers/search?q=${encodeURIComponent(customerSearch)}`)
      .then(({ data }) => setCustomers(data))
      .catch(console.error);
  }, [customerSearch]);

  // Load slots when date changes
  useEffect(() => {
    if (!selectedDate) return;
    setSlotsLoading(true);
    api.get(`/admin/slots?date=${selectedDate}`)
      .then(({ data }) => setSlots(data))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate]);

  const selectedServices = services.filter(s => selectedServiceIds.includes(s.id));
  const totalPrice = selectedServices.reduce((sum, s) => sum + parseFloat(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);

  const handleFindNext = async () => {
    if (!selectedServiceIds.length) return;
    setFindingNext(true);
    setError('');
    try {
      const { data } = await api.get(`/admin/next-available?serviceIds=${selectedServiceIds.join(',')}`);
      if (data.found) {
        setSelectedDate(data.date);
        setSelectedSlot(data.time);
        setCalendarMonth(dayjs(data.date).startOf('month'));
      } else {
        setError('No available slots found in the next 30 days');
      }
    } catch {
      setError('Failed to find available slots');
    } finally {
      setFindingNext(false);
    }
  };

  const customerName = isNewCustomer ? newCustomer.name : selectedCustomer?.name;
  const customerEmail = isNewCustomer ? newCustomer.email : selectedCustomer?.email;
  const customerPhone = isNewCustomer ? newCustomer.phone : selectedCustomer?.phone;

  const toggleService = (id) => {
    setSelectedServiceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleRecurringDate = (dateStr) => {
    setRecurringDates(prev =>
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
    );
  };

  // Generate dates from frequency
  const getFrequencyDates = () => {
    if (!selectedDate || recurringFrequency === 'specific') return recurringDates;

    const intervalWeeks = recurringFrequency === 'weekly' ? 1
      : recurringFrequency === 'fortnightly' ? 2
      : 4; // 4weekly

    const dates = [];
    for (let i = 0; i < recurringCount; i++) {
      dates.push(dayjs(selectedDate).add(i * intervalWeeks, 'week').format('YYYY-MM-DD'));
    }
    return dates;
  };

  const allRecurringDates = isRecurring ? getFrequencyDates() : [];

  const canProceed = () => {
    switch (activeStep) {
      case 0: return isNewCustomer ? (newCustomer.name && newCustomer.email && !phoneError) : !!selectedCustomer;
      case 1: return selectedServiceIds.length > 0;
      case 2: {
        if (!isRecurring) return !!selectedDate && !!selectedSlot;
        if (recurringFrequency === 'specific') return recurringDates.length > 0 && !!selectedSlot;
        return !!selectedDate && !!selectedSlot && recurringCount > 0;
      }
      default: return true;
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      const basePayload = {
        customerName,
        customerEmail,
        customerPhone,
        serviceIds: selectedServiceIds,
        notes,
      };

      if (isRecurring && allRecurringDates.length > 0) {
        await api.post('/admin/bookings/admin-create-recurring', {
          ...basePayload,
          dates: allRecurringDates.map(d => ({ date: d, startTime: selectedSlot })),
        });
      } else {
        await api.post('/admin/bookings/admin-create', {
          ...basePayload,
          date: selectedDate,
          startTime: selectedSlot,
        });
      }

      setSuccess(true);
      setTimeout(() => navigate('/admin/bookings'), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Box textAlign="center" py={6}>
        <Typography variant="h5" color="success.main" fontWeight={600}>Booking Created!</Typography>
        <Typography color="text.secondary" mt={1}>Redirecting to bookings...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/admin/bookings')}>Back</Button>
        <Typography variant="h5" fontWeight={600}>Create Booking</Typography>
      </Box>

      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
        {steps.map(label => (
          <Step key={label}><StepLabel>{label}</StepLabel></Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Step 0: Customer */}
      {activeStep === 0 && (
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} mb={2}>Customer Details</Typography>
            <FormControlLabel
              control={<Checkbox checked={isNewCustomer} onChange={e => setIsNewCustomer(e.target.checked)} />}
              label="New customer"
            />

            {isNewCustomer ? (
              <Box mt={1}>
                <TextField fullWidth label="Name" margin="normal" required
                  value={newCustomer.name} onChange={e => setNewCustomer(f => ({ ...f, name: e.target.value }))} />
                <TextField fullWidth label="Email" type="email" margin="normal" required
                  value={newCustomer.email} onChange={e => setNewCustomer(f => ({ ...f, email: e.target.value }))} />
                <TextField fullWidth label="Phone" margin="normal"
                  value={newCustomer.phone}
                  onChange={e => { setNewCustomer(f => ({ ...f, phone: e.target.value })); setPhoneError(''); }}
                  onBlur={() => {
                    if (newCustomer.phone) {
                      const clean = newCustomer.phone.replace(/[\s\-\(\)]/g, '');
                      if (!/^\+?[0-9]{7,15}$/.test(clean)) setPhoneError('Enter a valid phone number (7-15 digits)');
                    }
                  }}
                  error={!!phoneError} helperText={phoneError} />
              </Box>
            ) : (
              <Autocomplete
                options={customers}
                getOptionLabel={(o) => `${o.name} (${o.email})`}
                value={selectedCustomer}
                onChange={(_, v) => setSelectedCustomer(v)}
                inputValue={customerSearch}
                onInputChange={(_, v) => setCustomerSearch(v)}
                renderInput={(params) => (
                  <TextField {...params} label="Search customers" margin="normal" placeholder="Type name, email or phone..." />
                )}
                noOptionsText={customerSearch.length < 2 ? 'Type at least 2 characters' : 'No customers found'}
                sx={{ mt: 1 }}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 1: Services */}
      {activeStep === 1 && (
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} mb={2}>Select Services</Typography>
            {services.map(s => {
              const isSelected = selectedServiceIds.includes(s.id);
              return (
                <Card key={s.id} variant="outlined" sx={{ mb: 1, cursor: 'pointer',
                  border: isSelected ? 2 : 1, borderColor: isSelected ? 'primary.main' : 'divider'
                }} onClick={() => toggleService(s.id)}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Checkbox checked={isSelected} size="small" sx={{ p: 0 }} />
                      <Box flex={1}>
                        <Typography fontWeight={500}>{s.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {s.duration} min — {s.category || 'General'}
                        </Typography>
                      </Box>
                      <Typography fontWeight={600}>£{parseFloat(s.price).toFixed(2)}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
            {selectedServiceIds.length > 0 && (
              <Box mt={2} p={2} bgcolor="grey.100" borderRadius={2}>
                <Typography variant="body2" fontWeight={500}>
                  {selectedServiceIds.length} service{selectedServiceIds.length > 1 ? 's' : ''} — £{totalPrice.toFixed(2)} — {totalDuration} min
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Date & Time */}
      {activeStep === 2 && (
        <Box>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}
            flexDirection={{ xs: 'column', sm: 'row' }} gap={1}>
            <Typography variant="h6" fontWeight={600}>Choose Date & Time</Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <Button variant="outlined" size="small" onClick={handleFindNext}
                disabled={findingNext || !selectedServiceIds.length}
                startIcon={findingNext ? <CircularProgress size={16} /> : <Search />}
                sx={{ minHeight: 40 }}>
                {findingNext ? 'Searching...' : 'Find Next Available'}
              </Button>
              <FormControlLabel
                control={<Checkbox checked={isRecurring} onChange={e => { setIsRecurring(e.target.checked); setRecurringDates([]); }} />}
                label="Recurring"
              />
            </Box>
          </Box>

          {/* Service summary */}
          {selectedServiceIds.length > 0 && (
            <Box mb={2} p={1.5} bgcolor="grey.100" borderRadius={2}>
              <Typography variant="body2" color="text.secondary">
                {selectedServices.map(s => s.name).join(', ')} — {totalDuration} min — £{totalPrice.toFixed(2)}
              </Typography>
            </Box>
          )}

          {isRecurring && (
            <Card sx={{ mb: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="subtitle2" mb={1}>Frequency</Typography>
                <ToggleButtonGroup
                  value={recurringFrequency}
                  exclusive
                  onChange={(e, v) => { if (v) setRecurringFrequency(v); }}
                  size="small"
                  sx={{ mb: 2, flexWrap: 'wrap' }}
                >
                  {FREQUENCY_OPTIONS.map(opt => (
                    <ToggleButton key={opt.value} value={opt.value} sx={{ minHeight: 40 }}>
                      {opt.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>

                {recurringFrequency !== 'specific' && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" mb={1}>
                      How many sessions? (starting from the date you pick below)
                    </Typography>
                    <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
                      {[4, 6, 8, 12].map(n => (
                        <Chip
                          key={n}
                          label={`${n} sessions`}
                          onClick={() => setRecurringCount(n)}
                          variant={recurringCount === n ? 'filled' : 'outlined'}
                          color={recurringCount === n ? 'primary' : 'default'}
                        />
                      ))}
                      <TextField
                        size="small"
                        type="number"
                        value={recurringCount}
                        onChange={e => setRecurringCount(Math.max(1, Math.min(52, parseInt(e.target.value) || 1)))}
                        sx={{ width: 80 }}
                        inputProps={{ min: 1, max: 52 }}
                      />
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* Date picker — Calendar Grid */}
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="body2" color="text.secondary" mb={1}>
                {isRecurring && recurringFrequency === 'specific'
                  ? 'Select multiple dates (same time slot for all):'
                  : isRecurring
                    ? 'Pick the first date — subsequent dates calculated automatically:'
                    : 'Pick a date:'}
              </Typography>

              {isRecurring && recurringFrequency === 'specific' ? (
                <Box>
                  <CalendarGrid
                    calendarMonth={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    multiSelect
                    selectedDates={recurringDates}
                    onDateToggle={toggleRecurringDate}
                  />
                  {recurringDates.length > 0 && (
                    <Typography variant="body2" mt={1} fontWeight={500}>
                      {recurringDates.length} date(s) selected
                    </Typography>
                  )}
                </Box>
              ) : (
                <Box>
                  <CalendarGrid
                    calendarMonth={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    selectedDate={selectedDate}
                    onDateSelect={(dateStr) => { setSelectedDate(dateStr); setSelectedSlot(null); }}
                  />

                  {/* Recurring dates preview */}
                  {isRecurring && recurringFrequency !== 'specific' && selectedDate && (
                    <Box p={1.5} bgcolor="grey.50" borderRadius={2} mt={1.5}>
                      <Typography variant="subtitle2" mb={0.5}>
                        {allRecurringDates.length} scheduled dates:
                      </Typography>
                      <Box display="flex" flexWrap="wrap" gap={0.5}>
                        {allRecurringDates.map(d => (
                          <Chip key={d} label={dayjs(d).format('ddd D MMM')} size="small" variant="outlined" />
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Time slot picker */}
          {(selectedDate || recurringDates.length > 0) && (
            <Card>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="subtitle2" mb={1}>Time Slot</Typography>
                <TimeSlotPicker
                  slots={slots}
                  totalDuration={totalDuration}
                  selectedSlot={selectedSlot}
                  onSlotSelect={setSelectedSlot}
                  loading={slotsLoading}
                  emptyMessage="No available slots. Try another date."
                />

                {/* Manual time override */}
                <Box mt={2}>
                  <Button variant="text" size="small"
                    onClick={() => setShowManualTime(prev => !prev)}
                    sx={{ color: 'text.secondary' }}>
                    {showManualTime ? 'Hide manual override' : 'Manual time override'}
                  </Button>
                  {showManualTime && (
                    <TextField
                      label="Manual time" size="small" type="time" sx={{ mt: 1, display: 'block' }}
                      value={selectedSlot || ''}
                      onChange={e => setSelectedSlot(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      helperText="Use this if slots haven't been generated for this date"
                    />
                  )}
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {/* Step 3: Confirm */}
      {activeStep === 3 && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={2}>Confirm Booking</Typography>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Customer</Typography>
              <Typography>{customerName} — {customerEmail}</Typography>
              {customerPhone && <Typography variant="body2">{customerPhone}</Typography>}

              <Typography variant="subtitle2" color="text.secondary" mt={2}>Services</Typography>
              {selectedServices.map(s => (
                <Box key={s.id} display="flex" justifyContent="space-between" py={0.5}>
                  <Typography variant="body2">{s.name} ({s.duration} min)</Typography>
                  <Typography variant="body2">£{parseFloat(s.price).toFixed(2)}</Typography>
                </Box>
              ))}
              <Box display="flex" justifyContent="space-between" pt={1} mt={1} borderTop={1} borderColor="divider">
                <Typography fontWeight={600}>Total per session</Typography>
                <Typography fontWeight={600}>£{totalPrice.toFixed(2)} — {totalDuration} min</Typography>
              </Box>

              <Typography variant="subtitle2" color="text.secondary" mt={2}>Date & Time</Typography>
              {isRecurring ? (
                <Box>
                  {recurringFrequency !== 'specific' && (
                    <Typography variant="body2" color="text.secondary" mb={1}>
                      {recurringFrequency === 'weekly' ? 'Weekly' : recurringFrequency === 'fortnightly' ? 'Fortnightly' : '4-weekly'}
                      {' '} — {allRecurringDates.length} sessions — £{(totalPrice * allRecurringDates.length).toFixed(2)} total
                    </Typography>
                  )}
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {(recurringFrequency === 'specific' ? recurringDates.sort() : allRecurringDates).map(d => (
                      <Chip key={d} label={`${dayjs(d).format('ddd D MMM')} at ${selectedSlot}`} size="small" sx={{ mb: 0.5 }} />
                    ))}
                  </Box>
                </Box>
              ) : (
                <Typography>{dayjs(selectedDate).format('dddd D MMMM YYYY')} at {selectedSlot}</Typography>
              )}

              <TextField fullWidth label="Notes (optional)" margin="normal" multiline rows={2}
                value={notes} onChange={e => setNotes(e.target.value)} />

              <Alert severity="info" sx={{ mt: 1 }}>
                {isRecurring
                  ? `${allRecurringDates.length} bookings will be created, all auto-confirmed.`
                  : 'This booking will be auto-confirmed (created by admin).'}
              </Alert>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Spacer for fixed bottom bar */}
      <Box sx={{ height: 90 }} />

      {/* Fixed bottom navigation bar */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: { xs: 0, md: '240px' },
          right: 0,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
          px: 3,
          py: 2,
          zIndex: 1100,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <Button variant="outlined" disabled={activeStep === 0} onClick={() => setActiveStep(s => s - 1)} sx={{ minHeight: 44 }}>
            Back
          </Button>
          {selectedServiceIds.length > 0 && activeStep > 0 && (
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography variant="body2" color="text.secondary">
                {selectedServiceIds.length} service{selectedServiceIds.length > 1 ? 's' : ''} — {totalDuration} min
              </Typography>
              <Typography variant="body2" fontWeight={700} color="primary.main">
                £{totalPrice.toFixed(2)}
              </Typography>
            </Box>
          )}
        </Box>
        {activeStep < 3 ? (
          <Button variant="contained" disabled={!canProceed()} onClick={() => setActiveStep(s => s + 1)} sx={{ minHeight: 44, px: 4 }}>
            Continue
          </Button>
        ) : (
          <Button variant="contained" onClick={handleSubmit} disabled={submitting} sx={{ minHeight: 44, px: 4 }}>
            {submitting ? 'Creating...' : isRecurring ? `Create ${allRecurringDates.length} Bookings` : 'Create Booking'}
          </Button>
        )}
      </Box>
    </Box>
  );
}

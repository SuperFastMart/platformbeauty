import { useState, useEffect } from 'react';
import {
  Box, Typography, Stepper, Step, StepLabel, Button, Card, CardContent,
  TextField, Chip, Alert, CircularProgress, Autocomplete, Checkbox,
  FormControlLabel
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

const steps = ['Customer', 'Service', 'Date & Time', 'Confirm'];

export default function AdminBookingCreate() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);

  // Customer
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' });
  const [isNewCustomer, setIsNewCustomer] = useState(false);

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

  // Recurring
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDates, setRecurringDates] = useState([]);

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
    // Use admin's tenant slug from the services endpoint context
    api.get(`/admin/slots?date=${selectedDate}`)
      .then(({ data }) => setSlots(data))
      .catch(() => {
        // Fallback: try fetching from the admin endpoint
        setSlots([]);
      })
      .finally(() => setSlotsLoading(false));
  }, [selectedDate]);

  const selectedServices = services.filter(s => selectedServiceIds.includes(s.id));
  const totalPrice = selectedServices.reduce((sum, s) => sum + parseFloat(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);
  const dateOptions = Array.from({ length: 30 }, (_, i) => dayjs().add(i, 'day'));

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

  const canProceed = () => {
    switch (activeStep) {
      case 0: return isNewCustomer ? (newCustomer.name && newCustomer.email) : !!selectedCustomer;
      case 1: return selectedServiceIds.length > 0;
      case 2: return isRecurring ? recurringDates.length > 0 : (!!selectedDate && !!selectedSlot);
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

      if (isRecurring && recurringDates.length > 0) {
        await api.post('/admin/bookings/admin-create-recurring', {
          ...basePayload,
          dates: recurringDates.map(d => ({ date: d, startTime: selectedSlot })),
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
        <Box maxWidth={500}>
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
                value={newCustomer.phone} onChange={e => setNewCustomer(f => ({ ...f, phone: e.target.value }))} />
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
        </Box>
      )}

      {/* Step 1: Services */}
      {activeStep === 1 && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={2}>Select Services</Typography>
          {services.map(s => {
            const isSelected = selectedServiceIds.includes(s.id);
            return (
              <Card key={s.id} sx={{ mb: 1, cursor: 'pointer',
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
              <Typography variant="body2">
                {selectedServiceIds.length} service{selectedServiceIds.length > 1 ? 's' : ''} — £{totalPrice.toFixed(2)} — {totalDuration} min
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Step 2: Date & Time */}
      {activeStep === 2 && (
        <Box>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" fontWeight={600}>Choose Date & Time</Typography>
            <FormControlLabel
              control={<Checkbox checked={isRecurring} onChange={e => { setIsRecurring(e.target.checked); setRecurringDates([]); }} />}
              label="Recurring"
            />
          </Box>

          {isRecurring ? (
            <Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                Select multiple dates (same time slot will be used for all):
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                {dateOptions.map(d => {
                  const dateStr = d.format('YYYY-MM-DD');
                  const isSelected = recurringDates.includes(dateStr);
                  return (
                    <Chip
                      key={dateStr}
                      label={<Box textAlign="center"><Typography variant="caption" display="block">{d.format('ddd')}</Typography><Typography variant="body2" fontWeight={600}>{d.format('D MMM')}</Typography></Box>}
                      onClick={() => toggleRecurringDate(dateStr)}
                      variant={isSelected ? 'filled' : 'outlined'}
                      color={isSelected ? 'primary' : 'default'}
                      sx={{ height: 'auto', py: 1, px: 0.5, borderRadius: 2 }}
                    />
                  );
                })}
              </Box>
              {recurringDates.length > 0 && (
                <Typography variant="body2" mb={2}>{recurringDates.length} date(s) selected</Typography>
              )}
            </Box>
          ) : (
            <Box mb={3}>
              <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                {dateOptions.map(d => {
                  const dateStr = d.format('YYYY-MM-DD');
                  const isSelected = selectedDate === dateStr;
                  return (
                    <Chip
                      key={dateStr}
                      label={<Box textAlign="center"><Typography variant="caption" display="block">{d.format('ddd')}</Typography><Typography variant="body2" fontWeight={600}>{d.format('D MMM')}</Typography></Box>}
                      onClick={() => { setSelectedDate(dateStr); setSelectedSlot(null); }}
                      variant={isSelected ? 'filled' : 'outlined'}
                      color={isSelected ? 'primary' : 'default'}
                      sx={{ height: 'auto', py: 1, px: 0.5, borderRadius: 2 }}
                    />
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Time slot picker */}
          {(selectedDate || recurringDates.length > 0) && (
            <Box>
              <Typography variant="subtitle2" mb={1}>Time Slot</Typography>
              {slotsLoading ? (
                <CircularProgress size={24} />
              ) : slots.length === 0 && selectedDate ? (
                <Alert severity="info">No available slots. Try another date.</Alert>
              ) : (
                <Box display="flex" flexWrap="wrap" gap={1}>
                  {slots.map(slot => {
                    const time = slot.start_time?.slice(0, 5);
                    return (
                      <Chip
                        key={slot.id}
                        label={time}
                        onClick={() => setSelectedSlot(time)}
                        variant={selectedSlot === time ? 'filled' : 'outlined'}
                        color={selectedSlot === time ? 'primary' : 'default'}
                        sx={{ minWidth: 70, fontSize: '0.9rem' }}
                      />
                    );
                  })}
                </Box>
              )}

              <TextField
                label="Time (manual)" size="small" type="time" sx={{ mt: 2 }}
                value={selectedSlot || ''}
                onChange={e => setSelectedSlot(e.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText="Or type a time manually if slots aren't generated yet"
              />
            </Box>
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
                <Typography fontWeight={600}>Total</Typography>
                <Typography fontWeight={600}>£{totalPrice.toFixed(2)} — {totalDuration} min</Typography>
              </Box>

              <Typography variant="subtitle2" color="text.secondary" mt={2}>Date & Time</Typography>
              {isRecurring ? (
                <Box>
                  {recurringDates.sort().map(d => (
                    <Chip key={d} label={`${dayjs(d).format('ddd D MMM')} at ${selectedSlot}`} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                  ))}
                </Box>
              ) : (
                <Typography>{dayjs(selectedDate).format('dddd D MMMM YYYY')} at {selectedSlot}</Typography>
              )}

              <TextField fullWidth label="Notes (optional)" margin="normal" multiline rows={2}
                value={notes} onChange={e => setNotes(e.target.value)} />

              <Alert severity="info" sx={{ mt: 1 }}>
                This booking will be auto-confirmed (created by admin).
              </Alert>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Navigation */}
      <Box display="flex" justifyContent="space-between" mt={4}>
        <Button variant="outlined" disabled={activeStep === 0} onClick={() => setActiveStep(s => s - 1)}>
          Back
        </Button>
        {activeStep < 3 ? (
          <Button variant="contained" disabled={!canProceed()} onClick={() => setActiveStep(s => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating...' : isRecurring ? `Create ${recurringDates.length} Bookings` : 'Create Booking'}
          </Button>
        )}
      </Box>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stepper, Step, StepLabel, Button, Card, CardContent,
  TextField, Checkbox, Container, Chip, Alert, CircularProgress
} from '@mui/material';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';

const steps = ['Services', 'Date', 'Time', 'Details', 'Confirm'];

export default function BookingFlow() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const tenant = useTenant();

  const [activeStep, setActiveStep] = useState(0);
  const [allServices, setAllServices] = useState([]);
  const [grouped, setGrouped] = useState({});
  const [selectedIds, setSelectedIds] = useState(location.state?.selectedServiceIds || []);
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [error, setError] = useState('');

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

  const toggleService = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Generate next 14 days for date selection
  const dateOptions = Array.from({ length: 14 }, (_, i) => dayjs().add(i + 1, 'day'));

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
      setActiveStep(5); // Success step
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
        <Typography variant="h4" fontWeight={700} gutterBottom color="success.main">
          Booking Confirmed!
        </Typography>
        <Typography variant="body1" color="text.secondary" mb={4}>
          Your booking request has been submitted. You'll receive a confirmation once it's approved.
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

        <Button variant="outlined" sx={{ mt: 3 }} onClick={() => navigate(`/t/${slug}`)}>
          Back to {tenant?.name}
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
        {steps.map(label => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Step 0: Services */}
      {activeStep === 0 && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={2}>Select Services</Typography>
          {Object.entries(grouped).map(([category, services]) => (
            <Box key={category} mb={3}>
              <Typography variant="subtitle2" color="text.secondary" mb={1}>{category}</Typography>
              {services.map(s => {
                const isSelected = selectedIds.includes(s.id);
                return (
                  <Card key={s.id} sx={{ mb: 1, cursor: 'pointer',
                    border: isSelected ? 2 : 1, borderColor: isSelected ? 'primary.main' : 'divider'
                  }} onClick={() => toggleService(s.id)}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Checkbox checked={isSelected} size="small" sx={{ p: 0 }} />
                        <Box flex={1}>
                          <Typography fontWeight={500}>{s.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{s.duration} min</Typography>
                        </Box>
                        <Typography fontWeight={600}>£{parseFloat(s.price).toFixed(2)}</Typography>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          ))}
          {selectedIds.length > 0 && (
            <Box mt={2} p={2} bgcolor="grey.100" borderRadius={2}>
              <Typography variant="body2" color="text.secondary">
                {selectedIds.length} service{selectedIds.length > 1 ? 's' : ''} — £{totalPrice.toFixed(2)} — {totalDuration} min
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Step 1: Date */}
      {activeStep === 1 && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={2}>Choose a Date</Typography>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {dateOptions.map(d => {
              const dateStr = d.format('YYYY-MM-DD');
              const isSelected = selectedDate === dateStr;
              return (
                <Chip
                  key={dateStr}
                  label={
                    <Box textAlign="center">
                      <Typography variant="caption" display="block">{d.format('ddd')}</Typography>
                      <Typography variant="body2" fontWeight={600}>{d.format('D MMM')}</Typography>
                    </Box>
                  }
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

      {/* Step 2: Time */}
      {activeStep === 2 && (
        <Box>
          <Typography variant="h6" fontWeight={600} mb={1}>Choose a Time</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {dayjs(selectedDate).format('dddd D MMMM YYYY')} — {totalDuration} min needed
          </Typography>

          {slotsLoading ? (
            <Box textAlign="center" py={4}><CircularProgress /></Box>
          ) : slots.length === 0 ? (
            <Alert severity="info">No available slots for this date. Please try another date.</Alert>
          ) : (
            <Box display="flex" flexWrap="wrap" gap={1}>
              {slots.map(slot => {
                const time = slot.start_time?.slice(0, 5);
                const isSelected = selectedSlot === time;
                return (
                  <Chip
                    key={slot.id}
                    label={time}
                    onClick={() => setSelectedSlot(time)}
                    variant={isSelected ? 'filled' : 'outlined'}
                    color={isSelected ? 'primary' : 'default'}
                    sx={{ minWidth: 70, fontSize: '0.9rem' }}
                  />
                );
              })}
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
              <Box display="flex" justifyContent="space-between" pt={1} mt={1} borderTop={1} borderColor="divider">
                <Typography fontWeight={600}>Total</Typography>
                <Typography fontWeight={600}>£{totalPrice.toFixed(2)} — {totalDuration} min</Typography>
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
          disabled={activeStep === 0}
          onClick={() => setActiveStep(s => s - 1)}
        >
          Back
        </Button>

        {activeStep < 4 ? (
          <Button
            variant="contained"
            disabled={!canProceed()}
            onClick={() => setActiveStep(s => s + 1)}
          >
            Continue
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Confirm Booking'}
          </Button>
        )}
      </Box>
    </Container>
  );
}

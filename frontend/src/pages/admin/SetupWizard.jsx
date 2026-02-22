import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stepper, Step, StepLabel, StepContent, Button,
  TextField, Card, CardContent, Alert, Chip, CircularProgress,
  IconButton, Switch, FormControlLabel
} from '@mui/material';
import {
  ContentCut, Info, Palette, Payment, Schedule,
  CheckCircle, Add, Delete, ArrowForward, Celebration
} from '@mui/icons-material';
import api from '../../api/client';

const DAYS_CONFIG = [
  { name: 'Monday', num: 1, open: true, start: '09:00', end: '17:00', duration: 30 },
  { name: 'Tuesday', num: 2, open: true, start: '09:00', end: '17:00', duration: 30 },
  { name: 'Wednesday', num: 3, open: true, start: '09:00', end: '17:00', duration: 30 },
  { name: 'Thursday', num: 4, open: true, start: '09:00', end: '17:00', duration: 30 },
  { name: 'Friday', num: 5, open: true, start: '09:00', end: '17:00', duration: 30 },
  { name: 'Saturday', num: 6, open: true, start: '09:00', end: '15:00', duration: 30 },
  { name: 'Sunday', num: 0, open: false, start: '10:00', end: '16:00', duration: 30 },
];

export default function SetupWizard() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Step 1: Services
  const [serviceList, setServiceList] = useState([{ name: '', duration: 30, price: '', category: '' }]);

  // Step 2: About
  const [aboutTitle, setAboutTitle] = useState('');
  const [aboutText, setAboutText] = useState('');

  // Step 3: Branding
  const [primaryColor, setPrimaryColor] = useState('#6366f1');
  const [logoUrl, setLogoUrl] = useState('');

  // Step 4: Stripe
  const [stripePublishable, setStripePublishable] = useState('');
  const [stripeSecret, setStripeSecret] = useState('');

  // Step 5: Availability
  const [days, setDays] = useState(DAYS_CONFIG.map(d => ({ ...d })));

  useEffect(() => {
    api.get('/admin/setup-status')
      .then(r => {
        setStatus(r.data);
        // Jump to first incomplete step
        const checks = [r.data.hasServices, r.data.hasAbout, r.data.hasBranding, r.data.hasStripe, r.data.hasTemplates];
        const firstIncomplete = checks.findIndex(c => !c);
        if (firstIncomplete !== -1) setActiveStep(firstIncomplete);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const refreshStatus = () => api.get('/admin/setup-status').then(r => setStatus(r.data)).catch(() => {});

  // Step 1: Save services
  const saveServices = async () => {
    const valid = serviceList.filter(s => s.name.trim() && s.duration > 0 && s.price);
    if (valid.length === 0) return;
    setSaving(true);
    try {
      for (const s of valid) {
        await api.post('/admin/services', {
          name: s.name.trim(),
          duration: parseInt(s.duration),
          price: parseFloat(s.price),
          category: s.category.trim() || 'General',
          description: '',
          display_order: 0,
        });
      }
      await refreshStatus();
      setActiveStep(1);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save services');
    } finally {
      setSaving(false);
    }
  };

  // Step 2: Save about
  const saveAbout = async () => {
    setSaving(true);
    try {
      const settings = {};
      if (aboutTitle.trim()) settings.about_title = aboutTitle.trim();
      if (aboutText.trim()) settings.about_text = aboutText.trim();
      if (Object.keys(settings).length > 0) {
        await api.put('/admin/site-settings', settings);
      }
      await refreshStatus();
      setActiveStep(2);
    } catch {
      alert('Failed to save about info');
    } finally {
      setSaving(false);
    }
  };

  // Step 3: Save branding
  const saveBranding = async () => {
    setSaving(true);
    try {
      const settings = {};
      if (primaryColor) settings.primary_color = primaryColor;
      if (logoUrl.trim()) settings.logo_url = logoUrl.trim();
      await api.put('/admin/site-settings', settings);
      await refreshStatus();
      setActiveStep(3);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save branding');
    } finally {
      setSaving(false);
    }
  };

  // Step 4: Save Stripe
  const saveStripe = async () => {
    if (!stripePublishable.trim() || !stripeSecret.trim()) return;
    setSaving(true);
    try {
      await api.put('/admin/settings', {
        stripe_publishable_key: stripePublishable.trim(),
        stripe_secret_key: stripeSecret.trim(),
      });
      await refreshStatus();
      setActiveStep(4);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save Stripe keys');
    } finally {
      setSaving(false);
    }
  };

  // Step 5: Save availability
  const saveAvailability = async () => {
    const openDays = days.filter(d => d.open);
    if (openDays.length === 0) return;
    setSaving(true);
    try {
      for (const day of openDays) {
        await api.post('/admin/slot-templates', {
          name: `${day.name} Schedule`,
          day_of_week: day.num,
          start_time: day.start,
          end_time: day.end,
          slot_duration: parseInt(day.duration),
        });
      }
      // Generate 2 weeks of slots
      const today = new Date();
      const twoWeeks = new Date(today);
      twoWeeks.setDate(twoWeeks.getDate() + 14);
      await api.post('/admin/slot-templates/generate', {
        startDate: today.toISOString().split('T')[0],
        endDate: twoWeeks.toISOString().split('T')[0],
      });
      await refreshStatus();
      setActiveStep(5);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save availability');
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async () => {
    await api.post('/admin/setup-status/dismiss').catch(() => {});
    navigate('/admin/dashboard');
  };

  const allComplete = status && status.hasServices && status.hasAbout && status.hasBranding && status.hasTemplates;

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    );
  }

  // Completion screen
  if (activeStep === 5 || allComplete) {
    return (
      <Box maxWidth={600} mx="auto" mt={4} textAlign="center">
        <Celebration sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
        <Typography variant="h4" fontWeight={700} gutterBottom>
          You're all set!
        </Typography>
        <Typography color="text.secondary" mb={4}>
          Your booking page is ready for customers. You can always adjust these settings later.
        </Typography>
        <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
          <Button variant="contained" size="large" onClick={() => navigate('/admin/dashboard')}>
            Go to Dashboard
          </Button>
          <Button
            variant="outlined" size="large"
            onClick={() => window.open(`/t/${localStorage.getItem('auth_user') ? JSON.parse(localStorage.getItem('auth_user')).tenantSlug : ''}`, '_blank')}
          >
            View Booking Page
          </Button>
        </Box>
      </Box>
    );
  }

  const steps = [
    {
      label: 'Add Your Services',
      icon: <ContentCut />,
      complete: status?.hasServices,
      content: (
        <Box>
          <Typography variant="body2" color="text.secondary" mb={2}>
            What services do you offer? Add at least one to get started.
          </Typography>
          {serviceList.map((s, i) => (
            <Card key={i} variant="outlined" sx={{ mb: 1.5 }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box display="flex" gap={1.5} flexWrap="wrap" alignItems="center">
                  <TextField
                    label="Service name" size="small" required sx={{ flex: 2, minWidth: 150 }}
                    value={s.name}
                    onChange={e => {
                      const list = [...serviceList];
                      list[i].name = e.target.value;
                      setServiceList(list);
                    }}
                  />
                  <TextField
                    label="Duration (min)" size="small" type="number" sx={{ width: 110 }}
                    inputProps={{ min: 5, max: 480 }}
                    value={s.duration}
                    onChange={e => {
                      const list = [...serviceList];
                      list[i].duration = e.target.value;
                      setServiceList(list);
                    }}
                  />
                  <TextField
                    label="Price" size="small" type="number" sx={{ width: 90 }}
                    inputProps={{ min: 0, step: 0.01 }}
                    value={s.price}
                    onChange={e => {
                      const list = [...serviceList];
                      list[i].price = e.target.value;
                      setServiceList(list);
                    }}
                  />
                  <TextField
                    label="Category" size="small" sx={{ flex: 1, minWidth: 120 }}
                    value={s.category}
                    placeholder="e.g. Hair, Nails"
                    onChange={e => {
                      const list = [...serviceList];
                      list[i].category = e.target.value;
                      setServiceList(list);
                    }}
                  />
                  {serviceList.length > 1 && (
                    <IconButton size="small" onClick={() => setServiceList(serviceList.filter((_, j) => j !== i))}>
                      <Delete fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              </CardContent>
            </Card>
          ))}
          <Button
            size="small" startIcon={<Add />}
            onClick={() => setServiceList([...serviceList, { name: '', duration: 30, price: '', category: '' }])}
          >
            Add another service
          </Button>
          <Box display="flex" gap={1} mt={2}>
            <Button
              variant="contained" onClick={saveServices} disabled={saving || !serviceList.some(s => s.name.trim() && s.price)}
            >
              {saving ? 'Saving...' : 'Save & Continue'}
            </Button>
            <Button onClick={() => navigate('/admin/services')} color="inherit">
              Use full Services page instead
            </Button>
          </Box>
        </Box>
      ),
    },
    {
      label: 'About Your Business',
      icon: <Info />,
      complete: status?.hasAbout,
      content: (
        <Box>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Tell your customers about your business. This appears on your booking page.
          </Typography>
          <TextField
            fullWidth label="Business Tagline" size="small" sx={{ mb: 2 }}
            value={aboutTitle}
            onChange={e => setAboutTitle(e.target.value)}
            placeholder="e.g. Professional beauty treatments in the heart of town"
          />
          <TextField
            fullWidth label="About Text" multiline rows={3} size="small"
            value={aboutText}
            onChange={e => setAboutText(e.target.value)}
            placeholder="Describe your business, experience, and what makes you special..."
          />
          <Box display="flex" gap={1} mt={2}>
            <Button variant="contained" onClick={saveAbout} disabled={saving || (!aboutTitle.trim() && !aboutText.trim())}>
              {saving ? 'Saving...' : 'Save & Continue'}
            </Button>
            <Button onClick={() => setActiveStep(2)}>Skip</Button>
          </Box>
        </Box>
      ),
    },
    {
      label: 'Branding',
      icon: <Palette />,
      complete: status?.hasBranding,
      content: (
        <Box>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Customise your booking page with your brand colour and logo.
          </Typography>
          <Box display="flex" gap={2} alignItems="center" mb={2}>
            <TextField
              label="Brand Colour" size="small" type="color" sx={{ width: 120 }}
              value={primaryColor}
              onChange={e => setPrimaryColor(e.target.value)}
            />
            <Box sx={{ width: 40, height: 40, borderRadius: 1, bgcolor: primaryColor, border: '1px solid rgba(0,0,0,0.12)' }} />
          </Box>
          <TextField
            fullWidth label="Logo URL (optional)" size="small"
            value={logoUrl}
            onChange={e => setLogoUrl(e.target.value)}
            placeholder="https://example.com/your-logo.png"
            helperText="Direct link to your logo image"
          />
          <Box display="flex" gap={1} mt={2}>
            <Button variant="contained" onClick={saveBranding} disabled={saving}>
              {saving ? 'Saving...' : 'Save & Continue'}
            </Button>
            <Button onClick={() => setActiveStep(3)}>Skip</Button>
          </Box>
        </Box>
      ),
    },
    {
      label: 'Connect Stripe (Payments)',
      icon: <Payment />,
      complete: status?.hasStripe,
      content: (
        <Box>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Connect Stripe to accept online payments from your customers. You can skip this and accept cash/manual payments only.
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            Find your API keys at{' '}
            <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer">
              dashboard.stripe.com/apikeys
            </a>
          </Alert>
          <TextField
            fullWidth label="Publishable Key" size="small" sx={{ mb: 2 }}
            value={stripePublishable}
            onChange={e => setStripePublishable(e.target.value)}
            placeholder="pk_live_..."
          />
          <TextField
            fullWidth label="Secret Key" size="small" type="password"
            value={stripeSecret}
            onChange={e => setStripeSecret(e.target.value)}
            placeholder="sk_live_..."
          />
          <Box display="flex" gap={1} mt={2}>
            <Button
              variant="contained" onClick={saveStripe}
              disabled={saving || !stripePublishable.trim() || !stripeSecret.trim()}
            >
              {saving ? 'Saving...' : 'Save & Continue'}
            </Button>
            <Button onClick={() => setActiveStep(4)}>Skip for now</Button>
          </Box>
        </Box>
      ),
    },
    {
      label: 'Set Your Availability',
      icon: <Schedule />,
      complete: status?.hasTemplates,
      content: (
        <Box>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Set your working hours. We'll generate bookable time slots for the next 2 weeks automatically.
          </Typography>
          {days.map((day, i) => (
            <Box
              key={day.name} display="flex" alignItems="center" gap={1.5} py={0.75}
              sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={day.open}
                    onChange={e => setDays(d => d.map((dd, j) => j === i ? { ...dd, open: e.target.checked } : dd))}
                    size="small"
                  />
                }
                label={<Typography variant="body2" sx={{ width: 80 }}>{day.name}</Typography>}
                sx={{ mr: 0 }}
              />
              {day.open ? (
                <>
                  <TextField
                    type="time" size="small" sx={{ width: 120 }}
                    value={day.start}
                    onChange={e => setDays(d => d.map((dd, j) => j === i ? { ...dd, start: e.target.value } : dd))}
                  />
                  <Typography variant="body2">to</Typography>
                  <TextField
                    type="time" size="small" sx={{ width: 120 }}
                    value={day.end}
                    onChange={e => setDays(d => d.map((dd, j) => j === i ? { ...dd, end: e.target.value } : dd))}
                  />
                  <TextField
                    type="number" size="small" label="Slot min" sx={{ width: 80 }}
                    inputProps={{ min: 5, max: 120 }}
                    value={day.duration}
                    onChange={e => setDays(d => d.map((dd, j) => j === i ? { ...dd, duration: e.target.value } : dd))}
                  />
                </>
              ) : (
                <Chip label="Closed" size="small" variant="outlined" />
              )}
            </Box>
          ))}
          <Box display="flex" gap={1} mt={2}>
            <Button
              variant="contained" onClick={saveAvailability}
              disabled={saving || !days.some(d => d.open)}
            >
              {saving ? 'Saving...' : 'Save & Generate Slots'}
            </Button>
            <Button onClick={() => navigate('/admin/slot-templates')} color="inherit">
              Use full Availability page
            </Button>
          </Box>
        </Box>
      ),
    },
  ];

  return (
    <Box maxWidth={700} mx="auto">
      <Typography variant="h5" fontWeight={700} mb={1}>
        Welcome! Let's set up your booking page
      </Typography>
      <Typography color="text.secondary" mb={3}>
        Complete these steps to get your business ready to accept bookings. You can always change these later in Settings.
      </Typography>

      <Stepper activeStep={activeStep} orientation="vertical">
        {steps.map((step, index) => (
          <Step key={step.label} completed={step.complete}>
            <StepLabel
              optional={step.complete ? <Chip label="Done" size="small" color="success" sx={{ height: 20, fontSize: 11 }} /> : null}
              StepIconProps={{
                icon: step.complete ? <CheckCircle color="success" /> : index + 1,
              }}
              onClick={() => setActiveStep(index)}
              sx={{ cursor: 'pointer' }}
            >
              <Typography fontWeight={activeStep === index ? 600 : 400}>{step.label}</Typography>
            </StepLabel>
            <StepContent>
              {step.content}
            </StepContent>
          </Step>
        ))}
      </Stepper>

      <Box mt={4} pt={2} borderTop="1px solid" borderColor="divider">
        <Button color="inherit" size="small" onClick={handleDismiss}>
          Skip setup — I'll configure everything myself
        </Button>
      </Box>
    </Box>
  );
}

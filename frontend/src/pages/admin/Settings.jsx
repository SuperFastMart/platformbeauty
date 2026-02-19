import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button, Tabs, Tab,
  Snackbar, Alert, CircularProgress, InputAdornment, Chip
} from '@mui/material';
import { Save, CreditCard, Store, Palette } from '@mui/icons-material';
import api from '../../api/client';

function TabPanel({ children, value, index }) {
  return value === index ? <Box mt={3}>{children}</Box> : null;
}

export default function Settings() {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const [settings, setSettings] = useState({
    name: '',
    business_phone: '',
    business_address: '',
    logo_url: '',
    primary_color: '#8B2635',
    stripe_publishable_key: '',
    stripe_secret_key: '',
    stripe_secret_key_set: false,
    stripe_secret_key_masked: '',
    subscription_tier: '',
    subscription_status: '',
  });

  useEffect(() => {
    api.get('/admin/settings')
      .then(({ data }) => setSettings(s => ({ ...s, ...data, stripe_secret_key: '' })))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (field) => (e) => {
    setSettings(s => ({ ...s, [field]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...settings };
      // Don't send empty secret key (keep existing)
      if (!payload.stripe_secret_key) {
        delete payload.stripe_secret_key;
      }
      delete payload.stripe_secret_key_set;
      delete payload.stripe_secret_key_masked;
      delete payload.subscription_tier;
      delete payload.subscription_status;

      await api.put('/admin/settings', payload);
      setSnackbar({ open: true, message: 'Settings saved', severity: 'success' });

      // Refresh to get updated masked values
      const { data } = await api.get('/admin/settings');
      setSettings(s => ({ ...s, ...data, stripe_secret_key: '' }));
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to save', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Settings</Typography>
        <Button variant="contained" startIcon={<Save />} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab icon={<Store />} label="Business" iconPosition="start" />
        <Tab icon={<Palette />} label="Branding" iconPosition="start" />
        <Tab icon={<CreditCard />} label="Payments" iconPosition="start" />
      </Tabs>

      {/* Business Info */}
      <TabPanel value={tab} index={0}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>Business Information</Typography>
            <TextField fullWidth label="Business Name" margin="normal"
              value={settings.name} onChange={handleChange('name')} />
            <TextField fullWidth label="Phone" margin="normal"
              value={settings.business_phone || ''} onChange={handleChange('business_phone')} />
            <TextField fullWidth label="Address" margin="normal" multiline rows={2}
              value={settings.business_address || ''} onChange={handleChange('business_address')} />
          </CardContent>
        </Card>
      </TabPanel>

      {/* Branding */}
      <TabPanel value={tab} index={1}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>Branding</Typography>
            <TextField fullWidth label="Logo URL" margin="normal"
              value={settings.logo_url || ''} onChange={handleChange('logo_url')}
              helperText="Direct link to your logo image (PNG, JPG)" />
            {settings.logo_url && (
              <Box mt={1} mb={2}>
                <img src={settings.logo_url} alt="Logo preview"
                  style={{ maxHeight: 80, borderRadius: 4 }}
                  onError={(e) => { e.target.style.display = 'none'; }} />
              </Box>
            )}
            <TextField fullWidth label="Primary Color" margin="normal" type="color"
              value={settings.primary_color || '#8B2635'} onChange={handleChange('primary_color')}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: settings.primary_color }} />
                  </InputAdornment>
                ),
              }}
              helperText="Used for buttons, headers, and your public booking page" />
          </CardContent>
        </Card>
      </TabPanel>

      {/* Payments / Stripe */}
      <TabPanel value={tab} index={2}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>Stripe Integration</Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Connect your Stripe account to accept card payments, save cards on file, and charge no-show fees.
              You can find your API keys in the{' '}
              <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer">
                Stripe Dashboard
              </a>.
            </Typography>

            {settings.stripe_secret_key_set ? (
              <Alert severity="success" sx={{ mb: 2 }}>
                Stripe is connected. Secret key: {settings.stripe_secret_key_masked}
              </Alert>
            ) : (
              <Alert severity="info" sx={{ mb: 2 }}>
                Stripe is not configured. Add your API keys below to enable card payments.
              </Alert>
            )}

            <TextField fullWidth label="Publishable Key" margin="normal"
              value={settings.stripe_publishable_key || ''}
              onChange={handleChange('stripe_publishable_key')}
              placeholder="pk_live_... or pk_test_..."
              helperText="Starts with pk_live_ or pk_test_" />

            <TextField fullWidth label="Secret Key" margin="normal"
              value={settings.stripe_secret_key}
              onChange={handleChange('stripe_secret_key')}
              placeholder={settings.stripe_secret_key_set ? 'Leave blank to keep current key' : 'sk_live_... or sk_test_...'}
              helperText={settings.stripe_secret_key_set
                ? 'Leave blank to keep your current key, or enter a new one to replace it'
                : 'Starts with sk_live_ or sk_test_. This is stored securely and never shown in full.'
              }
              type="password" />

            <Box mt={3}>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>What Stripe enables:</Typography>
              <Box display="flex" flexWrap="wrap" gap={1}>
                <Chip label="Card on file" size="small" variant="outlined" />
                <Chip label="Online payments" size="small" variant="outlined" />
                <Chip label="No-show charges" size="small" variant="outlined" />
                <Chip label="3D Secure" size="small" variant="outlined" />
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>Subscription</Typography>
            <Box display="flex" gap={2} alignItems="center">
              <Chip
                label={settings.subscription_tier || 'basic'}
                color="primary" size="small"
              />
              <Chip
                label={settings.subscription_status || 'trial'}
                color={settings.subscription_status === 'active' ? 'success' : 'warning'}
                size="small" variant="outlined"
              />
            </Box>
            <Typography variant="body2" color="text.secondary" mt={1}>
              Your subscription is managed by the platform. Contact support to upgrade.
            </Typography>
          </CardContent>
        </Card>
      </TabPanel>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

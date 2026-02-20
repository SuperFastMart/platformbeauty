import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button, Tabs, Tab,
  Snackbar, Alert, CircularProgress, InputAdornment, Chip, Switch, FormControlLabel, Grid
} from '@mui/material';
import { Save, CreditCard, Store, Palette, Info, Schedule, Code, ContentCopy, Share, Delete, Add, DragIndicator, Gavel } from '@mui/icons-material';
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

  // Site settings (stored in tenant_settings table)
  const defaultHours = {
    monday: { open: '09:00', close: '17:00', closed: false },
    tuesday: { open: '09:00', close: '17:00', closed: false },
    wednesday: { open: '09:00', close: '17:00', closed: false },
    thursday: { open: '09:00', close: '17:00', closed: false },
    friday: { open: '09:00', close: '17:00', closed: false },
    saturday: { open: '09:00', close: '15:00', closed: false },
    sunday: { open: '09:00', close: '15:00', closed: true },
  };

  const [siteSettings, setSiteSettings] = useState({
    about_title: '',
    about_text: '',
    business_hours: defaultHours,
  });

  useEffect(() => {
    Promise.all([
      api.get('/admin/settings'),
      api.get('/admin/site-settings'),
    ])
      .then(([settingsRes, siteRes]) => {
        setSettings(s => ({ ...s, ...settingsRes.data, stripe_secret_key: '' }));
        setSiteSettings(prev => ({
          ...prev,
          ...siteRes.data,
          business_hours: siteRes.data.business_hours || defaultHours,
        }));
      })
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

      // Save site settings too
      await api.put('/admin/site-settings', siteSettings);

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

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab icon={<Store />} label="Business" iconPosition="start" />
        <Tab icon={<Info />} label="About" iconPosition="start" />
        <Tab icon={<Schedule />} label="Hours" iconPosition="start" />
        <Tab icon={<Palette />} label="Branding" iconPosition="start" />
        <Tab icon={<CreditCard />} label="Payments" iconPosition="start" />
        <Tab icon={<Share />} label="Social" iconPosition="start" />
        <Tab icon={<Gavel />} label="Policies" iconPosition="start" />
        <Tab icon={<Code />} label="Widget" iconPosition="start" />
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

      {/* About */}
      <TabPanel value={tab} index={1}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>Public About Section</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              This content appears on your public booking page for customers to see.
            </Typography>
            <TextField fullWidth label="About Title" margin="normal"
              value={siteSettings.about_title || ''}
              onChange={e => setSiteSettings(s => ({ ...s, about_title: e.target.value }))}
              placeholder="e.g. Welcome to Studio Jen" />
            <TextField fullWidth label="About Text" margin="normal" multiline rows={4}
              value={siteSettings.about_text || ''}
              onChange={e => setSiteSettings(s => ({ ...s, about_text: e.target.value }))}
              placeholder="Tell your customers about your business..." />

            <Typography variant="subtitle1" fontWeight={600} mt={4} mb={1}>Profile Image</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Add a profile photo to create a personal "Meet Me" section on your booking page.
            </Typography>
            <TextField fullWidth label="Profile Image URL" margin="normal"
              value={siteSettings.about_profile_image_url || ''}
              onChange={e => setSiteSettings(s => ({ ...s, about_profile_image_url: e.target.value }))}
              placeholder="https://example.com/your-photo.jpg"
              helperText="Direct link to a square profile photo (PNG, JPG)" />
            {siteSettings.about_profile_image_url && (
              <Box mt={1} mb={2}>
                <Box
                  component="img"
                  src={siteSettings.about_profile_image_url}
                  alt="Profile preview"
                  sx={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid', borderColor: 'primary.main' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </Box>
            )}

            <Typography variant="subtitle1" fontWeight={600} mt={4} mb={1}>Map & Directions</Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={!!siteSettings.about_show_map}
                  onChange={e => setSiteSettings(s => ({ ...s, about_show_map: e.target.checked }))}
                />
              }
              label="Show map on booking page"
            />
            {siteSettings.about_show_map && (
              <>
                <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
                  The map will automatically use your business address from the Business tab. Make sure your address is filled in.
                  {settings.business_address ? (
                    <Typography variant="body2" mt={0.5}><strong>Current address:</strong> {settings.business_address}</Typography>
                  ) : (
                    <Typography variant="body2" mt={0.5} color="warning.main">No address set — go to the Business tab to add one.</Typography>
                  )}
                </Alert>
                <TextField fullWidth label="Custom Map Embed URL (optional)" margin="normal"
                  value={siteSettings.about_map_embed_url || ''}
                  onChange={e => {
                    let url = e.target.value;
                    const srcMatch = url.match(/src="([^"]+)"/);
                    if (srcMatch) url = srcMatch[1];
                    setSiteSettings(s => ({ ...s, about_map_embed_url: url }));
                  }}
                  placeholder="Leave blank to auto-generate from your address"
                  helperText="Only needed if you want a specific map. Leave blank to use your business address automatically."
                />
              </>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Hours */}
      <TabPanel value={tab} index={2}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>Business Hours</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Displayed on your public booking page. These are for display only and don't affect slot availability.
            </Typography>
            {Object.entries(siteSettings.business_hours || defaultHours).map(([day, hours]) => (
              <Box key={day} display="flex" alignItems="center" gap={2} mb={1.5}>
                <Typography sx={{ width: 100, textTransform: 'capitalize' }} fontWeight={500}>
                  {day}
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={!hours.closed}
                      onChange={(e) => setSiteSettings(s => ({
                        ...s,
                        business_hours: {
                          ...s.business_hours,
                          [day]: { ...hours, closed: !e.target.checked },
                        },
                      }))}
                      size="small"
                    />
                  }
                  label={hours.closed ? 'Closed' : 'Open'}
                  sx={{ minWidth: 90 }}
                />
                {!hours.closed && (
                  <>
                    <TextField
                      type="time" size="small" label="Open"
                      value={hours.open}
                      onChange={(e) => setSiteSettings(s => ({
                        ...s,
                        business_hours: {
                          ...s.business_hours,
                          [day]: { ...hours, open: e.target.value },
                        },
                      }))}
                      InputLabelProps={{ shrink: true }}
                      sx={{ width: 140 }}
                    />
                    <TextField
                      type="time" size="small" label="Close"
                      value={hours.close}
                      onChange={(e) => setSiteSettings(s => ({
                        ...s,
                        business_hours: {
                          ...s.business_hours,
                          [day]: { ...hours, close: e.target.value },
                        },
                      }))}
                      InputLabelProps={{ shrink: true }}
                      sx={{ width: 140 }}
                    />
                  </>
                )}
              </Box>
            ))}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Branding */}
      <TabPanel value={tab} index={3}>
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

        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>Business Name Display</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Choose how your business name appears on your public booking page — as styled text or a logo image.
            </Typography>

            <Box display="flex" gap={2} mb={2}>
              <Button
                variant={(!siteSettings.header_display || siteSettings.header_display === 'text') ? 'contained' : 'outlined'}
                onClick={() => setSiteSettings(s => ({ ...s, header_display: 'text' }))}
              >
                Styled Text
              </Button>
              <Button
                variant={siteSettings.header_display === 'logo' ? 'contained' : 'outlined'}
                onClick={() => setSiteSettings(s => ({ ...s, header_display: 'logo' }))}
              >
                Logo Image
              </Button>
            </Box>

            {(!siteSettings.header_display || siteSettings.header_display === 'text') && (
              <>
                <TextField fullWidth select label="Header Font" margin="normal"
                  value={siteSettings.header_font || 'Inter'}
                  onChange={e => setSiteSettings(s => ({ ...s, header_font: e.target.value }))}
                >
                  <MenuItem value="Inter">Inter (Default)</MenuItem>
                  <MenuItem value="Playfair Display">Playfair Display (Elegant Serif)</MenuItem>
                  <MenuItem value="Dancing Script">Dancing Script (Script)</MenuItem>
                  <MenuItem value="Great Vibes">Great Vibes (Calligraphy)</MenuItem>
                  <MenuItem value="Parisienne">Parisienne (French Script)</MenuItem>
                  <MenuItem value="Cormorant Garamond">Cormorant Garamond (Classic Serif)</MenuItem>
                  <MenuItem value="Lora">Lora (Modern Serif)</MenuItem>
                  <MenuItem value="Montserrat">Montserrat (Modern Sans)</MenuItem>
                  <MenuItem value="Raleway">Raleway (Thin Modern)</MenuItem>
                </TextField>
                <Box mt={2} p={2} border={1} borderColor="divider" borderRadius={2} textAlign="center">
                  <link
                    href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(siteSettings.header_font || 'Inter')}:wght@400;700&display=swap`}
                    rel="stylesheet"
                  />
                  <Typography
                    variant="h4"
                    fontWeight={700}
                    sx={{ fontFamily: `"${siteSettings.header_font || 'Inter'}", serif` }}
                  >
                    {settings.name || 'Your Business Name'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Preview</Typography>
                </Box>
              </>
            )}

            {siteSettings.header_display === 'logo' && (
              <>
                <TextField fullWidth label="Header Logo URL" margin="normal"
                  value={siteSettings.header_logo_url || ''}
                  onChange={e => setSiteSettings(s => ({ ...s, header_logo_url: e.target.value }))}
                  placeholder="https://example.com/your-header-logo.png"
                  helperText="Recommended: transparent PNG, max height ~80px. This replaces the text name on your booking page."
                />
                {siteSettings.header_logo_url && (
                  <Box mt={2} p={2} border={1} borderColor="divider" borderRadius={2} textAlign="center" bgcolor="grey.50">
                    <img
                      src={siteSettings.header_logo_url}
                      alt="Header logo preview"
                      style={{ maxHeight: 80, maxWidth: '100%' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <Typography variant="caption" color="text.secondary" display="block" mt={1}>Preview</Typography>
                  </Box>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Payments / Stripe */}
      <TabPanel value={tab} index={4}>
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

      {/* Social Embeds */}
      <TabPanel value={tab} index={5}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>Social Media Widgets</Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Embed your Instagram feed, TikTok, Facebook page, or any social widget on your public booking page.
              Use services like <a href="https://lightwidget.com" target="_blank" rel="noopener noreferrer">LightWidget</a> for
              Instagram, or copy embed codes directly from your social platforms.
            </Typography>

            {(siteSettings.social_embeds || []).map((embed, idx) => (
              <Card key={idx} variant="outlined" sx={{ mb: 2, p: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                  <Box display="flex" alignItems="center" gap={1} flex={1}>
                    <DragIndicator sx={{ color: 'text.disabled', cursor: 'grab' }} />
                    <TextField
                      size="small" label="Label" placeholder="e.g. Instagram Feed"
                      value={embed.label || ''}
                      onChange={(e) => {
                        const updated = [...(siteSettings.social_embeds || [])];
                        updated[idx] = { ...updated[idx], label: e.target.value };
                        setSiteSettings(s => ({ ...s, social_embeds: updated }));
                      }}
                      sx={{ width: 200 }}
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={embed.visible !== false}
                          onChange={(e) => {
                            const updated = [...(siteSettings.social_embeds || [])];
                            updated[idx] = { ...updated[idx], visible: e.target.checked };
                            setSiteSettings(s => ({ ...s, social_embeds: updated }));
                          }}
                        />
                      }
                      label={embed.visible !== false ? 'Visible' : 'Hidden'}
                    />
                  </Box>
                  <Button
                    size="small" color="error"
                    startIcon={<Delete />}
                    onClick={() => {
                      const updated = (siteSettings.social_embeds || []).filter((_, i) => i !== idx);
                      setSiteSettings(s => ({ ...s, social_embeds: updated }));
                    }}
                  >
                    Remove
                  </Button>
                </Box>
                <TextField
                  fullWidth multiline rows={4}
                  label="Embed Code"
                  placeholder={'Paste your embed code here, e.g.:\n<iframe src="https://lightwidget.com/widgets/abc123..." scrolling="no" allowtransparency="true" ...></iframe>'}
                  value={embed.code || ''}
                  onChange={(e) => {
                    const updated = [...(siteSettings.social_embeds || [])];
                    updated[idx] = { ...updated[idx], code: e.target.value };
                    setSiteSettings(s => ({ ...s, social_embeds: updated }));
                  }}
                  InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
                  sx={{ mt: 1 }}
                />
              </Card>
            ))}

            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={() => {
                const current = siteSettings.social_embeds || [];
                setSiteSettings(s => ({
                  ...s,
                  social_embeds: [...current, { label: '', code: '', visible: true }],
                }));
              }}
            >
              Add Social Widget
            </Button>

            <Alert severity="info" sx={{ mt: 3 }}>
              <strong>How to get embed codes:</strong><br />
              <strong>Instagram:</strong> Use <a href="https://lightwidget.com" target="_blank" rel="noopener noreferrer">LightWidget.com</a> — connect your account, customise the grid, copy the embed code.<br />
              <strong>Facebook:</strong> Go to your Facebook page → Share → Embed → copy the code.<br />
              <strong>TikTok:</strong> On any video, click Share → Embed → copy the code.<br />
              <strong>Google Reviews:</strong> Use a service like Elfsight or paste a Google review widget embed code.
            </Alert>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Policies */}
      <TabPanel value={tab} index={6}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>Business Policies</Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Set your cancellation, no-show, privacy, and terms policies. These will be shown to customers during booking
              and on your public page. Default templates are provided — customise them to suit your business.
            </Typography>

            <Typography variant="subtitle2" fontWeight={600} mb={1}>Cancellation Policy</Typography>
            <TextField
              fullWidth multiline rows={4} sx={{ mb: 3 }}
              placeholder="Enter your cancellation policy..."
              value={siteSettings.policy_cancellation || ''}
              onChange={e => setSiteSettings(s => ({ ...s, policy_cancellation: e.target.value }))}
            />
            {!siteSettings.policy_cancellation && (
              <Button size="small" variant="outlined" sx={{ mb: 3, mt: -2 }}
                onClick={() => setSiteSettings(s => ({ ...s, policy_cancellation: 'Cancellations must be made at least 24 hours before your scheduled appointment. Late cancellations (less than 24 hours notice) may be subject to a cancellation fee of up to 50% of the service cost. To cancel or reschedule, please contact us directly or use your customer portal.' }))}
              >
                Use Default Template
              </Button>
            )}

            <Typography variant="subtitle2" fontWeight={600} mb={1}>No-Show Policy</Typography>
            <TextField
              fullWidth multiline rows={4} sx={{ mb: 3 }}
              placeholder="Enter your no-show policy..."
              value={siteSettings.policy_noshow || ''}
              onChange={e => setSiteSettings(s => ({ ...s, policy_noshow: e.target.value }))}
            />
            {!siteSettings.policy_noshow && (
              <Button size="small" variant="outlined" sx={{ mb: 3, mt: -2 }}
                onClick={() => setSiteSettings(s => ({ ...s, policy_noshow: 'Clients who fail to attend their appointment without prior notice will be marked as a no-show. After two no-shows, a deposit or prepayment may be required for future bookings. We understand emergencies happen — please let us know as soon as possible if you cannot make your appointment.' }))}
              >
                Use Default Template
              </Button>
            )}

            <Typography variant="subtitle2" fontWeight={600} mb={1}>Privacy Policy</Typography>
            <TextField
              fullWidth multiline rows={4} sx={{ mb: 3 }}
              placeholder="Enter your privacy policy..."
              value={siteSettings.policy_privacy || ''}
              onChange={e => setSiteSettings(s => ({ ...s, policy_privacy: e.target.value }))}
            />
            {!siteSettings.policy_privacy && (
              <Button size="small" variant="outlined" sx={{ mb: 3, mt: -2 }}
                onClick={() => setSiteSettings(s => ({ ...s, policy_privacy: 'We collect your name, contact details, and booking information solely to provide our services. Your personal data is stored securely and will never be shared with third parties for marketing purposes. You may request access to, correction of, or deletion of your personal data at any time by contacting us.' }))}
              >
                Use Default Template
              </Button>
            )}

            <Typography variant="subtitle2" fontWeight={600} mb={1}>Terms &amp; Conditions</Typography>
            <TextField
              fullWidth multiline rows={4} sx={{ mb: 2 }}
              placeholder="Enter your terms and conditions..."
              value={siteSettings.policy_terms || ''}
              onChange={e => setSiteSettings(s => ({ ...s, policy_terms: e.target.value }))}
            />
            {!siteSettings.policy_terms && (
              <Button size="small" variant="outlined" sx={{ mb: 2, mt: -1 }}
                onClick={() => setSiteSettings(s => ({ ...s, policy_terms: 'By booking an appointment, you agree to our cancellation and no-show policies. Prices are subject to change and will be confirmed at the time of booking. We reserve the right to refuse service. Payment is due at the time of the appointment unless otherwise agreed. Gift vouchers are non-refundable and must be used within 12 months of purchase.' }))}
              >
                Use Default Template
              </Button>
            )}

            <Alert severity="info" sx={{ mt: 1 }}>
              These policies are saved along with your other settings when you click <strong>Save Settings</strong> above.
              Customers will see a link to your policies during the booking process and on your public landing page.
            </Alert>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Widget */}
      <TabPanel value={tab} index={7}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>Embeddable Booking Widget</Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Add a booking widget to your own website. Copy the embed code below and paste it into your site's HTML.
            </Typography>

            <Alert severity="info" sx={{ mb: 3 }}>
              The widget is a self-contained booking form that works in an iframe. It automatically adapts
              to your branding colours and shows all your services.
            </Alert>

            <Typography variant="subtitle2" fontWeight={600} mb={1}>Embed Code</Typography>
            <Box sx={{ position: 'relative' }}>
              <TextField
                fullWidth multiline rows={3}
                value={`<iframe src="${window.location.origin}/t/${settings.slug || '[your-slug]'}/widget" width="100%" height="600" frameborder="0" style="border: none; border-radius: 12px;"></iframe>`}
                InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 13 } }}
              />
              <Button
                size="small" variant="outlined"
                startIcon={<ContentCopy />}
                sx={{ position: 'absolute', top: 8, right: 8 }}
                onClick={() => {
                  navigator.clipboard.writeText(
                    `<iframe src="${window.location.origin}/t/${settings.slug || '[your-slug]'}/widget" width="100%" height="600" frameborder="0" style="border: none; border-radius: 12px;"></iframe>`
                  );
                  setSnackbar({ open: true, message: 'Embed code copied!', severity: 'success' });
                }}
              >
                Copy
              </Button>
            </Box>

            <Typography variant="subtitle2" fontWeight={600} mt={4} mb={1}>Auto-Height (Optional)</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Add this script after the iframe to automatically resize it to fit the content:
            </Typography>
            <TextField
              fullWidth multiline rows={4}
              value={`<script>
window.addEventListener('message', function(e) {
  if (e.data?.type === 'booking-widget-height') {
    document.querySelector('iframe').style.height = e.data.height + 'px';
  }
});
</script>`}
              InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 13 } }}
            />

            <Typography variant="subtitle2" fontWeight={600} mt={4} mb={1}>Preview</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Your widget is live at:{' '}
              <a href={`${window.location.origin}/t/${settings.slug || ''}/widget`} target="_blank" rel="noopener noreferrer">
                {window.location.origin}/t/{settings.slug || '[your-slug]'}/widget
              </a>
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

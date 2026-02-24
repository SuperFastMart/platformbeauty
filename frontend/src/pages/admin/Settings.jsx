import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, TextField, Button, Tabs, Tab,
  Snackbar, Alert, CircularProgress, InputAdornment, Chip, Switch, FormControlLabel, Grid, MenuItem,
  useMediaQuery, useTheme, LinearProgress
} from '@mui/material';
import { Save, CreditCard, Store, Palette, Info, Schedule, Code, ContentCopy, Share, Delete, Add, DragIndicator, Gavel, Subscriptions, OpenInNew, CheckCircle, Security, Lock, LockOpen, AccountBalance, Sms } from '@mui/icons-material';
import api from '../../api/client';

function TabPanel({ children, value, index }) {
  return value === index ? <Box mt={3}>{children}</Box> : null;
}

function SubscriptionTab({ snackbar, setSnackbar }) {
  const [subData, setSubData] = useState(null);
  const [subLoading, setSubLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const loadSubscription = () => {
    api.get('/admin/subscription')
      .then(r => setSubData(r.data))
      .catch(console.error)
      .finally(() => setSubLoading(false));
  };

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const status = searchParams.get('status');

    // If returning from Stripe checkout, verify the session then load data
    if (sessionId && status === 'success') {
      api.post('/admin/subscription/verify', { session_id: sessionId })
        .then(() => setSnackbar({ open: true, message: 'Subscription activated!', severity: 'success' }))
        .catch(() => {})
        .finally(() => {
          searchParams.delete('session_id');
          searchParams.delete('status');
          setSearchParams(searchParams, { replace: true });
          loadSubscription();
        });
    } else {
      loadSubscription();
    }
  }, []);

  const handleCheckout = async (tier) => {
    setActionLoading(true);
    try {
      const res = await api.post('/admin/subscription/checkout', { tier });
      window.location.href = res.data.url;
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to start checkout', severity: 'error' });
      setActionLoading(false);
    }
  };

  const handlePortal = async () => {
    setActionLoading(true);
    try {
      const res = await api.post('/admin/subscription/portal');
      window.location.href = res.data.url;
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to open billing portal', severity: 'error' });
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel your subscription? You\'ll keep access until the end of the billing period.')) return;
    setActionLoading(true);
    try {
      await api.post('/admin/subscription/cancel');
      setSnackbar({ open: true, message: 'Subscription will cancel at end of billing period', severity: 'info' });
      // Refresh
      const r = await api.get('/admin/subscription');
      setSubData(r.data);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to cancel', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      await api.post('/admin/subscription/reactivate');
      setSnackbar({ open: true, message: 'Subscription reactivated!', severity: 'success' });
      const r = await api.get('/admin/subscription');
      setSubData(r.data);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to reactivate', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  if (subLoading) return <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>;
  if (!subData) return <Alert severity="error">Failed to load subscription data</Alert>;

  const statusColors = {
    trial: 'info', active: 'success', cancelling: 'warning',
    cancelled: 'error', past_due: 'error', trial_expired: 'warning',
  };

  const isCurrentPlan = (tier) => tier === subData.current_tier;
  const hasActiveSubscription = subData.stripe_subscription_id && ['active', 'cancelling'].includes(subData.status);

  return (
    <Box>
      {/* Current Plan Status */}
      <Card sx={{ mb: 3, borderTop: '3px solid #8B2635' }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
            <Box>
              <Typography variant="h6" fontWeight={700} mb={0.5}>Current Plan</Typography>
              <Box display="flex" alignItems="center" gap={1.5} mb={1}>
                <Typography variant="h4" fontWeight={800} color="primary.main" sx={{ textTransform: 'capitalize' }}>
                  {subData.current_plan?.name || subData.current_tier}
                </Typography>
                <Chip
                  label={subData.status?.replace('_', ' ')}
                  color={statusColors[subData.status] || 'default'}
                  size="small"
                  sx={{ textTransform: 'capitalize' }}
                />
              </Box>
              {subData.status === 'trial' && subData.trial_ends_at && (
                <Typography variant="body2" color="text.secondary">
                  Trial ends: {new Date(subData.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Typography>
              )}
              {subData.status === 'trial_expired' && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Your trial has expired. Upgrade to a paid plan to continue using all features.
                </Alert>
              )}
              {subData.current_period_end && subData.status !== 'trial' && (
                <Typography variant="body2" color="text.secondary">
                  {subData.status === 'cancelling' ? 'Access until' : 'Next billing date'}:{' '}
                  {new Date(subData.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Typography>
              )}
              {subData.current_plan?.price_monthly > 0 && subData.status === 'active' && (
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  £{parseFloat(subData.current_plan.price_monthly).toFixed(2)}/month
                </Typography>
              )}
            </Box>
            <Box display="flex" gap={1} flexWrap="wrap">
              {hasActiveSubscription && subData.status === 'active' && (
                <>
                  <Button variant="outlined" size="small" startIcon={<OpenInNew />} onClick={handlePortal} disabled={actionLoading}>
                    Manage Billing
                  </Button>
                  <Button variant="outlined" size="small" color="error" onClick={handleCancel} disabled={actionLoading}>
                    Cancel Plan
                  </Button>
                </>
              )}
              {subData.status === 'cancelling' && (
                <Button variant="contained" size="small" onClick={handleReactivate} disabled={actionLoading}>
                  Reactivate
                </Button>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Usage This Month */}
      {subData.usage && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={700} mb={2}>Usage</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <Box mb={1} display="flex" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="body2" fontWeight={600}>Services</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {subData.usage.services}{subData.usage.max_services ? ` of ${subData.usage.max_services}` : ' (unlimited)'}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={subData.usage.max_services ? Math.min((subData.usage.services / subData.usage.max_services) * 100, 100) : 0}
                  sx={{
                    height: 8, borderRadius: 4,
                    bgcolor: '#f0f0f0',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 4,
                      bgcolor: subData.usage.max_services && subData.usage.services >= subData.usage.max_services ? 'error.main' : 'primary.main',
                    },
                  }}
                />
                {subData.usage.max_services && subData.usage.services > subData.usage.max_services && (
                  <Alert severity="warning" sx={{ mt: 1 }} variant="outlined">
                    You have {subData.usage.services} services but your plan allows {subData.usage.max_services}. Existing services are kept, but you can't add new ones until you upgrade.
                  </Alert>
                )}
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box mb={1} display="flex" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="body2" fontWeight={600}>Bookings This Month</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {subData.usage.bookings_this_month}{subData.usage.max_bookings_per_month ? ` of ${subData.usage.max_bookings_per_month}` : ' (unlimited)'}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={subData.usage.max_bookings_per_month ? Math.min((subData.usage.bookings_this_month / subData.usage.max_bookings_per_month) * 100, 100) : 0}
                  sx={{
                    height: 8, borderRadius: 4,
                    bgcolor: '#f0f0f0',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 4,
                      bgcolor: subData.usage.max_bookings_per_month && subData.usage.bookings_this_month >= subData.usage.max_bookings_per_month ? 'error.main' : 'primary.main',
                    },
                  }}
                />
                {subData.usage.max_bookings_per_month && subData.usage.bookings_this_month >= subData.usage.max_bookings_per_month && (
                  <Alert severity="error" sx={{ mt: 1 }} variant="outlined">
                    You've reached your monthly booking limit. Upgrade your plan to accept more bookings.
                  </Alert>
                )}
              </Grid>
            </Grid>
            {subData.current_tier === 'free' && (
              <Alert severity="info" sx={{ mt: 2 }} variant="outlined">
                Upgrade to Growth or Pro for unlimited services and bookings.
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Plan Cards */}
      <Typography variant="h6" fontWeight={600} mb={2}>
        {hasActiveSubscription ? 'Change Plan' : 'Choose a Plan'}
      </Typography>
      <Grid container spacing={2}>
        {(subData.plans || []).map(plan => {
          const isCurrent = isCurrentPlan(plan.tier);
          const features = typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || []);
          return (
            <Grid item xs={12} sm={6} md={3} key={plan.tier}>
              <Card sx={{
                height: '100%', display: 'flex', flexDirection: 'column',
                border: isCurrent ? '2px solid #8B2635' : '1px solid #eee',
                position: 'relative', overflow: 'visible',
              }}>
                {isCurrent && (
                  <Chip label="Current" size="small" color="primary"
                    sx={{ position: 'absolute', top: -10, right: 12, fontWeight: 700 }} />
                )}
                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" fontWeight={700}>{plan.name}</Typography>
                  <Box display="flex" alignItems="baseline" gap={0.5} mb={2}>
                    <Typography variant="h4" fontWeight={800}>
                      {plan.price_monthly > 0 ? `£${parseFloat(plan.price_monthly).toFixed(2)}` : 'Free'}
                    </Typography>
                    {plan.price_monthly > 0 && (
                      <Typography variant="body2" color="text.secondary">/month</Typography>
                    )}
                  </Box>
                  <Box flex={1}>
                    {features.map((f, i) => (
                      <Box key={i} display="flex" alignItems="flex-start" gap={1} mb={0.8}>
                        <CheckCircle sx={{ fontSize: 16, color: 'success.main', mt: 0.3 }} />
                        <Typography variant="body2">{f}</Typography>
                      </Box>
                    ))}
                  </Box>
                  <Box mt={2}>
                    {isCurrent ? (
                      <Button fullWidth variant="outlined" disabled>Current Plan</Button>
                    ) : plan.price_monthly === 0 ? (
                      <Button fullWidth variant="outlined" disabled>Free Tier</Button>
                    ) : (
                      <Button
                        fullWidth variant="contained"
                        onClick={() => handleCheckout(plan.tier)}
                        disabled={actionLoading}
                        sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}
                      >
                        {hasActiveSubscription ? 'Switch to ' : 'Subscribe — '}
                        {plan.name}
                      </Button>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}

function SecurityTab({ snackbar, setSnackbar }) {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    api.get('/admin/mfa/status')
      .then(r => setMfaEnabled(r.data.mfa_enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleStartSetup = async () => {
    setActionLoading(true);
    try {
      const res = await api.post('/admin/mfa/setup');
      setSetupData(res.data);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to start setup', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifySetup = async () => {
    if (verifyCode.length !== 6) return;
    setActionLoading(true);
    try {
      const res = await api.post('/admin/mfa/verify-setup', { code: verifyCode });
      setBackupCodes(res.data.backup_codes);
      setMfaEnabled(true);
      setSetupData(null);
      setVerifyCode('');
      setSnackbar({ open: true, message: 'Two-factor authentication enabled!', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Invalid code', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisable = async () => {
    if (disableCode.length < 6) return;
    setActionLoading(true);
    try {
      await api.post('/admin/mfa/disable', { code: disableCode });
      setMfaEnabled(false);
      setDisableCode('');
      setBackupCodes(null);
      setSnackbar({ open: true, message: 'Two-factor authentication disabled', severity: 'info' });
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Invalid code', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" py={4}><CircularProgress size={32} /></Box>;

  return (
    <Box>
      {/* MFA Status Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1.5} mb={2}>
            {mfaEnabled ? <Lock color="success" /> : <LockOpen color="action" />}
            <Typography variant="subtitle1" fontWeight={600}>
              Two-Factor Authentication (2FA)
            </Typography>
            <Chip
              label={mfaEnabled ? 'Enabled' : 'Not set up'}
              size="small"
              color={mfaEnabled ? 'success' : 'default'}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Add an extra layer of security to your account. When enabled, you'll need to enter a code
            from your authenticator app each time you sign in.
          </Typography>

          {/* Not enabled — show setup button or setup flow */}
          {!mfaEnabled && !setupData && (
            <Button
              variant="contained" onClick={handleStartSetup} disabled={actionLoading}
              startIcon={<Security />}
            >
              {actionLoading ? 'Loading...' : 'Set Up 2FA'}
            </Button>
          )}

          {/* Setup flow — QR code + verify */}
          {!mfaEnabled && setupData && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                Scan the QR code below with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
              </Alert>
              <Box display="flex" gap={3} flexWrap="wrap" alignItems="flex-start">
                <Box textAlign="center">
                  <img src={setupData.qr_code} alt="QR Code" style={{ width: 200, height: 200, borderRadius: 8, border: '1px solid #eee' }} />
                  <Typography variant="caption" display="block" color="text.secondary" mt={1}>
                    Can't scan? Enter this key manually:
                  </Typography>
                  <Typography variant="caption" fontFamily="monospace" sx={{ wordBreak: 'break-all', fontSize: 11 }}>
                    {setupData.secret}
                  </Typography>
                </Box>
                <Box flex={1} minWidth={240}>
                  <Typography variant="body2" fontWeight={500} mb={1}>
                    Enter the 6-digit code from your app:
                  </Typography>
                  <TextField
                    fullWidth size="small"
                    value={verifyCode}
                    onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    inputProps={{ maxLength: 6, style: { textAlign: 'center', fontSize: '1.3rem', letterSpacing: 6 } }}
                    sx={{ mb: 2 }}
                  />
                  <Box display="flex" gap={1}>
                    <Button
                      variant="contained" onClick={handleVerifySetup}
                      disabled={actionLoading || verifyCode.length !== 6}
                    >
                      {actionLoading ? 'Verifying...' : 'Verify & Enable'}
                    </Button>
                    <Button variant="text" onClick={() => { setSetupData(null); setVerifyCode(''); }}>
                      Cancel
                    </Button>
                  </Box>
                </Box>
              </Box>
            </Box>
          )}

          {/* Backup codes shown after setup */}
          {backupCodes && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                Save your backup codes!
              </Typography>
              <Typography variant="body2" mb={1}>
                Store these codes somewhere safe. Each can be used once if you lose access to your authenticator app.
              </Typography>
              <Box sx={{ bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1, p: 1.5, fontFamily: 'monospace', fontSize: 13 }}>
                {backupCodes.map((code, i) => (
                  <span key={i}>{code}{i < backupCodes.length - 1 ? '  •  ' : ''}</span>
                ))}
              </Box>
              <Button
                size="small" sx={{ mt: 1 }}
                onClick={() => {
                  navigator.clipboard.writeText(backupCodes.join('\n'));
                  setSnackbar({ open: true, message: 'Backup codes copied', severity: 'success' });
                }}
              >
                Copy Codes
              </Button>
            </Alert>
          )}

          {/* Enabled — show disable option */}
          {mfaEnabled && !backupCodes && (
            <Box mt={2} pt={2} borderTop="1px solid #eee">
              <Typography variant="body2" color="text.secondary" mb={1.5}>
                To disable 2FA, enter a current code from your authenticator app:
              </Typography>
              <Box display="flex" gap={1} alignItems="flex-start">
                <TextField
                  size="small" placeholder="000000"
                  value={disableCode}
                  onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputProps={{ maxLength: 6, style: { textAlign: 'center', letterSpacing: 4 } }}
                  sx={{ width: 160 }}
                />
                <Button
                  variant="outlined" color="error" size="small"
                  onClick={handleDisable}
                  disabled={actionLoading || disableCode.length < 6}
                  sx={{ height: 40 }}
                >
                  Disable 2FA
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

function TaxComplianceTab({ snackbar, setSnackbar }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taxInfo, setTaxInfo] = useState({
    legal_name: '', legal_entity_type: 'individual', tax_reference: '',
    date_of_birth: '', address_line_1: '', address_line_2: '',
    city: '', postcode: '', country: 'United Kingdom',
    tax_info_completed_at: null,
  });

  useEffect(() => {
    api.get('/admin/tax-info')
      .then(r => setTaxInfo(prev => ({
        ...prev, ...r.data,
        date_of_birth: r.data.date_of_birth ? r.data.date_of_birth.split('T')[0] : '',
      })))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/admin/tax-info', taxInfo);
      setTaxInfo(prev => ({ ...prev, tax_info_completed_at: prev.tax_info_completed_at || new Date().toISOString() }));
      setSnackbar({ open: true, message: 'Tax information saved', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to save', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field) => (e) => setTaxInfo(prev => ({ ...prev, [field]: e.target.value }));

  if (loading) return <Box display="flex" justifyContent="center" py={4}><CircularProgress size={32} /></Box>;

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2" fontWeight={600} mb={0.5}>Why do we need this?</Typography>
        <Typography variant="body2">
          Under UK Digital Platform Reporting rules (DAC7), Boukd is required to collect and report
          seller identity and earnings information to HMRC annually. This is a legal requirement for
          all digital platforms that facilitate services — your data is stored securely and used solely
          for regulatory compliance.
        </Typography>
      </Alert>

      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="subtitle1" fontWeight={600}>Tax &amp; Identity Information</Typography>
            {taxInfo.tax_info_completed_at && (
              <Chip label="Completed" size="small" color="success" icon={<CheckCircle />} />
            )}
          </Box>

          <Box display="flex" gap={2} mb={2}>
            <Button
              variant={taxInfo.legal_entity_type === 'individual' ? 'contained' : 'outlined'}
              onClick={() => setTaxInfo(prev => ({ ...prev, legal_entity_type: 'individual' }))}
              size="small"
            >
              Individual / Sole Trader
            </Button>
            <Button
              variant={taxInfo.legal_entity_type === 'business' ? 'contained' : 'outlined'}
              onClick={() => setTaxInfo(prev => ({ ...prev, legal_entity_type: 'business' }))}
              size="small"
            >
              Registered Business
            </Button>
          </Box>

          <TextField fullWidth label={taxInfo.legal_entity_type === 'business' ? 'Registered Company Name' : 'Full Legal Name'} margin="normal" required
            value={taxInfo.legal_name} onChange={handleChange('legal_name')} />

          <TextField fullWidth
            label={taxInfo.legal_entity_type === 'business' ? 'Company Registration Number' : 'Unique Taxpayer Reference (UTR)'}
            margin="normal"
            value={taxInfo.tax_reference} onChange={handleChange('tax_reference')}
            helperText={taxInfo.legal_entity_type === 'business'
              ? 'Your Companies House registration number'
              : 'Your 10-digit UTR from HMRC (optional but recommended)'}
          />

          {taxInfo.legal_entity_type === 'individual' && (
            <TextField fullWidth type="date" label="Date of Birth" margin="normal" required
              value={taxInfo.date_of_birth} onChange={handleChange('date_of_birth')}
              InputLabelProps={{ shrink: true }}
              helperText="Required for individual sellers under DAC7" />
          )}

          <Typography variant="subtitle2" fontWeight={600} mt={3} mb={1}>Registered Address</Typography>

          <TextField fullWidth label="Address Line 1" margin="normal" required
            value={taxInfo.address_line_1} onChange={handleChange('address_line_1')} />
          <TextField fullWidth label="Address Line 2" margin="normal"
            value={taxInfo.address_line_2} onChange={handleChange('address_line_2')} />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="City / Town" margin="normal" required
                value={taxInfo.city} onChange={handleChange('city')} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField fullWidth label="Postcode" margin="normal" required
                value={taxInfo.postcode} onChange={handleChange('postcode')} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField fullWidth label="Country" margin="normal"
                value={taxInfo.country} onChange={handleChange('country')} />
            </Grid>
          </Grid>

          <Box mt={3}>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Tax Information'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

function SmsTab({ snackbar, setSnackbar }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [smsAvailable, setSmsAvailable] = useState(false);
  const [smsSettings, setSmsSettings] = useState({
    sms_booking_confirmed_enabled: 'true',
    sms_booking_rejected_enabled: 'true',
    sms_reminder_24h_enabled: 'true',
    sms_reminder_2h_enabled: 'false',
  });

  useEffect(() => {
    api.get('/admin/sms-settings')
      .then(({ data }) => {
        setSmsSettings(data.settings);
        setSmsAvailable(data.sms_available);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/admin/sms-settings', { settings: smsSettings });
      setSnackbar({ open: true, message: 'SMS settings saved', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to save', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleSetting = (key) => {
    setSmsSettings(prev => ({
      ...prev,
      [key]: prev[key] === 'true' ? 'false' : 'true',
    }));
  };

  if (loading) return <Box display="flex" justifyContent="center" py={4}><CircularProgress size={32} /></Box>;

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1.5} mb={2}>
            <Sms color={smsAvailable ? 'success' : 'action'} />
            <Typography variant="subtitle1" fontWeight={600}>SMS Notifications</Typography>
            <Chip
              label={smsAvailable ? 'Available' : 'Not included in plan'}
              size="small"
              color={smsAvailable ? 'success' : 'default'}
            />
          </Box>

          {!smsAvailable ? (
            <Alert severity="info">
              SMS notifications are available on the Pro plan. Upgrade your subscription to enable SMS reminders
              and booking confirmations for your customers.
            </Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Configure which SMS notifications are sent to your customers. SMS messages are sent via Brevo
                using your plan's included SMS credits.
              </Typography>

              <Typography variant="subtitle2" fontWeight={600} mb={1.5}>Booking Notifications</Typography>
              <FormControlLabel
                control={<Switch checked={smsSettings.sms_booking_confirmed_enabled === 'true'} onChange={() => toggleSetting('sms_booking_confirmed_enabled')} />}
                label="Send SMS when booking is confirmed"
                sx={{ display: 'block', mb: 1 }}
              />
              <FormControlLabel
                control={<Switch checked={smsSettings.sms_booking_rejected_enabled === 'true'} onChange={() => toggleSetting('sms_booking_rejected_enabled')} />}
                label="Send SMS when booking is rejected"
                sx={{ display: 'block', mb: 2 }}
              />

              <Typography variant="subtitle2" fontWeight={600} mb={1.5}>Appointment Reminders</Typography>
              <FormControlLabel
                control={<Switch checked={smsSettings.sms_reminder_24h_enabled === 'true'} onChange={() => toggleSetting('sms_reminder_24h_enabled')} />}
                label="24-hour SMS reminder (sent daily at 9am)"
                sx={{ display: 'block', mb: 1 }}
              />
              <FormControlLabel
                control={<Switch checked={smsSettings.sms_reminder_2h_enabled === 'true'} onChange={() => toggleSetting('sms_reminder_2h_enabled')} />}
                label="2-hour SMS reminder (sent 2 hours before appointment)"
                sx={{ display: 'block', mb: 2 }}
              />

              <Alert severity="info" sx={{ mb: 3 }}>
                Email reminders are always sent regardless of SMS settings. SMS provides an additional reminder channel
                for customers who have provided a phone number.
              </Alert>

              <Button variant="contained" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save SMS Settings'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default function Settings() {
  const [searchParams] = useSearchParams();
  const initialTab = useMemo(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'sms') return 8;
    if (tabParam === 'subscription') return 9;
    if (tabParam === 'security') return 10;
    if (tabParam === 'tax') return 11;
    return 0;
  }, []);
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
        <Tab icon={<Sms />} label="SMS" iconPosition="start" />
        <Tab icon={<Subscriptions />} label="Subscription" iconPosition="start" />
        <Tab icon={<Security />} label="Security" iconPosition="start" />
        <Tab icon={<AccountBalance />} label="Tax & Compliance" iconPosition="start" />
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
              <Box key={day} display="flex" alignItems="center" gap={{ xs: 1, sm: 2 }} mb={1.5} flexWrap="wrap">
                <Typography sx={{ width: { xs: 70, sm: 100 }, textTransform: 'capitalize' }} fontWeight={500}>
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
                      sx={{ width: { xs: 120, sm: 140 } }}
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
                      sx={{ width: { xs: 120, sm: 140 } }}
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
        <Alert severity="info" sx={{ mb: 2 }}>
          This configures how your <strong>clients</strong> pay for services. Your own platform subscription
          is managed in the <strong>Subscription</strong> tab.
        </Alert>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>Client Payment Processing</Typography>
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
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Box display="flex" alignItems="center" gap={1} flex={1} sx={{ minWidth: 0, flexWrap: 'wrap' }}>
                    <DragIndicator sx={{ color: 'text.disabled', cursor: 'grab' }} />
                    <TextField
                      size="small" label="Label" placeholder="e.g. Instagram Feed"
                      value={embed.label || ''}
                      onChange={(e) => {
                        const updated = [...(siteSettings.social_embeds || [])];
                        updated[idx] = { ...updated[idx], label: e.target.value };
                        setSiteSettings(s => ({ ...s, social_embeds: updated }));
                      }}
                      sx={{ width: { xs: '100%', sm: 200 } }}
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

      {/* SMS */}
      <TabPanel value={tab} index={8}>
        <SmsTab snackbar={snackbar} setSnackbar={setSnackbar} />
      </TabPanel>

      {/* Subscription */}
      <TabPanel value={tab} index={9}>
        <SubscriptionTab snackbar={snackbar} setSnackbar={setSnackbar} />
      </TabPanel>

      {/* Security */}
      <TabPanel value={tab} index={10}>
        <SecurityTab snackbar={snackbar} setSnackbar={setSnackbar} />
      </TabPanel>

      {/* Tax & Compliance */}
      <TabPanel value={tab} index={11}>
        <TaxComplianceTab snackbar={snackbar} setSnackbar={setSnackbar} />
      </TabPanel>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, TextField, Chip,
  CircularProgress, Alert, Snackbar, Switch, FormControlLabel, Divider
} from '@mui/material';
import { AttachMoney, Sync, Business, Download, AccountBalance } from '@mui/icons-material';
import api from '../../api/client';

export default function PlatformSubscriptions() {
  const [plans, setPlans] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [dac7Stats, setDac7Stats] = useState(null);
  const [dac7Year, setDac7Year] = useState(new Date().getFullYear() - 1);
  const [dac7Exporting, setDac7Exporting] = useState(false);

  const fetchData = () => {
    Promise.all([
      api.get('/platform/subscriptions/plans').then(r => r.data),
      api.get('/platform/subscriptions/overview').then(r => r.data).catch(() => null),
      api.get('/platform/dac7-stats').then(r => r.data).catch(() => null),
    ]).then(([plansData, overviewData, dac7Data]) => {
      setPlans(plansData);
      setOverview(overviewData);
      setDac7Stats(dac7Data);
    }).catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleSyncStripe = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/platform/subscriptions/sync-stripe');
      setSnackbar({ open: true, message: `Synced ${res.data.synced?.length || 0} plans to Stripe`, severity: 'success' });
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Sync failed', severity: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdatePlan = async (plan) => {
    setSaving(plan.id);
    try {
      await api.put(`/platform/subscriptions/plans/${plan.id}`, plan);
      setSnackbar({ open: true, message: `${plan.name} updated`, severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Update failed', severity: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const updatePlanField = (id, field, value) => {
    setPlans(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  if (loading) return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;

  // Group overview by tier
  const tierCounts = {};
  (overview?.by_tier || []).forEach(r => {
    if (!tierCounts[r.tier]) tierCounts[r.tier] = { active: 0, trial: 0, other: 0 };
    if (r.status === 'active') tierCounts[r.tier].active = r.count;
    else if (r.status === 'trial') tierCounts[r.tier].trial = r.count;
    else tierCounts[r.tier].other += r.count;
  });

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={700}>Subscription Plans</Typography>
        <Button
          variant="contained" startIcon={<Sync />}
          onClick={handleSyncStripe} disabled={syncing}
        >
          {syncing ? 'Syncing...' : 'Sync to Stripe'}
        </Button>
      </Box>

      {/* MRR + Stats */}
      {overview && (
        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} sm={4}>
            <Card sx={{ borderTop: '3px solid #2e7d32' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <AttachMoney sx={{ fontSize: 32, color: '#2e7d32' }} />
                <Typography variant="h4" fontWeight={800} color="#2e7d32">
                  £{overview.mrr?.toFixed(2) || '0.00'}
                </Typography>
                <Typography variant="caption" color="text.secondary">Monthly Recurring Revenue</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card sx={{ borderTop: '3px solid #1976d2' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Business sx={{ fontSize: 32, color: '#1976d2' }} />
                <Typography variant="h4" fontWeight={800} color="#1976d2">
                  {overview.trial_expiring?.length || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">Trials Expiring This Week</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card sx={{ borderTop: '3px solid #8B2635' }}>
              <CardContent sx={{ py: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Distribution</Typography>
                {Object.entries(tierCounts).map(([tier, counts]) => (
                  <Box key={tier} display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Chip label={tier} size="small" variant="outlined" sx={{ textTransform: 'capitalize', minWidth: 80 }} />
                    <Typography variant="body2">
                      {counts.active} active{counts.trial > 0 && `, ${counts.trial} trial`}
                    </Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Trial Expiring Alert */}
      {overview?.trial_expiring?.length > 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600}>Trials expiring soon:</Typography>
          {overview.trial_expiring.map(t => (
            <Typography key={t.id} variant="body2">
              {t.name} ({t.owner_email}) — expires {new Date(t.trial_ends_at).toLocaleDateString('en-GB')}
            </Typography>
          ))}
        </Alert>
      )}

      {/* Plan Cards */}
      <Typography variant="h6" fontWeight={600} mb={2}>Manage Plans</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        Click "Sync to Stripe" to automatically create Stripe Products and Prices for all active paid plans.
        If prices have changed, syncing will archive the old Stripe price and create a new one.
        You can also manually enter Stripe IDs if you've created them in the Stripe dashboard.
      </Alert>

      <Grid container spacing={2}>
        {plans.map(plan => {
          const features = typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || []);
          return (
            <Grid item xs={12} md={6} key={plan.id}>
              <Card sx={{ border: plan.is_active ? '1px solid #eee' : '1px solid #ffcdd2' }}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="h6" fontWeight={700}>{plan.name}</Typography>
                      <Chip label={plan.tier} size="small" variant="outlined" />
                      {!plan.is_active && <Chip label="Inactive" size="small" color="error" />}
                    </Box>
                    <Typography variant="h5" fontWeight={800} color="primary.main">
                      {plan.price_monthly > 0 ? `£${parseFloat(plan.price_monthly).toFixed(2)}` : 'Free'}
                    </Typography>
                  </Box>

                  <Grid container spacing={1.5}>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth size="small" label="Name"
                        value={plan.name}
                        onChange={e => updatePlanField(plan.id, 'name', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth size="small" label="Monthly Price (£)" type="number"
                        value={plan.price_monthly}
                        onChange={e => updatePlanField(plan.id, 'price_monthly', parseFloat(e.target.value) || 0)}
                        inputProps={{ step: 0.01 }}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth size="small" label="Max Services"
                        value={plan.max_services ?? ''}
                        onChange={e => updatePlanField(plan.id, 'max_services', e.target.value ? parseInt(e.target.value) : null)}
                        placeholder="Unlimited"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth size="small" label="Max Bookings/Month"
                        value={plan.max_bookings_per_month ?? ''}
                        onChange={e => updatePlanField(plan.id, 'max_bookings_per_month', e.target.value ? parseInt(e.target.value) : null)}
                        placeholder="Unlimited"
                      />
                    </Grid>
                  </Grid>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="caption" fontWeight={600} color="text.secondary">Stripe IDs</Typography>
                  <Grid container spacing={1.5} mt={0.5}>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth size="small" label="Stripe Product ID"
                        value={plan.stripe_product_id || ''}
                        onChange={e => updatePlanField(plan.id, 'stripe_product_id', e.target.value)}
                        placeholder="prod_..."
                        InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth size="small" label="Stripe Price ID"
                        value={plan.stripe_price_id || ''}
                        onChange={e => updatePlanField(plan.id, 'stripe_price_id', e.target.value)}
                        placeholder="price_..."
                        InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
                      />
                    </Grid>
                  </Grid>

                  <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
                    <Box display="flex" gap={2}>
                      <FormControlLabel
                        control={<Switch checked={plan.is_active} onChange={e => updatePlanField(plan.id, 'is_active', e.target.checked)} size="small" />}
                        label="Active"
                      />
                      <FormControlLabel
                        control={<Switch checked={plan.sms_enabled} onChange={e => updatePlanField(plan.id, 'sms_enabled', e.target.checked)} size="small" />}
                        label="SMS"
                      />
                    </Box>
                    <Button
                      variant="contained" size="small"
                      onClick={() => handleUpdatePlan(plan)}
                      disabled={saving === plan.id}
                    >
                      {saving === plan.id ? 'Saving...' : 'Save'}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* DAC7 Compliance */}
      <Divider sx={{ my: 4 }} />
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <AccountBalance />
          <Typography variant="h6" fontWeight={600}>DAC7 Compliance</Typography>
        </Box>
      </Box>

      {dac7Stats && (
        <Grid container spacing={2} mb={3}>
          <Grid item xs={6} sm={4}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" fontWeight={800} color="success.main">{dac7Stats.completed}</Typography>
                <Typography variant="caption" color="text.secondary">Tax Info Completed</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={4}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" fontWeight={800} color={dac7Stats.incomplete > 0 ? 'warning.main' : 'text.secondary'}>{dac7Stats.incomplete}</Typography>
                <Typography variant="caption" color="text.secondary">Incomplete</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent sx={{ py: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Annual HMRC Export</Typography>
                <Box display="flex" gap={1} alignItems="center">
                  <TextField
                    size="small" type="number" label="Year"
                    value={dac7Year}
                    onChange={e => setDac7Year(parseInt(e.target.value) || new Date().getFullYear() - 1)}
                    sx={{ width: 100 }}
                    inputProps={{ min: 2024 }}
                  />
                  <Button
                    variant="contained" size="small" startIcon={<Download />}
                    disabled={dac7Exporting}
                    onClick={async () => {
                      setDac7Exporting(true);
                      try {
                        const res = await api.get(`/platform/dac7-export?year=${dac7Year}`, { responseType: 'blob' });
                        const url = window.URL.createObjectURL(new Blob([res.data]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', `dac7_report_${dac7Year}.csv`);
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        window.URL.revokeObjectURL(url);
                      } catch {
                        setSnackbar({ open: true, message: 'Export failed', severity: 'error' });
                      } finally {
                        setDac7Exporting(false);
                      }
                    }}
                  >
                    {dac7Exporting ? 'Exporting...' : 'Download CSV'}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Alert severity="info">
        DAC7 requires annual reporting to HMRC by 31 January for the previous calendar year.
        The export includes all tenants with completed payments and their tax information.
        Tenants with incomplete tax info are prompted to complete it after 14 days.
      </Alert>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

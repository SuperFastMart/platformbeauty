import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Chip, IconButton, CircularProgress, Alert, Switch,
  FormControlLabel, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  MenuItem, Select, InputLabel, FormControl
} from '@mui/material';
import { Add, Edit, Delete, WorkspacePremium, People, Visibility } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import FeatureGate from '../../components/FeatureGate';

export default function Memberships() {
  const [plans, setPlans] = useState([]);
  const [services, setServices] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [subsOpen, setSubsOpen] = useState(null);
  const [subscribers, setSubscribers] = useState([]);
  const [form, setForm] = useState({
    name: '', description: '', priceMonthly: '', includedSessions: '0',
    discountPercent: '0', priorityBooking: false, includedServices: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const [plansRes, statsRes, svcRes] = await Promise.all([
        api.get('/admin/memberships'),
        api.get('/admin/memberships/all/stats'),
        api.get('/admin/services'),
      ]);
      setPlans(plansRes.data);
      setStats(statsRes.data);
      setServices(Array.isArray(svcRes.data) ? svcRes.data : svcRes.data.services || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', description: '', priceMonthly: '', includedSessions: '0', discountPercent: '0', priorityBooking: false, includedServices: [] });
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (plan) => {
    setEditId(plan.id);
    setForm({
      name: plan.name,
      description: plan.description || '',
      priceMonthly: String(plan.price_monthly),
      includedSessions: String(plan.included_sessions || 0),
      discountPercent: String(plan.discount_percent || 0),
      priorityBooking: plan.priority_booking || false,
      includedServices: plan.included_services?.map(s => ({
        serviceId: s.service_id || '__any__', category: s.category, sessionsPerMonth: s.sessions_per_month,
      })) || [],
    });
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.priceMonthly) {
      setError('Name and monthly price are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        includedServices: form.includedServices.map(s => ({
          ...s,
          serviceId: s.serviceId === '__any__' ? '' : s.serviceId,
        })),
      };
      if (editId) {
        await api.put(`/admin/memberships/${editId}`, payload);
      } else {
        await api.post('/admin/memberships', payload);
      }
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this membership plan?')) return;
    try {
      await api.delete(`/admin/memberships/${id}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleToggleActive = async (plan) => {
    try {
      await api.put(`/admin/memberships/${plan.id}`, { active: !plan.active });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const viewSubscribers = async (plan) => {
    setSubsOpen(plan);
    try {
      const { data } = await api.get(`/admin/memberships/${plan.id}/subscribers`);
      setSubscribers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const addIncludedService = () => {
    setForm(f => ({
      ...f,
      includedServices: [...f.includedServices, { serviceId: '__any__', category: '', sessionsPerMonth: 1 }],
    }));
  };

  const updateIncludedService = (index, field, value) => {
    setForm(f => ({
      ...f,
      includedServices: f.includedServices.map((s, i) => i === index ? { ...s, [field]: value } : s),
    }));
  };

  const removeIncludedService = (index) => {
    setForm(f => ({ ...f, includedServices: f.includedServices.filter((_, i) => i !== index) }));
  };

  if (loading) return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;

  return (
    <FeatureGate requiredTier="pro">
      <Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" fontWeight={700}>Memberships</Typography>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}
            sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}>
            Create Plan
          </Button>
        </Box>

        {/* Stats */}
        {stats && (
          <Grid container spacing={2} mb={3}>
            {[
              { label: 'Active Plans', value: stats.active_plans, color: '#8B2635' },
              { label: 'Active Members', value: stats.active_members, color: '#2e7d32' },
              { label: 'Monthly Revenue', value: `£${parseFloat(stats.monthly_revenue || 0).toFixed(2)}`, color: '#D4A853' },
              { label: 'Past Due', value: stats.past_due, color: '#d32f2f' },
            ].map(s => (
              <Grid item xs={6} sm={3} key={s.label}>
                <Card sx={{ borderTop: `3px solid ${s.color}` }}>
                  <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                    <Typography variant="h6" fontWeight={700} color={s.color}>{s.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Plans */}
        {plans.length === 0 ? (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 6 }}>
              <WorkspacePremium sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">No membership plans yet. Create your first plan.</Typography>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={3}>
            {plans.map(plan => (
              <Grid item xs={12} sm={6} md={4} key={plan.id}>
                <Card sx={{
                  opacity: plan.active ? 1 : 0.6,
                  border: plan.active ? '2px solid' : '2px dashed',
                  borderColor: plan.active ? '#D4A853' : 'divider',
                  transition: 'all 0.3s ease',
                  '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' },
                }}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                      <Box>
                        <Typography variant="h6" fontWeight={700}>{plan.name}</Typography>
                        {plan.priority_booking && (
                          <Chip label="Priority Booking" size="small" sx={{ bgcolor: '#D4A85325', color: '#8a7020', fontWeight: 600, mt: 0.5 }} />
                        )}
                      </Box>
                      <Box>
                        <IconButton size="small" onClick={() => openEdit(plan)}><Edit fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(plan.id)}><Delete fontSize="small" /></IconButton>
                      </Box>
                    </Box>

                    {plan.description && (
                      <Typography variant="body2" color="text.secondary" mb={1}>{plan.description}</Typography>
                    )}

                    <Typography variant="h4" fontWeight={700} color="#D4A853" mb={1}>
                      £{parseFloat(plan.price_monthly).toFixed(2)}
                      <Typography component="span" variant="body2" color="text.secondary">/month</Typography>
                    </Typography>

                    <Box mb={1}>
                      {plan.included_sessions > 0 && (
                        <Typography variant="body2"><strong>{plan.included_sessions}</strong> sessions/month</Typography>
                      )}
                      {plan.discount_percent > 0 && (
                        <Typography variant="body2"><strong>{plan.discount_percent}%</strong> off all bookings</Typography>
                      )}
                    </Box>

                    {plan.included_services && (
                      <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                        {plan.included_services.map((s, i) => (
                          <Chip key={i} label={s.service_name || s.category || 'Any'} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                        ))}
                      </Box>
                    )}

                    <Box display="flex" justifyContent="space-between" alignItems="center" mt={2} pt={1} borderTop={1} borderColor="divider">
                      <Button size="small" startIcon={<People />} onClick={() => viewSubscribers(plan)}
                        sx={{ color: 'text.secondary' }}>
                        {plan.active_subscribers || 0} subscribers
                      </Button>
                      <FormControlLabel
                        control={<Switch size="small" checked={plan.active} onChange={() => handleToggleActive(plan)} />}
                        label={<Typography variant="caption">{plan.active ? 'Active' : 'Inactive'}</Typography>}
                        labelPlacement="start"
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editId ? 'Edit Plan' : 'Create Membership Plan'}</DialogTitle>
          <DialogContent>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {!editId && (
              <Alert severity="info" sx={{ mb: 2 }} variant="outlined">
                A Stripe Product and Price will be created automatically. Price cannot be changed after creation — create a new plan instead.
              </Alert>
            )}
            <TextField fullWidth label="Plan Name" margin="normal" required
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <TextField fullWidth label="Description" margin="normal" multiline rows={2}
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            {!editId && (
              <TextField fullWidth label="Monthly Price (£)" type="number" margin="normal" required
                value={form.priceMonthly} onChange={e => setForm(f => ({ ...f, priceMonthly: e.target.value }))}
                inputProps={{ min: 0, step: 0.01 }} />
            )}
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField fullWidth label="Included Sessions/Month" type="number" margin="normal"
                  value={form.includedSessions} onChange={e => setForm(f => ({ ...f, includedSessions: e.target.value }))}
                  inputProps={{ min: 0 }} helperText="0 = unlimited" />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Discount %" type="number" margin="normal"
                  value={form.discountPercent} onChange={e => setForm(f => ({ ...f, discountPercent: e.target.value }))}
                  inputProps={{ min: 0, max: 100 }} helperText="Applied to all bookings" />
              </Grid>
            </Grid>
            <FormControlLabel sx={{ mt: 1 }}
              control={<Switch checked={form.priorityBooking} onChange={e => setForm(f => ({ ...f, priorityBooking: e.target.checked }))} />}
              label="Priority Booking" />

            {/* Included services */}
            <Box mt={2}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle2" fontWeight={600}>Included Services</Typography>
                <Button size="small" onClick={addIncludedService}>+ Add Service</Button>
              </Box>
              {form.includedServices.map((svc, i) => (
                <Box key={i} display="flex" gap={1} mb={1} alignItems="center">
                  <FormControl size="small" sx={{ flex: 2 }}>
                    <InputLabel>Service</InputLabel>
                    <Select value={svc.serviceId || '__any__'} label="Service"
                      onChange={e => updateIncludedService(i, 'serviceId', e.target.value)}>
                      <MenuItem value="__any__">Any Service</MenuItem>
                      {services.filter(s => s.active !== false).map(s => (
                        <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField size="small" label="Sessions" type="number" sx={{ width: 80 }}
                    value={svc.sessionsPerMonth} onChange={e => updateIncludedService(i, 'sessionsPerMonth', e.target.value)}
                    inputProps={{ min: 1 }} />
                  <IconButton size="small" color="error" onClick={() => removeIncludedService(i)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}
              sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}>
              {saving ? 'Saving...' : editId ? 'Save Changes' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Subscribers Dialog */}
        <Dialog open={!!subsOpen} onClose={() => setSubsOpen(null)} maxWidth="md" fullWidth>
          {subsOpen && (
            <>
              <DialogTitle>Subscribers — {subsOpen.name}</DialogTitle>
              <DialogContent>
                {subscribers.length === 0 ? (
                  <Typography color="text.secondary" textAlign="center" py={3}>No subscribers yet</Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Customer</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Sessions Used</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Since</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Next Billing</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {subscribers.map(sub => (
                          <TableRow key={sub.id}>
                            <TableCell>
                              <Typography variant="body2" fontWeight={500}>{sub.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{sub.email}</Typography>
                            </TableCell>
                            <TableCell>
                              <Chip label={sub.status} size="small"
                                color={sub.status === 'active' ? 'success' : sub.status === 'past_due' ? 'warning' : sub.status === 'cancelling' ? 'info' : 'error'}
                                sx={{ textTransform: 'capitalize' }} />
                              {sub.cancel_at_period_end && (
                                <Typography variant="caption" color="error" display="block">Cancelling</Typography>
                              )}
                            </TableCell>
                            <TableCell>{sub.sessions_used_this_period || 0}</TableCell>
                            <TableCell>{dayjs(sub.created_at).format('D MMM YYYY')}</TableCell>
                            <TableCell>
                              {sub.current_period_end ? dayjs(sub.current_period_end).format('D MMM YYYY') : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setSubsOpen(null)}>Close</Button>
              </DialogActions>
            </>
          )}
        </Dialog>
      </Box>
    </FeatureGate>
  );
}

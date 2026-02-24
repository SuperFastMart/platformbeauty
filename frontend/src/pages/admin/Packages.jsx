import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Chip, IconButton, CircularProgress, Alert, Switch,
  FormControlLabel, MenuItem, Select, InputLabel, FormControl, OutlinedInput,
  Checkbox, ListItemText
} from '@mui/material';
import { Add, Edit, Delete, Inventory2 } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import FeatureGate from '../../components/FeatureGate';

export default function Packages() {
  const [packages, setPackages] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', packagePrice: '', originalPrice: '',
    sessionCount: '', category: '', validDays: '365', serviceIds: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const [pkgRes, svcRes] = await Promise.all([
        api.get('/admin/packages'),
        api.get('/admin/services'),
      ]);
      setPackages(pkgRes.data);
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
    setForm({ name: '', description: '', packagePrice: '', originalPrice: '', sessionCount: '', category: '', validDays: '365', serviceIds: [] });
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (pkg) => {
    setEditId(pkg.id);
    setForm({
      name: pkg.name,
      description: pkg.description || '',
      packagePrice: String(pkg.package_price),
      originalPrice: pkg.original_price ? String(pkg.original_price) : '',
      sessionCount: String(pkg.session_count),
      category: pkg.category || '',
      validDays: String(pkg.valid_days || 365),
      serviceIds: pkg.services ? pkg.services.map(s => s.id) : [],
    });
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.packagePrice || !form.sessionCount || !form.serviceIds.length) {
      setError('Name, price, session count, and at least one service are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editId) {
        await api.put(`/admin/packages/${editId}`, form);
      } else {
        await api.post('/admin/packages', form);
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
    if (!window.confirm('Delete this package?')) return;
    try {
      await api.delete(`/admin/packages/${id}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleToggleActive = async (pkg) => {
    try {
      await api.put(`/admin/packages/${pkg.id}`, { active: !pkg.active });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;

  return (
    <FeatureGate requiredTier="pro">
      <Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" fontWeight={700}>Service Packages</Typography>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}
            sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}>
            Create Package
          </Button>
        </Box>

        {packages.length === 0 ? (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 6 }}>
              <Inventory2 sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">No packages yet. Create your first service package.</Typography>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={3}>
            {packages.map(pkg => {
              const savings = pkg.original_price
                ? Math.round((1 - parseFloat(pkg.package_price) / parseFloat(pkg.original_price)) * 100)
                : 0;

              return (
                <Grid item xs={12} sm={6} md={4} key={pkg.id}>
                  <Card sx={{
                    opacity: pkg.active ? 1 : 0.6,
                    border: pkg.active ? '1px solid transparent' : '1px dashed',
                    borderColor: pkg.active ? 'transparent' : 'divider',
                    transition: 'all 0.3s ease',
                    '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' },
                  }}>
                    <CardContent>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                        <Box>
                          <Typography variant="h6" fontWeight={700}>{pkg.name}</Typography>
                          {pkg.category && (
                            <Chip label={pkg.category} size="small" variant="outlined" sx={{ mt: 0.5, fontSize: 11 }} />
                          )}
                        </Box>
                        <Box>
                          <IconButton size="small" onClick={() => openEdit(pkg)}><Edit fontSize="small" /></IconButton>
                          <IconButton size="small" color="error" onClick={() => handleDelete(pkg.id)}><Delete fontSize="small" /></IconButton>
                        </Box>
                      </Box>

                      {pkg.description && (
                        <Typography variant="body2" color="text.secondary" mb={1}>{pkg.description}</Typography>
                      )}

                      <Box display="flex" alignItems="baseline" gap={1} mb={1}>
                        <Typography variant="h5" fontWeight={700} color="#D4A853">
                          £{parseFloat(pkg.package_price).toFixed(2)}
                        </Typography>
                        {pkg.original_price && (
                          <Typography variant="body2" color="text.secondary" sx={{ textDecoration: 'line-through' }}>
                            £{parseFloat(pkg.original_price).toFixed(2)}
                          </Typography>
                        )}
                        {savings > 0 && (
                          <Chip label={`Save ${savings}%`} size="small" sx={{ bgcolor: '#2e7d3215', color: '#2e7d32', fontWeight: 700 }} />
                        )}
                      </Box>

                      <Typography variant="body2" mb={0.5}>
                        <strong>{pkg.session_count}</strong> sessions · Valid for {pkg.valid_days} days
                      </Typography>

                      {pkg.services && (
                        <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                          {pkg.services.map(s => (
                            <Chip key={s.id} label={s.name} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                          ))}
                        </Box>
                      )}

                      <Box display="flex" justifyContent="space-between" alignItems="center" mt={2} pt={1} borderTop={1} borderColor="divider">
                        <Typography variant="caption" color="text.secondary">
                          {pkg.active_customers || 0} active customers
                        </Typography>
                        <FormControlLabel
                          control={<Switch size="small" checked={pkg.active} onChange={() => handleToggleActive(pkg)} />}
                          label={<Typography variant="caption">{pkg.active ? 'Active' : 'Inactive'}</Typography>}
                          labelPlacement="start"
                        />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editId ? 'Edit Package' : 'Create Package'}</DialogTitle>
          <DialogContent>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField fullWidth label="Package Name" margin="normal" required
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <TextField fullWidth label="Description" margin="normal" multiline rows={2}
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField fullWidth label="Package Price (£)" type="number" margin="normal" required
                  value={form.packagePrice} onChange={e => setForm(f => ({ ...f, packagePrice: e.target.value }))}
                  inputProps={{ min: 0, step: 0.01 }} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Original Price (£)" type="number" margin="normal"
                  helperText="Shows as strikethrough"
                  value={form.originalPrice} onChange={e => setForm(f => ({ ...f, originalPrice: e.target.value }))}
                  inputProps={{ min: 0, step: 0.01 }} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Sessions Included" type="number" margin="normal" required
                  value={form.sessionCount} onChange={e => setForm(f => ({ ...f, sessionCount: e.target.value }))}
                  inputProps={{ min: 1 }} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Valid Days" type="number" margin="normal"
                  value={form.validDays} onChange={e => setForm(f => ({ ...f, validDays: e.target.value }))}
                  inputProps={{ min: 1 }} />
              </Grid>
            </Grid>
            <TextField fullWidth label="Category (optional)" margin="normal"
              value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            <FormControl fullWidth margin="normal">
              <InputLabel>Included Services</InputLabel>
              <Select
                multiple value={form.serviceIds}
                onChange={e => setForm(f => ({ ...f, serviceIds: e.target.value }))}
                input={<OutlinedInput label="Included Services" />}
                renderValue={selected => selected.map(id => services.find(s => s.id === id)?.name || id).join(', ')}
              >
                {services.filter(s => s.active !== false).map(s => (
                  <MenuItem key={s.id} value={s.id}>
                    <Checkbox checked={form.serviceIds.includes(s.id)} />
                    <ListItemText primary={s.name} secondary={`£${parseFloat(s.price).toFixed(2)} · ${s.duration}min`} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}
              sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}>
              {saving ? 'Saving...' : editId ? 'Save Changes' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </FeatureGate>
  );
}

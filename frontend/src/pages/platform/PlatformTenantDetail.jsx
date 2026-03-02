import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, CardContent, CircularProgress, Grid, Chip,
  Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Paper,
  MenuItem, Select, FormControl, InputLabel, TextField, InputAdornment
} from '@mui/material';
import { ArrowBack, Block, CheckCircle, Delete, Edit, PersonOutline, SwapHoriz } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function PlatformTenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { startImpersonation } = useAuth();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [tierDialog, setTierDialog] = useState(false);
  const [selectedTier, setSelectedTier] = useState('');
  const [renameDialog, setRenameDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [slugAvailable, setSlugAvailable] = useState(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTenant = () => {
    api.get(`/platform/tenants/${id}/detail`)
      .then(({ data }) => { setTenant(data); setError(null); })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load tenant'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTenant(); }, [id]);

  // Check slug availability with debounce
  useEffect(() => {
    if (!newSlug || newSlug.length < 3 || (tenant && newSlug === tenant.slug)) {
      setSlugAvailable(newSlug === tenant?.slug ? null : null);
      return;
    }
    setSlugChecking(true);
    const timer = setTimeout(() => {
      api.get(`/platform/check-slug/${newSlug}`)
        .then(r => setSlugAvailable(r.data.available))
        .catch(() => setSlugAvailable(null))
        .finally(() => setSlugChecking(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [newSlug, tenant?.slug]);

  const handleSuspend = async () => {
    setActionLoading(true);
    try {
      const endpoint = tenant.active ? 'suspend' : 'unsuspend';
      await api.put(`/platform/tenants/${id}/${endpoint}`);
      setSnackbar({ open: true, message: `Tenant ${tenant.active ? 'suspended' : 'unsuspended'} successfully`, severity: 'success' });
      fetchTenant();
    } catch {
      setSnackbar({ open: true, message: 'Action failed', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleImpersonate = async () => {
    setActionLoading(true);
    try {
      const { data } = await api.post(`/platform/impersonate/${id}`);
      startImpersonation(data.token, data.user);
      navigate('/admin/dashboard');
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Impersonation failed', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await api.delete(`/platform/tenants/${id}?confirm=true`);
      setSnackbar({ open: true, message: 'Tenant deleted', severity: 'success' });
      setTimeout(() => navigate('/platform/tenants'), 1000);
    } catch {
      setSnackbar({ open: true, message: 'Delete failed', severity: 'error' });
    } finally {
      setActionLoading(false);
      setDeleteDialog(false);
    }
  };

  const handleRenameNameChange = (val) => {
    setNewName(val);
    setNewSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 50));
  };

  const handleRename = async () => {
    const trimName = newName.trim();
    const nameChanged = trimName && trimName !== tenant.name;
    const slugChanged = newSlug && newSlug !== tenant.slug;
    if (!nameChanged && !slugChanged) return;
    if (slugChanged && slugAvailable === false) return;
    setActionLoading(true);
    try {
      const body = {};
      if (nameChanged) body.name = trimName;
      if (slugChanged) body.slug = newSlug;
      await api.put(`/platform/tenants/${id}`, body);
      setSnackbar({ open: true, message: 'Tenant updated successfully', severity: 'success' });
      setRenameDialog(false);
      fetchTenant();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to update tenant', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeTier = async () => {
    if (!selectedTier || selectedTier === (tenant.subscription_tier || 'free')) return;
    setActionLoading(true);
    try {
      await api.put(`/platform/tenants/${id}`, {
        subscription_tier: selectedTier,
        subscription_status: 'active',
      });
      setSnackbar({ open: true, message: `Tenant moved to ${selectedTier} tier`, severity: 'success' });
      setTierDialog(false);
      fetchTenant();
    } catch {
      setSnackbar({ open: true, message: 'Failed to update tier', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;
  if (error) return (
    <Box>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/platform/tenants')} sx={{ mb: 2 }}>
        Back to Tenants
      </Button>
      <Alert severity="error">{error}</Alert>
    </Box>
  );
  if (!tenant) return null;

  return (
    <Box>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/platform/tenants')} sx={{ mb: 2 }}>
        Back to Tenants
      </Button>

      {/* Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
            <Box>
              <Typography variant="h5" fontWeight={700} mb={0.5}>{tenant.name}</Typography>
              <Typography variant="body2" color="text.secondary" mb={1}>
                /t/{tenant.slug} &middot; {tenant.owner_email} &middot; Created {dayjs(tenant.created_at).format('D MMM YYYY')}
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                <Chip
                  label={tenant.subscription_tier || 'free'}
                  color="primary" size="small" variant="outlined"
                  sx={{ textTransform: 'capitalize' }}
                />
                <Chip
                  label={tenant.active ? 'Active' : 'Suspended'}
                  color={tenant.active ? 'success' : 'error'}
                  size="small"
                />
                {tenant.trial_ends_at && (
                  <Chip
                    label={`Trial ends ${dayjs(tenant.trial_ends_at).format('D MMM YYYY')}`}
                    size="small" variant="outlined"
                  />
                )}
              </Box>
            </Box>
            <Box display="flex" gap={1} flexWrap="wrap">
              <Button
                variant="contained"
                startIcon={<PersonOutline />}
                onClick={handleImpersonate}
                disabled={actionLoading}
              >
                Impersonate
              </Button>
              <Button
                variant="outlined"
                startIcon={<Edit />}
                onClick={() => { setNewName(tenant.name); setNewSlug(tenant.slug); setSlugAvailable(null); setRenameDialog(true); }}
                disabled={actionLoading}
              >
                Rename
              </Button>
              <Button
                variant="outlined"
                startIcon={<SwapHoriz />}
                onClick={() => { setSelectedTier(tenant.subscription_tier || 'free'); setTierDialog(true); }}
                disabled={actionLoading}
              >
                Change Tier
              </Button>
              <Button
                variant="outlined"
                color={tenant.active ? 'warning' : 'success'}
                startIcon={tenant.active ? <Block /> : <CheckCircle />}
                onClick={handleSuspend}
                disabled={actionLoading}
              >
                {tenant.active ? 'Suspend' : 'Unsuspend'}
              </Button>
              <Button
                variant="outlined" color="error"
                startIcon={<Delete />}
                onClick={() => setDeleteDialog(true)}
                disabled={actionLoading}
              >
                Delete
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Stats */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Customers', value: tenant.customer_count || 0, color: '#1976d2' },
          { label: 'Bookings (30d)', value: tenant.booking_count || 0, color: '#2e7d32' },
          { label: 'Services', value: tenant.service_count || 0, color: '#7b1fa2' },
          { label: 'Revenue (30d)', value: `£${parseFloat(tenant.revenue || 0).toFixed(2)}`, color: '#D4A853' },
        ].map(s => (
          <Grid item xs={6} sm={3} key={s.label}>
            <Card sx={{ borderTop: `3px solid ${s.color}` }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" fontWeight={700} color={s.color}>{s.value}</Typography>
                <Typography variant="body2" color="text.secondary">{s.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Users */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} mb={2}>Tenant Users</Typography>
          {tenant.users?.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Username</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Last Login</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tenant.users.map(u => (
                    <TableRow key={u.id}>
                      <TableCell>{u.username}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell><Chip label={u.role} size="small" variant="outlined" /></TableCell>
                      <TableCell>{u.last_login_at ? dayjs(u.last_login_at).format('D MMM YYYY HH:mm') : 'Never'}</TableCell>
                      <TableCell>{dayjs(u.created_at).format('D MMM YYYY')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary">No users found</Typography>
          )}
        </CardContent>
      </Card>

      {/* Rename Dialog */}
      <Dialog open={renameDialog} onClose={() => setRenameDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Rename Tenant</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Update the business name and URL. The old URL will automatically redirect to the new one.
          </DialogContentText>
          <TextField
            fullWidth autoFocus
            label="Business Name"
            value={newName}
            onChange={(e) => handleRenameNameChange(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Booking URL"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50))}
            InputProps={{
              startAdornment: <InputAdornment position="start">boukd.com/t/</InputAdornment>,
              endAdornment: newSlug && newSlug !== tenant.slug && newSlug.length >= 3 && (
                <InputAdornment position="end">
                  {slugChecking ? (
                    <CircularProgress size={18} />
                  ) : slugAvailable === true ? (
                    <CheckCircle sx={{ color: 'success.main', fontSize: 20 }} />
                  ) : slugAvailable === false ? (
                    <Typography variant="caption" color="error">Taken</Typography>
                  ) : null}
                </InputAdornment>
              ),
            }}
            helperText={
              newSlug === tenant.slug ? 'Current URL (unchanged)' :
              newSlug.length >= 3 && slugAvailable === true ? 'This URL is available' :
              newSlug.length >= 3 && slugAvailable === false ? 'This URL is already taken' :
              newSlug.length > 0 && newSlug.length < 3 ? 'Minimum 3 characters' : ''
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialog(false)}>Cancel</Button>
          <Button
            variant="contained" onClick={handleRename}
            disabled={
              actionLoading ||
              (newName.trim() === tenant.name && newSlug === tenant.slug) ||
              (newSlug !== tenant.slug && slugAvailable === false) ||
              newSlug.length < 3
            }
            sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Tier Dialog */}
      <Dialog open={tierDialog} onClose={() => setTierDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Change Subscription Tier</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Override the subscription tier for <strong>{tenant.name}</strong>. This sets the tier directly without requiring a Stripe subscription.
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel>Tier</InputLabel>
            <Select value={selectedTier} onChange={(e) => setSelectedTier(e.target.value)} label="Tier">
              <MenuItem value="free">Free</MenuItem>
              <MenuItem value="growth">Growth</MenuItem>
              <MenuItem value="pro">Pro</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTierDialog(false)}>Cancel</Button>
          <Button
            variant="contained" onClick={handleChangeTier} disabled={actionLoading}
            sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}
          >
            Update Tier
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>Delete Tenant?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete <strong>{tenant.name}</strong> and all associated data
            (bookings, customers, services, payments, etc.). This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={actionLoading}>
            Delete Permanently
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

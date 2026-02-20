import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, CardContent, CircularProgress, Grid, Chip,
  Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Paper
} from '@mui/material';
import { ArrowBack, Block, CheckCircle, Delete, PersonOutline } from '@mui/icons-material';
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
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTenant = () => {
    api.get(`/platform/tenants/${id}/detail`)
      .then(({ data }) => { setTenant(data); setError(null); })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load tenant'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTenant(); }, [id]);

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

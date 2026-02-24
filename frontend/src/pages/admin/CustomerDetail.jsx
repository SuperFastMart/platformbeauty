import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Chip, Button, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Grid, Alert, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, useMediaQuery, useTheme, Tooltip
} from '@mui/material';
import { ArrowBack, Delete, PersonOutline, ReportProblem, LocalOffer, Add } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

const statusColors = {
  pending: 'warning', confirmed: 'success', rejected: 'error',
  cancelled: 'default', completed: 'info',
};

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [customer, setCustomer] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [allergies, setAllergies] = useState('');
  const [preferences, setPreferences] = useState('');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [deleteDialog, setDeleteDialog] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    api.get(`/admin/customers/${id}`)
      .then(({ data }) => {
        setCustomer(data.customer);
        setBookings(data.bookings);
        setStats(data.stats);
        setNotes(data.customer.admin_notes || '');
        setAllergies(data.customer.allergies || '');
        setPreferences(data.customer.preferences || '');
        setTags(data.customer.tags ? data.customer.tags.split(',').map(t => t.trim()).filter(Boolean) : []);
      })
      .catch(err => {
        if (err.response?.status === 404) navigate('/admin/customers');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const saveAll = async () => {
    try {
      await Promise.all([
        api.put(`/admin/customers/${id}/notes`, { notes }),
        api.put(`/admin/customers/${id}/preferences`, {
          allergies: allergies || null,
          preferences: preferences || null,
          tags: tags.length > 0 ? tags.join(',') : null,
        }),
      ]);
      setSnackbar({ open: true, message: 'Customer details saved', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to save', severity: 'error' });
    }
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTag('');
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/admin/customers/${id}`);
      navigate('/admin/customers');
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to delete customer', severity: 'error' });
      setDeleteDialog(false);
    }
  };

  if (loading) return <Typography>Loading...</Typography>;
  if (!customer) return <Typography>Customer not found</Typography>;

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={3}>
        <IconButton onClick={() => navigate('/admin/customers')}><ArrowBack /></IconButton>
        <Typography variant="h5" fontWeight={600} sx={{ flex: 1 }}>{customer.name}</Typography>
        {customer.allow_admin_impersonation && (
          <Button
            variant="outlined" size="small"
            startIcon={<PersonOutline />}
            onClick={async () => {
              try {
                const { data } = await api.post(`/admin/impersonate/customer/${id}`);
                // Open customer portal in new tab with the impersonation token
                localStorage.setItem('customer_token', data.token);
                localStorage.setItem('customer_user', JSON.stringify(data.customer));
                window.open(`/t/${data.tenantSlug}/portal`, '_blank');
              } catch (err) {
                setSnackbar({ open: true, message: err.response?.data?.error || 'Impersonation failed', severity: 'error' });
              }
            }}
          >
            View as Customer
          </Button>
        )}
      </Box>

      {/* Stats */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Bookings', value: stats.total || 0 },
          { label: 'Completed', value: stats.completed || 0 },
          { label: 'Cancelled', value: stats.cancelled || 0 },
          { label: 'Total Spent', value: `£${(stats.totalSpent || 0).toFixed(2)}` },
          { label: 'Favourite', value: stats.favouriteService || '-' },
        ].map(s => (
          <Grid item xs={6} sm={4} md key={s.label}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                <Typography fontWeight={600}>{s.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Customer Info */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography fontWeight={600} mb={1}>Contact Details</Typography>
              <Typography variant="body2"><strong>Email:</strong> {customer.email}</Typography>
              <Typography variant="body2"><strong>Phone:</strong> {customer.phone || 'Not provided'}</Typography>
              <Typography variant="body2">
                <strong>Customer since:</strong> {dayjs(customer.created_at).format('D MMM YYYY')}
              </Typography>
              {customer.last_visit_date && (
                <Typography variant="body2">
                  <strong>Last visit:</strong> {dayjs(customer.last_visit_date).format('D MMM YYYY')}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              {/* Allergies / Alerts */}
              <Box sx={{ bgcolor: allergies ? 'rgba(211, 47, 47, 0.06)' : 'transparent', borderRadius: 1, p: allergies ? 1.5 : 0, mb: 2 }}>
                <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                  <ReportProblem sx={{ fontSize: 18, color: allergies ? 'error.main' : 'text.secondary' }} />
                  <Typography fontWeight={600} variant="body2" color={allergies ? 'error.main' : 'text.primary'}>Allergies / Alerts</Typography>
                </Box>
                <TextField
                  fullWidth multiline rows={2} size="small"
                  placeholder="e.g. Nut allergy, sensitive skin, latex..."
                  value={allergies}
                  onChange={e => setAllergies(e.target.value)}
                />
              </Box>

              {/* Preferences */}
              <Typography fontWeight={600} variant="body2" mb={0.5}>Preferences</Typography>
              <TextField
                fullWidth multiline rows={2} size="small" sx={{ mb: 2 }}
                placeholder="Colour formulas, preferred products, notes..."
                value={preferences}
                onChange={e => setPreferences(e.target.value)}
              />

              {/* Tags */}
              <Typography fontWeight={600} variant="body2" mb={0.5}>Tags</Typography>
              <Box display="flex" flexWrap="wrap" gap={0.5} mb={1}>
                {tags.map(tag => (
                  <Chip
                    key={tag} label={tag} size="small" variant="outlined"
                    icon={<LocalOffer sx={{ fontSize: 14 }} />}
                    onDelete={() => setTags(tags.filter(t => t !== tag))}
                  />
                ))}
              </Box>
              <Box display="flex" gap={1} mb={2}>
                <TextField
                  size="small" placeholder="Add tag..." value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  sx={{ flex: 1 }}
                />
                <Button size="small" variant="outlined" onClick={addTag} disabled={!newTag.trim()}>
                  <Add sx={{ fontSize: 18 }} />
                </Button>
              </Box>

              {/* Admin Notes */}
              <Typography fontWeight={600} variant="body2" mb={0.5}>Admin Notes</Typography>
              <TextField
                fullWidth multiline rows={3} size="small"
                placeholder="Private notes about this customer..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />

              <Button size="small" variant="contained" sx={{ mt: 1.5 }} onClick={saveAll}>
                Save All
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Booking History */}
      <Typography variant="h6" fontWeight={600} mb={2}>Booking History</Typography>
      {bookings.length === 0 ? (
        <Typography color="text.secondary">No bookings</Typography>
      ) : (
        isMobile ? bookings.map(b => (
          <Card key={b.id} variant="outlined" sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography fontWeight={500}>{dayjs(b.date).format('D MMM YYYY')}</Typography>
                <Chip label={b.status} color={statusColors[b.status] || 'default'} size="small" />
              </Box>
              <Typography variant="body2" color="text.secondary" mt={0.3}>
                {b.start_time?.slice(0, 5)} - {b.end_time?.slice(0, 5)}
              </Typography>
              <Typography variant="body2" mt={0.3}>{b.service_names}</Typography>
              <Typography variant="body2" fontWeight={600} mt={0.3}>
                £{parseFloat(b.total_price).toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        )) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Date</strong></TableCell>
                <TableCell><strong>Time</strong></TableCell>
                <TableCell><strong>Services</strong></TableCell>
                <TableCell align="right"><strong>Price</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bookings.map(b => (
                <TableRow key={b.id}>
                  <TableCell>{dayjs(b.date).format('D MMM YYYY')}</TableCell>
                  <TableCell>{b.start_time?.slice(0, 5)} - {b.end_time?.slice(0, 5)}</TableCell>
                  <TableCell>{b.service_names}</TableCell>
                  <TableCell align="right">£{parseFloat(b.total_price).toFixed(2)}</TableCell>
                  <TableCell>
                    <Chip label={b.status} color={statusColors[b.status] || 'default'} size="small" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        )
      )}

      {/* Delete */}
      <Box mt={4} pt={3} borderTop={1} borderColor="divider">
        <Button color="error" variant="outlined" startIcon={<Delete />}
          onClick={() => setDeleteDialog(true)}>
          Delete Customer (GDPR)
        </Button>
        <Typography variant="caption" display="block" color="text.secondary" mt={0.5}>
          This will permanently delete the customer and all associated data.
        </Typography>
      </Box>

      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>Delete Customer (GDPR)?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1, mb: 2 }}>
            This will permanently delete <strong>{customer.name}</strong>'s personal data. This action cannot be undone.
          </Alert>
          <Typography variant="body2" fontWeight={600} gutterBottom>What gets deleted:</Typography>
          <Typography variant="body2" color="text.secondary" component="ul" sx={{ pl: 2, mb: 1 }}>
            <li>Customer record (name, email, phone, notes, preferences)</li>
            <li>Messages and booking requests</li>
            <li>Loyalty stamps and redeemed rewards</li>
            <li>Email history</li>
          </Typography>
          <Typography variant="body2" fontWeight={600} gutterBottom>What gets anonymised (kept for reporting):</Typography>
          <Typography variant="body2" color="text.secondary" component="ul" sx={{ pl: 2 }}>
            <li>Bookings (customer name replaced with "Deleted Customer")</li>
            <li>Reviews (anonymised)</li>
            <li>Payment records (preserved for accounting)</li>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Delete Permanently
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Chip, Button, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Grid, Alert, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton
} from '@mui/material';
import { ArrowBack, Delete, PersonOutline } from '@mui/icons-material';
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
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [deleteDialog, setDeleteDialog] = useState(false);

  useEffect(() => {
    api.get(`/admin/customers/${id}`)
      .then(({ data }) => {
        setCustomer(data.customer);
        setBookings(data.bookings);
        setStats(data.stats);
        setNotes(data.customer.admin_notes || '');
      })
      .catch(err => {
        if (err.response?.status === 404) navigate('/admin/customers');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const saveNotes = async () => {
    try {
      await api.put(`/admin/customers/${id}/notes`, { notes });
      setSnackbar({ open: true, message: 'Notes saved', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to save notes', severity: 'error' });
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
              <Typography fontWeight={600} mb={1}>Admin Notes</Typography>
              <TextField
                fullWidth multiline rows={3}
                placeholder="Private notes about this customer..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                size="small"
              />
              <Button size="small" variant="contained" sx={{ mt: 1 }} onClick={saveNotes}>
                Save Notes
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
        <DialogTitle>Delete Customer?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1 }}>
            This will permanently delete <strong>{customer.name}</strong> and all their bookings,
            requests, and payment records. This action cannot be undone.
          </Alert>
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

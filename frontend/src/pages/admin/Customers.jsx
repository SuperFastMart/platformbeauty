import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, TextField, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Chip, InputAdornment,
  Card, CardContent, CardActionArea, Grid, useMediaQuery, useTheme,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert
} from '@mui/material';
import { Search, ChevronRight, Add } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const fetchCustomers = () => {
    api.get('/admin/customers')
      .then(({ data }) => setCustomers(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCustomers(); }, []);

  const filtered = search
    ? customers.filter(c =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search)
      )
    : customers;

  const handleCreateCustomer = async () => {
    if (!form.name || !form.email) {
      setFormError('Name and email are required');
      return;
    }
    if (form.phone) {
      const clean = form.phone.replace(/[\s\-\(\)]/g, '');
      if (!/^\+?[0-9]{7,15}$/.test(clean)) {
        setFormError('Enter a valid phone number (7-15 digits)');
        return;
      }
    }
    setSubmitting(true);
    setFormError('');
    try {
      await api.post('/admin/customers', form);
      setSnackbar({ open: true, message: 'Customer created', severity: 'success' });
      setDialogOpen(false);
      setForm({ name: '', email: '', phone: '' });
      fetchCustomers();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Customers</Typography>
        <Box display="flex" alignItems="center" gap={1}>
          <Chip label={`${customers.length} total`} size="small" />
          <Button variant="contained" size="small" startIcon={<Add />} onClick={() => setDialogOpen(true)}>
            Add Customer
          </Button>
        </Box>
      </Box>

      <TextField
        placeholder="Search by name, email, or phone..."
        size="small" sx={{ mb: 3, maxWidth: isMobile ? '100%' : 400 }}
        fullWidth
        value={search}
        onChange={e => setSearch(e.target.value)}
        InputProps={{
          startAdornment: <InputAdornment position="start"><Search /></InputAdornment>
        }}
      />

      {loading ? (
        <Typography>Loading...</Typography>
      ) : filtered.length === 0 ? (
        <Typography color="text.secondary">
          {search ? 'No customers match your search' : 'No customers yet'}
        </Typography>
      ) : isMobile ? (
        /* Mobile: Card layout */
        <Grid container spacing={1.5}>
          {filtered.map(c => (
            <Grid item xs={12} key={c.id}>
              <Card variant="outlined">
                <CardActionArea onClick={() => navigate(`/admin/customers/${c.id}`)}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography fontWeight={600}>{c.name}</Typography>
                        <Typography variant="body2" color="text.secondary">{c.email}</Typography>
                        {c.phone && (
                          <Typography variant="body2" color="text.secondary">{c.phone}</Typography>
                        )}
                      </Box>
                      <ChevronRight color="action" />
                    </Box>
                    <Box display="flex" gap={1} mt={1} flexWrap="wrap">
                      <Chip label={`${c.booking_count || 0} bookings`} size="small" variant="outlined" />
                      <Chip label={`£${parseFloat(c.total_spent || 0).toFixed(2)}`} size="small" variant="outlined" />
                      {c.last_booking_date && (
                        <Chip label={dayjs(c.last_booking_date).format('D MMM YYYY')} size="small" variant="outlined" />
                      )}
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        /* Desktop: Table layout */
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Email</strong></TableCell>
                <TableCell><strong>Phone</strong></TableCell>
                <TableCell align="center"><strong>Bookings</strong></TableCell>
                <TableCell align="right"><strong>Total Spent</strong></TableCell>
                <TableCell><strong>Last Booking</strong></TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(c => (
                <TableRow
                  key={c.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/admin/customers/${c.id}`)}
                >
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{c.email}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{c.phone || '-'}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={c.booking_count || 0} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="right">
                    £{parseFloat(c.total_spent || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {c.last_booking_date
                      ? dayjs(c.last_booking_date).format('D MMM YYYY')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small"><ChevronRight /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add Customer Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Customer</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <TextField fullWidth label="Name" margin="normal" required
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <TextField fullWidth label="Email" type="email" margin="normal" required
            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <TextField fullWidth label="Phone" margin="normal"
            value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            helperText="Optional — 7 to 15 digits" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateCustomer} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

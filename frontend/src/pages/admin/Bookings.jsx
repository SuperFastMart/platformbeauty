import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Button, TextField,
  ToggleButton, ToggleButtonGroup, Snackbar, Alert, Grid
} from '@mui/material';
import { Check, Close } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';

const statusColors = {
  pending: 'warning',
  confirmed: 'success',
  rejected: 'error',
  cancelled: 'default',
};

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchBookings = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (statusFilter !== 'all') params.append('status', statusFilter);

    api.get(`/admin/bookings?${params}`)
      .then(({ data }) => setBookings(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchBookings(); }, [date, statusFilter]);

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/admin/bookings/${id}/status`, { status });
      setSnackbar({ open: true, message: `Booking ${status}`, severity: 'success' });
      fetchBookings();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error', severity: 'error' });
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>Bookings</Typography>

      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap" alignItems="center">
        <TextField
          type="date" size="small" label="Date"
          value={date} onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <ToggleButtonGroup
          value={statusFilter} exclusive
          onChange={(e, v) => v && setStatusFilter(v)}
          size="small"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="pending">Pending</ToggleButton>
          <ToggleButton value="confirmed">Confirmed</ToggleButton>
          <ToggleButton value="rejected">Rejected</ToggleButton>
        </ToggleButtonGroup>
        <Button variant="text" size="small" onClick={() => { setDate(''); setStatusFilter('all'); }}>
          Clear Filters
        </Button>
      </Box>

      {/* Booking cards */}
      {loading ? (
        <Typography>Loading...</Typography>
      ) : bookings.length === 0 ? (
        <Typography color="text.secondary">No bookings found</Typography>
      ) : (
        <Grid container spacing={2}>
          {bookings.map(b => (
            <Grid item xs={12} md={6} key={b.id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={1}>
                    <Box>
                      <Typography fontWeight={600}>{b.customer_name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {b.customer_email} {b.customer_phone && `| ${b.customer_phone}`}
                      </Typography>
                    </Box>
                    <Chip label={b.status} color={statusColors[b.status] || 'default'} size="small" />
                  </Box>

                  <Typography variant="body2" mt={1}>
                    {b.service_names}
                  </Typography>

                  <Box display="flex" gap={2} mt={1}>
                    <Typography variant="body2" color="text.secondary">
                      {dayjs(b.date).format('ddd D MMM YYYY')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {b.start_time?.slice(0, 5)} - {b.end_time?.slice(0, 5)}
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      £{parseFloat(b.total_price).toFixed(2)}
                    </Typography>
                  </Box>

                  {b.notes && (
                    <Typography variant="body2" color="text.secondary" mt={1} fontStyle="italic">
                      Note: {b.notes}
                    </Typography>
                  )}

                  {b.status === 'pending' && (
                    <Box display="flex" gap={1} mt={2}>
                      <Button
                        size="small" variant="contained" color="success"
                        startIcon={<Check />}
                        onClick={() => updateStatus(b.id, 'confirmed')}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small" variant="outlined" color="error"
                        startIcon={<Close />}
                        onClick={() => updateStatus(b.id, 'rejected')}
                      >
                        Reject
                      </Button>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

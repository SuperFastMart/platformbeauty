import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, IconButton, Button,
  TextField, MenuItem, CircularProgress, Alert, Tooltip, Grid,
  useMediaQuery, useTheme
} from '@mui/material';
import { Delete, NotificationsActive, HourglassEmpty, Email, Phone, CalendarMonth } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import useSubscriptionTier from '../../hooks/useSubscriptionTier';
import FeatureGate from '../../components/FeatureGate';

const statusConfig = {
  waiting: { label: 'Waiting', color: 'warning' },
  notified: { label: 'Notified', color: 'info' },
  booked: { label: 'Booked', color: 'success' },
  expired: { label: 'Expired', color: 'default' },
  cancelled: { label: 'Cancelled', color: 'error' },
};

export default function Waitlist() {
  const { hasAccess } = useSubscriptionTier();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [notifying, setNotifying] = useState(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const fetchEntries = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterDate) params.append('date', filterDate);
    if (filterStatus) params.append('status', filterStatus);
    api.get(`/admin/waitlist?${params.toString()}`)
      .then(({ data }) => setEntries(data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load waitlist'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEntries(); }, [filterDate, filterStatus]);

  const handleNotify = async (id) => {
    setNotifying(id);
    try {
      await api.post(`/admin/waitlist/${id}/notify`);
      fetchEntries();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to notify');
    } finally {
      setNotifying(null);
    }
  };

  const handleRemove = async (id) => {
    try {
      await api.delete(`/admin/waitlist/${id}`);
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove');
    }
  };

  if (!hasAccess('pro')) return <FeatureGate requiredTier="pro" featureName="Waitlist Management" />;

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={1}>Waitlist</Typography>

      <Alert severity="info" sx={{ mb: 3 }} variant="outlined">
        <Typography variant="body2" fontWeight={600} mb={0.5}>How the waitlist works for your clients</Typography>
        <Typography variant="body2" color="text.secondary">
          When a customer tries to book a date with no available slots, they'll see the option to join
          the waitlist. They enter their name, email, and phone number, and you'll be notified immediately.
          When a slot opens up, use the "Notify" button to send them an email letting them know a spot
          is available. They can then rebook at their convenience through your booking page.
        </Typography>
      </Alert>

      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <TextField
          type="date"
          label="Filter by date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          size="small"
          sx={{ minWidth: 160 }}
        />
        <TextField
          select
          label="Status"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          size="small"
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="waiting">Waiting</MenuItem>
          <MenuItem value="notified">Notified</MenuItem>
          <MenuItem value="booked">Booked</MenuItem>
          <MenuItem value="expired">Expired</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
        </TextField>
        {(filterDate || filterStatus) && (
          <Button size="small" onClick={() => { setFilterDate(''); setFilterStatus(''); }}>
            Clear Filters
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <HourglassEmpty sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">No waitlist entries found.</Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {entries.map(entry => {
            const sc = statusConfig[entry.status] || statusConfig.waiting;
            const date = entry.date ? dayjs(entry.date).format('ddd D MMM YYYY') : '';
            const timeRange = entry.preferred_start_time
              ? `${entry.preferred_start_time.slice(0, 5)}${entry.preferred_end_time ? ` – ${entry.preferred_end_time.slice(0, 5)}` : ''}`
              : 'Any time';

            return (
              <Grid item xs={12} sm={6} md={4} key={entry.id}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                      <Box>
                        <Typography fontWeight={600} fontSize="1rem">{entry.customer_name}</Typography>
                        <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                          <Email sx={{ fontSize: 14, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">{entry.customer_email}</Typography>
                        </Box>
                        {entry.customer_phone && (
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <Phone sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">{entry.customer_phone}</Typography>
                          </Box>
                        )}
                      </Box>
                      <Chip label={sc.label} color={sc.color} size="small" />
                    </Box>

                    <Box display="flex" alignItems="center" gap={0.5} mb={1}>
                      <CalendarMonth sx={{ fontSize: 16, color: 'primary.main' }} />
                      <Typography variant="body2" fontWeight={500}>{date}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                        {timeRange}
                      </Typography>
                    </Box>

                    {entry.service_names && (
                      <Typography variant="body2" color="text.secondary" mb={1} sx={{
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {entry.service_names}
                      </Typography>
                    )}

                    {entry.notes && (
                      <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                        Note: {entry.notes}
                      </Typography>
                    )}

                    {entry.status === 'notified' && entry.expires_at && (
                      <Typography variant="caption" color="info.main" display="block" mb={1}>
                        Expires: {dayjs(entry.expires_at).format('HH:mm')}
                      </Typography>
                    )}

                    <Box display="flex" justifyContent="flex-end" gap={1} mt={1}>
                      {entry.status === 'waiting' && (
                        <Tooltip title="Notify customer">
                          <IconButton
                            size="small"
                            color="info"
                            onClick={() => handleNotify(entry.id)}
                            disabled={notifying === entry.id}
                          >
                            {notifying === entry.id ? <CircularProgress size={18} /> : <NotificationsActive fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Remove from waitlist">
                        <IconButton size="small" color="error" onClick={() => handleRemove(entry.id)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}

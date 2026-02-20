import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Button, Divider,
  List, ListItem, ListItemText, ListItemIcon, useMediaQuery, useTheme
} from '@mui/material';
import {
  CalendarMonth, PendingActions, AttachMoney, People,
  AccessTime, Add, Visibility
} from '@mui/icons-material';
import api from '../../api/client';

function StatCard({ title, value, icon, color, onClick }) {
  return (
    <Card sx={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="body2" color="text.secondary">{title}</Typography>
            <Typography variant="h4" fontWeight={600}>{value}</Typography>
          </Box>
          <Box sx={{ color, opacity: 0.7, fontSize: 48 }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(({ data }) => setStats(data))
      .catch(console.error);
  }, []);

  if (!stats) return <Typography>Loading dashboard...</Typography>;

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>Dashboard</Typography>

      <Grid container spacing={isMobile ? 2 : 3}>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard
            title="Today's Bookings"
            value={stats.todayBookings}
            icon={<CalendarMonth fontSize="inherit" />}
            color="primary.main"
            onClick={() => navigate('/admin/bookings')}
          />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard
            title="Pending Approval"
            value={stats.pendingCount}
            icon={<PendingActions fontSize="inherit" />}
            color="warning.main"
            onClick={() => navigate('/admin/bookings')}
          />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard
            title="Week Revenue"
            value={`£${stats.weekRevenue.toFixed(2)}`}
            icon={<AttachMoney fontSize="inherit" />}
            color="success.main"
          />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard
            title="Total Customers"
            value={stats.totalCustomers}
            icon={<People fontSize="inherit" />}
            color="info.main"
          />
        </Grid>
      </Grid>

      {/* Quick Actions */}
      <Box display="flex" gap={1} mt={3} flexWrap="wrap">
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => navigate('/admin/create-booking')}
          sx={{ minHeight: 44 }}
        >
          Create Booking
        </Button>
        {stats.pendingRequests > 0 && (
          <Button
            variant="outlined"
            color="warning"
            startIcon={<Visibility />}
            onClick={() => navigate('/admin/bookings')}
            sx={{ minHeight: 44 }}
          >
            {stats.pendingRequests} Pending Request{stats.pendingRequests !== 1 ? 's' : ''}
          </Button>
        )}
      </Box>

      {/* Today's Appointments */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} mb={1}>
            Today's Appointments
          </Typography>
          {stats.todayAppointments.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              No appointments scheduled for today.
            </Typography>
          ) : (
            <List disablePadding>
              {stats.todayAppointments.map((appt, i) => (
                <Box key={appt.id}>
                  {i > 0 && <Divider />}
                  <ListItem
                    sx={{ px: 0, cursor: 'pointer' }}
                    onClick={() => navigate('/admin/bookings')}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <AccessTime color="action" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                          <Typography fontWeight={600} variant="body2">
                            {appt.start_time?.slice(0, 5)} - {appt.end_time?.slice(0, 5)}
                          </Typography>
                          <Typography variant="body2">
                            {appt.customer_name}
                          </Typography>
                          <Chip
                            label={appt.status}
                            size="small"
                            color={appt.status === 'confirmed' ? 'success' : 'warning'}
                            variant="outlined"
                          />
                        </Box>
                      }
                      secondary={`${appt.service_names} — £${parseFloat(appt.total_price).toFixed(2)}`}
                    />
                  </ListItem>
                </Box>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

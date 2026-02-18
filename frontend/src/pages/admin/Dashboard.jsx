import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Card, CardContent, Grid } from '@mui/material';
import {
  CalendarMonth, PendingActions, AttachMoney, People
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

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(({ data }) => setStats(data))
      .catch(console.error);
  }, []);

  if (!stats) return <Typography>Loading dashboard...</Typography>;

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>Dashboard</Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Today's Bookings"
            value={stats.todayBookings}
            icon={<CalendarMonth fontSize="inherit" />}
            color="primary.main"
            onClick={() => navigate('/admin/bookings')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Pending Approval"
            value={stats.pendingCount}
            icon={<PendingActions fontSize="inherit" />}
            color="warning.main"
            onClick={() => navigate('/admin/bookings')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Week Revenue"
            value={`£${stats.weekRevenue.toFixed(2)}`}
            icon={<AttachMoney fontSize="inherit" />}
            color="success.main"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Customers"
            value={stats.totalCustomers}
            icon={<People fontSize="inherit" />}
            color="info.main"
          />
        </Grid>
      </Grid>
    </Box>
  );
}

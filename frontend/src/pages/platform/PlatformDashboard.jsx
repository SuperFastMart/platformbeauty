import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress, Chip, List,
  ListItemButton, ListItemText, ListItemIcon, Divider
} from '@mui/material';
import {
  Business, People, CalendarMonth, AttachMoney, TrendingUp,
  FiberNew, SupportAgent
} from '@mui/icons-material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../../api/client';

dayjs.extend(relativeTime);

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/platform/analytics').then(r => r.data),
      api.get('/platform/notifications').then(r => r.data).catch(() => ({ notifications: [], unread_count: 0 })),
    ]).then(([analyticsData, notifData]) => {
      setStats(analyticsData);
      setNotifications(notifData.notifications?.slice(0, 10) || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;

  const cards = [
    { label: 'Total Tenants', value: stats?.total_tenants || 0, icon: <Business fontSize="large" />, color: '#8B2635' },
    { label: 'Active (30d)', value: stats?.active_tenants || 0, icon: <People fontSize="large" />, color: '#1976d2' },
    { label: 'Total Bookings', value: stats?.total_bookings || 0, icon: <CalendarMonth fontSize="large" />, color: '#2e7d32' },
    { label: 'Total Revenue', value: `£${parseFloat(stats?.total_revenue || 0).toFixed(2)}`, icon: <AttachMoney fontSize="large" />, color: '#D4A853' },
    { label: 'New This Month', value: stats?.new_this_month || 0, icon: <TrendingUp fontSize="large" />, color: '#7b1fa2' },
  ];

  const notifIcon = (type) => {
    switch (type) {
      case 'tenant_signup': return <FiberNew color="primary" />;
      case 'ticket_new': return <SupportAgent color="warning" />;
      default: return <FiberNew />;
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Platform Dashboard</Typography>

      {/* Stats Cards */}
      <Grid container spacing={2} mb={3}>
        {cards.map(c => (
          <Grid item xs={6} sm={4} md key={c.label}>
            <Card sx={{ borderTop: `3px solid ${c.color}`, height: '100%' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Box sx={{ color: c.color, mb: 0.5 }}>{c.icon}</Box>
                <Typography variant="h4" fontWeight={700} color={c.color}>{c.value}</Typography>
                <Typography variant="body2" color="text.secondary">{c.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Plan Distribution */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Plan Distribution</Typography>
              {stats?.plan_distribution?.length > 0 ? (
                <Box display="flex" flexDirection="column" gap={1.5}>
                  {stats.plan_distribution.map(p => (
                    <Box key={p.tier} display="flex" justifyContent="space-between" alignItems="center">
                      <Chip
                        label={p.tier || 'free'}
                        size="small" variant="outlined"
                        sx={{ textTransform: 'capitalize', minWidth: 80, justifyContent: 'center' }}
                      />
                      <Box sx={{ flex: 1, mx: 2, height: 8, bgcolor: 'grey.100', borderRadius: 4, overflow: 'hidden' }}>
                        <Box sx={{
                          height: '100%',
                          width: `${Math.min((p.count / (stats.total_tenants || 1)) * 100, 100)}%`,
                          bgcolor: 'primary.main',
                          borderRadius: 4,
                        }} />
                      </Box>
                      <Typography variant="body2" fontWeight={600}>{p.count}</Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary">No data yet</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Notifications */}
        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={1}>Recent Notifications</Typography>
              {notifications.length > 0 ? (
                <List dense disablePadding>
                  {notifications.map((n, i) => (
                    <Box key={n.id}>
                      <ListItemButton
                        sx={{ borderRadius: 1, opacity: n.read_at ? 0.7 : 1 }}
                        onClick={() => {
                          if (n.type === 'ticket_new' && n.metadata?.ticketId) {
                            navigate(`/platform/support/${n.metadata.ticketId}`);
                          } else if (n.type === 'tenant_signup' && n.tenant_id) {
                            navigate(`/platform/tenants/${n.tenant_id}`);
                          }
                          api.put(`/platform/notifications/${n.id}/read`).catch(() => {});
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 40 }}>{notifIcon(n.type)}</ListItemIcon>
                        <ListItemText
                          primary={n.title}
                          secondary={`${n.body || ''} · ${dayjs(n.created_at).fromNow()}`}
                          primaryTypographyProps={{ fontWeight: n.read_at ? 400 : 600, variant: 'body2' }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                        {!n.read_at && (
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', ml: 1 }} />
                        )}
                      </ListItemButton>
                      {i < notifications.length - 1 && <Divider />}
                    </Box>
                  ))}
                </List>
              ) : (
                <Typography color="text.secondary">No notifications yet</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

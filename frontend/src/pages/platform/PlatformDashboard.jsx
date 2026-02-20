import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress, Chip, List,
  ListItemButton, ListItemText, ListItemIcon, Divider, ToggleButtonGroup,
  ToggleButton
} from '@mui/material';
import {
  Business, People, CalendarMonth, AttachMoney, TrendingUp,
  FiberNew, SupportAgent, PersonOutline, AccessTime
} from '@mui/icons-material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../../api/client';

dayjs.extend(relativeTime);

// SVG Bar Chart — bars in SVG (stretch fine), labels as HTML (no distortion)
function BarChart({ data, xKey, yKey, color = '#8B2635', height = 200, formatX, formatY }) {
  if (!data || data.length === 0) return <Typography color="text.secondary" variant="body2">No data</Typography>;
  const maxVal = Math.max(...data.map(d => parseFloat(d[yKey]) || 0), 1);
  const barHeight = height - 28;
  const barPadding = 0.3;

  return (
    <Box sx={{ width: '100%' }}>
      <svg width="100%" height={barHeight} viewBox={`0 0 ${data.length} ${barHeight}`} preserveAspectRatio="none">
        {data.map((d, i) => {
          const val = parseFloat(d[yKey]) || 0;
          const h = (val / maxVal) * barHeight;
          return (
            <rect
              key={i}
              x={i + barPadding / 2}
              y={barHeight - h}
              width={1 - barPadding}
              height={h}
              fill={color}
              opacity={0.85}
            >
              <title>{`${formatX ? formatX(d[xKey]) : d[xKey]}: ${formatY ? formatY(val) : val}`}</title>
            </rect>
          );
        })}
      </svg>
      {data.length <= 31 && (
        <Box sx={{ display: 'flex', width: '100%', mt: 0.5 }}>
          {data.map((d, i) => (
            <Typography
              key={i}
              variant="caption"
              sx={{
                flex: 1,
                textAlign: 'center',
                fontSize: data.length > 20 ? 9 : 11,
                color: 'text.secondary',
                lineHeight: 1,
                overflow: 'hidden',
              }}
            >
              {formatX ? formatX(d[xKey]) : d[xKey]}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

// Horizontal bar for rankings
function HorizontalBars({ data, labelKey, valueKey, color = '#8B2635', suffix = '' }) {
  if (!data || data.length === 0) return <Typography color="text.secondary" variant="body2">No data</Typography>;
  const maxVal = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <Box>
      {data.filter(d => d[valueKey] > 0).map((d, i) => (
        <Box key={i} mb={1}>
          <Box display="flex" justifyContent="space-between" mb={0.3}>
            <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: '60%' }}>{d[labelKey]}</Typography>
            <Typography variant="body2" fontWeight={600}>{d[valueKey]}{suffix}</Typography>
          </Box>
          <Box sx={{ height: 6, bgcolor: 'grey.100', borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{
              height: '100%',
              width: `${(d[valueKey] / maxVal) * 100}%`,
              bgcolor: color,
              borderRadius: 3,
              transition: 'width 0.5s ease',
            }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

// Status chips with counts
function StatusBreakdown({ data }) {
  if (!data || data.length === 0) return <Typography color="text.secondary" variant="body2">No bookings</Typography>;
  const statusColors = {
    confirmed: 'success', pending: 'warning', completed: 'info',
    cancelled: 'error', no_show: 'default',
  };
  return (
    <Box display="flex" flexWrap="wrap" gap={1}>
      {data.map(d => (
        <Chip
          key={d.status}
          label={`${d.status?.replace('_', ' ')} (${d.count})`}
          size="small"
          color={statusColors[d.status] || 'default'}
          variant="outlined"
          sx={{ textTransform: 'capitalize' }}
        />
      ))}
    </Box>
  );
}

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [trends, setTrends] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trendDays, setTrendDays] = useState(30);

  const fetchTrends = (days) => {
    api.get(`/platform/analytics/trends?days=${days}`)
      .then(r => setTrends(r.data))
      .catch(() => {});
  };

  useEffect(() => {
    Promise.all([
      api.get('/platform/analytics').then(r => r.data),
      api.get('/platform/analytics/trends?days=30').then(r => r.data).catch(() => []),
      api.get('/platform/notifications').then(r => r.data).catch(() => ({ notifications: [], unread_count: 0 })),
    ]).then(([analyticsData, trendsData, notifData]) => {
      setStats(analyticsData);
      setTrends(trendsData);
      setNotifications(notifData.notifications?.slice(0, 10) || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleTrendDays = (_, val) => {
    if (!val) return;
    setTrendDays(val);
    fetchTrends(val);
  };

  if (loading) return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;

  const cards = [
    { label: 'Total Tenants', value: stats?.total_tenants || 0, icon: <Business fontSize="large" />, color: '#8B2635' },
    { label: 'Active (30d)', value: stats?.active_tenants || 0, icon: <People fontSize="large" />, color: '#1976d2' },
    { label: 'Total Bookings', value: stats?.total_bookings || 0, icon: <CalendarMonth fontSize="large" />, color: '#2e7d32' },
    { label: 'Total Revenue', value: `£${parseFloat(stats?.total_revenue || 0).toFixed(2)}`, icon: <AttachMoney fontSize="large" />, color: '#D4A853' },
    { label: 'Customers', value: stats?.total_customers || 0, icon: <PersonOutline fontSize="large" />, color: '#0288d1' },
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
          <Grid item xs={6} sm={4} md={2} key={c.label}>
            <Card sx={{ borderTop: `3px solid ${c.color}`, height: '100%' }}>
              <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
                <Box sx={{ color: c.color, mb: 0.5 }}>{c.icon}</Box>
                <Typography variant="h5" fontWeight={700} color={c.color}>{c.value}</Typography>
                <Typography variant="caption" color="text.secondary">{c.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Booking & Revenue Trends */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" fontWeight={600}>Booking & Revenue Trends</Typography>
            <ToggleButtonGroup size="small" value={trendDays} exclusive onChange={handleTrendDays}>
              <ToggleButton value={7}>7d</ToggleButton>
              <ToggleButton value={30}>30d</ToggleButton>
              <ToggleButton value={90}>90d</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="text.secondary" mb={1}>Bookings per Day</Typography>
              <BarChart
                data={trends}
                xKey="date"
                yKey="bookings"
                color="#2e7d32"
                height={180}
                formatX={d => dayjs(d).format('D')}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="text.secondary" mb={1}>Revenue per Day</Typography>
              <BarChart
                data={trends}
                xKey="date"
                yKey="revenue"
                color="#D4A853"
                height={180}
                formatX={d => dayjs(d).format('D')}
                formatY={v => `£${parseFloat(v).toFixed(2)}`}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={3} mb={3}>
        {/* Bookings by Hour */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={1} display="flex" alignItems="center" gap={0.5}>
                <AccessTime fontSize="small" /> Bookings by Hour
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                When customers book most often
              </Typography>
              <BarChart
                data={(() => {
                  const full = Array.from({ length: 24 }, (_, i) => ({
                    hour: i,
                    count: stats?.bookings_by_hour?.find(h => h.hour === i)?.count || 0,
                  }));
                  return full;
                })()}
                xKey="hour"
                yKey="count"
                color="#1976d2"
                height={160}
                formatX={h => `${h}`}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Top Tenants */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Top Tenants (30d)</Typography>
              <HorizontalBars
                data={stats?.top_tenants || []}
                labelKey="name"
                valueKey="booking_count"
                color="#8B2635"
                suffix=" bookings"
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Plan Distribution + Status Breakdown */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Plan Distribution</Typography>
              {stats?.plan_distribution?.length > 0 ? (
                <Box mb={3}>
                  {stats.plan_distribution.map(p => (
                    <Box key={p.tier} display="flex" justifyContent="space-between" alignItems="center" mb={1}>
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
                <Typography color="text.secondary" variant="body2">No data</Typography>
              )}

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" fontWeight={600} mb={1}>Booking Status (30d)</Typography>
              <StatusBreakdown data={stats?.status_breakdown || []} />

              {(stats?.tenant_growth?.length || 0) > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" fontWeight={600} mb={1}>Tenant Signups (6mo)</Typography>
                  <BarChart
                    data={stats.tenant_growth}
                    xKey="month"
                    yKey="count"
                    color="#7b1fa2"
                    height={100}
                    formatX={m => dayjs(m).format('MMM')}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Notifications */}
      <Card>
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
    </Box>
  );
}

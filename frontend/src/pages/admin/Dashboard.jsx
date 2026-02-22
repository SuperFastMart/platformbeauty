import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Button, Divider,
  List, ListItem, ListItemText, ListItemIcon, useMediaQuery, useTheme,
  ToggleButtonGroup, ToggleButton, CircularProgress
} from '@mui/material';
import {
  CalendarMonth, PendingActions, AttachMoney, People,
  AccessTime, Add, Visibility
} from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';

function StatCard({ title, value, icon, color, onClick, subtitle }) {
  return (
    <Card sx={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="body2" color="text.secondary">{title}</Typography>
            <Typography variant="h4" fontWeight={600}>{value}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
          <Box sx={{ color, opacity: 0.7, fontSize: 48 }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// Simple SVG bar chart
function BarChart({ data, labelKey, valueKey, color = '#8B2635', height = 160, compact = false }) {
  if (!data || data.length === 0) return <Typography color="text.secondary" variant="body2">No data yet</Typography>;
  const maxVal = Math.max(...data.map(d => parseFloat(d[valueKey]) || 0), 1);
  const baseWidth = compact ? 300 : 600;
  const barWidth = Math.max(Math.floor(baseWidth / data.length) - 4, 6);

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <svg width={Math.max(data.length * (barWidth + 4), compact ? 200 : 300)} height={height + 30} style={{ display: 'block' }}>
        {data.map((d, i) => {
          const val = parseFloat(d[valueKey]) || 0;
          const barH = Math.max((val / maxVal) * height, 1);
          const x = i * (barWidth + 4) + 2;
          return (
            <g key={i}>
              <rect
                x={x} y={height - barH}
                width={barWidth} height={barH}
                fill={color} rx={2} opacity={0.85}
              />
              {(data.length <= 14 || i % Math.ceil(data.length / 10) === 0) && (
                <text
                  x={x + barWidth / 2} y={height + 14}
                  textAnchor="middle" fontSize="9" fill="#999"
                >
                  {dayjs(d[labelKey]).format('D/M')}
                </text>
              )}
              {val > 0 && data.length <= 14 && (
                <text
                  x={x + barWidth / 2} y={height - barH - 4}
                  textAnchor="middle" fontSize="9" fill="#666"
                >
                  {val % 1 === 0 ? val : parseFloat(val).toFixed(0)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

// Status breakdown as horizontal bars
function StatusBars({ data }) {
  if (!data || data.length === 0) return <Typography color="text.secondary" variant="body2">No data yet</Typography>;
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const colors = { confirmed: '#2e7d32', pending: '#ed6c02', cancelled: '#d32f2f', completed: '#1976d2', 'no-show': '#9e9e9e' };

  return (
    <Box>
      {data.map(d => (
        <Box key={d.status} mb={1.5}>
          <Box display="flex" justifyContent="space-between" mb={0.5}>
            <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{d.status}</Typography>
            <Typography variant="body2" fontWeight={600}>{d.count}</Typography>
          </Box>
          <Box sx={{ height: 8, bgcolor: 'grey.100', borderRadius: 4, overflow: 'hidden' }}>
            <Box sx={{
              height: '100%',
              width: `${(d.count / total) * 100}%`,
              bgcolor: colors[d.status] || '#8B2635',
              borderRadius: 4,
            }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState(30);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(({ data }) => setStats(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    setAnalyticsLoading(true);
    api.get(`/admin/analytics?days=${analyticsPeriod}`)
      .then(({ data }) => setAnalytics(data))
      .catch(console.error)
      .finally(() => setAnalyticsLoading(false));
  }, [analyticsPeriod]);

  if (!stats) return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;

  const repeatPct = analytics?.total_unique_customers > 0
    ? Math.round((analytics.repeat_customers / analytics.total_unique_customers) * 100)
    : 0;

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>Dashboard</Typography>

      {/* Stat Cards */}
      <Grid container spacing={isMobile ? 2 : 3} mb={3}>
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
      <Box display="flex" gap={1} mb={3} flexWrap="wrap">
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => navigate('/admin/bookings/create')}
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

      {/* Analytics Section */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6" fontWeight={600}>Analytics</Typography>
        <ToggleButtonGroup
          value={analyticsPeriod}
          exclusive
          onChange={(_, v) => v && setAnalyticsPeriod(v)}
          size="small"
        >
          <ToggleButton value={7}>7d</ToggleButton>
          <ToggleButton value={30}>30d</ToggleButton>
          <ToggleButton value={90}>90d</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {analyticsLoading ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress size={32} /></Box>
      ) : analytics && (
        <>
          {/* Analytics period stats */}
          <Grid container spacing={2} mb={3}>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={700} color="primary">
                    {analytics.new_customers}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">New Customers</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={700} color="#2e7d32">
                    {repeatPct}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Repeat Rate</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={700} color="#7b1fa2">
                    {analytics.booking_trends.reduce((s, d) => s + d.count, 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Total Bookings</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={700} color="#D4A853">
                    £{analytics.revenue_trends.reduce((s, d) => s + parseFloat(d.revenue || 0), 0).toFixed(2)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Period Revenue</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Grid container spacing={3} mb={3}>
            {/* Bookings Chart */}
            <Grid item xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600} mb={2}>
                    Bookings ({analyticsPeriod}d)
                  </Typography>
                  <BarChart
                    data={analytics.booking_trends}
                    labelKey="date"
                    valueKey="count"
                    color="#8B2635"
                    compact={isMobile}
                  />
                </CardContent>
              </Card>
            </Grid>

            {/* Status Breakdown */}
            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600} mb={2}>
                    Booking Status
                  </Typography>
                  <StatusBars data={analytics.status_breakdown} />
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Grid container spacing={3} mb={3}>
            {/* Revenue Chart */}
            <Grid item xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600} mb={2}>
                    Revenue ({analyticsPeriod}d)
                  </Typography>
                  <BarChart
                    data={analytics.revenue_trends}
                    labelKey="date"
                    valueKey="revenue"
                    color="#2e7d32"
                    compact={isMobile}
                  />
                </CardContent>
              </Card>
            </Grid>

            {/* Top Services */}
            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600} mb={2}>
                    Top Services
                  </Typography>
                  {analytics.top_services.length > 0 ? (
                    <Box>
                      {analytics.top_services.map((s, i) => (
                        <Box key={i} display="flex" justifyContent="space-between" alignItems="center" py={0.75}>
                          <Box flex={1} minWidth={0}>
                            <Typography variant="body2" noWrap fontWeight={i === 0 ? 600 : 400}>
                              {s.service_names}
                            </Typography>
                          </Box>
                          <Box display="flex" gap={1} ml={1}>
                            <Chip label={`${s.count}`} size="small" variant="outlined" />
                            <Typography variant="body2" fontWeight={600} color="success.main" sx={{ minWidth: 50, textAlign: 'right' }}>
                              £{parseFloat(s.revenue || 0).toFixed(0)}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Typography color="text.secondary" variant="body2">No bookings yet</Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Monthly Revenue */}
          {analytics.monthly_revenue.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>
                  Monthly Revenue (Last 6 Months)
                </Typography>
                <Grid container spacing={2}>
                  {analytics.monthly_revenue.map((m, i) => (
                    <Grid item xs={6} sm={4} md={2} key={i}>
                      <Box textAlign="center" py={1}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {dayjs(m.month).format('MMM YYYY')}
                        </Typography>
                        <Typography variant="h6" fontWeight={700} color="success.main">
                          £{parseFloat(m.revenue || 0).toFixed(0)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {m.bookings} booking{m.bookings !== 1 ? 's' : ''}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Today's Appointments */}
      <Card>
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

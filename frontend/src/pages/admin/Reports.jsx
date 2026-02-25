import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, TextField, Button,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, Divider,
  TableContainer, useMediaQuery, useTheme
} from '@mui/material';
import { Download } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import useSubscriptionTier from '../../hooks/useSubscriptionTier';
import FeatureGate from '../../components/FeatureGate';

export default function Reports() {
  const { hasAccess } = useSubscriptionTier();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [from, setFrom] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [revenue, setRevenue] = useState(null);
  const [dailyRevenue, setDailyRevenue] = useState([]);
  const [services, setServices] = useState([]);
  const [bookingStats, setBookingStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [sourceBreakdown, setSourceBreakdown] = useState([]);
  const [tipsData, setTipsData] = useState(null);
  const [retention, setRetention] = useState(null);
  const [atRisk, setAtRisk] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/admin/reports/export?from=${from}&to=${to}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `transactions_${from}_to_${to}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      console.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const fetchData = () => {
    setLoading(true);
    const params = `from=${from}&to=${to}`;
    Promise.all([
      api.get(`/admin/reports/revenue?${params}`),
      api.get(`/admin/reports/daily-revenue?${params}`),
      api.get(`/admin/reports/services-performance?${params}`),
      api.get(`/admin/reports/bookings-stats?${params}`),
      api.get(`/admin/reports/transactions?${params}&limit=20`),
      api.get(`/admin/reports/source-breakdown?${params}`),
      api.get(`/admin/reports/tips?${params}`),
      api.get('/admin/reports/retention'),
      api.get('/admin/reports/at-risk'),
    ])
      .then(([revRes, dailyRes, servRes, bookRes, transRes, srcRes, tipRes, retRes, arRes]) => {
        setRevenue(revRes.data);
        setDailyRevenue(dailyRes.data);
        setServices(servRes.data);
        setBookingStats(bookRes.data);
        setTransactions(transRes.data.transactions);
        setSourceBreakdown(srcRes.data);
        setTipsData(tipRes.data);
        setRetention(retRes.data);
        setAtRisk(arRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  if (!hasAccess('growth')) return <FeatureGate requiredTier="growth" featureName="Reports & Analytics" />;

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>Reports</Typography>

      {/* Date filter */}
      <Box display="flex" gap={2} mb={3} alignItems="center" flexWrap="wrap">
        <TextField
          type="date" size="small" label="From"
          value={from} onChange={(e) => setFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          type="date" size="small" label="To"
          value={to} onChange={(e) => setTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <Button variant="contained" onClick={fetchData}>Apply</Button>
        <Button variant="text" onClick={() => {
          setFrom(dayjs().startOf('month').format('YYYY-MM-DD'));
          setTo(dayjs().format('YYYY-MM-DD'));
        }}>
          This Month
        </Button>
        <Button variant="text" onClick={() => {
          setFrom(dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
          setTo(dayjs().format('YYYY-MM-DD'));
        }}>
          Last 7 Days
        </Button>
        <Button
          variant="outlined" startIcon={<Download />}
          onClick={handleExport} disabled={exporting || loading}
        >
          {exporting ? 'Exporting...' : 'Download CSV'}
        </Button>
      </Box>

      {loading ? (
        <Typography>Loading...</Typography>
      ) : (
        <>
          {/* Revenue stats */}
          {revenue && (
            <Grid container spacing={2} mb={3}>
              <Grid item xs={6} sm={2.4}>
                <Card>
                  <CardContent sx={{ textAlign: 'center', py: 2 }}>
                    <Typography variant="h5" fontWeight={700}>
                      £{revenue.total_revenue.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Total Revenue</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={2.4}>
                <Card>
                  <CardContent sx={{ textAlign: 'center', py: 2 }}>
                    <Typography variant="h5" fontWeight={700}>
                      £{revenue.card_revenue.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Card</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={2.4}>
                <Card>
                  <CardContent sx={{ textAlign: 'center', py: 2 }}>
                    <Typography variant="h5" fontWeight={700}>
                      £{revenue.cash_revenue.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Cash</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={2.4}>
                <Card>
                  <CardContent sx={{ textAlign: 'center', py: 2 }}>
                    <Typography variant="h5" fontWeight={700}>
                      {revenue.total_payments}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Payments</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={2.4}>
                <Card>
                  <CardContent sx={{ textAlign: 'center', py: 2 }}>
                    <Typography variant="h5" fontWeight={700}>
                      £{revenue.average_payment.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Average</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Booking stats */}
          {bookingStats && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} mb={2}>Booking Summary</Typography>
                <Box display="flex" gap={2} flexWrap="wrap">
                  <Chip label={`Total: ${bookingStats.total}`} />
                  {Object.entries(bookingStats.by_status).map(([status, count]) => (
                    <Chip
                      key={status}
                      label={`${status}: ${count}`}
                      color={status === 'completed' ? 'success' : status === 'confirmed' ? 'primary' :
                        status === 'pending' ? 'warning' : status === 'cancelled' || status === 'rejected' ? 'error' : 'default'}
                      variant="outlined"
                    />
                  ))}
                  {bookingStats.noshows > 0 && (
                    <Chip label={`No-shows: ${bookingStats.noshows}`} color="error" />
                  )}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Service performance */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Service Performance</Typography>
              {services.length === 0 ? (
                <Typography color="text.secondary">No data for this period</Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Service</TableCell>
                        {!isMobile && <TableCell>Category</TableCell>}
                        <TableCell align="right">Price</TableCell>
                        <TableCell align="right">Bookings</TableCell>
                        <TableCell align="right">Revenue</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {services.map(s => (
                        <TableRow key={s.id}>
                          <TableCell>{s.name}</TableCell>
                          {!isMobile && <TableCell>{s.category || '—'}</TableCell>}
                          <TableCell align="right">£{s.service_price.toFixed(2)}</TableCell>
                          <TableCell align="right">{s.booking_count}</TableCell>
                          <TableCell align="right">£{s.estimated_revenue.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

          {/* Daily revenue */}
          {dailyRevenue.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} mb={2}>Daily Revenue</Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell align="right">Revenue</TableCell>
                        {!isMobile && <TableCell align="right">Card</TableCell>}
                        {!isMobile && <TableCell align="right">Cash</TableCell>}
                        <TableCell align="right">Payments</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dailyRevenue.map(d => (
                        <TableRow key={d.date}>
                          <TableCell>{dayjs(d.date).format(isMobile ? 'D MMM' : 'ddd D MMM')}</TableCell>
                          <TableCell align="right">£{d.revenue.toFixed(2)}</TableCell>
                          {!isMobile && <TableCell align="right">£{d.card.toFixed(2)}</TableCell>}
                          {!isMobile && <TableCell align="right">£{d.cash.toFixed(2)}</TableCell>}
                          <TableCell align="right">{d.payments}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}

          {/* Recent transactions */}
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Recent Transactions</Typography>
              {transactions.length === 0 ? (
                <Typography color="text.secondary">No transactions for this period</Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Customer</TableCell>
                        {!isMobile && <TableCell>Service</TableCell>}
                        <TableCell>Method</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {transactions.map(t => (
                        <TableRow key={t.id}>
                          <TableCell>{t.paid_at ? dayjs(t.paid_at).format('D MMM HH:mm') : '—'}</TableCell>
                          <TableCell>{t.customer_name || '—'}</TableCell>
                          {!isMobile && <TableCell>{t.service_names || '—'}</TableCell>}
                          <TableCell>
                            <Chip
                              label={{ card: 'Card', cash: 'Cash', card_on_file: 'Card on file', pay_on_site: 'Pay on site', pay_at_salon: 'Pay on site' }[t.payment_method] || t.payment_method}
                              size="small"
                              color={t.payment_method === 'card' ? 'primary' : 'default'}
                            />
                          </TableCell>
                          <TableCell align="right">£{t.amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

          {/* Tips & Source row */}
          <Grid container spacing={2} mt={1} mb={3}>
            {/* Tips summary */}
            {tipsData && (
              <Grid item xs={12} sm={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ textAlign: 'center', py: 2 }}>
                    <Typography variant="h5" fontWeight={700}>
                      £{tipsData.total_tips.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Total Tips</Typography>
                    {tipsData.bookings_with_tips > 0 && (
                      <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                        Avg £{tipsData.avg_tip.toFixed(2)} across {tipsData.bookings_with_tips} booking{tipsData.bookings_with_tips !== 1 ? 's' : ''}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Source breakdown */}
            {sourceBreakdown.length > 0 && (
              <Grid item xs={12} sm={8}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight={600} mb={2}>Booking Sources</Typography>
                    {sourceBreakdown.map(s => {
                      const maxCount = Math.max(...sourceBreakdown.map(x => x.count));
                      const pct = maxCount > 0 ? (s.count / maxCount) * 100 : 0;
                      return (
                        <Box key={s.source} display="flex" alignItems="center" gap={1} mb={1}>
                          <Typography variant="body2" sx={{ minWidth: 80, textTransform: 'capitalize' }}>{s.source}</Typography>
                          <Box sx={{ flex: 1, bgcolor: '#f0f0f0', borderRadius: 1, height: 20, overflow: 'hidden' }}>
                            <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: '#8B2635', borderRadius: 1, transition: 'width 0.3s' }} />
                          </Box>
                          <Typography variant="body2" fontWeight={600} sx={{ minWidth: 40, textAlign: 'right' }}>{s.count}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 60, textAlign: 'right' }}>£{s.revenue.toFixed(0)}</Typography>
                        </Box>
                      );
                    })}
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>

          {/* Retention metrics */}
          {retention && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} mb={2}>Client Retention</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Box textAlign="center">
                      <Typography variant="h5" fontWeight={700} color="primary.main">
                        {retention.total_rebookings > 0
                          ? Math.round((retention.rebooked_30d / retention.total_rebookings) * 100)
                          : 0}%
                      </Typography>
                      <Typography variant="body2" color="text.secondary">Rebook within 30d</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box textAlign="center">
                      <Typography variant="h5" fontWeight={700}>
                        {retention.avg_gap_days > 0 ? `${retention.avg_gap_days}d` : '—'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">Avg gap between visits</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box textAlign="center">
                      <Typography variant="h5" fontWeight={700}>
                        £{retention.avg_ltv.toFixed(0)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">Avg lifetime value</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box textAlign="center">
                      <Typography variant="h5" fontWeight={700} color={retention.at_risk_count > 0 ? 'error.main' : 'text.primary'}>
                        {retention.at_risk_count}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">At-risk clients</Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* At-risk customers */}
          {atRisk.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} mb={2}>
                  At-Risk Customers
                  <Typography component="span" variant="body2" color="text.secondary" ml={1}>
                    (2+ visits, absent 60+ days)
                  </Typography>
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Customer</TableCell>
                        {!isMobile && <TableCell>Last Visit</TableCell>}
                        <TableCell align="right">Days Since</TableCell>
                        <TableCell align="right">Total Spent</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {atRisk.slice(0, 10).map(c => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>{c.name}</Typography>
                            {!isMobile && <Typography variant="caption" color="text.secondary">{c.email}</Typography>}
                          </TableCell>
                          {!isMobile && <TableCell>{c.last_visit_date ? dayjs(c.last_visit_date).format('D MMM YYYY') : '—'}</TableCell>}
                          <TableCell align="right">
                            <Chip label={`${c.days_since_last_visit}d`} size="small" color="error" variant="outlined" />
                          </TableCell>
                          <TableCell align="right">£{c.total_spent.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
}

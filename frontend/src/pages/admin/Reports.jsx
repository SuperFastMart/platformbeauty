import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, TextField, Button,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, Divider,
  TableContainer, useMediaQuery, useTheme
} from '@mui/material';
import dayjs from 'dayjs';
import api from '../../api/client';

export default function Reports() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [from, setFrom] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [revenue, setRevenue] = useState(null);
  const [dailyRevenue, setDailyRevenue] = useState([]);
  const [services, setServices] = useState([]);
  const [bookingStats, setBookingStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    setLoading(true);
    const params = `from=${from}&to=${to}`;
    Promise.all([
      api.get(`/admin/reports/revenue?${params}`),
      api.get(`/admin/reports/daily-revenue?${params}`),
      api.get(`/admin/reports/services-performance?${params}`),
      api.get(`/admin/reports/bookings-stats?${params}`),
      api.get(`/admin/reports/transactions?${params}&limit=20`),
    ])
      .then(([revRes, dailyRes, servRes, bookRes, transRes]) => {
        setRevenue(revRes.data);
        setDailyRevenue(dailyRes.data);
        setServices(servRes.data);
        setBookingStats(bookRes.data);
        setTransactions(transRes.data.transactions);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

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
                              label={t.payment_method}
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
        </>
      )}
    </Box>
  );
}

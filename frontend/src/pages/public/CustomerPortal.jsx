import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, Tabs, Tab, Chip,
  Container, Alert, CircularProgress, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Radio, RadioGroup, FormControlLabel,
  Snackbar, IconButton, Switch, Grid,
} from '@mui/material';
import { Logout, Edit, EmojiEvents, Search, DeleteForever } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';
import CalendarGrid from '../../components/CalendarGrid';
import TimeSlotPicker from '../../components/TimeSlotPicker';

const statusColors = {
  pending: 'warning', confirmed: 'success', rejected: 'error',
  cancelled: 'default', completed: 'info',
};

function TabPanel({ children, value, index }) {
  return value === index ? <Box pt={2}>{children}</Box> : null;
}

export default function CustomerPortal() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const tenant = useTenant();

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [history, setHistory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessageBody, setNewMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loyalty, setLoyalty] = useState(null);
  const [redeemingCategory, setRedeemingCategory] = useState(null);
  const [myMembership, setMyMembership] = useState(null);
  const [myPackages, setMyPackages] = useState([]);
  const [cancellingMembership, setCancellingMembership] = useState(false);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Request dialog state
  const [requestDialog, setRequestDialog] = useState(false);
  const [requestBooking, setRequestBooking] = useState(null);
  const [requestType, setRequestType] = useState('cancel');
  const [requestReason, setRequestReason] = useState('');
  const [requestDate, setRequestDate] = useState('');
  const [requestTime, setRequestTime] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Amendment slot picker state
  const [amendSlots, setAmendSlots] = useState([]);
  const [amendSlotsLoading, setAmendSlotsLoading] = useState(false);
  const [amendCalendarMonth, setAmendCalendarMonth] = useState(dayjs().startOf('month'));
  const [findingNextAmend, setFindingNextAmend] = useState(false);

  // Profile state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Account deletion
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const customerToken = localStorage.getItem('customer_token');

  const authApi = (method, url, data) => {
    return api({ method, url, data, headers: { Authorization: `Bearer ${customerToken}` } });
  };

  useEffect(() => {
    if (!customerToken) {
      navigate(`/t/${slug}/portal/login`);
      return;
    }
    fetchData();
  }, [slug, customerToken]);

  const fetchData = async () => {
    try {
      const [meRes, reqRes, msgRes, loyaltyRes, membershipRes, packagesRes] = await Promise.all([
        authApi('get', `/t/${slug}/auth/me`),
        authApi('get', `/t/${slug}/auth/booking-requests`),
        authApi('get', `/t/${slug}/auth/messages`),
        authApi('get', `/t/${slug}/loyalty/status`).catch(() => ({ data: { active: false } })),
        authApi('get', `/t/${slug}/memberships/my-membership`).catch(() => ({ data: null })),
        authApi('get', `/t/${slug}/packages/my-packages`).catch(() => ({ data: [] })),
      ]);
      setCustomer(meRes.data.customer);
      setUpcoming(meRes.data.upcoming);
      setHistory(meRes.data.history);
      setRequests(reqRes.data);
      setMessages(msgRes.data);
      setLoyalty(loyaltyRes.data);
      setMyMembership(membershipRes.data);
      setMyPackages(packagesRes.data || []);
      setEditName(meRes.data.customer.name);
      setEditPhone(meRes.data.customer.phone || '');
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('customer_token');
        localStorage.removeItem('customer_user');
        navigate(`/t/${slug}/portal/login`);
        return;
      }
      setError('Failed to load your data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer_user');
    navigate(`/t/${slug}/portal/login`);
  };

  const openRequestDialog = (booking) => {
    setRequestBooking(booking);
    setRequestType('cancel');
    setRequestReason('');
    setRequestDate('');
    setRequestTime('');
    setAmendSlots([]);
    setAmendCalendarMonth(dayjs().startOf('month'));
    setRequestDialog(true);
  };

  // Fetch available slots when amend date changes
  useEffect(() => {
    if (requestType !== 'amend' || !requestDate) {
      setAmendSlots([]);
      return;
    }
    setAmendSlotsLoading(true);
    api.get(`/t/${slug}/slots?date=${requestDate}`)
      .then(({ data }) => setAmendSlots(data))
      .catch(() => setAmendSlots([]))
      .finally(() => setAmendSlotsLoading(false));
  }, [requestDate, requestType, slug]);

  // Compute duration from the booking's start/end times
  const amendDuration = useMemo(() => {
    if (!requestBooking?.start_time || !requestBooking?.end_time) return 30;
    const [sh, sm] = requestBooking.start_time.split(':').map(Number);
    const [eh, em] = requestBooking.end_time.split(':').map(Number);
    const d = (eh * 60 + em) - (sh * 60 + sm);
    return d > 0 ? d : 30;
  }, [requestBooking]);

  const handleFindNextAmend = async () => {
    if (!requestBooking?.service_ids) return;
    setFindingNextAmend(true);
    try {
      const { data } = await api.get(`/t/${slug}/next-available?serviceIds=${requestBooking.service_ids}`);
      if (data.found) {
        setRequestDate(data.date);
        setRequestTime(data.time?.slice(0, 5));
        setAmendCalendarMonth(dayjs(data.date).startOf('month'));
      }
    } catch {
      // Silent fail — user can pick manually
    } finally {
      setFindingNextAmend(false);
    }
  };

  const submitRequest = async () => {
    setSubmittingRequest(true);
    try {
      await authApi('post', `/t/${slug}/auth/booking-request`, {
        bookingId: requestBooking.id,
        requestType,
        reason: requestReason,
        requestedDate: requestType === 'amend' ? requestDate : undefined,
        requestedTime: requestType === 'amend' ? requestTime : undefined,
      });
      setSnackbar({ open: true, message: 'Request submitted successfully', severity: 'success' });
      setRequestDialog(false);
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to submit request', severity: 'error' });
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessageBody.trim()) return;
    setSendingMessage(true);
    try {
      await authApi('post', `/t/${slug}/auth/messages`, { body: newMessageBody });
      setNewMessageBody('');
      const { data } = await authApi('get', `/t/${slug}/auth/messages`);
      setMessages(data);
      setSnackbar({ open: true, message: 'Message sent', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to send message', severity: 'error' });
    } finally {
      setSendingMessage(false);
    }
  };

  const cancelRequest = async (id) => {
    try {
      await authApi('delete', `/t/${slug}/auth/booking-request/${id}`);
      setSnackbar({ open: true, message: 'Request cancelled', severity: 'success' });
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to cancel request', severity: 'error' });
    }
  };

  const saveProfile = async () => {
    try {
      const { data } = await authApi('put', `/t/${slug}/auth/profile`, { name: editName, phone: editPhone });
      setCustomer(prev => ({ ...prev, ...data }));
      setSnackbar({ open: true, message: 'Profile updated', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to update profile', severity: 'error' });
    }
  };

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      return setSnackbar({ open: true, message: 'Passwords do not match', severity: 'error' });
    }
    try {
      await authApi('post', `/t/${slug}/auth/change-password`, { currentPassword, newPassword });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setSnackbar({ open: true, message: 'Password changed', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to change password', severity: 'error' });
    }
  };

  const handleRedeem = async (category) => {
    setRedeemingCategory(category);
    try {
      const { data } = await authApi('post', `/t/${slug}/loyalty/redeem`, { category });
      setSnackbar({ open: true, message: `Reward redeemed! Your code: ${data.code}`, severity: 'success' });
      fetchData(); // Refresh stamps
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to redeem', severity: 'error' });
    } finally {
      setRedeemingCategory(null);
    }
  };

  const handleCancelMembership = async () => {
    if (!window.confirm('Are you sure you want to cancel your membership? It will remain active until the end of your current billing period.')) return;
    setCancellingMembership(true);
    try {
      await authApi('post', `/t/${slug}/memberships/cancel`);
      setSnackbar({ open: true, message: 'Membership will be cancelled at the end of your billing period', severity: 'success' });
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to cancel', severity: 'error' });
    } finally {
      setCancellingMembership(false);
    }
  };

  const hasPlans = !!(myMembership || myPackages.length > 0);

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await authApi('delete', `/t/${slug}/auth/account`);
      localStorage.removeItem('customer_token');
      localStorage.removeItem('customer_user');
      navigate(`/t/${slug}`);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to delete account', severity: 'error' });
    } finally {
      setDeletingAccount(false);
      setDeleteDialog(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  const BookingCard = ({ booking, showActions }) => (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="start">
          <Box>
            <Typography fontWeight={600}>{booking.service_names}</Typography>
            <Typography variant="body2" color="text.secondary">
              {dayjs(booking.date).format('dddd D MMMM YYYY')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {booking.start_time?.slice(0, 5)} - {booking.end_time?.slice(0, 5)}
            </Typography>
            <Typography variant="body2" fontWeight={500} mt={0.5}>
              £{parseFloat(booking.total_price).toFixed(2)}
            </Typography>
          </Box>
          <Box textAlign="right">
            <Chip label={booking.status} color={statusColors[booking.status] || 'default'} size="small" />
          </Box>
        </Box>
        {booking.notes && (
          <Typography variant="body2" color="text.secondary" mt={1} fontStyle="italic">
            {booking.notes}
          </Typography>
        )}
        {showActions && ['pending', 'confirmed'].includes(booking.status) && (
          <Box display="flex" gap={1} mt={2}>
            <Button size="small" variant="outlined" onClick={() => openRequestDialog(booking)}>
              Change / Cancel
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Welcome blurb */}
      <Box mb={3} p={2.5} bgcolor="rgba(139, 38, 53, 0.04)" borderRadius={3}>
        <Typography variant="h5" fontWeight={700} mb={0.5}>Welcome back, {customer?.name}</Typography>
        <Typography variant="body2" color="text.secondary">
          This is your personal portal where you can manage all your bookings, view your history, send messages to
          {tenant?.name ? ` ${tenant.name}` : ' your stylist'}, and manage your loyalty rewards, memberships, and packages.
          Use the tabs below to navigate.
        </Typography>
      </Box>

      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h6" fontWeight={600}>My Bookings</Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button variant="outlined" size="small" onClick={() => navigate(`/t/${slug}/book`)}>
            New Booking
          </Button>
          <IconButton onClick={handleLogout} title="Sign Out">
            <Logout />
          </IconButton>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tab label={`Upcoming (${upcoming.length})`} />
        <Tab label="History" />
        <Tab label={`Requests (${requests.filter(r => r.status === 'pending').length})`} />
        <Tab label={`Messages${messages.length > 0 ? ` (${messages.filter(m => m.direction === 'outbound' && !m.read_at).length})` : ''}`} />
        {hasPlans && <Tab label="My Plans" />}
        {loyalty?.active && <Tab label="Loyalty" />}
        <Tab label="Profile" />
      </Tabs>

      {/* Upcoming */}
      <TabPanel value={tab} index={0}>
        {upcoming.length === 0 ? (
          <Box textAlign="center" py={4}>
            <Typography color="text.secondary" mb={2}>No upcoming bookings</Typography>
            <Button variant="contained" onClick={() => navigate(`/t/${slug}/book`)}>
              Book an Appointment
            </Button>
          </Box>
        ) : upcoming.map(b => <BookingCard key={b.id} booking={b} showActions />)}
      </TabPanel>

      {/* History */}
      <TabPanel value={tab} index={1}>
        {history.length === 0 ? (
          <Typography color="text.secondary" py={4} textAlign="center">No past bookings</Typography>
        ) : history.map(b => <BookingCard key={b.id} booking={b} />)}
      </TabPanel>

      {/* Requests */}
      <TabPanel value={tab} index={2}>
        {requests.length === 0 ? (
          <Typography color="text.secondary" py={4} textAlign="center">No requests</Typography>
        ) : requests.map(r => (
          <Card key={r.id} sx={{ mb: 2 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box>
                  <Typography fontWeight={600}>
                    {r.request_type === 'cancel' ? 'Cancellation' : 'Amendment'} Request
                  </Typography>
                  <Typography variant="body2" color="text.secondary">{r.service_names}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Original: {dayjs(r.booking_date).format('D MMM YYYY')} at {r.booking_time?.slice(0, 5)}
                  </Typography>
                  {r.reason && <Typography variant="body2" mt={0.5}>Reason: {r.reason}</Typography>}
                  {r.requested_date && (
                    <Typography variant="body2">
                      Requested: {dayjs(r.requested_date).format('D MMM YYYY')} at {r.requested_time?.slice(0, 5)}
                    </Typography>
                  )}
                  {r.admin_response && (
                    <Typography variant="body2" fontStyle="italic" mt={0.5}>
                      Response: {r.admin_response}
                    </Typography>
                  )}
                </Box>
                <Box textAlign="right">
                  <Chip label={r.status} size="small"
                    color={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'error' : 'warning'} />
                  <Typography variant="caption" display="block" color="text.secondary" mt={0.5}>
                    {dayjs(r.created_at).format('D MMM YYYY')}
                  </Typography>
                </Box>
              </Box>
              {r.status === 'pending' && (
                <Button size="small" color="error" sx={{ mt: 1 }} onClick={() => cancelRequest(r.id)}>
                  Withdraw Request
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </TabPanel>

      {/* Messages */}
      <TabPanel value={tab} index={3}>
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ maxHeight: 400, overflow: 'auto' }}>
            {messages.length === 0 ? (
              <Typography color="text.secondary" textAlign="center" py={4}>
                No messages yet. Send a message below and we'll get back to you.
              </Typography>
            ) : (
              messages.map(m => (
                <Box
                  key={m.id}
                  mb={1.5}
                  display="flex"
                  justifyContent={m.direction === 'inbound' ? 'flex-end' : 'flex-start'}
                >
                  <Box
                    maxWidth="80%"
                    p={1.5}
                    borderRadius={2}
                    bgcolor={m.direction === 'inbound' ? 'primary.main' : 'grey.100'}
                    color={m.direction === 'inbound' ? 'white' : 'text.primary'}
                  >
                    {m.subject && (
                      <Typography variant="caption" fontWeight={600} display="block" mb={0.5}>
                        {m.subject}
                      </Typography>
                    )}
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m.body}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7 }} display="block" textAlign="right" mt={0.5}>
                      {dayjs(m.created_at).format('D MMM HH:mm')}
                    </Typography>
                  </Box>
                </Box>
              ))
            )}
          </CardContent>
        </Card>
        <Box display="flex" gap={1}>
          <TextField
            size="small" fullWidth placeholder="Type a message..."
            value={newMessageBody} onChange={e => setNewMessageBody(e.target.value)}
            multiline maxRows={3}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
          />
          <Button
            variant="contained"
            onClick={handleSendMessage}
            disabled={!newMessageBody.trim() || sendingMessage}
          >
            Send
          </Button>
        </Box>
      </TabPanel>

      {/* My Plans (Membership + Packages) */}
      {hasPlans && (
        <TabPanel value={tab} index={4}>
          {myMembership && (
            <Card sx={{ mb: 3, border: '2px solid', borderColor: '#D4A85330' }}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                  <Box>
                    <Typography fontWeight={700} variant="h6">{myMembership.plan_name}</Typography>
                    <Chip label={myMembership.status === 'cancelling' ? 'Cancelling' : 'Active'}
                      size="small" color={myMembership.status === 'cancelling' ? 'warning' : 'success'}
                      sx={{ mt: 0.5 }} />
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#D4A853">
                    £{parseFloat(myMembership.price_monthly).toFixed(2)}/mo
                  </Typography>
                </Box>
                <Grid container spacing={2} mb={2}>
                  {myMembership.included_sessions > 0 && (
                    <Grid item xs={6}>
                      <Box bgcolor="grey.50" p={1.5} borderRadius={2} textAlign="center">
                        <Typography variant="h5" fontWeight={700}>
                          {myMembership.included_sessions - (myMembership.sessions_used_this_period || 0)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Sessions Remaining</Typography>
                      </Box>
                    </Grid>
                  )}
                  {myMembership.discount_percent > 0 && (
                    <Grid item xs={6}>
                      <Box bgcolor="grey.50" p={1.5} borderRadius={2} textAlign="center">
                        <Typography variant="h5" fontWeight={700}>{myMembership.discount_percent}%</Typography>
                        <Typography variant="caption" color="text.secondary">Discount</Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>
                {myMembership.current_period_end && (
                  <Typography variant="body2" color="text.secondary" mb={1}>
                    {myMembership.status === 'cancelling'
                      ? `Access until: ${dayjs(myMembership.current_period_end).format('D MMM YYYY')}`
                      : `Next billing: ${dayjs(myMembership.current_period_end).format('D MMM YYYY')}`}
                  </Typography>
                )}
                {myMembership.status !== 'cancelling' && myMembership.status !== 'cancelled' && (
                  <Button variant="outlined" color="error" size="small"
                    onClick={handleCancelMembership} disabled={cancellingMembership}>
                    {cancellingMembership ? 'Cancelling...' : 'Cancel Membership'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {myPackages.length > 0 && (
            <>
              <Typography fontWeight={600} mb={2}>Service Packages</Typography>
              {myPackages.map(pkg => (
                <Card key={pkg.id} sx={{ mb: 2, opacity: pkg.status === 'active' ? 1 : 0.6 }}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="start">
                      <Box>
                        <Typography fontWeight={600}>{pkg.name}</Typography>
                        <Chip label={pkg.status} size="small"
                          color={pkg.status === 'active' ? 'success' : 'default'}
                          sx={{ mt: 0.5 }} />
                      </Box>
                      <Box textAlign="right">
                        <Typography variant="h6" fontWeight={700} color="#D4A853">
                          {pkg.sessions_remaining}/{pkg.total_sessions}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">sessions left</Typography>
                      </Box>
                    </Box>
                    {pkg.services && (
                      <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                        {pkg.services.filter(Boolean).map(s => (
                          <Chip key={s.id} label={s.name} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                        ))}
                      </Box>
                    )}
                    {pkg.expires_at && (
                      <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                        Expires: {dayjs(pkg.expires_at).format('D MMM YYYY')}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabPanel>
      )}

      {/* Loyalty */}
      {loyalty?.active && (
        <TabPanel value={tab} index={hasPlans ? 5 : 4}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <EmojiEvents color="primary" />
                <Typography fontWeight={600}>Loyalty Stamps</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Collect {loyalty.stamps_needed} stamps to earn {loyalty.discount_percent}% off your next booking!
              </Typography>

              {loyalty.stamps?.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  No stamps yet. Complete a booking to start earning!
                </Typography>
              ) : (
                loyalty.stamps?.map(s => (
                  <Box key={s.category} mb={2} p={2} bgcolor="grey.50" borderRadius={2}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography fontWeight={600}>{s.category}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {s.stamps} / {loyalty.stamps_needed} stamps
                      </Typography>
                    </Box>
                    {/* Visual stamp progress */}
                    <Box display="flex" gap={0.5} mb={1} flexWrap="wrap">
                      {Array.from({ length: loyalty.stamps_needed }, (_, i) => (
                        <Box
                          key={i}
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            bgcolor: i < s.stamps ? 'primary.main' : 'grey.300',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.2s',
                          }}
                        >
                          {i < s.stamps && (
                            <Typography variant="caption" color="white" fontWeight={700}>
                              {i + 1}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                    {s.stamps >= loyalty.stamps_needed && (
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleRedeem(s.category)}
                        disabled={redeemingCategory === s.category}
                        sx={{ mt: 1 }}
                      >
                        {redeemingCategory === s.category ? 'Redeeming...' : `Redeem ${loyalty.discount_percent}% Off`}
                      </Button>
                    )}
                    <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                      Lifetime stamps: {s.lifetime_stamps}
                    </Typography>
                  </Box>
                ))
              )}
            </CardContent>
          </Card>

          {/* Active reward codes */}
          {loyalty.available_rewards?.length > 0 && (
            <Card>
              <CardContent>
                <Typography fontWeight={600} mb={2}>Your Reward Codes</Typography>
                {loyalty.available_rewards.map(r => (
                  <Box key={r.id} mb={1.5} p={1.5} bgcolor="success.50" borderRadius={2}
                    sx={{ bgcolor: 'rgba(46, 125, 50, 0.08)', border: '1px dashed', borderColor: 'success.main' }}>
                    <Typography fontWeight={700} fontFamily="monospace" fontSize="1.1rem">
                      {r.code}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.reward_name || `${loyalty.discount_percent}% off`}
                      {r.expires_at && ` — Expires ${dayjs(r.expires_at).format('D MMM YYYY')}`}
                    </Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          )}
        </TabPanel>
      )}

      {/* Profile */}
      <TabPanel value={tab} index={4 + (hasPlans ? 1 : 0) + (loyalty?.active ? 1 : 0)}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography fontWeight={600} mb={2}>Your Details</Typography>
            <TextField fullWidth label="Name" margin="normal"
              value={editName} onChange={e => setEditName(e.target.value)} />
            <TextField fullWidth label="Phone" margin="normal"
              value={editPhone} onChange={e => setEditPhone(e.target.value)} />
            <TextField fullWidth label="Email" margin="normal" disabled
              value={customer?.email || ''} />
            <Button variant="contained" sx={{ mt: 2 }} onClick={saveProfile}>
              Save Changes
            </Button>
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography fontWeight={600} mb={1}>Admin Access</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Allow the business to access your account for booking management and support purposes.
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={!!customer?.allow_admin_impersonation}
                  onChange={async (e) => {
                    try {
                      await authApi('put', `/t/${slug}/auth/profile`, { allow_admin_impersonation: e.target.checked });
                      setCustomer(prev => ({ ...prev, allow_admin_impersonation: e.target.checked }));
                      setSnackbar({ open: true, message: e.target.checked ? 'Admin access enabled' : 'Admin access disabled', severity: 'success' });
                    } catch {
                      setSnackbar({ open: true, message: 'Failed to update', severity: 'error' });
                    }
                  }}
                />
              }
              label="Allow business to view my account"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography fontWeight={600} mb={2}>Change Password</Typography>
            <TextField fullWidth label="Current Password" type="password" margin="normal"
              value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            <TextField fullWidth label="New Password" type="password" margin="normal"
              value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <TextField fullWidth label="Confirm New Password" type="password" margin="normal"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            <Button variant="contained" sx={{ mt: 2 }} onClick={changePassword}>
              Change Password
            </Button>
          </CardContent>
        </Card>

        <Card sx={{ mt: 3, border: '1px solid', borderColor: 'error.main' }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <DeleteForever color="error" />
              <Typography fontWeight={600} color="error">Delete My Account</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Permanently delete your account and all personal data. Your booking history will be anonymised
              for the business's records but will no longer be linked to you. This action cannot be undone.
            </Typography>
            <Button
              variant="outlined"
              color="error"
              onClick={() => { setDeleteConfirmText(''); setDeleteDialog(true); }}
            >
              Delete My Account
            </Button>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Cancel/Amend Request Dialog */}
      <Dialog open={requestDialog} onClose={() => setRequestDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Change or Cancel Booking</DialogTitle>
        <DialogContent>
          {requestBooking && (
            <Box mb={2}>
              <Typography variant="body2" color="text.secondary">
                {requestBooking.service_names} — {dayjs(requestBooking.date).format('D MMM YYYY')} at {requestBooking.start_time?.slice(0, 5)}
              </Typography>
            </Box>
          )}

          <RadioGroup value={requestType} onChange={e => setRequestType(e.target.value)}>
            <FormControlLabel value="cancel" control={<Radio />} label="Cancel this booking" />
            <FormControlLabel value="amend" control={<Radio />} label="Request a different date/time" />
          </RadioGroup>

          <TextField fullWidth label="Reason (optional)" margin="normal" multiline rows={2}
            value={requestReason} onChange={e => setRequestReason(e.target.value)} />

          {requestType === 'amend' && (
            <Box mt={2}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle2">Choose a new date and time</Typography>
                <Button
                  variant="text"
                  size="small"
                  startIcon={findingNextAmend ? <CircularProgress size={14} /> : <Search />}
                  onClick={handleFindNextAmend}
                  disabled={findingNextAmend}
                >
                  {findingNextAmend ? 'Searching...' : 'Find Next'}
                </Button>
              </Box>

              <CalendarGrid
                calendarMonth={amendCalendarMonth}
                onMonthChange={setAmendCalendarMonth}
                selectedDate={requestDate}
                onDateSelect={(dateStr) => {
                  setRequestDate(dateStr);
                  setRequestTime('');
                }}
                compact
              />

              {requestDate && (
                <Box mt={2}>
                  <TimeSlotPicker
                    slots={amendSlots}
                    totalDuration={amendDuration}
                    selectedSlot={requestTime}
                    onSlotSelect={setRequestTime}
                    loading={amendSlotsLoading}
                    emptyMessage="No available slots for this date."
                    compact
                  />
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRequestDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitRequest} disabled={submittingRequest}>
            {submittingRequest ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={deleteDialog} onClose={() => !deletingAccount && setDeleteDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle color="error">Delete Your Account</DialogTitle>
        <DialogContent>
          <Typography variant="body2" mb={2}>
            This will permanently delete your account including:
          </Typography>
          <Typography variant="body2" component="ul" sx={{ pl: 2, mb: 2 }}>
            <li>Your personal details and contact information</li>
            <li>Messages and booking requests</li>
            <li>Loyalty stamps and rewards</li>
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Your past bookings and reviews will be anonymised (not deleted) so the business can keep their records.
          </Typography>
          <Typography variant="body2" fontWeight={600} mb={1}>
            Type DELETE to confirm:
          </Typography>
          <TextField
            fullWidth size="small"
            value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)} disabled={deletingAccount}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteAccount}
            disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
          >
            {deletingAccount ? 'Deleting...' : 'Permanently Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Container>
  );
}

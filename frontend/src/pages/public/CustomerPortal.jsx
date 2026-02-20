import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, Tabs, Tab, Chip,
  Container, Alert, CircularProgress, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Radio, RadioGroup, FormControlLabel,
  Snackbar, IconButton, Switch
} from '@mui/material';
import { Logout, Edit, EmojiEvents } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';

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

  // Profile state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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
      const [meRes, reqRes, msgRes, loyaltyRes] = await Promise.all([
        authApi('get', `/t/${slug}/auth/me`),
        authApi('get', `/t/${slug}/auth/booking-requests`),
        authApi('get', `/t/${slug}/auth/messages`),
        authApi('get', `/t/${slug}/loyalty/status`).catch(() => ({ data: { active: false } })),
      ]);
      setCustomer(meRes.data.customer);
      setUpcoming(meRes.data.upcoming);
      setHistory(meRes.data.history);
      setRequests(reqRes.data);
      setMessages(msgRes.data);
      setLoyalty(loyaltyRes.data);
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
    setRequestDialog(true);
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
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>My Bookings</Typography>
          <Typography color="text.secondary">Welcome back, {customer?.name}</Typography>
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

      {/* Loyalty */}
      {loyalty?.active && (
        <TabPanel value={tab} index={4}>
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
      <TabPanel value={tab} index={loyalty?.active ? 5 : 4}>
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
            <Box display="flex" gap={2} mt={1}>
              <TextField type="date" label="Preferred Date" InputLabelProps={{ shrink: true }}
                value={requestDate} onChange={e => setRequestDate(e.target.value)} fullWidth />
              <TextField type="time" label="Preferred Time" InputLabelProps={{ shrink: true }}
                value={requestTime} onChange={e => setRequestTime(e.target.value)} fullWidth />
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

      <Snackbar open={snackbar.open} autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Container>
  );
}

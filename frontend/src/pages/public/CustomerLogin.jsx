import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, TextField, Button, Tab, Tabs, Card, CardContent,
  Container, Alert, CircularProgress, Link
} from '@mui/material';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';

function TabPanel({ children, value, index }) {
  return value === index ? <Box pt={2}>{children}</Box> : null;
}

export default function CustomerLogin() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const tenant = useTenant();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get('reset');

  const [tab, setTab] = useState(resetToken ? 3 : 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Sign In
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  // Magic Link
  const [magicEmail, setMagicEmail] = useState('');

  // Reset Password
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');

  const saveAndRedirect = (token, customer) => {
    localStorage.setItem('customer_token', token);
    localStorage.setItem('customer_user', JSON.stringify(customer));
    navigate(`/t/${slug}/portal`);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data } = await api.post(`/t/${slug}/auth/login`, { email: loginEmail, password: loginPassword });
      saveAndRedirect(data.token, data.customer);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (regPassword !== regConfirm) {
      return setError('Passwords do not match');
    }
    setLoading(true);
    try {
      const { data } = await api.post(`/t/${slug}/auth/register`, {
        name: regName, email: regEmail, phone: regPhone, password: regPassword,
      });
      saveAndRedirect(data.token, data.customer);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally { setLoading(false); }
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    try {
      const { data } = await api.post(`/t/${slug}/auth/magic-link`, { email: magicEmail });
      setSuccess(data.message);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send link');
    } finally { setLoading(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (resetPassword !== resetConfirm) {
      return setError('Passwords do not match');
    }
    setLoading(true);
    try {
      const { data } = await api.post(`/t/${slug}/auth/reset-password`, {
        token: resetToken, password: resetPassword,
      });
      setSuccess(data.message);
      setTab(0);
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed');
    } finally { setLoading(false); }
  };

  const handleForgotPassword = async () => {
    if (!loginEmail) {
      setError('Enter your email above first');
      return;
    }
    setError(''); setLoading(true);
    try {
      const { data } = await api.post(`/t/${slug}/auth/forgot-password`, { email: loginEmail });
      setSuccess(data.message);
    } catch (err) {
      setError('Failed to send reset link');
    } finally { setLoading(false); }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Box textAlign="center" mb={3}>
        <Typography variant="h5" fontWeight={700}>
          {tenant?.name || 'Customer Portal'}
        </Typography>
        <Typography color="text.secondary">
          Sign in to manage your bookings
        </Typography>
      </Box>

      <Card>
        <CardContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

          {resetToken ? (
            <Box>
              <Typography variant="h6" mb={2}>Reset Your Password</Typography>
              <form onSubmit={handleResetPassword}>
                <TextField fullWidth label="New Password" type="password" margin="normal" required
                  value={resetPassword} onChange={e => setResetPassword(e.target.value)} />
                <TextField fullWidth label="Confirm Password" type="password" margin="normal" required
                  value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} />
                <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }} disabled={loading}>
                  {loading ? <CircularProgress size={24} /> : 'Set New Password'}
                </Button>
              </form>
            </Box>
          ) : (
            <>
              <Tabs value={tab} onChange={(e, v) => { setTab(v); setError(''); setSuccess(''); }}
                variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tab label="Sign In" />
                <Tab label="Register" />
                <Tab label="Magic Link" />
              </Tabs>

              <TabPanel value={tab} index={0}>
                <form onSubmit={handleLogin}>
                  <TextField fullWidth label="Email" type="email" margin="normal" required
                    value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                  <TextField fullWidth label="Password" type="password" margin="normal" required
                    value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                  <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }} disabled={loading}>
                    {loading ? <CircularProgress size={24} /> : 'Sign In'}
                  </Button>
                  <Box textAlign="center" mt={1}>
                    <Link component="button" variant="body2" onClick={handleForgotPassword}>
                      Forgot password?
                    </Link>
                  </Box>
                </form>
              </TabPanel>

              <TabPanel value={tab} index={1}>
                <form onSubmit={handleRegister}>
                  <TextField fullWidth label="Full Name" margin="normal" required
                    value={regName} onChange={e => setRegName(e.target.value)} />
                  <TextField fullWidth label="Email" type="email" margin="normal" required
                    value={regEmail} onChange={e => setRegEmail(e.target.value)} />
                  <TextField fullWidth label="Phone" margin="normal"
                    value={regPhone} onChange={e => setRegPhone(e.target.value)} />
                  <TextField fullWidth label="Password" type="password" margin="normal" required
                    value={regPassword} onChange={e => setRegPassword(e.target.value)}
                    helperText="At least 6 characters" />
                  <TextField fullWidth label="Confirm Password" type="password" margin="normal" required
                    value={regConfirm} onChange={e => setRegConfirm(e.target.value)} />
                  <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }} disabled={loading}>
                    {loading ? <CircularProgress size={24} /> : 'Create Account'}
                  </Button>
                </form>
              </TabPanel>

              <TabPanel value={tab} index={2}>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Enter your email and we'll send you a link to sign in — no password needed.
                </Typography>
                <form onSubmit={handleMagicLink}>
                  <TextField fullWidth label="Email" type="email" margin="normal" required
                    value={magicEmail} onChange={e => setMagicEmail(e.target.value)} />
                  <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }} disabled={loading}>
                    {loading ? <CircularProgress size={24} /> : 'Send Sign-In Link'}
                  </Button>
                </form>
              </TabPanel>
            </>
          )}

          <Box display="flex" justifyContent="center" gap={3} mt={3} pt={2} borderTop={1} borderColor="divider">
            <Link component="button" variant="body2" onClick={() => navigate(`/t/${slug}/book`)}>
              Book an Appointment
            </Link>
            <Link component="button" variant="body2" onClick={() => navigate(`/t/${slug}`)}>
              Back to Home
            </Link>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}

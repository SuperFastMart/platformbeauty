import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert
} from '@mui/material';
import { Lock } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/client';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = { email, password };
      if (mfaRequired && mfaCode) payload.mfa_code = mfaCode;

      const { data } = await api.post('/admin/auth/login', payload);

      // Check if MFA is required
      if (data.mfa_required) {
        setMfaRequired(true);
        setLoading(false);
        return;
      }

      login(data.token, data.user);

      // Redirect based on email verification status
      if (data.user.email_verified === false) {
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        navigate('/admin/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setMfaRequired(false);
    setMfaCode('');
    setError('');
  };

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="background.default">
      <Card sx={{ width: 400, mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" fontWeight={600} gutterBottom>
            Business Admin
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            {mfaRequired ? 'Enter your authentication code' : 'Sign in to manage your bookings'}
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={handleSubmit}>
            {!mfaRequired ? (
              <>
                <TextField
                  fullWidth label="Email" type="email" margin="normal"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  required autoFocus
                />
                <TextField
                  fullWidth label="Password" type="password" margin="normal"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </>
            ) : (
              <Box textAlign="center">
                <Lock sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Open your authenticator app and enter the 6-digit code.
                </Typography>
                <TextField
                  fullWidth label="Authentication Code" margin="normal"
                  value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required autoFocus
                  inputProps={{ maxLength: 6, style: { textAlign: 'center', fontSize: '1.4rem', letterSpacing: 8 } }}
                  placeholder="000000"
                  helperText="You can also use a backup code"
                />
              </Box>
            )}
            <Button
              fullWidth variant="contained" size="large" type="submit"
              disabled={loading || (mfaRequired && mfaCode.length < 6)}
              sx={{ mt: 2 }}
            >
              {loading ? 'Signing in...' : mfaRequired ? 'Verify' : 'Sign In'}
            </Button>
            {mfaRequired && (
              <Button
                fullWidth variant="text" size="small" sx={{ mt: 1, color: 'text.secondary' }}
                onClick={handleBackToLogin}
              >
                Back to login
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}

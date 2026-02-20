import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Button, Alert, CircularProgress, Container
} from '@mui/material';
import { MarkEmailRead, CheckCircle, ErrorOutline, Send } from '@mui/icons-material';
import api from '../../api/client';

const PRIMARY = '#8B2635';

export default function EmailVerification() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const emailParam = searchParams.get('email');

  const [verifying, setVerifying] = useState(!!token);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // If token present, auto-verify
  useEffect(() => {
    if (!token) return;
    api.get(`/platform/verify-email?token=${token}`)
      .then(res => {
        setVerified(true);
        setVerifying(false);
        // Update stored user data
        const savedUser = localStorage.getItem('auth_user');
        if (savedUser) {
          const user = JSON.parse(savedUser);
          user.email_verified = true;
          localStorage.setItem('auth_user', JSON.stringify(user));
        }
      })
      .catch(err => {
        setError(err.response?.data?.error || 'Verification failed');
        setVerifying(false);
      });
  }, [token]);

  const handleResend = async () => {
    const email = emailParam || JSON.parse(localStorage.getItem('auth_user') || '{}').email;
    if (!email) {
      setError('No email address found. Please sign up again.');
      return;
    }
    setResending(true);
    try {
      await api.post('/platform/resend-verification', { email });
      setResent(true);
    } catch {
      setError('Failed to resend verification email. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleContinue = () => {
    navigate('/admin/dashboard');
  };

  // Token verification in progress
  if (verifying) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="#F5F0EE">
        <Card sx={{ maxWidth: 440, width: '100%', mx: 2, borderRadius: 3 }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress size={48} sx={{ color: PRIMARY, mb: 2 }} />
            <Typography variant="h6" fontWeight={600}>Verifying your email...</Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Token verified successfully
  if (verified) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="#F5F0EE">
        <Card sx={{ maxWidth: 440, width: '100%', mx: 2, borderRadius: 3 }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <CheckCircle sx={{ fontSize: 64, color: '#2e7d32', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} mb={1}>Email Verified!</Typography>
            <Typography color="text.secondary" mb={3}>
              Your email has been verified successfully. You can now access your dashboard.
            </Typography>
            <Button
              variant="contained" size="large" fullWidth
              onClick={handleContinue}
              sx={{ bgcolor: PRIMARY, py: 1.5, borderRadius: 2, '&:hover': { bgcolor: '#6d1f2b' } }}
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // No token — show "check your email" screen
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="#F5F0EE">
      <Card sx={{ maxWidth: 480, width: '100%', mx: 2, borderRadius: 3 }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <MarkEmailRead sx={{ fontSize: 64, color: PRIMARY, mb: 2 }} />
          <Typography variant="h5" fontWeight={700} mb={1}>Check your email</Typography>
          <Typography color="text.secondary" mb={1}>
            We've sent a verification link to your email address.
          </Typography>
          <Typography color="text.secondary" mb={3} variant="body2">
            Click the link in the email to verify your account and get started.
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>{error}</Alert>}
          {resent && <Alert severity="success" sx={{ mb: 2 }}>Verification email sent! Check your inbox.</Alert>}

          <Box sx={{ bgcolor: '#f9f9f9', borderRadius: 2, p: 2, mb: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Didn't receive the email? Check your spam folder or click below to resend.
            </Typography>
          </Box>

          <Button
            variant="outlined" fullWidth
            startIcon={resending ? <CircularProgress size={18} /> : <Send />}
            onClick={handleResend}
            disabled={resending || resent}
            sx={{ mb: 2, borderColor: PRIMARY, color: PRIMARY }}
          >
            {resending ? 'Sending...' : resent ? 'Email Sent' : 'Resend Verification Email'}
          </Button>

          <Button
            variant="text" size="small" fullWidth
            onClick={handleContinue}
            sx={{ color: 'text.secondary' }}
          >
            Skip for now — I'll verify later
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, Alert, Button, Container } from '@mui/material';
import api from '../../api/client';

export default function VerifyMagicLink() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('Invalid link — no token provided.');
      setVerifying(false);
      return;
    }

    api.post(`/t/${slug}/auth/verify-magic-link`, { token })
      .then(({ data }) => {
        localStorage.setItem('customer_token', data.token);
        localStorage.setItem('customer_user', JSON.stringify(data.customer));
        navigate(`/t/${slug}/portal`, { replace: true });
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Verification failed. The link may have expired.');
        setVerifying(false);
      });
  }, [token, slug, navigate]);

  return (
    <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
      {verifying ? (
        <Box>
          <CircularProgress sx={{ mb: 2 }} />
          <Typography>Verifying your sign-in link...</Typography>
        </Box>
      ) : (
        <Box>
          <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
          <Button variant="contained" onClick={() => navigate(`/t/${slug}/portal/login`)}>
            Back to Sign In
          </Button>
        </Box>
      )}
    </Container>
  );
}

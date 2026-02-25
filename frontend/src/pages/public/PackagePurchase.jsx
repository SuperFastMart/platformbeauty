import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, Grid, CircularProgress,
  Alert, Chip, List, ListItem, ListItemIcon, ListItemText
} from '@mui/material';
import { Inventory2, CheckCircle, CalendarMonth, LocalOffer } from '@mui/icons-material';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';

const stripeCache = {};
function getStripe(key) {
  if (!stripeCache[key]) stripeCache[key] = loadStripe(key);
  return stripeCache[key];
}

function PackagePaymentForm({ onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    if (error) {
      onError(error.message);
    } else {
      onSuccess();
    }
    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <Button
        type="submit" variant="contained" fullWidth size="large"
        disabled={!stripe || processing}
        sx={{ mt: 2, bgcolor: '#D4A853', color: '#1a1a1a', fontWeight: 700, '&:hover': { bgcolor: '#c49a3f' }, minHeight: 48 }}
      >
        {processing ? <CircularProgress size={24} /> : 'Complete Purchase'}
      </Button>
    </form>
  );
}

export default function PackagePurchase() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const tenant = useTenant();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isLoggedIn = !!localStorage.getItem('customer_token');

  useEffect(() => {
    api.get(`/t/${slug}/packages`)
      .then(({ data }) => setPackages(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  const handlePurchase = async (pkg) => {
    if (!isLoggedIn) {
      navigate(`/t/${slug}/portal/login?redirect=packages`);
      return;
    }

    setSelectedPkg(pkg);
    setPurchasing(true);
    setError('');

    try {
      const token = localStorage.getItem('customer_token');
      const { data } = await api.post(`/t/${slug}/packages/${pkg.id}/purchase`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start purchase');
      setPurchasing(false);
    }
  };

  const handlePaymentSuccess = async () => {
    try {
      const token = localStorage.getItem('customer_token');
      await api.post(`/t/${slug}/packages/${selectedPkg.id}/confirm-purchase`, {
        paymentIntentId,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccess(true);
      setClientSecret('');
      setPurchasing(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Purchase confirmation failed');
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  if (success) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" p={3}>
        <Card sx={{ maxWidth: 440, textAlign: 'center' }}>
          <CardContent sx={{ p: 4 }}>
            <CheckCircle sx={{ fontSize: 56, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} mb={1}>Package Purchased!</Typography>
            <Typography color="text.secondary" mb={1}>
              Your <strong>{selectedPkg?.name}</strong> package is now active with {selectedPkg?.session_count} sessions.
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Use your sessions when booking appointments.
            </Typography>
            <Box display="flex" gap={1} justifyContent="center">
              <Button variant="contained" onClick={() => navigate(`/t/${slug}/book`)}
                sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}>
                Book Now
              </Button>
              <Button variant="outlined" onClick={() => navigate(`/t/${slug}/portal`)}>
                My Portal
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (clientSecret && selectedPkg && tenant?.stripe_publishable_key) {
    return (
      <Box display="flex" justifyContent="center" py={4} px={2}>
        <Card sx={{ maxWidth: 460, width: '100%' }}>
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Typography variant="h6" fontWeight={700} mb={0.5}>{selectedPkg.name}</Typography>
            <Typography color="text.secondary" mb={3}>
              {selectedPkg.session_count} sessions — £{parseFloat(selectedPkg.package_price).toFixed(2)}
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Elements stripe={getStripe(tenant.stripe_publishable_key)} options={{ clientSecret }}>
              <PackagePaymentForm
                onSuccess={handlePaymentSuccess}
                onError={msg => setError(msg)}
              />
            </Elements>
            <Button variant="text" fullWidth onClick={() => { setClientSecret(''); setPurchasing(false); setSelectedPkg(null); setError(''); }}
              sx={{ mt: 1 }}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box py={4} px={2}>
      <Box textAlign="center" mb={4}>
        <Inventory2 sx={{ fontSize: 44, color: '#D4A853', mb: 1 }} />
        <Typography variant="h4" fontWeight={700}>Service Packages</Typography>
        <Typography color="text.secondary" mt={1} maxWidth={500} mx="auto">
          Save by purchasing a package of sessions. Use them whenever you book an appointment.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ maxWidth: 600, mx: 'auto', mb: 3 }}>{error}</Alert>}

      {packages.length === 0 ? (
        <Box textAlign="center" py={6}>
          <Typography color="text.secondary">No service packages are currently available.</Typography>
          <Button variant="outlined" onClick={() => navigate(`/t/${slug}`)} sx={{ mt: 2 }}>
            Back to Home
          </Button>
        </Box>
      ) : (
        <Grid container spacing={3} justifyContent="center">
          {packages.map(pkg => {
            const savings = pkg.original_price ? parseFloat(pkg.original_price) - parseFloat(pkg.package_price) : 0;
            return (
              <Grid item xs={12} sm={6} md={4} key={pkg.id}>
                <Card sx={{
                  height: '100%', display: 'flex', flexDirection: 'column',
                  border: '2px solid', borderColor: '#D4A85330',
                  transition: 'all 0.3s ease',
                  '&:hover': { borderColor: '#D4A853', boxShadow: '0 8px 24px rgba(212, 168, 83, 0.15)', transform: 'translateY(-4px)' },
                }}>
                  <CardContent sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="h6" fontWeight={700} mb={0.5}>{pkg.name}</Typography>

                    <Box display="flex" alignItems="baseline" gap={1} mb={1}>
                      <Typography variant="h4" fontWeight={700} color="#D4A853">
                        £{parseFloat(pkg.package_price).toFixed(2)}
                      </Typography>
                      {pkg.original_price && parseFloat(pkg.original_price) > parseFloat(pkg.package_price) && (
                        <Typography color="text.secondary" sx={{ textDecoration: 'line-through' }}>
                          £{parseFloat(pkg.original_price).toFixed(2)}
                        </Typography>
                      )}
                    </Box>

                    {savings > 0 && (
                      <Chip
                        icon={<LocalOffer sx={{ fontSize: 14 }} />}
                        label={`Save £${savings.toFixed(2)}`}
                        size="small"
                        sx={{ bgcolor: '#2e7d3215', color: '#2e7d32', fontWeight: 600, mb: 1.5, alignSelf: 'flex-start' }}
                      />
                    )}

                    {pkg.description && (
                      <Typography variant="body2" color="text.secondary" mb={2}>
                        {pkg.description}
                      </Typography>
                    )}

                    <List dense sx={{ flex: 1, mb: 2 }}>
                      <ListItem disablePadding sx={{ mb: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <CalendarMonth sx={{ fontSize: 18, color: '#D4A853' }} />
                        </ListItemIcon>
                        <ListItemText primary={`${pkg.session_count} sessions included`}
                          primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItem>
                      {pkg.valid_days && (
                        <ListItem disablePadding sx={{ mb: 0.5 }}>
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <CheckCircle sx={{ fontSize: 18, color: '#2e7d32' }} />
                          </ListItemIcon>
                          <ListItemText primary={`Valid for ${pkg.valid_days} days`}
                            primaryTypographyProps={{ variant: 'body2' }} />
                        </ListItem>
                      )}
                      {pkg.services && pkg.services.filter(Boolean).length > 0 && (
                        <ListItem disablePadding sx={{ mb: 0.5 }}>
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <CheckCircle sx={{ fontSize: 18, color: '#2e7d32' }} />
                          </ListItemIcon>
                          <ListItemText
                            primary={`Covers: ${pkg.services.filter(Boolean).map(s => s.name).join(', ')}`}
                            primaryTypographyProps={{ variant: 'body2' }} />
                        </ListItem>
                      )}
                    </List>

                    <Button
                      variant="contained" fullWidth
                      onClick={() => handlePurchase(pkg)}
                      disabled={purchasing}
                      sx={{ bgcolor: '#D4A853', color: '#1a1a1a', '&:hover': { bgcolor: '#c49a3f' }, fontWeight: 600, minHeight: 44 }}
                    >
                      {isLoggedIn ? 'Purchase' : 'Sign In to Purchase'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, Grid, CircularProgress,
  Alert, Chip, List, ListItem, ListItemIcon, ListItemText
} from '@mui/material';
import { WorkspacePremium, CheckCircle, Star, Percent, CalendarMonth } from '@mui/icons-material';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';

const stripeCache = {};
function getStripe(key) {
  if (!stripeCache[key]) stripeCache[key] = loadStripe(key);
  return stripeCache[key];
}

function SubscribePaymentForm({ onSuccess, onError }) {
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
        sx={{ mt: 2, bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' }, minHeight: 48, fontWeight: 700 }}
      >
        {processing ? <CircularProgress size={24} color="inherit" /> : 'Subscribe Now'}
      </Button>
    </form>
  );
}

export default function MembershipSignup() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const tenant = useTenant();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [subscribing, setSubscribing] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [myMembership, setMyMembership] = useState(null);

  const isLoggedIn = !!localStorage.getItem('customer_token');

  useEffect(() => {
    api.get(`/t/${slug}/memberships`)
      .then(({ data }) => setPlans(data))
      .catch(console.error)
      .finally(() => setLoading(false));

    if (isLoggedIn) {
      api.get(`/t/${slug}/memberships/my-membership`)
        .then(({ data }) => setMyMembership(data))
        .catch(() => {});
    }
  }, [slug, isLoggedIn]);

  const handleSubscribe = async (plan) => {
    if (!isLoggedIn) {
      navigate(`/t/${slug}/portal/login?redirect=memberships`);
      return;
    }

    setSelectedPlan(plan);
    setSubscribing(true);
    setError('');

    try {
      const { data } = await api.post(`/t/${slug}/memberships/${plan.id}/subscribe`);
      setClientSecret(data.clientSecret);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start subscription');
      setSubscribing(false);
    }
  };

  const handlePaymentSuccess = () => {
    setSuccess(true);
    setClientSecret('');
    setSubscribing(false);
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
            <Typography variant="h5" fontWeight={700} mb={1}>Welcome to {selectedPlan?.name}!</Typography>
            <Typography color="text.secondary" mb={3}>
              Your membership is now active. Enjoy your benefits when booking appointments.
            </Typography>
            <Button variant="contained" onClick={() => navigate(`/t/${slug}/portal`)}
              sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}>
              Go to My Portal
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (clientSecret && selectedPlan && tenant?.stripe_publishable_key) {
    return (
      <Box display="flex" justifyContent="center" py={4} px={2}>
        <Card sx={{ maxWidth: 460, width: '100%' }}>
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Typography variant="h6" fontWeight={700} mb={0.5}>{selectedPlan.name}</Typography>
            <Typography color="text.secondary" mb={3}>
              £{parseFloat(selectedPlan.price_monthly).toFixed(2)}/month
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Elements stripe={getStripe(tenant.stripe_publishable_key)} options={{ clientSecret }}>
              <SubscribePaymentForm
                onSuccess={handlePaymentSuccess}
                onError={msg => setError(msg)}
              />
            </Elements>
            <Button variant="text" fullWidth onClick={() => { setClientSecret(''); setSubscribing(false); setSelectedPlan(null); setError(''); }}
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
        <WorkspacePremium sx={{ fontSize: 44, color: '#D4A853', mb: 1 }} />
        <Typography variant="h4" fontWeight={700}>Membership Plans</Typography>
        <Typography color="text.secondary" mt={1} maxWidth={500} mx="auto">
          Join a membership plan to enjoy exclusive discounts, included sessions, and priority booking benefits.
        </Typography>
      </Box>

      {myMembership && (
        <Alert severity="info" sx={{ maxWidth: 600, mx: 'auto', mb: 3 }}>
          You currently have an active <strong>{myMembership.plan_name}</strong> membership.
          Manage it from your <Button size="small" onClick={() => navigate(`/t/${slug}/portal`)} sx={{ textTransform: 'none' }}>customer portal</Button>.
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ maxWidth: 600, mx: 'auto', mb: 3 }}>{error}</Alert>}

      {plans.length === 0 ? (
        <Box textAlign="center" py={6}>
          <Typography color="text.secondary">No membership plans are currently available.</Typography>
          <Button variant="outlined" onClick={() => navigate(`/t/${slug}`)} sx={{ mt: 2 }}>
            Back to Home
          </Button>
        </Box>
      ) : (
        <Grid container spacing={3} justifyContent="center">
          {plans.map(plan => (
            <Grid item xs={12} sm={6} md={4} key={plan.id}>
              <Card sx={{
                height: '100%', display: 'flex', flexDirection: 'column',
                border: '2px solid', borderColor: '#D4A85330',
                transition: 'all 0.3s ease',
                '&:hover': { borderColor: '#D4A853', boxShadow: '0 8px 24px rgba(212, 168, 83, 0.15)', transform: 'translateY(-4px)' },
              }}>
                <CardContent sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" fontWeight={700} mb={0.5}>{plan.name}</Typography>
                  <Box display="flex" alignItems="baseline" gap={0.5} mb={1}>
                    <Typography variant="h4" fontWeight={700} color="#D4A853">
                      £{parseFloat(plan.price_monthly).toFixed(2)}
                    </Typography>
                    <Typography color="text.secondary">/month</Typography>
                  </Box>

                  {plan.description && (
                    <Typography variant="body2" color="text.secondary" mb={2}>
                      {plan.description}
                    </Typography>
                  )}

                  <List dense sx={{ flex: 1, mb: 2 }}>
                    {plan.included_sessions > 0 && (
                      <ListItem disablePadding sx={{ mb: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <CalendarMonth sx={{ fontSize: 18, color: '#D4A853' }} />
                        </ListItemIcon>
                        <ListItemText primary={`${plan.included_sessions} sessions per month`}
                          primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItem>
                    )}
                    {plan.discount_percent > 0 && (
                      <ListItem disablePadding sx={{ mb: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Percent sx={{ fontSize: 18, color: '#D4A853' }} />
                        </ListItemIcon>
                        <ListItemText primary={`${plan.discount_percent}% discount on all services`}
                          primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItem>
                    )}
                    {plan.priority_booking && (
                      <ListItem disablePadding sx={{ mb: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Star sx={{ fontSize: 18, color: '#D4A853' }} />
                        </ListItemIcon>
                        <ListItemText primary="Priority booking access"
                          primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItem>
                    )}
                    {plan.included_services && plan.included_services.filter(Boolean).length > 0 && (
                      <ListItem disablePadding sx={{ mb: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <CheckCircle sx={{ fontSize: 18, color: '#2e7d32' }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={`Includes: ${plan.included_services.filter(Boolean).map(s => s.service_name || s.category).join(', ')}`}
                          primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItem>
                    )}
                  </List>

                  <Button
                    variant="contained" fullWidth
                    onClick={() => handleSubscribe(plan)}
                    disabled={subscribing || !!myMembership}
                    sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' }, fontWeight: 600, minHeight: 44 }}
                  >
                    {myMembership ? 'Already a Member' : isLoggedIn ? 'Subscribe' : 'Sign In to Subscribe'}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}

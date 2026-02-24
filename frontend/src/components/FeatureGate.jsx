import { Box, Typography, Button, Card, CardContent, CircularProgress } from '@mui/material';
import { Lock } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import useSubscriptionTier from '../hooks/useSubscriptionTier';

const TIER_NAMES = { growth: 'Growth', pro: 'Pro' };

const TIER_FEATURES = {
  growth: [
    'Unlimited services & bookings',
    'Custom branding & fonts',
    'Discount codes',
    'Full reports & analytics',
    'Customer messaging',
  ],
  pro: [
    'Everything in Growth',
    'SMS notifications & reminders',
    'Loyalty programme',
    'Review collection',
    'Waitlist management',
    'Priority support',
  ],
};

export default function FeatureGate({ requiredTier, featureName, children }) {
  const { hasAccess, loading } = useSubscriptionTier();
  const navigate = useNavigate();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  if (hasAccess(requiredTier)) {
    return children;
  }

  const tierName = TIER_NAMES[requiredTier] || requiredTier;
  const features = TIER_FEATURES[requiredTier] || [];

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="60vh"
      sx={{ px: 2 }}
    >
      <Card sx={{ maxWidth: 480, width: '100%', textAlign: 'center', overflow: 'visible' }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              bgcolor: 'rgba(212, 168, 83, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2,
            }}
          >
            <Lock sx={{ fontSize: 32, color: '#D4A853' }} />
          </Box>

          <Typography variant="h5" fontWeight={700} mb={1}>
            {featureName || 'Premium Feature'}
          </Typography>

          <Typography color="text.secondary" mb={3}>
            This feature is available on the <strong>{tierName}</strong> plan and above.
            Upgrade to unlock it for your business.
          </Typography>

          {features.length > 0 && (
            <Box sx={{ textAlign: 'left', mb: 3, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 2, p: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                {tierName} plan includes:
              </Typography>
              {features.map((f, i) => (
                <Typography key={i} variant="body2" color="text.secondary" sx={{ py: 0.3 }}>
                  • {f}
                </Typography>
              ))}
            </Box>
          )}

          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/admin/settings?tab=subscription')}
            sx={{
              bgcolor: '#D4A853',
              color: '#1a1a1a',
              fontWeight: 600,
              px: 4,
              '&:hover': { bgcolor: '#c49a3f' },
            }}
          >
            Unlock with {tierName}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

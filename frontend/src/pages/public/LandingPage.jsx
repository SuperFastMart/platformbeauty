import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Container, Grid, Card, CardContent,
  AppBar, Toolbar, Alert, CircularProgress, InputAdornment, Chip, Divider
} from '@mui/material';
import {
  CalendarMonth, People, Storefront, Speed, CheckCircle, TrendingUp,
  Palette, NotificationsActive, BarChart, Star, ArrowForward, Visibility,
  VisibilityOff
} from '@mui/icons-material';
import api from '../../api/client';

const PRIMARY = '#8B2635';
const GOLD = '#D4A853';

const features = [
  { icon: <CalendarMonth sx={{ fontSize: 40 }} />, title: 'Smart Booking', desc: 'Let customers book 24/7 with your custom booking page. Service categories, time slots, and instant confirmations.' },
  { icon: <People sx={{ fontSize: 40 }} />, title: 'Customer Management', desc: 'Track customer history, preferences, and loyalty. Send automated reminders via email and SMS.' },
  { icon: <Palette sx={{ fontSize: 40 }} />, title: 'Your Brand', desc: 'Custom colours, fonts, logos, and policies. Your booking page looks and feels like your own website.' },
  { icon: <BarChart sx={{ fontSize: 40 }} />, title: 'Reports & Analytics', desc: 'Revenue reports, booking trends, customer insights, and service performance at a glance.' },
  { icon: <NotificationsActive sx={{ fontSize: 40 }} />, title: 'Automated Notifications', desc: 'Email confirmations, SMS reminders, and review requests. Never miss a booking again.' },
  { icon: <Star sx={{ fontSize: 40 }} />, title: 'Loyalty & Reviews', desc: 'Built-in loyalty stamps, discount codes, and review collection to keep customers coming back.' },
];

const steps = [
  { num: '1', title: 'Sign Up', desc: 'Create your account in seconds. No credit card required — start with a 14-day free trial.' },
  { num: '2', title: 'Set Up', desc: 'Add your services, set your availability, and customise your booking page with your brand.' },
  { num: '3', title: 'Start Booking', desc: 'Share your link and start accepting bookings immediately. Manage everything from one dashboard.' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [showSignup, setShowSignup] = useState(false);
  const [form, setForm] = useState({ business_name: '', slug: '', owner_name: '', owner_email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState([]);

  // Fetch subscription plans
  useEffect(() => {
    api.get('/subscriptions/plans')
      .then(r => setPlans(r.data))
      .catch(() => {});
  }, []);

  // Auto-generate slug from business name
  const handleNameChange = (e) => {
    const name = e.target.value;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 50);
    setForm(f => ({ ...f, business_name: name, slug }));
  };

  // Check slug availability with debounce
  useEffect(() => {
    if (!form.slug || form.slug.length < 3) {
      setSlugAvailable(null);
      return;
    }
    setSlugChecking(true);
    const timer = setTimeout(() => {
      api.get(`/platform/check-slug/${form.slug}`)
        .then(r => setSlugAvailable(r.data.available))
        .catch(() => setSlugAvailable(null))
        .finally(() => setSlugChecking(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [form.slug]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/platform/signup', form);
      // Store token and user (email not yet verified)
      localStorage.setItem('auth_token', res.data.token);
      localStorage.setItem('auth_user', JSON.stringify(res.data.user));
      // Redirect to email verification page
      navigate(`/verify-email?email=${encodeURIComponent(form.owner_email)}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ bgcolor: '#F5F0EE', minHeight: '100vh' }}>
      {/* Navigation */}
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ justifyContent: 'space-between' }}>
            <Typography variant="h5" fontWeight={800} sx={{ color: PRIMARY, letterSpacing: -0.5 }}>
              PlatformBeauty
            </Typography>
            <Box display="flex" gap={1.5} alignItems="center">
              <Button
                color="inherit"
                sx={{ color: 'text.secondary', fontWeight: 500 }}
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Features
              </Button>
              <Button
                color="inherit"
                sx={{ color: 'text.secondary', fontWeight: 500 }}
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              >
                How It Works
              </Button>
              <Button
                color="inherit"
                sx={{ color: 'text.secondary', fontWeight: 500 }}
                onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Pricing
              </Button>
              <Button
                variant="outlined"
                size="small"
                sx={{ borderColor: PRIMARY, color: PRIMARY, fontWeight: 600 }}
                onClick={() => navigate('/admin/login')}
              >
                Log In
              </Button>
              <Button
                variant="contained"
                size="small"
                sx={{ bgcolor: PRIMARY, fontWeight: 600, '&:hover': { bgcolor: '#6d1f2b' } }}
                onClick={() => {
                  setShowSignup(true);
                  setTimeout(() => document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth' }), 100);
                }}
              >
                Get Started Free
              </Button>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Hero Section */}
      <Box sx={{
        background: `radial-gradient(ellipse at 20% 50%, ${PRIMARY} 0%, #5a1420 60%, #3d0e16 100%)`,
        color: 'white',
        py: { xs: 8, md: 12 },
        position: 'relative',
        overflow: 'hidden',
      }}>
        <Box sx={{
          position: 'absolute', top: -100, right: -100, width: 500, height: 500,
          borderRadius: '50%', background: `radial-gradient(circle, rgba(212,168,83,0.12) 0%, transparent 70%)`,
        }} />
        <Box sx={{
          position: 'absolute', bottom: -80, left: -80, width: 400, height: 400,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)',
        }} />
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={7}>
              <Typography variant="h2" fontWeight={800} sx={{
                fontSize: { xs: '2.2rem', md: '3.2rem' },
                lineHeight: 1.2,
                mb: 2,
              }}>
                The all-in-one booking platform for beauty professionals
              </Typography>
              <Typography variant="h6" sx={{ opacity: 0.9, fontWeight: 400, mb: 4, maxWidth: 550, lineHeight: 1.6 }}>
                Manage bookings, customers, payments, and your brand — all from one beautiful dashboard. No tech skills needed.
              </Typography>
              <Box display="flex" gap={2} flexWrap="wrap">
                <Button
                  variant="contained"
                  size="large"
                  endIcon={<ArrowForward />}
                  sx={{
                    bgcolor: GOLD, color: '#1a1a1a', fontWeight: 700, fontSize: '1.05rem',
                    px: 4, py: 1.5, borderRadius: 2,
                    '&:hover': { bgcolor: '#c49a3f' },
                  }}
                  onClick={() => {
                    setShowSignup(true);
                    setTimeout(() => document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth' }), 100);
                  }}
                >
                  Start Free Trial
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  sx={{
                    borderColor: 'rgba(255,255,255,0.5)', color: 'white', fontWeight: 600,
                    px: 4, py: 1.5, borderRadius: 2,
                    '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
                  }}
                  onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  See Features
                </Button>
              </Box>
              <Box display="flex" gap={3} mt={4}>
                <Box display="flex" alignItems="center" gap={0.5}>
                  <CheckCircle sx={{ fontSize: 18, color: GOLD }} />
                  <Typography variant="body2" sx={{ opacity: 0.85 }}>14-day free trial</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={0.5}>
                  <CheckCircle sx={{ fontSize: 18, color: GOLD }} />
                  <Typography variant="body2" sx={{ opacity: 0.85 }}>No credit card required</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={0.5}>
                  <CheckCircle sx={{ fontSize: 18, color: GOLD }} />
                  <Typography variant="body2" sx={{ opacity: 0.85 }}>Set up in minutes</Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} md={5} sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'center' }}>
              <Box sx={{
                width: 340, height: 380, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 4,
                border: '1px solid rgba(255,255,255,0.15)', p: 3,
                backdropFilter: 'blur(10px)',
              }}>
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 2, p: 2, mb: 2 }}>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Today's Bookings</Typography>
                  <Typography variant="h4" fontWeight={700}>12</Typography>
                </Box>
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 2, p: 2, mb: 2 }}>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>This Month's Revenue</Typography>
                  <Typography variant="h4" fontWeight={700} sx={{ color: GOLD }}>£2,480</Typography>
                </Box>
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 2, p: 2 }}>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Active Customers</Typography>
                  <Typography variant="h4" fontWeight={700}>156</Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Stats Bar */}
      <Box sx={{ bgcolor: 'white', py: 4, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <Container maxWidth="lg">
          <Grid container spacing={3} justifyContent="center" textAlign="center">
            <Grid item xs={6} md={3}>
              <Typography variant="h4" fontWeight={800} color={PRIMARY}>24/7</Typography>
              <Typography variant="body2" color="text.secondary">Online Booking</Typography>
            </Grid>
            <Grid item xs={6} md={3}>
              <Typography variant="h4" fontWeight={800} color={PRIMARY}>100%</Typography>
              <Typography variant="body2" color="text.secondary">Customisable</Typography>
            </Grid>
            <Grid item xs={6} md={3}>
              <Typography variant="h4" fontWeight={800} color={PRIMARY}>0%</Typography>
              <Typography variant="body2" color="text.secondary">Commission Fees</Typography>
            </Grid>
            <Grid item xs={6} md={3}>
              <Typography variant="h4" fontWeight={800} color={PRIMARY}>14 days</Typography>
              <Typography variant="body2" color="text.secondary">Free Trial</Typography>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features */}
      <Box id="features" sx={{ py: { xs: 6, md: 10 }, bgcolor: '#F5F0EE' }}>
        <Container maxWidth="lg">
          <Box textAlign="center" mb={6}>
            <Chip label="FEATURES" size="small" sx={{ bgcolor: `${PRIMARY}15`, color: PRIMARY, fontWeight: 700, mb: 2 }} />
            <Typography variant="h3" fontWeight={800} sx={{ fontSize: { xs: '1.8rem', md: '2.5rem' }, mb: 1.5 }}>
              Everything you need to run your business
            </Typography>
            <Typography variant="h6" color="text.secondary" fontWeight={400} maxWidth={600} mx="auto">
              From booking management to customer loyalty — all the tools you need in one place.
            </Typography>
          </Box>
          <Grid container spacing={3}>
            {features.map((f, i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Card sx={{
                  height: '100%', borderRadius: 3, border: '1px solid #eee',
                  transition: 'all 0.3s ease', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                  '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 12px 40px rgba(0,0,0,0.1)' },
                }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ color: PRIMARY, mb: 2 }}>{f.icon}</Box>
                    <Typography variant="h6" fontWeight={700} mb={1}>{f.title}</Typography>
                    <Typography variant="body2" color="text.secondary" lineHeight={1.7}>{f.desc}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* How It Works */}
      <Box id="how-it-works" sx={{ bgcolor: 'white', py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Box textAlign="center" mb={6}>
            <Chip label="HOW IT WORKS" size="small" sx={{ bgcolor: `${GOLD}25`, color: '#8a7020', fontWeight: 700, mb: 2 }} />
            <Typography variant="h3" fontWeight={800} sx={{ fontSize: { xs: '1.8rem', md: '2.5rem' }, mb: 1.5 }}>
              Up and running in three simple steps
            </Typography>
          </Box>
          <Grid container spacing={4} justifyContent="center">
            {steps.map((s, i) => (
              <Grid item xs={12} md={4} key={i}>
                <Box textAlign="center" px={2}>
                  <Box sx={{
                    width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 2,
                    bgcolor: PRIMARY, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Typography variant="h4" fontWeight={800}>{s.num}</Typography>
                  </Box>
                  <Typography variant="h6" fontWeight={700} mb={1}>{s.title}</Typography>
                  <Typography variant="body1" color="text.secondary" lineHeight={1.7}>{s.desc}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Your Journey */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: '#F5F0EE' }}>
        <Container maxWidth="md">
          <Box textAlign="center" mb={6}>
            <Chip label="YOUR JOURNEY" size="small" sx={{ bgcolor: `${PRIMARY}15`, color: PRIMARY, fontWeight: 700, mb: 2 }} />
            <Typography variant="h3" fontWeight={800} sx={{ fontSize: { xs: '1.8rem', md: '2.5rem' }, mb: 1.5 }}>
              From sign-up to fully booked
            </Typography>
          </Box>
          {[
            { title: 'Create your account', desc: 'Sign up with your business name and email. Your custom booking page is created instantly.', icon: <Storefront sx={{ fontSize: 28 }} /> },
            { title: 'Add your services', desc: 'Set up your service menu with categories, prices, and durations. Organise them exactly how you want.', icon: <CalendarMonth sx={{ fontSize: 28 }} /> },
            { title: 'Configure your availability', desc: 'Set your working hours, slot durations, and blocked-out days. The system handles scheduling automatically.', icon: <Speed sx={{ fontSize: 28 }} /> },
            { title: 'Customise your brand', desc: 'Choose your colours, fonts, and logo. Add your policies, about section, and social links.', icon: <Palette sx={{ fontSize: 28 }} /> },
            { title: 'Share your link', desc: 'Send your booking page to customers via social media, WhatsApp, or embed it on your website.', icon: <People sx={{ fontSize: 28 }} /> },
            { title: 'Grow your business', desc: 'Track bookings, revenue, and customer loyalty. Let the platform work for you while you focus on what you do best.', icon: <TrendingUp sx={{ fontSize: 28 }} /> },
          ].map((step, i, arr) => (
            <Box key={i} display="flex" gap={3} mb={i < arr.length - 1 ? 0 : 0}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48 }}>
                <Box sx={{
                  width: 48, height: 48, borderRadius: '50%', bgcolor: PRIMARY, color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {step.icon}
                </Box>
                {i < arr.length - 1 && (
                  <Box sx={{ width: 2, flex: 1, bgcolor: `${PRIMARY}30`, my: 0.5, minHeight: 40 }} />
                )}
              </Box>
              <Box sx={{ pb: i < arr.length - 1 ? 2 : 0, pt: 0.5 }}>
                <Typography variant="h6" fontWeight={700} mb={0.5}>{step.title}</Typography>
                <Typography variant="body1" color="text.secondary" lineHeight={1.7}>{step.desc}</Typography>
              </Box>
            </Box>
          ))}
        </Container>
      </Box>

      {/* Built For Beauty Pros */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'white' }}>
        <Container maxWidth="lg">
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={6}>
              <Chip label="BUILT FOR YOU" size="small" sx={{ bgcolor: `${PRIMARY}15`, color: PRIMARY, fontWeight: 700, mb: 2 }} />
              <Typography variant="h3" fontWeight={800} sx={{ fontSize: { xs: '1.8rem', md: '2.2rem' }, mb: 2 }}>
                Designed for beauty, wellness, and service professionals
              </Typography>
              <Typography variant="body1" color="text.secondary" lineHeight={1.8} mb={3}>
                Whether you're a nail technician, hairstylist, makeup artist, barber, or spa owner —
                PlatformBeauty gives you a professional booking system that works for your business.
              </Typography>
              {[
                'Hair salons & barbers',
                'Nail technicians',
                'Semi-permanent makeup artists',
                'Beauty therapists & spas',
                'Massage therapists',
                'Any appointment-based business',
              ].map((item, i) => (
                <Box key={i} display="flex" alignItems="center" gap={1} mb={1}>
                  <CheckCircle sx={{ fontSize: 20, color: '#2e7d32' }} />
                  <Typography variant="body1">{item}</Typography>
                </Box>
              ))}
            </Grid>
            <Grid item xs={12} md={6}>
              <Card sx={{ borderRadius: 3, overflow: 'hidden', border: `2px solid ${PRIMARY}20` }}>
                <CardContent sx={{ p: 0 }}>
                  <Box sx={{ bgcolor: PRIMARY, color: 'white', px: 3, py: 2 }}>
                    <Typography fontWeight={700}>Your Booking Page</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.8 }}>platformbeauty.com/t/your-business</Typography>
                  </Box>
                  <Box sx={{ p: 3 }}>
                    {['Gel Nails — Full Set', 'Lash Lift & Tint', 'Eyebrow Lamination'].map((service, i) => (
                      <Box key={i} display="flex" justifyContent="space-between" alignItems="center"
                        sx={{ py: 1.5, borderBottom: i < 2 ? '1px solid #eee' : 'none' }}>
                        <Box>
                          <Typography fontWeight={500}>{service}</Typography>
                          <Typography variant="caption" color="text.secondary">{45 + i * 15} min</Typography>
                        </Box>
                        <Chip label={`£${30 + i * 10}`} size="small"
                          sx={{ bgcolor: `${PRIMARY}10`, color: PRIMARY, fontWeight: 700 }} />
                      </Box>
                    ))}
                    <Button fullWidth variant="contained" sx={{ mt: 2, bgcolor: PRIMARY, borderRadius: 2, py: 1.2 }}>
                      Book Now
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Pricing */}
      {plans.length > 0 && (
        <Box id="pricing" sx={{ py: { xs: 6, md: 10 }, bgcolor: 'white' }}>
          <Container maxWidth="lg">
            <Box textAlign="center" mb={6}>
              <Chip label="PRICING" size="small" sx={{ bgcolor: `${GOLD}25`, color: '#8a7020', fontWeight: 700, mb: 2 }} />
              <Typography variant="h3" fontWeight={800} sx={{ fontSize: { xs: '1.8rem', md: '2.5rem' }, mb: 1.5 }}>
                Simple, transparent pricing
              </Typography>
              <Typography variant="h6" color="text.secondary" fontWeight={400} maxWidth={500} mx="auto">
                Start free, upgrade when you're ready. No hidden fees, no commission on bookings.
              </Typography>
            </Box>
            <Grid container spacing={3} justifyContent="center">
              {plans.map((plan, i) => {
                const planFeatures = typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || []);
                const isPopular = plan.tier === 'professional';
                return (
                  <Grid item xs={12} sm={6} md={3} key={plan.tier}>
                    <Card sx={{
                      height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 3,
                      border: isPopular ? `2px solid ${PRIMARY}` : '1px solid #eee',
                      position: 'relative', overflow: 'visible',
                      transition: 'all 0.3s ease', boxShadow: isPopular ? '0 8px 30px rgba(139,38,53,0.15)' : '0 2px 12px rgba(0,0,0,0.04)',
                      '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 12px 40px rgba(0,0,0,0.1)' },
                    }}>
                      {isPopular && (
                        <Chip label="Most Popular" size="small"
                          sx={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', bgcolor: PRIMARY, color: 'white', fontWeight: 700 }} />
                      )}
                      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 3 }}>
                        <Typography variant="h6" fontWeight={700} mb={0.5}>{plan.name}</Typography>
                        <Box display="flex" alignItems="baseline" gap={0.5} mb={2}>
                          <Typography variant="h3" fontWeight={800} sx={{ color: PRIMARY }}>
                            {plan.price_monthly > 0 ? `£${parseFloat(plan.price_monthly).toFixed(0)}` : 'Free'}
                          </Typography>
                          {plan.price_monthly > 0 && (
                            <Typography variant="body1" color="text.secondary">/month</Typography>
                          )}
                        </Box>
                        <Divider sx={{ mb: 2 }} />
                        <Box flex={1}>
                          {planFeatures.map((f, fi) => (
                            <Box key={fi} display="flex" alignItems="flex-start" gap={1} mb={1}>
                              <CheckCircle sx={{ fontSize: 16, color: '#2e7d32', mt: 0.3, flexShrink: 0 }} />
                              <Typography variant="body2">{f}</Typography>
                            </Box>
                          ))}
                        </Box>
                        <Button
                          fullWidth variant={isPopular ? 'contained' : 'outlined'} size="large"
                          sx={{
                            mt: 2, borderRadius: 2, py: 1.2, fontWeight: 700,
                            ...(isPopular ? { bgcolor: PRIMARY, '&:hover': { bgcolor: '#6d1f2b' } } : { borderColor: PRIMARY, color: PRIMARY }),
                          }}
                          onClick={() => {
                            setShowSignup(true);
                            setTimeout(() => document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth' }), 100);
                          }}
                        >
                          {plan.price_monthly === 0 ? 'Start Free' : 'Get Started'}
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </Container>
        </Box>
      )}

      {/* CTA / Signup Section */}
      <Box id="signup" sx={{
        py: { xs: 6, md: 10 },
        bgcolor: showSignup ? '#F5F0EE' : PRIMARY,
        color: showSignup ? 'inherit' : 'white',
      }}>
        <Container maxWidth="lg">
          {!showSignup ? (
            <Box textAlign="center">
              <Typography variant="h3" fontWeight={800} sx={{ fontSize: { xs: '1.8rem', md: '2.5rem' }, mb: 2 }}>
                Ready to grow your business?
              </Typography>
              <Typography variant="h6" fontWeight={400} sx={{ opacity: 0.9, mb: 4, maxWidth: 500, mx: 'auto' }}>
                Join PlatformBeauty today and start taking bookings online. No upfront costs.
              </Typography>
              <Button
                variant="contained"
                size="large"
                endIcon={<ArrowForward />}
                sx={{
                  bgcolor: GOLD, color: '#1a1a1a', fontWeight: 700, fontSize: '1.1rem',
                  px: 5, py: 1.5, borderRadius: 2,
                  '&:hover': { bgcolor: '#c49a3f' },
                }}
                onClick={() => setShowSignup(true)}
              >
                Create Your Free Account
              </Button>
            </Box>
          ) : (
            <Grid container spacing={4} justifyContent="center">
              <Grid item xs={12} md={6}>
                <Box mb={3}>
                  <Typography variant="h4" fontWeight={800} sx={{ fontSize: { xs: '1.6rem', md: '2rem' }, mb: 1 }}>
                    Create your account
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    Get started with a 14-day free trial. No credit card needed.
                  </Typography>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                <Card sx={{ borderRadius: 3, border: '1px solid #eee' }}>
                  <CardContent sx={{ p: 3 }}>
                    <form onSubmit={handleSubmit}>
                      <TextField
                        fullWidth label="Business Name" required
                        placeholder="e.g. Studio Jen, Nails by Sarah"
                        value={form.business_name}
                        onChange={handleNameChange}
                        margin="normal"
                      />
                      <TextField
                        fullWidth label="Your Booking URL" required
                        value={form.slug}
                        onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') }))}
                        margin="normal"
                        InputProps={{
                          startAdornment: <InputAdornment position="start">platformbeauty.com/t/</InputAdornment>,
                          endAdornment: form.slug.length >= 3 && (
                            <InputAdornment position="end">
                              {slugChecking ? (
                                <CircularProgress size={18} />
                              ) : slugAvailable === true ? (
                                <CheckCircle sx={{ color: 'success.main', fontSize: 20 }} />
                              ) : slugAvailable === false ? (
                                <Typography variant="caption" color="error">Taken</Typography>
                              ) : null}
                            </InputAdornment>
                          ),
                        }}
                        helperText={form.slug.length >= 3 && slugAvailable === true ? 'This URL is available!' : form.slug.length >= 3 && slugAvailable === false ? 'This URL is already taken' : 'Choose a short, memorable URL'}
                      />
                      <TextField
                        fullWidth label="Your Name" required
                        placeholder="Jane Smith"
                        value={form.owner_name}
                        onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))}
                        margin="normal"
                      />
                      <TextField
                        fullWidth label="Email Address" type="email" required
                        placeholder="jane@example.com"
                        value={form.owner_email}
                        onChange={e => setForm(f => ({ ...f, owner_email: e.target.value }))}
                        margin="normal"
                      />
                      <TextField
                        fullWidth label="Password" required
                        type={showPassword ? 'text' : 'password'}
                        placeholder="At least 6 characters"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        margin="normal"
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <Button
                                size="small" tabIndex={-1}
                                onClick={() => setShowPassword(p => !p)}
                                sx={{ minWidth: 0, color: 'text.secondary' }}
                              >
                                {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                              </Button>
                            </InputAdornment>
                          ),
                        }}
                      />
                      <Button
                        fullWidth variant="contained" type="submit" size="large"
                        disabled={loading || slugAvailable === false}
                        sx={{
                          mt: 2, py: 1.5, bgcolor: PRIMARY, fontWeight: 700, fontSize: '1rem',
                          borderRadius: 2,
                          '&:hover': { bgcolor: '#6d1f2b' },
                        }}
                      >
                        {loading ? <CircularProgress size={24} color="inherit" /> : 'Create My Account'}
                      </Button>
                      <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={2}>
                        By signing up, you agree to our terms of service. Your 14-day trial starts immediately.
                      </Typography>
                    </form>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={5} sx={{ display: { xs: 'none', md: 'block' } }}>
                <Box sx={{ mt: 8 }}>
                  <Typography variant="h6" fontWeight={700} mb={3}>What you get with your free trial:</Typography>
                  {[
                    'Custom branded booking page',
                    'Unlimited services and categories',
                    'Customer management & history',
                    'Automated email notifications',
                    'Online payment processing',
                    'Reports and analytics dashboard',
                    'Loyalty programme & discount codes',
                    'Customer review collection',
                    'Support from our team',
                  ].map((item, i) => (
                    <Box key={i} display="flex" alignItems="center" gap={1.5} mb={1.5}>
                      <CheckCircle sx={{ fontSize: 20, color: '#2e7d32' }} />
                      <Typography variant="body1">{item}</Typography>
                    </Box>
                  ))}
                </Box>
              </Grid>
            </Grid>
          )}
        </Container>
      </Box>

      {/* Footer */}
      <Box sx={{ bgcolor: '#1a1a1a', color: 'white', py: 4 }}>
        <Container maxWidth="lg">
          <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: GOLD }}>PlatformBeauty</Typography>
              <Typography variant="caption" sx={{ opacity: 0.6 }}>
                The booking platform for beauty professionals
              </Typography>
            </Box>
            <Box display="flex" gap={3}>
              <Button color="inherit" size="small" sx={{ opacity: 0.7 }} onClick={() => navigate('/admin/login')}>
                Tenant Login
              </Button>
              <Button color="inherit" size="small" sx={{ opacity: 0.7 }} onClick={() => navigate('/platform/login')}>
                Platform Admin
              </Button>
            </Box>
          </Box>
          <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
          <Typography variant="caption" sx={{ opacity: 0.4 }}>
            &copy; {new Date().getFullYear()} PlatformBeauty. All rights reserved.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}

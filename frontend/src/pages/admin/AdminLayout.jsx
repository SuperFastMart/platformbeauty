import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, Drawer, List,
  ListItemButton, ListItemIcon, ListItemText, Button, Chip, Badge,
  IconButton, useMediaQuery, useTheme, Alert
} from '@mui/material';
import {
  Dashboard as DashboardIcon, ContentCut, CalendarMonth,
  Schedule, Logout, People, AddCircle, Settings as SettingsIcon,
  Loyalty as LoyaltyIcon, LocalOffer, Assessment,
  Chat, StarBorder, Menu as MenuIcon, SupportAgent,
  DarkMode, LightMode, Security, Close
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeMode } from '../../contexts/ThemeContext';
import api from '../../api/client';

const DRAWER_WIDTH = 240;

const navItems = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: <DashboardIcon /> },
  { label: 'Services', path: '/admin/services', icon: <ContentCut /> },
  { label: 'Bookings', path: '/admin/bookings', icon: <CalendarMonth /> },
  { label: 'Availability', path: '/admin/slot-templates', icon: <Schedule /> },
  { label: 'Create Booking', path: '/admin/bookings/create', icon: <AddCircle /> },
  { label: 'Customers', path: '/admin/customers', icon: <People /> },
  { label: 'Loyalty', path: '/admin/loyalty', icon: <LoyaltyIcon /> },
  { label: 'Discount Codes', path: '/admin/discount-codes', icon: <LocalOffer /> },
  { label: 'Reports', path: '/admin/reports', icon: <Assessment /> },
  { label: 'Messages', path: '/admin/messages', icon: <Chat /> },
  { label: 'Reviews', path: '/admin/reviews', icon: <StarBorder /> },
  { label: 'Support', path: '/admin/support', icon: <SupportAgent /> },
  { label: 'Settings', path: '/admin/settings', icon: <SettingsIcon /> },
];

export default function AdminLayout() {
  const { user, logout, exitImpersonation, isImpersonating } = useAuth();
  const { mode, toggleTheme } = useThemeMode();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showMfaBanner, setShowMfaBanner] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Poll support unread count
  useEffect(() => {
    const fetchUnread = () => {
      api.get('/admin/support/unread-count')
        .then(r => setSupportUnread(r.data.count))
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, []);

  // Check setup wizard status for new tenants
  useEffect(() => {
    if (isImpersonating) return;
    if (location.pathname === '/admin/setup') return;
    api.get('/admin/setup-status')
      .then(r => {
        const { hasServices, hasAbout, hasBranding, hasTemplates, dismissed } = r.data;
        if (!dismissed && (!hasServices || !hasAbout || !hasBranding || !hasTemplates)) {
          navigate('/admin/setup', { replace: true });
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check MFA status for subtle suggestion
  useEffect(() => {
    // Don't show if dismissed locally
    if (localStorage.getItem('mfa_banner_dismissed')) return;
    api.get('/admin/mfa/status')
      .then(r => {
        if (!r.data.mfa_enabled && !r.data.mfa_dismissed_at) {
          setShowMfaBanner(true);
        }
      })
      .catch(() => {});
  }, []);

  const dismissMfaBanner = () => {
    setShowMfaBanner(false);
    localStorage.setItem('mfa_banner_dismissed', '1');
    api.post('/admin/mfa/dismiss').catch(() => {});
  };

  const handleLogout = () => {
    if (isImpersonating) {
      exitImpersonation();
      navigate('/platform/tenants');
      return;
    }
    logout();
    navigate('/admin/login');
  };

  const handleNavClick = (path) => {
    setMobileOpen(false);
    navigate(path);
  };

  const drawerContent = (
    <>
      {!isMobile && <Toolbar />}
      <List>
        {navItems.map((item) => (
          <ListItemButton
            key={item.path}
            selected={location.pathname === item.path || location.pathname.startsWith(item.path + '/')}
            onClick={() => handleNavClick(item.path)}
            sx={{ minHeight: 48 }}
          >
            <ListItemIcon>
              {item.label === 'Support' && supportUnread > 0
                ? <Badge variant="dot" color="error">{item.icon}</Badge>
                : item.icon}
            </ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          {isMobile && (
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            {user?.tenantName || 'Business Admin'}
          </Typography>
          {!isMobile && user?.tenantSlug && (
            <Chip
              label={`/t/${user.tenantSlug}`}
              size="small"
              sx={{ mr: 2, color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
              variant="outlined"
              onClick={() => window.open(`/t/${user.tenantSlug}`, '_blank')}
            />
          )}
          <IconButton color="inherit" onClick={toggleTheme} sx={{ mr: 1 }}>
            {mode === 'dark' ? <LightMode /> : <DarkMode />}
          </IconButton>
          <Button color="inherit" startIcon={<Logout />} onClick={handleLogout}>
            {isMobile ? '' : 'Logout'}
          </Button>
        </Toolbar>
      </AppBar>

      {/* Mobile: Temporary Drawer */}
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: isMobile ? 2 : 3,
          mt: isImpersonating ? 12 : 8,
          width: isMobile ? '100%' : `calc(100% - ${DRAWER_WIDTH}px)`,
        }}
      >
        {isImpersonating && (
          <Box
            sx={{
              position: 'fixed',
              top: 64,
              left: isMobile ? 0 : DRAWER_WIDTH,
              right: 0,
              zIndex: (theme) => theme.zIndex.appBar - 1,
              bgcolor: '#ed6c02',
              color: 'white',
              py: 1,
              px: 2,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Typography variant="body2" fontWeight={600}>
              Viewing as {user?.tenantName || user?.username} (impersonation)
            </Typography>
            <Button
              size="small"
              variant="outlined"
              sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}
              onClick={() => { exitImpersonation(); navigate('/platform/tenants'); }}
            >
              Exit Impersonation
            </Button>
          </Box>
        )}
        {showMfaBanner && !isImpersonating && (
          <Alert
            severity="info"
            icon={<Security fontSize="small" />}
            action={
              <Box display="flex" gap={1} alignItems="center">
                <Button
                  color="inherit" size="small"
                  onClick={() => { navigate('/admin/settings?tab=security'); dismissMfaBanner(); }}
                >
                  Set up
                </Button>
                <IconButton size="small" color="inherit" onClick={dismissMfaBanner}>
                  <Close fontSize="small" />
                </IconButton>
              </Box>
            }
            sx={{ mb: 2, borderRadius: 2 }}
          >
            <Typography variant="body2">
              <strong>Protect your account</strong> — Enable two-factor authentication for extra security.
            </Typography>
          </Alert>
        )}
        <Outlet />
      </Box>
    </Box>
  );
}

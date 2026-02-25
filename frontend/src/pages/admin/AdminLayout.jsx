import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, Drawer, List,
  ListItemButton, ListItemIcon, ListItemText, Button, Chip, Badge,
  IconButton, useMediaQuery, useTheme, Alert, Popover, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import {
  Dashboard as DashboardIcon, ContentCut, CalendarMonth,
  Schedule, Logout, People, AddCircle, Settings as SettingsIcon,
  Loyalty as LoyaltyIcon, LocalOffer, Assessment,
  Chat, StarBorder, Menu as MenuIcon, SupportAgent,
  DarkMode, LightMode, Security, Close, AccountBalance, HourglassEmpty,
  CardGiftcard, Inventory2, WorkspacePremium, Notifications, Campaign,
  DoneAll, NewReleases, Build, Newspaper, Warning
} from '@mui/icons-material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeMode } from '../../contexts/ThemeContext';
import api from '../../api/client';

dayjs.extend(relativeTime);

const DRAWER_WIDTH = 240;

const navItems = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: <DashboardIcon /> },
  { label: 'Services', path: '/admin/services', icon: <ContentCut /> },
  { label: 'Bookings', path: '/admin/bookings', icon: <CalendarMonth /> },
  { label: 'Waitlist', path: '/admin/waitlist', icon: <HourglassEmpty /> },
  { label: 'Availability', path: '/admin/slot-templates', icon: <Schedule /> },
  { label: 'Create Booking', path: '/admin/bookings/create', icon: <AddCircle /> },
  { label: 'Customers', path: '/admin/customers', icon: <People /> },
  { label: 'Loyalty', path: '/admin/loyalty', icon: <LoyaltyIcon /> },
  { label: 'Discount Codes', path: '/admin/discount-codes', icon: <LocalOffer /> },
  { label: 'Gift Cards', path: '/admin/gift-cards', icon: <CardGiftcard /> },
  { label: 'Packages', path: '/admin/packages', icon: <Inventory2 /> },
  { label: 'Memberships', path: '/admin/memberships', icon: <WorkspacePremium /> },
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
  const [showTaxBanner, setShowTaxBanner] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
  const [trialBanner, setTrialBanner] = useState(null);

  // Broadcast notification state
  const [broadcastAnchor, setBroadcastAnchor] = useState(null);
  const [broadcasts, setBroadcasts] = useState([]);
  const [broadcastUnread, setBroadcastUnread] = useState(0);
  const [dismissedHighPriority, setDismissedHighPriority] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('dismissed_hp_broadcasts') || '[]'); }
    catch { return []; }
  });

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

  // Poll broadcast unread count
  const fetchBroadcastUnread = useCallback(() => {
    api.get('/admin/broadcasts/unread-count')
      .then(r => setBroadcastUnread(r.data.count || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchBroadcastUnread();
    const interval = setInterval(fetchBroadcastUnread, 60000);
    return () => clearInterval(interval);
  }, [fetchBroadcastUnread]);

  const fetchBroadcasts = useCallback(() => {
    api.get('/admin/broadcasts')
      .then(r => setBroadcasts(r.data || []))
      .catch(() => {});
  }, []);

  const openBroadcasts = (e) => {
    setBroadcastAnchor(e.currentTarget);
    fetchBroadcasts();
  };

  const handleMarkBroadcastRead = (id) => {
    api.put(`/admin/broadcasts/${id}/read`)
      .then(() => { fetchBroadcasts(); fetchBroadcastUnread(); })
      .catch(() => {});
  };

  const handleMarkAllBroadcastsRead = () => {
    api.put('/admin/broadcasts/read-all')
      .then(() => { fetchBroadcasts(); fetchBroadcastUnread(); })
      .catch(() => {});
  };

  const dismissHighPriority = (id) => {
    const updated = [...dismissedHighPriority, id];
    setDismissedHighPriority(updated);
    sessionStorage.setItem('dismissed_hp_broadcasts', JSON.stringify(updated));
    handleMarkBroadcastRead(id);
  };

  const broadcastIcon = (type) => {
    switch (type) {
      case 'feature': return <NewReleases fontSize="small" sx={{ color: '#8B2635' }} />;
      case 'downtime': return <Warning fontSize="small" color="error" />;
      case 'news': return <Newspaper fontSize="small" color="info" />;
      case 'update': return <Build fontSize="small" color="success" />;
      default: return <Campaign fontSize="small" />;
    }
  };

  const [selectedBroadcast, setSelectedBroadcast] = useState(null);

  const openBroadcastDetail = (b) => {
    setSelectedBroadcast(b);
    setBroadcastAnchor(null);
    if (!b.is_read) handleMarkBroadcastRead(b.id);
  };

  // High-priority unread broadcasts for banner display
  const highPriorityBroadcasts = broadcasts.filter(
    b => b.priority === 'high' && !b.is_read && !dismissedHighPriority.includes(b.id)
  );

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

  // Check subscription trial status
  useEffect(() => {
    api.get('/admin/subscription/tier')
      .then(({ data }) => {
        if (data.status === 'trial' || data.status === 'trial_expired') {
          setTrialBanner(data);
        }
      })
      .catch(() => {});
  }, []);

  const trialDaysLeft = trialBanner?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(trialBanner.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Check DAC7 tax info completion (show after 14 days)
  useEffect(() => {
    if (sessionStorage.getItem('tax_banner_dismissed')) return;
    api.get('/admin/tax-info')
      .then(r => {
        if (r.data.tax_info_completed_at) return;
        // Only show if account is older than 14 days
        const created = new Date(r.data.created_at);
        const daysSinceCreation = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation >= 14) {
          setShowTaxBanner(true);
        }
      })
      .catch(() => {});
  }, []);

  const dismissTaxBanner = () => {
    setShowTaxBanner(false);
    sessionStorage.setItem('tax_banner_dismissed', '1');
  };

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
          <IconButton color="inherit" onClick={openBroadcasts} sx={{ mr: 1 }}>
            <Badge badgeContent={broadcastUnread} color="error">
              <Notifications />
            </Badge>
          </IconButton>
          <IconButton color="inherit" onClick={toggleTheme} sx={{ mr: 1 }}>
            {mode === 'dark' ? <LightMode /> : <DarkMode />}
          </IconButton>
          <Button color="inherit" startIcon={<Logout />} onClick={handleLogout}>
            {isMobile ? '' : 'Logout'}
          </Button>
        </Toolbar>
      </AppBar>

      {/* Broadcast notification popover */}
      <Popover
        open={Boolean(broadcastAnchor)}
        anchorEl={broadcastAnchor}
        onClose={() => setBroadcastAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { width: 380, maxHeight: 460 } }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" px={2} py={1.5}>
          <Typography variant="subtitle2" fontWeight={600}>Announcements</Typography>
          {broadcastUnread > 0 && (
            <Button size="small" startIcon={<DoneAll />} onClick={handleMarkAllBroadcastsRead}
              sx={{ textTransform: 'none' }}>
              Mark all read
            </Button>
          )}
        </Box>
        <Divider />
        {broadcasts.length === 0 ? (
          <Box p={3} textAlign="center">
            <Campaign sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary" variant="body2">No announcements</Typography>
          </Box>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 380, overflow: 'auto' }}>
            {broadcasts.map(b => (
              <ListItemButton
                key={b.id}
                sx={{
                  opacity: b.is_read ? 0.65 : 1,
                  py: 1.5,
                  alignItems: 'flex-start',
                  bgcolor: !b.is_read ? 'action.hover' : 'transparent',
                }}
                onClick={() => openBroadcastDetail(b)}
              >
                <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                  {broadcastIcon(b.type)}
                </ListItemIcon>
                <ListItemText
                  primary={b.title}
                  secondary={
                    <>
                      <Typography variant="caption" component="span" sx={{
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden', whiteSpace: 'pre-line',
                      }}>
                        {b.body}
                      </Typography>
                      <br />
                      <Typography variant="caption" component="span" color="text.disabled">
                        {dayjs(b.published_at).fromNow()}
                      </Typography>
                    </>
                  }
                  primaryTypographyProps={{
                    variant: 'body2',
                    fontWeight: b.is_read ? 400 : 600,
                    gutterBottom: true,
                  }}
                />
                {!b.is_read && (
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#8B2635', mt: 1, ml: 1, flexShrink: 0 }} />
                )}
              </ListItemButton>
            ))}
          </List>
        )}
      </Popover>

      {/* Broadcast detail dialog */}
      <Dialog open={!!selectedBroadcast} onClose={() => setSelectedBroadcast(null)} maxWidth="sm" fullWidth>
        {selectedBroadcast && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
              {broadcastIcon(selectedBroadcast.type)}
              <Box flex={1}>
                <Typography variant="h6" fontWeight={600}>{selectedBroadcast.title}</Typography>
                <Box display="flex" gap={1} mt={0.5}>
                  <Chip label={selectedBroadcast.type} size="small" variant="outlined" sx={{ height: 22, fontSize: 11 }} />
                  {selectedBroadcast.priority === 'high' && (
                    <Chip label="High Priority" size="small" color="error" sx={{ height: 22, fontSize: 11 }} />
                  )}
                </Box>
              </Box>
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}>
                {selectedBroadcast.body}
              </Typography>
              <Typography variant="caption" color="text.disabled" display="block" mt={2}>
                Published {dayjs(selectedBroadcast.published_at).fromNow()} — {dayjs(selectedBroadcast.published_at).format('D MMM YYYY [at] HH:mm')}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedBroadcast(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Mobile: Custom drawer (no MUI Modal) */}
      {isMobile ? (
        <>
          <Box
            onClick={() => setMobileOpen(false)}
            sx={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              bgcolor: 'rgba(0,0,0,0.5)',
              zIndex: (theme) => theme.zIndex.drawer,
              opacity: mobileOpen ? 1 : 0,
              pointerEvents: mobileOpen ? 'auto' : 'none',
              transition: 'opacity 225ms ease',
            }}
          />
          <Box
            sx={{
              position: 'fixed',
              top: 0, left: 0, bottom: 0,
              width: DRAWER_WIDTH,
              bgcolor: 'background.paper',
              zIndex: (theme) => theme.zIndex.drawer + 2,
              transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 225ms cubic-bezier(0, 0, 0.2, 1)',
              overflowY: 'auto',
              boxShadow: mobileOpen ? 8 : 0,
            }}
          >
            {drawerContent}
          </Box>
        </>
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
        {showTaxBanner && !isImpersonating && (
          <Alert
            severity="warning"
            icon={<AccountBalance fontSize="small" />}
            action={
              <Box display="flex" gap={1} alignItems="center">
                <Button
                  color="inherit" size="small"
                  onClick={() => { navigate('/admin/settings?tab=tax'); dismissTaxBanner(); }}
                >
                  Complete now
                </Button>
                <IconButton size="small" color="inherit" onClick={dismissTaxBanner}>
                  <Close fontSize="small" />
                </IconButton>
              </Box>
            }
            sx={{ mb: 2, borderRadius: 2 }}
          >
            <Typography variant="body2">
              <strong>Tax information required</strong> — Under UK platform reporting rules, we need your identity and tax details to continue operating your account.
            </Typography>
          </Alert>
        )}
        {trialBanner?.status === 'trial' && !isImpersonating && (
          <Alert
            severity="info"
            action={
              <Button
                color="inherit" size="small"
                onClick={() => navigate('/admin/settings?tab=subscription')}
              >
                Subscribe now
              </Button>
            }
            sx={{ mb: 2, borderRadius: 2 }}
          >
            <Typography variant="body2">
              <strong>Pro Trial</strong> — {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining. Subscribe to keep all features.
            </Typography>
          </Alert>
        )}
        {trialBanner?.status === 'trial_expired' && !isImpersonating && (
          <Alert
            severity="warning"
            action={
              <Button
                color="inherit" size="small"
                onClick={() => navigate('/admin/settings?tab=subscription')}
              >
                Upgrade now
              </Button>
            }
            sx={{ mb: 2, borderRadius: 2 }}
          >
            <Typography variant="body2">
              <strong>Your trial has ended.</strong> You're now on the Free plan. Upgrade to unlock all features.
            </Typography>
          </Alert>
        )}
        {highPriorityBroadcasts.map(b => (
          <Alert
            key={b.id}
            severity={b.type === 'downtime' ? 'error' : 'info'}
            icon={broadcastIcon(b.type)}
            action={
              <IconButton size="small" color="inherit" onClick={() => dismissHighPriority(b.id)}>
                <Close fontSize="small" />
              </IconButton>
            }
            sx={{ mb: 2, borderRadius: 2 }}
          >
            <Typography variant="body2">
              <strong>{b.title}</strong> — {b.body.length > 120 ? b.body.slice(0, 120) + '…' : b.body}
            </Typography>
          </Alert>
        ))}
        <Outlet />
      </Box>
    </Box>
  );
}

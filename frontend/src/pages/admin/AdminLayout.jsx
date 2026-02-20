import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, Drawer, SwipeableDrawer, List,
  ListItemButton, ListItemIcon, ListItemText, Button, Chip,
  IconButton, useMediaQuery, useTheme
} from '@mui/material';
import {
  Dashboard as DashboardIcon, ContentCut, CalendarMonth,
  Schedule, Logout, People, AddCircle, Settings as SettingsIcon,
  Loyalty as LoyaltyIcon, LocalOffer, Assessment,
  Chat, StarBorder, Menu as MenuIcon, SupportAgent
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

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
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

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
    navigate(path);
    if (isMobile) setMobileOpen(false);
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
            <ListItemIcon>{item.icon}</ListItemIcon>
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
          <Button color="inherit" startIcon={<Logout />} onClick={handleLogout}>
            {isMobile ? '' : 'Logout'}
          </Button>
        </Toolbar>
      </AppBar>

      {/* Mobile: SwipeableDrawer */}
      {isMobile ? (
        <SwipeableDrawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          onOpen={() => setMobileOpen(true)}
          sx={{
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {drawerContent}
        </SwipeableDrawer>
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
        <Outlet />
      </Box>
    </Box>
  );
}

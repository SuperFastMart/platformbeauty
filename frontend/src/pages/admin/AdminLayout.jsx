import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, Drawer, List, ListItemButton,
  ListItemIcon, ListItemText, Button, Chip
} from '@mui/material';
import {
  Dashboard as DashboardIcon, ContentCut, CalendarMonth,
  Schedule, Logout, People, AddCircle, Settings as SettingsIcon,
  Loyalty as LoyaltyIcon, LocalOffer, Assessment,
  Chat, StarBorder
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
  { label: 'Settings', path: '/admin/settings', icon: <SettingsIcon /> },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            {user?.tenantName || 'Business Admin'}
          </Typography>
          {user?.tenantSlug && (
            <Chip
              label={`/t/${user.tenantSlug}`}
              size="small"
              sx={{ mr: 2, color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
              variant="outlined"
              onClick={() => window.open(`/t/${user.tenantSlug}`, '_blank')}
            />
          )}
          <Button color="inherit" startIcon={<Logout />} onClick={handleLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <List>
          {navItems.map((item) => (
            <ListItemButton
              key={item.path}
              selected={location.pathname === item.path || location.pathname.startsWith(item.path + '/')}
              onClick={() => navigate(item.path)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
        <Outlet />
      </Box>
    </Box>
  );
}

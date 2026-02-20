import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, Drawer, List, ListItemButton,
  ListItemIcon, ListItemText, Button, Badge, IconButton, Popover,
  ListItemSecondaryAction, Divider
} from '@mui/material';
import {
  Dashboard, Business, SupportAgent, Logout, Notifications,
  FiberNew, DoneAll, DarkMode, LightMode
} from '@mui/icons-material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeMode } from '../../contexts/ThemeContext';
import api from '../../api/client';

dayjs.extend(relativeTime);

const DRAWER_WIDTH = 240;

const navItems = [
  { label: 'Dashboard', path: '/platform/dashboard', icon: <Dashboard /> },
  { label: 'Tenants', path: '/platform/tenants', icon: <Business /> },
  { label: 'Support', path: '/platform/support', icon: <SupportAgent /> },
];

export default function PlatformLayout() {
  const { logout } = useAuth();
  const { mode, toggleTheme } = useThemeMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = () => {
    api.get('/platform/notifications')
      .then(({ data }) => {
        setNotifications(data.notifications?.slice(0, 15) || []);
        setUnreadCount(data.unread_count || 0);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/platform/login');
  };

  const handleMarkAllRead = () => {
    api.put('/platform/notifications/read-all')
      .then(() => { setUnreadCount(0); fetchNotifications(); })
      .catch(() => {});
  };

  const notifIcon = (type) => {
    switch (type) {
      case 'tenant_signup': return <FiberNew color="primary" fontSize="small" />;
      case 'ticket_new': return <SupportAgent color="warning" fontSize="small" />;
      default: return <FiberNew fontSize="small" />;
    }
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            Booking Platform Admin
          </Typography>
          <IconButton color="inherit" onClick={e => setAnchorEl(e.currentTarget)} sx={{ mr: 1 }}>
            <Badge badgeContent={unreadCount} color="error">
              <Notifications />
            </Badge>
          </IconButton>
          <IconButton color="inherit" onClick={toggleTheme} sx={{ mr: 1 }}>
            {mode === 'dark' ? <LightMode /> : <DarkMode />}
          </IconButton>
          <Button color="inherit" startIcon={<Logout />} onClick={handleLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      {/* Notification popover */}
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { width: 360, maxHeight: 420 } }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" px={2} py={1}>
          <Typography variant="subtitle2" fontWeight={600}>Notifications</Typography>
          {unreadCount > 0 && (
            <Button size="small" startIcon={<DoneAll />} onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )}
        </Box>
        <Divider />
        {notifications.length === 0 ? (
          <Box p={3} textAlign="center">
            <Typography color="text.secondary" variant="body2">No notifications</Typography>
          </Box>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 340, overflow: 'auto' }}>
            {notifications.map(n => (
              <ListItemButton
                key={n.id}
                sx={{ opacity: n.read_at ? 0.7 : 1, py: 1.5 }}
                onClick={() => {
                  api.put(`/platform/notifications/${n.id}/read`).catch(() => {});
                  setAnchorEl(null);
                  if (n.type === 'ticket_new' && n.metadata?.ticketId) {
                    navigate(`/platform/support/${n.metadata.ticketId}`);
                  } else if (n.type === 'tenant_signup' && n.tenant_id) {
                    navigate(`/platform/tenants/${n.tenant_id}`);
                  }
                  fetchNotifications();
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{notifIcon(n.type)}</ListItemIcon>
                <ListItemText
                  primary={n.title}
                  secondary={dayjs(n.created_at).fromNow()}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: n.read_at ? 400 : 600 }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                {!n.read_at && (
                  <ListItemSecondaryAction>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />
                  </ListItemSecondaryAction>
                )}
              </ListItemButton>
            ))}
          </List>
        )}
      </Popover>

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
              selected={location.pathname.startsWith(item.path)}
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

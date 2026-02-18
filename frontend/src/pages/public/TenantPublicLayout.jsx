import { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { Box, Typography, AppBar, Toolbar, CircularProgress, createTheme, ThemeProvider } from '@mui/material';
import api from '../../api/client';

const TenantContext = createContext(null);
export const useTenant = () => useContext(TenantContext);

export default function TenantPublicLayout() {
  const { slug } = useParams();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get(`/t/${slug}/`)
      .then(({ data }) => setTenant(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !tenant) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <Box textAlign="center">
          <Typography variant="h4" gutterBottom>Business Not Found</Typography>
          <Typography color="text.secondary">
            The business you're looking for doesn't exist or is no longer active.
          </Typography>
        </Box>
      </Box>
    );
  }

  // Create a tenant-specific theme based on their primary color
  const tenantTheme = createTheme({
    palette: {
      primary: { main: tenant.primary_color || '#8B2635' },
      secondary: { main: '#D4A853' },
      background: { default: '#fafafa' },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    },
    components: {
      MuiButton: {
        styleOverrides: { root: { textTransform: 'none', borderRadius: 8 } },
      },
      MuiCard: {
        styleOverrides: { root: { borderRadius: 12 } },
      },
    },
  });

  return (
    <TenantContext.Provider value={tenant}>
      <ThemeProvider theme={tenantTheme}>
        <Box minHeight="100vh" bgcolor="background.default">
          <AppBar position="static" elevation={0}>
            <Toolbar>
              {tenant.logo_url && (
                <Box component="img" src={tenant.logo_url} alt={tenant.name}
                  sx={{ height: 36, mr: 2, borderRadius: 1 }} />
              )}
              <Typography variant="h6" fontWeight={600}>
                {tenant.name}
              </Typography>
            </Toolbar>
          </AppBar>

          <Outlet />
        </Box>
      </ThemeProvider>
    </TenantContext.Provider>
  );
}

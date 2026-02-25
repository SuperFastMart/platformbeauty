import { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Box, Typography, AppBar, Toolbar, CircularProgress, createTheme, ThemeProvider, Button, IconButton } from '@mui/material';
import { Person, ArrowBack } from '@mui/icons-material';
import api from '../../api/client';

const TenantContext = createContext(null);
export const useTenant = () => useContext(TenantContext);

export default function TenantPublicLayout() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isLanding = location.pathname === `/t/${slug}` || location.pathname === `/t/${slug}/`;
  const [tenant, setTenant] = useState(null);
  const [siteSettings, setSiteSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/t/${slug}/`),
      api.get(`/t/${slug}/settings`).catch(() => ({ data: {} })),
    ])
      .then(([tenantRes, settingsRes]) => {
        setTenant(tenantRes.data);
        setSiteSettings(settingsRes.data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // Load custom Google Font for AppBar
  useEffect(() => {
    const font = siteSettings.header_font;
    if (font && font !== 'Inter' && (!siteSettings.header_display || siteSettings.header_display === 'text')) {
      const linkId = 'custom-header-font';
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;700&display=swap`;
        document.head.appendChild(link);
      }
    }
  }, [siteSettings.header_font, siteSettings.header_display]);

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

  // Detect light colors to ensure contrast
  const isLightColor = (hex) => {
    if (!hex || hex.length < 7) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.7;
  };

  const primaryColor = tenant.primary_color || '#8B2635';
  const lightPrimary = isLightColor(primaryColor);

  // Create a tenant-specific theme based on their primary color
  const tenantTheme = createTheme({
    palette: {
      primary: { main: lightPrimary ? '#333333' : primaryColor },
      secondary: { main: lightPrimary ? primaryColor : '#D4A853' },
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
        <Helmet>
          <title>{`Book with ${tenant.name} | Boukd`}</title>
          <meta name="description" content={siteSettings.about_text ? `${siteSettings.about_text.slice(0, 155)}` : `Book appointments with ${tenant.name} online. Easy scheduling, instant confirmations.`} />
          <meta property="og:title" content={`Book with ${tenant.name} | Boukd`} />
          <meta property="og:description" content={siteSettings.about_text ? `${siteSettings.about_text.slice(0, 155)}` : `Book appointments with ${tenant.name} online.`} />
          <meta property="og:url" content={`https://boukd.com/t/${slug}`} />
          {tenant.logo_url && <meta property="og:image" content={tenant.logo_url} />}
          <link rel="canonical" href={`https://boukd.com/t/${slug}`} />
        </Helmet>
        <Box minHeight="100vh" bgcolor="background.default" display="flex" flexDirection="column">
          <AppBar position="static" elevation={0}>
            <Toolbar>
              {!isLanding && (
                <IconButton
                  color="inherit" edge="start" size="small"
                  onClick={() => navigate(`/t/${slug}`)}
                  sx={{ mr: 1 }}
                  aria-label="Back to home"
                >
                  <ArrowBack fontSize="small" />
                </IconButton>
              )}
              <Box
                onClick={() => navigate(`/t/${slug}`)}
                sx={{ flexGrow: 1, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                {siteSettings.header_display === 'logo' && siteSettings.header_logo_url ? (
                  <Box
                    component="img"
                    src={siteSettings.header_logo_url}
                    alt={tenant.name}
                    sx={{ height: 40, maxWidth: 200, objectFit: 'contain', objectPosition: 'left' }}
                  />
                ) : (
                  <>
                    {tenant.logo_url && (
                      <Box component="img" src={tenant.logo_url} alt={tenant.name}
                        sx={{ height: 36, mr: 2, borderRadius: 1 }} />
                    )}
                    <Typography
                      variant="h6"
                      fontWeight={600}
                      sx={{
                        ...(siteSettings.header_font && siteSettings.header_font !== 'Inter'
                          ? { fontFamily: `"${siteSettings.header_font}", serif` }
                          : {}),
                      }}
                    >
                      {tenant.name}
                    </Typography>
                  </>
                )}
              </Box>
              <Button
                color="inherit" size="small" startIcon={<Person />}
                onClick={() => {
                  const token = localStorage.getItem('customer_token');
                  navigate(token ? `/t/${slug}/portal` : `/t/${slug}/portal/login`);
                }}
              >
                My Bookings
              </Button>
            </Toolbar>
          </AppBar>

          <Box sx={{ flex: 1 }}>
            <Outlet />
          </Box>

          <Box
            component="footer"
            sx={{ py: 2, textAlign: 'center', borderTop: '1px solid', borderColor: 'divider' }}
          >
            <Typography
              variant="caption"
              color="text.disabled"
              component="a"
              href="https://boukd.com"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textDecoration: 'none', '&:hover': { color: 'text.secondary' } }}
            >
              Powered by Boukd
            </Typography>
          </Box>
        </Box>
      </ThemeProvider>
    </TenantContext.Provider>
  );
}

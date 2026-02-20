import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, TextField, FormControl, InputLabel,
  Select, MenuItem, InputAdornment, Card, CardContent, Grid,
  useMediaQuery, useTheme
} from '@mui/material';
import { Add, Search } from '@mui/icons-material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../../api/client';

dayjs.extend(relativeTime);

export default function TenantList() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    api.get('/platform/tenants')
      .then(({ data }) => setTenants(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = tenants.filter(t => {
    if (search) {
      const s = search.toLowerCase();
      if (!t.name?.toLowerCase().includes(s) && !t.owner_email?.toLowerCase().includes(s) && !t.slug?.toLowerCase().includes(s)) return false;
    }
    if (tierFilter && (t.subscription_tier || 'free') !== tierFilter) return false;
    if (statusFilter === 'active' && !t.active) return false;
    if (statusFilter === 'suspended' && t.active) return false;
    return true;
  });

  const tiers = [...new Set(tenants.map(t => t.subscription_tier || 'free'))];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Tenants</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/platform/tenants/new')}>
          Create Tenant
        </Button>
      </Box>

      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <TextField
          size="small" placeholder="Search name, email, slug..."
          value={search} onChange={e => setSearch(e.target.value)}
          sx={{ minWidth: 250 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Tier</InputLabel>
          <Select value={tierFilter} label="Tier" onChange={e => setTierFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {tiers.map(t => <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>{t}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="suspended">Suspended</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {isMobile ? (
        <Grid container spacing={2}>
          {loading ? (
            <Grid item xs={12}><Typography textAlign="center" color="text.secondary">Loading...</Typography></Grid>
          ) : filtered.length === 0 ? (
            <Grid item xs={12}><Typography textAlign="center" color="text.secondary">No tenants found</Typography></Grid>
          ) : filtered.map(t => (
            <Grid item xs={12} key={t.id}>
              <Card
                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 } }}
                onClick={() => navigate(`/platform/tenants/${t.id}`)}
              >
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography fontWeight={600}>{t.name}</Typography>
                      <Typography variant="caption" color="text.secondary">/t/{t.slug}</Typography>
                    </Box>
                    <Box display="flex" gap={0.5}>
                      <Chip label={t.subscription_tier || 'free'} size="small" variant="outlined" sx={{ textTransform: 'capitalize' }} />
                      <Chip label={t.active ? 'Active' : 'Suspended'} color={t.active ? 'success' : 'error'} size="small" />
                    </Box>
                  </Box>
                  <Typography variant="body2" color="text.secondary" mt={1}>
                    {t.owner_name} &middot; {t.owner_email}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Created {dayjs(t.created_at).fromNow()}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Business Name</TableCell>
                <TableCell>Slug</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell>Tier</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">No tenants found</TableCell>
                </TableRow>
              ) : filtered.map((t) => (
                <TableRow
                  key={t.id} hover sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/platform/tenants/${t.id}`)}
                >
                  <TableCell>
                    <Typography fontWeight={600} variant="body2">{t.name}</Typography>
                  </TableCell>
                  <TableCell><code>/t/{t.slug}</code></TableCell>
                  <TableCell>
                    <Typography variant="body2">{t.owner_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{t.owner_email}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={t.subscription_tier || 'free'} size="small" variant="outlined" sx={{ textTransform: 'capitalize' }} />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={t.active ? 'Active' : 'Suspended'}
                      color={t.active ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{dayjs(t.created_at).format('D MMM YYYY')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

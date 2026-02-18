import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip
} from '@mui/material';
import { Add } from '@mui/icons-material';
import api from '../../api/client';

export default function TenantList() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/platform/tenants')
      .then(({ data }) => setTenants(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Tenants</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/platform/tenants/new')}>
          Create Tenant
        </Button>
      </Box>

      <TableContainer component={Paper}>
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
            ) : tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">No tenants yet</TableCell>
              </TableRow>
            ) : tenants.map((t) => (
              <TableRow
                key={t.id} hover sx={{ cursor: 'pointer' }}
                onClick={() => navigate(`/platform/tenants/${t.id}`)}
              >
                <TableCell>{t.name}</TableCell>
                <TableCell><code>/t/{t.slug}</code></TableCell>
                <TableCell>{t.owner_name} ({t.owner_email})</TableCell>
                <TableCell>
                  <Chip label={t.subscription_tier} size="small" />
                </TableCell>
                <TableCell>
                  <Chip
                    label={t.active ? 'Active' : 'Inactive'}
                    color={t.active ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

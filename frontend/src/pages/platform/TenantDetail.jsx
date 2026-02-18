import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, TextField, Button, Alert,
  Chip, Divider, Grid, MenuItem, Switch, FormControlLabel
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import api from '../../api/client';

export default function TenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get(`/platform/tenants/${id}`)
      .then(({ data }) => setTenant(data))
      .catch(() => setError('Tenant not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setTenant(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const { data } = await api.put(`/platform/tenants/${id}`, {
        name: tenant.name,
        owner_email: tenant.owner_email,
        owner_name: tenant.owner_name,
        business_phone: tenant.business_phone,
        business_address: tenant.business_address,
        subscription_tier: tenant.subscription_tier,
        subscription_status: tenant.subscription_status,
        active: tenant.active,
      });
      setTenant(prev => ({ ...prev, ...data }));
      setSuccess('Tenant updated successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update tenant');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>Loading...</Typography>;
  if (!tenant) return <Typography>Tenant not found</Typography>;

  return (
    <Box maxWidth={700}>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/platform/tenants')} sx={{ mb: 2 }}>
        Back to Tenants
      </Button>

      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Typography variant="h5" fontWeight={600}>{tenant.name}</Typography>
        <Chip label={`/t/${tenant.slug}`} variant="outlined" size="small" />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>Business Details</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth label="Business Name" value={tenant.name || ''} onChange={handleChange('name')} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Owner Name" value={tenant.owner_name || ''} onChange={handleChange('owner_name')} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Owner Email" value={tenant.owner_email || ''} onChange={handleChange('owner_email')} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Phone" value={tenant.business_phone || ''} onChange={handleChange('business_phone')} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Address" value={tenant.business_address || ''} onChange={handleChange('business_address')} />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          <Typography variant="subtitle1" fontWeight={600} mb={2}>Subscription</Typography>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField fullWidth select label="Tier" value={tenant.subscription_tier || 'basic'} onChange={handleChange('subscription_tier')}>
                <MenuItem value="basic">Basic (£5/mo)</MenuItem>
                <MenuItem value="premium">Premium (£10/mo)</MenuItem>
                <MenuItem value="pro">Pro (£15/mo)</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth select label="Status" value={tenant.subscription_status || 'trial'} onChange={handleChange('subscription_status')}>
                <MenuItem value="trial">Trial</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="past_due">Past Due</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </TextField>
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          <FormControlLabel
            control={<Switch checked={tenant.active} onChange={handleChange('active')} />}
            label="Tenant Active"
          />

          <Box mt={3}>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {tenant.users?.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>Admin Users</Typography>
            {tenant.users.map(u => (
              <Box key={u.id} display="flex" gap={2} alignItems="center" py={1}>
                <Typography>{u.username}</Typography>
                <Typography color="text.secondary">{u.email}</Typography>
                <Chip label={u.role} size="small" />
              </Box>
            ))}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

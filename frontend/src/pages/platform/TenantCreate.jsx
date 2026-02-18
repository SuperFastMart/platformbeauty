import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, TextField, Button, Alert, Grid
} from '@mui/material';
import api from '../../api/client';

export default function TenantCreate() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', slug: '', owner_email: '', owner_name: '',
    business_phone: '', admin_username: '', admin_password: ''
  });

  const handleChange = (field) => (e) => {
    const value = e.target.value;
    setForm(prev => ({
      ...prev,
      [field]: value,
      // Auto-generate slug from name
      ...(field === 'name' ? { slug: value.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 50) } : {})
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/platform/tenants', form);
      navigate('/platform/tenants');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create tenant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box maxWidth={600}>
      <Typography variant="h5" fontWeight={600} mb={3}>Create New Tenant</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Typography variant="subtitle2" color="text.secondary" mb={1}>Business Details</Typography>
            <TextField fullWidth label="Business Name" margin="normal" required
              value={form.name} onChange={handleChange('name')} />
            <TextField fullWidth label="URL Slug" margin="normal" required
              value={form.slug} onChange={handleChange('slug')}
              helperText={`Public URL: /t/${form.slug || '...'}`} />
            <TextField fullWidth label="Owner Name" margin="normal" required
              value={form.owner_name} onChange={handleChange('owner_name')} />
            <TextField fullWidth label="Owner Email" type="email" margin="normal" required
              value={form.owner_email} onChange={handleChange('owner_email')} />
            <TextField fullWidth label="Business Phone" margin="normal"
              value={form.business_phone} onChange={handleChange('business_phone')} />

            <Typography variant="subtitle2" color="text.secondary" mt={3} mb={1}>Admin Account</Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField fullWidth label="Username" required
                  value={form.admin_username} onChange={handleChange('admin_username')} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Password" type="password" required
                  value={form.admin_password} onChange={handleChange('admin_password')} />
              </Grid>
            </Grid>

            <Box display="flex" gap={2} mt={3}>
              <Button variant="outlined" onClick={() => navigate('/platform/tenants')}>
                Cancel
              </Button>
              <Button variant="contained" type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Tenant'}
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}

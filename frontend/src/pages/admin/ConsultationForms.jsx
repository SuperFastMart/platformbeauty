import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, FormControlLabel, Checkbox, Snackbar, Alert, IconButton
} from '@mui/material';
import { Add, Edit, Delete, Send, Assignment } from '@mui/icons-material';
import api from '../../api/client';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function ConsultationForms() {
  const navigate = useNavigate();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({
    name: '', description: '', send_mode: 'before_appointment',
    frequency: 'every_time', service_scope: 'all', service_ids: [], require_signature: false,
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchForms = () => {
    api.get('/admin/consultation-forms')
      .then(({ data }) => setForms(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchForms();
    api.get('/admin/services').then(({ data }) => setServices(data)).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) { setFormError('Form name is required'); return; }
    setSaving(true);
    setFormError('');
    try {
      const { data } = await api.post('/admin/consultation-forms', {
        ...form,
        service_ids: form.service_scope === 'specific' ? form.service_ids : null,
      });
      setSnackbar({ open: true, message: 'Form created', severity: 'success' });
      setDialogOpen(false);
      setForm({ name: '', description: '', send_mode: 'before_appointment', frequency: 'every_time', service_scope: 'all', service_ids: [], require_signature: false });
      navigate(`/admin/consultation-forms/${data.id}`);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create form');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/admin/consultation-forms/${id}`);
      setSnackbar({ open: true, message: 'Form deleted', severity: 'success' });
      fetchForms();
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete', severity: 'error' });
    }
  };

  const sendModeLabel = (m) => m === 'before_appointment' ? 'Auto' : 'Manual';
  const sendModeColor = (m) => m === 'before_appointment' ? 'success' : 'warning';
  const freqLabel = (f) => f === 'every_time' ? 'Every booking' : 'Once only';

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Consultation Forms</Typography>
        <Button variant="contained" size="small" startIcon={<Add />} onClick={() => setDialogOpen(true)}>
          Create Form
        </Button>
      </Box>

      {loading ? (
        <Typography>Loading...</Typography>
      ) : forms.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Assignment sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="h6" color="text.secondary" mb={1}>No consultation forms yet</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Create forms to collect information from clients before their appointments
          </Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>
            Create Your First Form
          </Button>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {forms.map(f => (
            <Grid item xs={12} md={6} key={f.id}>
              <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s' }}
                onClick={() => navigate(`/admin/consultation-forms/${f.id}`)}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box flex={1}>
                      <Typography fontWeight={600} mb={0.5}>{f.name}</Typography>
                      {f.description && (
                        <Typography variant="body2" color="text.secondary" mb={1} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.description}
                        </Typography>
                      )}
                      <Box display="flex" gap={0.5} flexWrap="wrap">
                        <Chip label={sendModeLabel(f.send_mode)} size="small" color={sendModeColor(f.send_mode)} variant="outlined" />
                        <Chip label={freqLabel(f.frequency)} size="small" variant="outlined" />
                        <Chip label={f.service_scope === 'all' ? 'All services' : 'Specific services'} size="small" variant="outlined" />
                        {f.require_signature && <Chip label="Signature" size="small" variant="outlined" color="info" />}
                      </Box>
                    </Box>
                    <Box display="flex" gap={0.5} ml={1}>
                      <IconButton size="small" onClick={e => { e.stopPropagation(); setConfirmDelete(f.id); }}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                  <Box display="flex" gap={2} mt={1.5}>
                    <Typography variant="caption" color="text.secondary">
                      {f.field_count} field{f.field_count !== 1 ? 's' : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {f.completed_count}/{f.response_count} completed
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create Form Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Consultation Form</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <TextField fullWidth label="Form Name" margin="normal" required
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Pre Hair Appointment" />
          <TextField fullWidth label="Description" margin="normal" multiline rows={2}
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Brief description visible to clients" />
          <TextField fullWidth select label="Send Mode" margin="normal"
            value={form.send_mode} onChange={e => setForm(f => ({ ...f, send_mode: e.target.value }))}>
            <MenuItem value="before_appointment">Before appointment (auto-send on booking confirmation)</MenuItem>
            <MenuItem value="manually">Manually (you decide when to send)</MenuItem>
          </TextField>
          <TextField fullWidth select label="Frequency" margin="normal"
            value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
            <MenuItem value="every_time">Every time they book an appointment</MenuItem>
            <MenuItem value="only_once">Only once</MenuItem>
          </TextField>
          <TextField fullWidth select label="Service Scope" margin="normal"
            value={form.service_scope} onChange={e => setForm(f => ({ ...f, service_scope: e.target.value }))}>
            <MenuItem value="all">All services</MenuItem>
            <MenuItem value="specific">Specific services</MenuItem>
          </TextField>
          {form.service_scope === 'specific' && (
            <TextField fullWidth select label="Select Services" margin="normal"
              SelectProps={{ multiple: true, renderValue: (sel) => sel.map(id => services.find(s => s.id === id)?.name || id).join(', ') }}
              value={form.service_ids}
              onChange={e => setForm(f => ({ ...f, service_ids: e.target.value }))}>
              {services.filter(s => s.active).map(s => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </TextField>
          )}
          <FormControlLabel sx={{ mt: 1 }}
            control={<Checkbox checked={form.require_signature} onChange={e => setForm(f => ({ ...f, require_signature: e.target.checked }))} />}
            label="Require client signature (confirmation checkbox)" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating...' : 'Create & Add Fields'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete form?"
        message="This will deactivate the form. Existing responses will be preserved."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={() => handleDelete(confirmDelete)}
      />

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

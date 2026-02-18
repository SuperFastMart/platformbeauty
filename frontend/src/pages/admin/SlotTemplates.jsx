import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Snackbar, Alert, Divider, Grid
} from '@mui/material';
import { Add, Edit, Delete, AutoFixHigh } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const emptyTemplate = { name: '', day_of_week: 1, start_time: '09:00', end_time: '17:00', slot_duration: 30 };

export default function SlotTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyTemplate);
  const [generateForm, setGenerateForm] = useState({
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().add(14, 'day').format('YYYY-MM-DD'),
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchTemplates = () => {
    api.get('/admin/slot-templates')
      .then(({ data }) => setTemplates(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleOpen = (template = null) => {
    if (template) {
      setEditing(template);
      setForm({
        name: template.name, day_of_week: template.day_of_week,
        start_time: template.start_time?.slice(0, 5), end_time: template.end_time?.slice(0, 5),
        slot_duration: template.slot_duration,
      });
    } else {
      setEditing(null);
      setForm(emptyTemplate);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await api.put(`/admin/slot-templates/${editing.id}`, form);
        setSnackbar({ open: true, message: 'Template updated', severity: 'success' });
      } else {
        await api.post('/admin/slot-templates', form);
        setSnackbar({ open: true, message: 'Template created', severity: 'success' });
      }
      setDialogOpen(false);
      fetchTemplates();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error', severity: 'error' });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.delete(`/admin/slot-templates/${id}`);
      setSnackbar({ open: true, message: 'Template deleted', severity: 'success' });
      fetchTemplates();
    } catch (err) {
      setSnackbar({ open: true, message: 'Error deleting template', severity: 'error' });
    }
  };

  const handleGenerate = async () => {
    try {
      const { data } = await api.post('/admin/slot-templates/generate', generateForm);
      setSnackbar({ open: true, message: data.message, severity: 'success' });
      setGenerateOpen(false);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error generating slots', severity: 'error' });
    }
  };

  // Group templates by day
  const byDay = {};
  templates.forEach(t => {
    if (!byDay[t.day_of_week]) byDay[t.day_of_week] = [];
    byDay[t.day_of_week].push(t);
  });

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Availability</Typography>
        <Box display="flex" gap={1}>
          <Button variant="outlined" startIcon={<AutoFixHigh />} onClick={() => setGenerateOpen(true)}>
            Generate Slots
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()}>
            Add Template
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Typography>Loading...</Typography>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary">
              No slot templates yet. Create templates to define your weekly availability, then generate time slots.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {[1, 2, 3, 4, 5, 6, 0].map(day => {
            const dayTemplates = byDay[day];
            if (!dayTemplates) return null;
            return (
              <Grid item xs={12} sm={6} md={4} key={day}>
                <Card>
                  <CardContent>
                    <Typography fontWeight={600} mb={1}>{DAYS[day]}</Typography>
                    {dayTemplates.map(t => (
                      <Box key={t.id} display="flex" justifyContent="space-between" alignItems="center" py={0.5}>
                        <Box>
                          <Typography variant="body2">
                            {t.start_time?.slice(0, 5)} - {t.end_time?.slice(0, 5)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {t.slot_duration}min slots
                          </Typography>
                        </Box>
                        <Box>
                          <IconButton size="small" onClick={() => handleOpen(t)}>
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDelete(t.id)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Template Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Template' : 'New Template'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" margin="normal"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <TextField fullWidth select label="Day of Week" margin="normal"
            value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: parseInt(e.target.value) }))}>
            {DAYS.map((d, i) => <MenuItem key={i} value={i}>{d}</MenuItem>)}
          </TextField>
          <Box display="flex" gap={2}>
            <TextField fullWidth label="Start Time" type="time" margin="normal"
              value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
              InputLabelProps={{ shrink: true }} />
            <TextField fullWidth label="End Time" type="time" margin="normal"
              value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
              InputLabelProps={{ shrink: true }} />
          </Box>
          <TextField label="Slot Duration (min)" type="number" margin="normal"
            value={form.slot_duration} onChange={e => setForm(f => ({ ...f, slot_duration: parseInt(e.target.value) || 30 }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Generate Slots Dialog */}
      <Dialog open={generateOpen} onClose={() => setGenerateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Generate Time Slots</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Generate available time slots from your templates for a date range.
          </Typography>
          <Box display="flex" gap={2}>
            <TextField fullWidth label="Start Date" type="date" margin="normal"
              value={generateForm.startDate}
              onChange={e => setGenerateForm(f => ({ ...f, startDate: e.target.value }))}
              InputLabelProps={{ shrink: true }} />
            <TextField fullWidth label="End Date" type="date" margin="normal"
              value={generateForm.endDate}
              onChange={e => setGenerateForm(f => ({ ...f, endDate: e.target.value }))}
              InputLabelProps={{ shrink: true }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGenerateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleGenerate}>Generate</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

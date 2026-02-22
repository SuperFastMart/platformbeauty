import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Snackbar, Alert, Divider, Grid, LinearProgress,
  useMediaQuery, useTheme
} from '@mui/material';
import { Add, Edit, Delete, AutoFixHigh, Visibility, Close, CheckCircle } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const QUICK_SETUP_DEFAULTS = [
  { day: 1, label: 'Mon', open: true, start: '09:00', end: '17:00', duration: 30 },
  { day: 2, label: 'Tue', open: true, start: '09:00', end: '17:00', duration: 30 },
  { day: 3, label: 'Wed', open: true, start: '09:00', end: '17:00', duration: 30 },
  { day: 4, label: 'Thu', open: true, start: '09:00', end: '17:00', duration: 30 },
  { day: 5, label: 'Fri', open: true, start: '09:00', end: '17:00', duration: 30 },
  { day: 6, label: 'Sat', open: true, start: '09:00', end: '15:00', duration: 30 },
  { day: 0, label: 'Sun', open: false, start: '10:00', end: '16:00', duration: 30 },
];

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

  // Availability overview state
  const [overview, setOverview] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [selectedDaySlots, setSelectedDaySlots] = useState(null);
  const [selectedDayDate, setSelectedDayDate] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);

  const [quickSetup, setQuickSetup] = useState(QUICK_SETUP_DEFAULTS.map(d => ({ ...d })));
  const [quickSetupSaving, setQuickSetupSaving] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const fetchTemplates = () => {
    api.get('/admin/slot-templates')
      .then(({ data }) => setTemplates(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const fetchOverview = () => {
    setOverviewLoading(true);
    api.get('/admin/slots/overview?days=14')
      .then(({ data }) => setOverview(data))
      .catch(console.error)
      .finally(() => setOverviewLoading(false));
  };

  useEffect(() => {
    fetchTemplates();
    fetchOverview();
  }, []);

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
      fetchOverview(); // Refresh overview after generating
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error generating slots', severity: 'error' });
    }
  };

  const viewDay = async (dateStr) => {
    setSelectedDayDate(dateStr);
    setDayLoading(true);
    try {
      const { data } = await api.get(`/admin/slots/day?date=${dateStr}`);
      setSelectedDaySlots(data);
    } catch (err) {
      setSelectedDaySlots([]);
    } finally {
      setDayLoading(false);
    }
  };

  const handleQuickSetup = async () => {
    setQuickSetupSaving(true);
    try {
      const openDays = quickSetup.filter(d => d.open);
      for (const day of openDays) {
        await api.post('/admin/slot-templates', {
          name: `${DAYS[day.day]} Schedule`,
          day_of_week: day.day,
          start_time: day.start,
          end_time: day.end,
          slot_duration: day.duration,
        });
      }
      // Generate 2 weeks of slots
      await api.post('/admin/slot-templates/generate', {
        startDate: dayjs().format('YYYY-MM-DD'),
        endDate: dayjs().add(14, 'day').format('YYYY-MM-DD'),
      });
      setSnackbar({ open: true, message: `Templates created and slots generated for the next 2 weeks!`, severity: 'success' });
      fetchTemplates();
      fetchOverview();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error during quick setup', severity: 'error' });
    } finally {
      setQuickSetupSaving(false);
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={600}>Availability</Typography>
        <Box display="flex" gap={1}>
          <Button variant="outlined" startIcon={<AutoFixHigh />} onClick={() => setGenerateOpen(true)} sx={{ minHeight: 44 }}>
            Generate Slots
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()} sx={{ minHeight: 44 }}>
            {isMobile ? 'Add' : 'Add Template'}
          </Button>
        </Box>
      </Box>

      {/* Slot Availability Overview */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" fontWeight={600}>Upcoming Availability</Typography>
            <Button size="small" onClick={fetchOverview} disabled={overviewLoading}>
              Refresh
            </Button>
          </Box>

          {overviewLoading ? (
            <LinearProgress />
          ) : overview.length === 0 ? (
            <Alert severity="info" variant="outlined">
              No time slots generated yet. Use "Generate Slots" above to create bookable time slots from your templates.
            </Alert>
          ) : (
            <Grid container spacing={1}>
              {overview.map(day => {
                const d = dayjs(day.date);
                const available = parseInt(day.available);
                const booked = parseInt(day.booked);
                const total = parseInt(day.total);
                const pct = total > 0 ? Math.round((available / total) * 100) : 0;
                const isToday = d.isSame(dayjs(), 'day');

                return (
                  <Grid item xs={6} sm={4} md={3} lg={12 / 7} key={day.date}>
                    <Card
                      variant="outlined"
                      sx={{
                        cursor: 'pointer',
                        bgcolor: available === 0 ? 'error.50' : pct <= 30 ? 'warning.50' : 'transparent',
                        border: isToday ? 2 : 1,
                        borderColor: isToday ? 'primary.main' : 'divider',
                        '&:hover': { bgcolor: 'action.hover' },
                        transition: 'background-color 0.15s',
                      }}
                      onClick={() => viewDay(day.date)}
                    >
                      <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 }, textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {d.format('ddd')}
                        </Typography>
                        <Typography fontWeight={700} fontSize="1.1rem">
                          {d.format('D MMM')}
                        </Typography>
                        <Box mt={0.5}>
                          <Chip
                            label={`${available}/${total}`}
                            size="small"
                            color={available === 0 ? 'error' : pct <= 30 ? 'warning' : 'success'}
                            variant="outlined"
                            sx={{ fontSize: '0.75rem', height: 22 }}
                          />
                        </Box>
                        {booked > 0 && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {booked} booked
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}

          <Box display="flex" gap={2} mt={2} flexWrap="wrap">
            <Box display="flex" alignItems="center" gap={0.5}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'success.main' }} />
              <Typography variant="caption">Available</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={0.5}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'warning.main' }} />
              <Typography variant="caption">Filling up</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={0.5}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'error.main' }} />
              <Typography variant="caption">Fully booked</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Quick Setup — shown when no templates exist */}
      {!loading && templates.length === 0 && (
        <Card sx={{ mb: 3, border: '2px solid', borderColor: 'primary.main' }}>
          <CardContent>
            <Typography variant="h6" fontWeight={600} mb={1}>Quick Setup</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Set your working hours and we'll create your availability automatically. You can customise later.
            </Typography>
            {quickSetup.map((day, idx) => (
              <Box key={day.day} display="flex" alignItems="center" gap={1} mb={1} flexWrap="wrap">
                <Button
                  size="small" variant={day.open ? 'contained' : 'outlined'}
                  sx={{ minWidth: 70, textTransform: 'none' }}
                  onClick={() => setQuickSetup(qs => qs.map((d, i) => i === idx ? { ...d, open: !d.open } : d))}
                >
                  {day.label}
                </Button>
                {day.open && (
                  <>
                    <TextField size="small" type="time" value={day.start} sx={{ width: { xs: 100, sm: 120 } }}
                      onChange={e => setQuickSetup(qs => qs.map((d, i) => i === idx ? { ...d, start: e.target.value } : d))}
                      InputLabelProps={{ shrink: true }} />
                    <Typography variant="body2">to</Typography>
                    <TextField size="small" type="time" value={day.end} sx={{ width: { xs: 100, sm: 120 } }}
                      onChange={e => setQuickSetup(qs => qs.map((d, i) => i === idx ? { ...d, end: e.target.value } : d))}
                      InputLabelProps={{ shrink: true }} />
                    {!isMobile && (
                      <>
                        <TextField size="small" type="number" value={day.duration} sx={{ width: 80 }}
                          inputProps={{ min: 5, max: 120 }}
                          onChange={e => setQuickSetup(qs => qs.map((d, i) => i === idx ? { ...d, duration: parseInt(e.target.value) || 30 } : d))} />
                        <Typography variant="caption" color="text.secondary">min slots</Typography>
                      </>
                    )}
                  </>
                )}
                {!day.open && <Typography variant="body2" color="text.secondary">Closed</Typography>}
              </Box>
            ))}
            <Button variant="contained" sx={{ mt: 2 }} onClick={handleQuickSetup} disabled={quickSetupSaving}
              startIcon={quickSetupSaving ? null : <CheckCircle />}>
              {quickSetupSaving ? 'Setting up...' : 'Save & Generate Slots'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Weekly Templates */}
      <Typography variant="h6" fontWeight={600} mb={1}>Weekly Schedule Templates</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Templates define your working pattern. After creating or changing templates, click "Generate Slots" to create bookable time slots.
      </Typography>
      {loading ? (
        <Typography>Loading...</Typography>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary">
              No slot templates yet. Use Quick Setup above, or create templates manually.
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

      {/* Day Detail Dialog */}
      <Dialog open={!!selectedDayDate} onClose={() => { setSelectedDayDate(null); setSelectedDaySlots(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight={600}>
              {selectedDayDate && dayjs(selectedDayDate).format('dddd D MMMM YYYY')}
            </Typography>
            <IconButton onClick={() => { setSelectedDayDate(null); setSelectedDaySlots(null); }}>
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {dayLoading ? (
            <LinearProgress />
          ) : !selectedDaySlots || selectedDaySlots.length === 0 ? (
            <Typography color="text.secondary">No time slots for this day.</Typography>
          ) : (
            <Box>
              {selectedDaySlots.map(slot => (
                <Box
                  key={slot.id}
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  py={1}
                  px={1.5}
                  mb={0.5}
                  borderRadius={1}
                  bgcolor={slot.is_available ? 'success.50' : 'grey.100'}
                  sx={{ bgcolor: slot.is_available ? 'rgba(46, 125, 50, 0.06)' : 'rgba(0, 0, 0, 0.04)' }}
                >
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography fontWeight={600} variant="body2" sx={{ minWidth: 100 }}>
                      {slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}
                    </Typography>
                    <Chip
                      label={slot.is_available ? 'Available' : 'Booked'}
                      size="small"
                      color={slot.is_available ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </Box>
                  {slot.booking_id && (
                    <Box textAlign="right">
                      <Typography variant="body2" fontWeight={500}>{slot.customer_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{slot.service_names}</Typography>
                    </Box>
                  )}
                </Box>
              ))}

              <Box mt={2} display="flex" gap={2}>
                <Typography variant="body2" color="success.main">
                  {selectedDaySlots.filter(s => s.is_available).length} available
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedDaySlots.filter(s => !s.is_available).length} booked
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

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
          <Box display="flex" gap={1} mb={2} flexWrap="wrap">
            <Button size="small" variant="outlined" onClick={() => setGenerateForm({ startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().add(14, 'day').format('YYYY-MM-DD') })}>Next 2 weeks</Button>
            <Button size="small" variant="outlined" onClick={() => setGenerateForm({ startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().add(1, 'month').format('YYYY-MM-DD') })}>Next month</Button>
            <Button size="small" variant="outlined" onClick={() => setGenerateForm({ startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().add(3, 'month').format('YYYY-MM-DD') })}>Next 3 months</Button>
          </Box>
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

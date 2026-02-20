import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, CardContent, Grid, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Snackbar, Alert, useMediaQuery, useTheme
} from '@mui/material';
import { Add, SupportAgent, Inbox, HourglassTop, CheckCircle } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';

const CATEGORIES = [
  { value: 'general', label: 'General Question' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'billing', label: 'Billing' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const statusColor = { open: 'info', in_progress: 'warning', resolved: 'success', closed: 'default' };
const statusLabel = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
const priorityColor = { low: 'default', normal: 'info', high: 'warning', urgent: 'error' };
const categoryLabel = { general: 'General', bug: 'Bug Report', feature_request: 'Feature Request', billing: 'Billing' };

export default function Support() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', category: 'general', priority: 'normal' });
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchTickets = () => {
    api.get('/admin/support')
      .then(({ data }) => setTickets(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTickets(); }, []);

  const handleCreate = async () => {
    if (!form.subject.trim() || !form.description.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/admin/support', form);
      setSnackbar({ open: true, message: 'Ticket created', severity: 'success' });
      setDialogOpen(false);
      setForm({ subject: '', description: '', category: 'general', priority: 'normal' });
      fetchTickets();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error creating ticket', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const openCount = tickets.filter(t => t.status === 'open').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;

  const stats = [
    { title: 'Open', value: openCount, icon: Inbox, color: '#1976d2' },
    { title: 'In Progress', value: inProgressCount, icon: HourglassTop, color: '#ed6c02' },
    { title: 'Resolved', value: resolvedCount, icon: CheckCircle, color: '#2e7d32' },
    { title: 'Total', value: tickets.length, icon: SupportAgent, color: '#9c27b0' },
  ];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={600}>Support</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)} sx={{ minHeight: 44 }}>
          New Ticket
        </Button>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <Grid item xs={6} sm={3} key={stat.title}>
              <Card>
                <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                  <Box display="flex" alignItems="center" gap={1.5}>
                    <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: `${stat.color}15`, display: 'flex' }}>
                      <Icon sx={{ color: stat.color, fontSize: 24 }} />
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">{stat.title}</Typography>
                      <Typography variant="h5" fontWeight="bold">{stat.value}</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Card>
        <CardContent>
          {loading ? (
            <Typography>Loading...</Typography>
          ) : tickets.length === 0 ? (
            <Box textAlign="center" py={6}>
              <SupportAgent sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography color="text.secondary">No support tickets yet. Click "New Ticket" to get help.</Typography>
            </Box>
          ) : isMobile ? (
            // Mobile card view
            tickets.map(ticket => (
              <Card
                key={ticket.id} variant="outlined" sx={{ mb: 1.5, cursor: 'pointer' }}
                onClick={() => navigate(`/admin/support/${ticket.id}`)}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography fontWeight={600} variant="body2" mb={0.5}>{ticket.subject}</Typography>
                  <Box display="flex" gap={0.5} flexWrap="wrap" mb={0.5}>
                    <Chip label={statusLabel[ticket.status] || ticket.status} color={statusColor[ticket.status]} size="small" />
                    <Chip label={ticket.priority} color={priorityColor[ticket.priority]} size="small" variant="outlined" />
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {parseInt(ticket.message_count)} messages • {dayjs(ticket.updated_at).format('D MMM')}
                  </Typography>
                </CardContent>
              </Card>
            ))
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Subject</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Priority</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Messages</TableCell>
                    <TableCell>Updated</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tickets.map(ticket => (
                    <TableRow
                      key={ticket.id} hover sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/admin/support/${ticket.id}`)}
                    >
                      <TableCell><Typography variant="body2" fontWeight={500}>{ticket.subject}</Typography></TableCell>
                      <TableCell><Chip label={categoryLabel[ticket.category] || ticket.category} size="small" variant="outlined" /></TableCell>
                      <TableCell><Chip label={ticket.priority} color={priorityColor[ticket.priority]} size="small" variant="outlined" /></TableCell>
                      <TableCell><Chip label={statusLabel[ticket.status] || ticket.status} color={statusColor[ticket.status]} size="small" /></TableCell>
                      <TableCell>{parseInt(ticket.message_count)}</TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {dayjs(ticket.updated_at).format('D MMM')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Create Ticket Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SupportAgent /> New Support Ticket
        </DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Subject" margin="normal" required
            value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            placeholder="Brief summary of your issue" />
          <TextField select fullWidth label="Category" margin="normal"
            value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
          </TextField>
          <TextField select fullWidth label="Priority" margin="normal"
            value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            {PRIORITIES.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
          </TextField>
          <TextField fullWidth multiline rows={4} label="Description" margin="normal" required
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Describe your issue or question in detail..." />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}
            disabled={submitting || !form.subject.trim() || !form.description.trim()}
            startIcon={<SupportAgent />}>
            {submitting ? 'Submitting...' : 'Submit Ticket'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

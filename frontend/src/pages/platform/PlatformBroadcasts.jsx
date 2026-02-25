import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Chip, IconButton, CircularProgress, Alert,
  MenuItem, Switch, FormControlLabel
} from '@mui/material';
import { Add, Edit, Delete, Send, Visibility, Campaign } from '@mui/icons-material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../../api/client';
import ConfirmDialog from '../../components/ConfirmDialog';

dayjs.extend(relativeTime);

const TYPE_COLOURS = {
  feature: '#8B2635',
  downtime: '#d32f2f',
  news: '#1976d2',
  update: '#2e7d32',
};

const PRIORITY_COLOURS = {
  low: 'default',
  normal: 'primary',
  high: 'error',
};

export default function PlatformBroadcasts() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [totalTenants, setTotalTenants] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ title: '', body: '', type: 'feature', priority: 'normal', expires_at: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [statsOpen, setStatsOpen] = useState(null);
  const [statsData, setStatsData] = useState(null);

  const fetchBroadcasts = async () => {
    try {
      const { data } = await api.get('/platform/broadcasts');
      setBroadcasts(data.broadcasts || []);
      setTotalTenants(data.total_tenants || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBroadcasts(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ title: '', body: '', type: 'feature', priority: 'normal', expires_at: '' });
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (b) => {
    setEditId(b.id);
    setForm({
      title: b.title,
      body: b.body,
      type: b.type,
      priority: b.priority,
      expires_at: b.expires_at ? dayjs(b.expires_at).format('YYYY-MM-DDTHH:mm') : '',
    });
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.body) {
      setError('Title and body are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        expires_at: form.expires_at || null,
      };
      if (editId) {
        await api.put(`/platform/broadcasts/${editId}`, payload);
      } else {
        await api.post('/platform/broadcasts', payload);
      }
      setDialogOpen(false);
      fetchBroadcasts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (b) => {
    try {
      if (b.published) {
        await api.put(`/platform/broadcasts/${b.id}`, { published: false });
      } else {
        await api.put(`/platform/broadcasts/${b.id}/publish`);
      }
      fetchBroadcasts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/platform/broadcasts/${deleteConfirm.id}`);
      fetchBroadcasts();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const openStats = async (b) => {
    setStatsOpen(b);
    try {
      const { data } = await api.get(`/platform/broadcasts/${b.id}/stats`);
      setStatsData(data);
    } catch (err) {
      console.error(err);
    }
  };

  const getStatus = (b) => {
    if (!b.published) return { label: 'Draft', color: 'default' };
    if (b.expires_at && dayjs(b.expires_at).isBefore(dayjs())) return { label: 'Expired', color: 'warning' };
    return { label: 'Published', color: 'success' };
  };

  const activeBroadcasts = broadcasts.filter(b => b.published && (!b.expires_at || dayjs(b.expires_at).isAfter(dayjs())));
  const totalReads = broadcasts.reduce((sum, b) => sum + (b.read_count || 0), 0);

  if (loading) return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={700}>Broadcasts</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate}
          sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}>
          New Broadcast
        </Button>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Broadcasts', value: broadcasts.length, color: '#8B2635' },
          { label: 'Active', value: activeBroadcasts.length, color: '#2e7d32' },
          { label: 'Total Reads', value: totalReads, color: '#D4A853' },
          { label: 'Tenants', value: totalTenants, color: '#1976d2' },
        ].map(s => (
          <Grid item xs={6} sm={3} key={s.label}>
            <Card sx={{ borderTop: `3px solid ${s.color}` }}>
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography variant="h6" fontWeight={700} color={s.color}>{s.value}</Typography>
                <Typography variant="caption" color="text.secondary">{s.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Broadcast List */}
      {broadcasts.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <Campaign sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">No broadcasts yet. Create your first announcement.</Typography>
          </CardContent>
        </Card>
      ) : (
        <Box display="flex" flexDirection="column" gap={2}>
          {broadcasts.map(b => {
            const status = getStatus(b);
            return (
              <Card key={b.id} sx={{
                borderLeft: `4px solid ${TYPE_COLOURS[b.type] || '#999'}`,
                opacity: status.label === 'Expired' ? 0.6 : 1,
              }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                    <Box flex={1}>
                      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                        <Typography variant="h6" fontWeight={600}>{b.title}</Typography>
                        <Chip label={status.label} size="small" color={status.color} sx={{ height: 22, fontSize: 11 }} />
                        <Chip label={b.type} size="small" variant="outlined"
                          sx={{ height: 22, fontSize: 11, borderColor: TYPE_COLOURS[b.type], color: TYPE_COLOURS[b.type] }} />
                        {b.priority === 'high' && (
                          <Chip label="High Priority" size="small" color="error" sx={{ height: 22, fontSize: 11 }} />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{
                        whiteSpace: 'pre-line',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {b.body}
                      </Typography>
                    </Box>
                    <Box display="flex" gap={0.5} ml={1}>
                      <IconButton size="small" onClick={() => openStats(b)} title="View stats">
                        <Visibility fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => openEdit(b)} title="Edit">
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleteConfirm(b)} title="Delete">
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  <Box display="flex" justifyContent="space-between" alignItems="center" mt={1.5} pt={1} borderTop={1} borderColor="divider">
                    <Box display="flex" gap={2} alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        Created {dayjs(b.created_at).fromNow()}
                      </Typography>
                      {b.published_at && (
                        <Typography variant="caption" color="text.secondary">
                          Published {dayjs(b.published_at).fromNow()}
                        </Typography>
                      )}
                      {b.expires_at && (
                        <Typography variant="caption" color="text.secondary">
                          Expires {dayjs(b.expires_at).format('D MMM YYYY HH:mm')}
                        </Typography>
                      )}
                      <Chip label={`${b.read_count || 0} / ${totalTenants} read`} size="small" variant="outlined"
                        sx={{ height: 20, fontSize: 11 }} />
                    </Box>
                    <Button
                      size="small"
                      variant={b.published ? 'outlined' : 'contained'}
                      color={b.published ? 'warning' : 'success'}
                      startIcon={b.published ? null : <Send />}
                      onClick={() => handlePublish(b)}
                      sx={{ textTransform: 'none' }}
                    >
                      {b.published ? 'Unpublish' : 'Publish'}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit Broadcast' : 'New Broadcast'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField fullWidth label="Title" margin="normal" required
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <TextField fullWidth label="Body" margin="normal" required multiline rows={4}
            value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            helperText="This is the full announcement text tenants will see." />
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField select fullWidth label="Type" margin="normal"
                value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <MenuItem value="feature">Feature</MenuItem>
                <MenuItem value="update">Update</MenuItem>
                <MenuItem value="news">News</MenuItem>
                <MenuItem value="downtime">Downtime</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField select fullWidth label="Priority" margin="normal"
                value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="normal">Normal</MenuItem>
                <MenuItem value="high">High</MenuItem>
              </TextField>
            </Grid>
          </Grid>
          <TextField fullWidth label="Expires At (optional)" type="datetime-local" margin="normal"
            value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            helperText="Leave blank for no expiry. Useful for downtime notices." />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}
            sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}>
            {saving ? 'Saving...' : editId ? 'Save Changes' : 'Create Draft'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Stats Dialog */}
      <Dialog open={!!statsOpen} onClose={() => { setStatsOpen(null); setStatsData(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>Broadcast Stats — {statsOpen?.title}</DialogTitle>
        <DialogContent>
          {!statsData ? (
            <Box textAlign="center" py={3}><CircularProgress /></Box>
          ) : (
            <>
              <Box display="flex" gap={3} mb={3}>
                <Box>
                  <Typography variant="h4" fontWeight={700} color="#8B2635">
                    {statsData.read_count}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    of {statsData.total_tenants} tenants read
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="h4" fontWeight={700} color="#D4A853">
                    {statsData.total_tenants > 0
                      ? Math.round((statsData.read_count / statsData.total_tenants) * 100)
                      : 0}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Reach</Typography>
                </Box>
              </Box>
              {statsData.readers?.length > 0 && (
                <>
                  <Typography variant="subtitle2" fontWeight={600} mb={1}>Read by</Typography>
                  {statsData.readers.map((r, i) => (
                    <Box key={i} display="flex" justifyContent="space-between" py={0.75} borderBottom={1} borderColor="divider">
                      <Typography variant="body2">{r.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{dayjs(r.read_at).fromNow()}</Typography>
                    </Box>
                  ))}
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setStatsOpen(null); setStatsData(null); }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Broadcast?"
        message={`"${deleteConfirm?.title}" will be permanently deleted.`}
        warning="This action cannot be undone."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onClose={() => setDeleteConfirm(null)}
      />
    </Box>
  );
}

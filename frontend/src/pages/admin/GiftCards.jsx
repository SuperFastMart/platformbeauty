import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Chip, IconButton, CircularProgress, Alert, Tooltip
} from '@mui/material';
import { Add, Delete, Visibility, ContentCopy, CardGiftcard } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useSubscriptionTier } from '../../hooks/useSubscriptionTier';
import FeatureGate from '../../components/FeatureGate';

const statusColors = {
  active: 'success',
  redeemed: 'info',
  expired: 'warning',
  cancelled: 'error',
};

export default function GiftCards() {
  const [cards, setCards] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(null);
  const [form, setForm] = useState({
    initialBalance: '', senderName: '', senderEmail: '',
    recipientName: '', recipientEmail: '', message: '', expiresAt: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const fetchData = async () => {
    try {
      const [cardsRes, statsRes] = await Promise.all([
        api.get('/admin/gift-cards'),
        api.get('/admin/gift-cards/stats'),
      ]);
      setCards(cardsRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.initialBalance || parseFloat(form.initialBalance) <= 0) {
      setError('Enter a valid balance');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/admin/gift-cards', form);
      setCreateOpen(false);
      setForm({ initialBalance: '', senderName: '', senderEmail: '', recipientName: '', recipientEmail: '', message: '', expiresAt: '' });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create gift card');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this gift card?')) return;
    try {
      await api.delete(`/admin/gift-cards/${id}`);
      fetchData();
      if (detailOpen?.id === id) setDetailOpen(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.put(`/admin/gift-cards/${id}`, { status });
      fetchData();
      if (detailOpen?.id === id) viewDetail(id);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update');
    }
  };

  const viewDetail = async (id) => {
    try {
      const { data } = await api.get(`/admin/gift-cards/${id}`);
      setDetailOpen(data);
    } catch (err) {
      console.error(err);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(''), 2000);
  };

  if (loading) return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;

  return (
    <FeatureGate requiredTier="pro">
      <Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" fontWeight={700}>Gift Cards</Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}
            sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}>
            Create Gift Card
          </Button>
        </Box>

        {/* Stats */}
        {stats && (
          <Grid container spacing={2} mb={3}>
            {[
              { label: 'Total Cards', value: stats.total_cards, color: '#8B2635' },
              { label: 'Active', value: stats.active_cards, color: '#2e7d32' },
              { label: 'Total Sold', value: `£${parseFloat(stats.total_sold).toFixed(2)}`, color: '#D4A853' },
              { label: 'Total Redeemed', value: `£${parseFloat(stats.total_redeemed).toFixed(2)}`, color: '#1976d2' },
              { label: 'Outstanding', value: `£${parseFloat(stats.outstanding_balance).toFixed(2)}`, color: '#ed6c02' },
            ].map(s => (
              <Grid item xs={6} sm={4} md key={s.label}>
                <Card sx={{ borderTop: `3px solid ${s.color}` }}>
                  <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                    <Typography variant="h6" fontWeight={700} color={s.color}>{s.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Cards Table */}
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Code</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Balance</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Recipient</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cards.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <CardGiftcard sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                      <Typography color="text.secondary">No gift cards yet</Typography>
                    </TableCell>
                  </TableRow>
                ) : cards.map(card => (
                  <TableRow key={card.id} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <Typography variant="body2" fontFamily="monospace" fontWeight={600}>
                          {card.code}
                        </Typography>
                        <Tooltip title={copied === card.code ? 'Copied!' : 'Copy code'}>
                          <IconButton size="small" onClick={() => copyCode(card.code)}>
                            <ContentCopy sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        £{parseFloat(card.remaining_balance).toFixed(2)}
                        <Typography component="span" variant="caption" color="text.secondary">
                          {' / £'}{parseFloat(card.initial_balance).toFixed(2)}
                        </Typography>
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{card.recipient_name || card.recipient_email || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={card.status} size="small" color={statusColors[card.status] || 'default'}
                        sx={{ textTransform: 'capitalize' }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{dayjs(card.created_at).format('D MMM YYYY')}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => viewDetail(card.id)}><Visibility fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(card.id)}><Delete fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

        {/* Create Dialog */}
        <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Create Gift Card</DialogTitle>
          <DialogContent>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField
              fullWidth label="Amount (£)" type="number" margin="normal" required
              value={form.initialBalance}
              onChange={e => setForm(f => ({ ...f, initialBalance: e.target.value }))}
              inputProps={{ min: 1, step: 0.01 }}
            />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField fullWidth label="Sender Name" margin="normal" size="small"
                  value={form.senderName} onChange={e => setForm(f => ({ ...f, senderName: e.target.value }))} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Sender Email" margin="normal" size="small"
                  value={form.senderEmail} onChange={e => setForm(f => ({ ...f, senderEmail: e.target.value }))} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Recipient Name" margin="normal" size="small"
                  value={form.recipientName} onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Recipient Email" margin="normal" size="small"
                  value={form.recipientEmail} onChange={e => setForm(f => ({ ...f, recipientEmail: e.target.value }))} />
              </Grid>
            </Grid>
            <TextField fullWidth label="Personal Message (optional)" margin="normal" multiline rows={2}
              value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
            <TextField
              fullWidth label="Expiry Date (optional)" type="date" margin="normal"
              InputLabelProps={{ shrink: true }}
              value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
            />
            <Typography variant="caption" color="text.secondary">
              If a recipient email is provided, the gift card code will be emailed to them automatically.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleCreate} disabled={saving}
              sx={{ bgcolor: '#8B2635', '&:hover': { bgcolor: '#6d1f2b' } }}>
              {saving ? 'Creating...' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={!!detailOpen} onClose={() => setDetailOpen(null)} maxWidth="sm" fullWidth>
          {detailOpen && (
            <>
              <DialogTitle>
                <Box display="flex" alignItems="center" gap={1}>
                  <CardGiftcard />
                  Gift Card Details
                </Box>
              </DialogTitle>
              <DialogContent>
                <Box p={2} mb={2} bgcolor="grey.50" borderRadius={2} textAlign="center">
                  <Typography variant="body2" color="text.secondary" mb={0.5}>Code</Typography>
                  <Typography variant="h6" fontFamily="monospace" fontWeight={700} letterSpacing={2}>
                    {detailOpen.code}
                  </Typography>
                  <Typography variant="h5" fontWeight={700} color="#D4A853" mt={1}>
                    £{parseFloat(detailOpen.remaining_balance).toFixed(2)}
                    <Typography component="span" variant="body2" color="text.secondary">
                      {' / £'}{parseFloat(detailOpen.initial_balance).toFixed(2)}
                    </Typography>
                  </Typography>
                  <Chip label={detailOpen.status} size="small" color={statusColors[detailOpen.status] || 'default'}
                    sx={{ mt: 1, textTransform: 'capitalize' }} />
                </Box>

                {(detailOpen.sender_name || detailOpen.sender_email) && (
                  <Box mb={1}>
                    <Typography variant="caption" color="text.secondary">From</Typography>
                    <Typography variant="body2">{detailOpen.sender_name} {detailOpen.sender_email && `(${detailOpen.sender_email})`}</Typography>
                  </Box>
                )}
                {(detailOpen.recipient_name || detailOpen.recipient_email) && (
                  <Box mb={1}>
                    <Typography variant="caption" color="text.secondary">To</Typography>
                    <Typography variant="body2">{detailOpen.recipient_name} {detailOpen.recipient_email && `(${detailOpen.recipient_email})`}</Typography>
                  </Box>
                )}
                {detailOpen.message && (
                  <Box mb={1}>
                    <Typography variant="caption" color="text.secondary">Message</Typography>
                    <Typography variant="body2" fontStyle="italic">"{detailOpen.message}"</Typography>
                  </Box>
                )}
                {detailOpen.expires_at && (
                  <Box mb={1}>
                    <Typography variant="caption" color="text.secondary">Expires</Typography>
                    <Typography variant="body2">{dayjs(detailOpen.expires_at).format('D MMM YYYY')}</Typography>
                  </Box>
                )}

                {/* Transactions */}
                {detailOpen.transactions?.length > 0 && (
                  <Box mt={2}>
                    <Typography variant="subtitle2" fontWeight={600} mb={1}>Transaction History</Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Amount</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Balance After</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detailOpen.transactions.map(t => (
                          <TableRow key={t.id}>
                            <TableCell>
                              <Chip label={t.transaction_type} size="small" variant="outlined"
                                color={t.transaction_type === 'purchase' ? 'success' : t.transaction_type === 'redemption' ? 'primary' : 'default'}
                                sx={{ textTransform: 'capitalize', fontSize: 11 }} />
                            </TableCell>
                            <TableCell>
                              {t.transaction_type === 'redemption' ? '-' : '+'}£{parseFloat(t.amount).toFixed(2)}
                            </TableCell>
                            <TableCell>£{parseFloat(t.balance_after).toFixed(2)}</TableCell>
                            <TableCell>{dayjs(t.created_at).format('D MMM YYYY HH:mm')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                )}

                {/* Status actions */}
                {detailOpen.status === 'active' && (
                  <Box mt={2} display="flex" gap={1}>
                    <Button size="small" color="error" variant="outlined"
                      onClick={() => handleStatusChange(detailOpen.id, 'cancelled')}>
                      Cancel Card
                    </Button>
                  </Box>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setDetailOpen(null)}>Close</Button>
              </DialogActions>
            </>
          )}
        </Dialog>
      </Box>
    </FeatureGate>
  );
}

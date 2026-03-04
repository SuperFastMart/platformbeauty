import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, TextField, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Chip, InputAdornment,
  Card, CardContent, CardActionArea, Grid, useMediaQuery, useTheme,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
  Checkbox
} from '@mui/material';
import { Search, ChevronRight, Add, Upload, Download, FilterList, Save, Close, Delete } from '@mui/icons-material';
import ConfirmDialog from '../../components/ConfirmDialog';
import dayjs from 'dayjs';
import api from '../../api/client';
import useSubscriptionTier from '../../hooks/useSubscriptionTier';
import CustomerImportDialog from '../../components/CustomerImportDialog';
import useTerminology from '../../hooks/useTerminology';
import useCurrency, { formatCurrency } from '../../hooks/useCurrency';

export default function Customers() {
  const navigate = useNavigate();
  const { hasAccess } = useSubscriptionTier();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { person, people } = useTerminology();
  const currency = useCurrency();

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Filters / Segmentation
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({});
  const [filteredCustomers, setFilteredCustomers] = useState(null);
  const [filtering, setFiltering] = useState(false);
  const [segments, setSegments] = useState([]);
  const [segmentName, setSegmentName] = useState('');
  const [saveSegOpen, setSaveSegOpen] = useState(false);

  const fetchCustomers = () => {
    api.get('/admin/customers')
      .then(({ data }) => setCustomers(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCustomers(); }, []);

  useEffect(() => {
    if (hasAccess('growth')) {
      api.get('/admin/segments').then(({ data }) => setSegments(data)).catch(() => {});
    }
  }, []);

  const applyFilters = async () => {
    setFiltering(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
      const { data } = await api.get(`/admin/customers/filter?${params.toString()}`);
      setFilteredCustomers(data);
    } catch {
      setSnackbar({ open: true, message: 'Filter failed', severity: 'error' });
    } finally {
      setFiltering(false);
    }
  };

  const clearFilters = () => {
    setFilters({});
    setFilteredCustomers(null);
  };

  const saveSegment = async () => {
    if (!segmentName) return;
    try {
      await api.post('/admin/segments', { name: segmentName, filters });
      setSnackbar({ open: true, message: 'Segment saved', severity: 'success' });
      setSaveSegOpen(false);
      setSegmentName('');
      const { data } = await api.get('/admin/segments');
      setSegments(data);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to save', severity: 'error' });
    }
  };

  const loadSegment = (seg) => {
    const f = typeof seg.filters === 'string' ? JSON.parse(seg.filters) : seg.filters;
    setFilters(f);
    setShowFilters(true);
    // auto-apply
    setTimeout(() => applyFilters(), 100);
  };

  const displayList = filteredCustomers || customers;
  const filtered = search
    ? displayList.filter(c =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search)
      )
    : displayList;

  const handleCreateCustomer = async () => {
    if (!form.name || !form.email) {
      setFormError('Name and email are required');
      return;
    }
    if (form.phone) {
      const clean = form.phone.replace(/[\s\-\(\)]/g, '');
      if (!/^\+?[0-9]{7,15}$/.test(clean)) {
        setFormError('Enter a valid phone number (7-15 digits)');
        return;
      }
    }
    setSubmitting(true);
    setFormError('');
    try {
      await api.post('/admin/customers', form);
      setSnackbar({ open: true, message: `${person} created`, severity: 'success' });
      setDialogOpen(false);
      setForm({ name: '', email: '', phone: '' });
      fetchCustomers();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const { data } = await api.post('/admin/customers/bulk-delete', { customerIds: [...selectedIds] });
      setSnackbar({ open: true, message: data.message, severity: 'success' });
      setSelectedIds(new Set());
      fetchCustomers();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Bulk delete failed', severity: 'error' });
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>{people}</Typography>
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <Chip label={`${filteredCustomers ? filteredCustomers.length : customers.length} ${filteredCustomers ? 'filtered' : 'total'}`} size="small" />
          {hasAccess('growth') && (
            <Button variant="outlined" size="small" startIcon={<FilterList />} onClick={() => setShowFilters(!showFilters)}>
              Filter
            </Button>
          )}
          <Button variant="outlined" size="small" startIcon={<Upload />} onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button variant="contained" size="small" startIcon={<Add />} onClick={() => setDialogOpen(true)}>
            Add
          </Button>
        </Box>
      </Box>

      {/* Segmentation filters */}
      {showFilters && hasAccess('growth') && (
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ py: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography variant="subtitle2" fontWeight={600}>Filter {people}</Typography>
              <Box display="flex" gap={1}>
                {segments.length > 0 && (
                  <TextField
                    select size="small" label="Load Segment" sx={{ minWidth: 140 }}
                    SelectProps={{ native: true }}
                    onChange={e => { const s = segments.find(s => s.id === parseInt(e.target.value)); if (s) loadSegment(s); }}
                  >
                    <option value="">—</option>
                    {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </TextField>
                )}
              </Box>
            </Box>
            <Grid container spacing={1.5}>
              <Grid item xs={6} sm={3}>
                <TextField fullWidth size="small" label={`Min spent (${currency.symbol})`} type="number"
                  value={filters.min_spent || ''} onChange={e => setFilters(f => ({ ...f, min_spent: e.target.value }))} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField fullWidth size="small" label={`Max spent (${currency.symbol})`} type="number"
                  value={filters.max_spent || ''} onChange={e => setFilters(f => ({ ...f, max_spent: e.target.value }))} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField fullWidth size="small" label="Min visits" type="number"
                  value={filters.min_visits || ''} onChange={e => setFilters(f => ({ ...f, min_visits: e.target.value }))} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField fullWidth size="small" label="Tags (comma-sep)" size="small"
                  value={filters.tags || ''} onChange={e => setFilters(f => ({ ...f, tags: e.target.value }))} />
              </Grid>
            </Grid>
            <Box display="flex" gap={1} mt={1.5}>
              <Button variant="contained" size="small" onClick={applyFilters} disabled={filtering}>
                {filtering ? 'Filtering...' : 'Apply'}
              </Button>
              {filteredCustomers && <Button size="small" onClick={clearFilters}>Clear</Button>}
              {Object.values(filters).some(v => v) && (
                <Button size="small" startIcon={<Save />} onClick={() => setSaveSegOpen(true)}>Save Segment</Button>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      <TextField
        placeholder="Search by name, email, or phone..."
        size="small" sx={{ mb: 2, maxWidth: isMobile ? '100%' : 400 }}
        fullWidth
        value={search}
        onChange={e => setSearch(e.target.value)}
        InputProps={{
          startAdornment: <InputAdornment position="start"><Search /></InputAdornment>
        }}
      />

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <Box display="flex" alignItems="center" gap={2} mb={2} p={1.5} borderRadius={2}
          sx={{ bgcolor: 'error.lighter', border: '1px solid', borderColor: 'error.light' }}>
          <Typography variant="body2" fontWeight={600}>
            {selectedIds.size} selected
          </Typography>
          <Button
            variant="outlined" color="error" size="small" startIcon={<Delete />}
            onClick={() => setConfirmOpen(true)} disabled={bulkDeleting}
          >
            {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
          </Button>
          <Button size="small" onClick={() => setSelectedIds(new Set())}>
            Clear Selection
          </Button>
        </Box>
      )}

      {loading ? (
        <Typography>Loading...</Typography>
      ) : filtered.length === 0 ? (
        <Typography color="text.secondary">
          {search ? `No ${people.toLowerCase()} match your search` : `No ${people.toLowerCase()} yet`}
        </Typography>
      ) : isMobile ? (
        /* Mobile: Card layout */
        <Grid container spacing={1.5}>
          {filtered.map(c => (
            <Grid item xs={12} key={c.id}>
              <Card variant="outlined">
                <CardActionArea onClick={() => navigate(`/admin/customers/${c.id}`)}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box display="flex" alignItems="center" gap={1}>
                        <Checkbox
                          size="small"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          onClick={e => e.stopPropagation()}
                          sx={{ p: 0.5 }}
                        />
                        <Box>
                          <Typography fontWeight={600}>{c.name}</Typography>
                          <Typography variant="body2" color="text.secondary">{c.email}</Typography>
                          {c.phone && (
                            <Typography variant="body2" color="text.secondary">{c.phone}</Typography>
                          )}
                        </Box>
                      </Box>
                      <ChevronRight color="action" />
                    </Box>
                    <Box display="flex" gap={1} mt={1} flexWrap="wrap">
                      <Chip label={`${c.booking_count || 0} bookings`} size="small" variant="outlined" />
                      <Chip label={formatCurrency(c.total_spent || 0, currency)} size="small" variant="outlined" />
                      {c.last_booking_date && (
                        <Chip label={dayjs(c.last_booking_date).format('D MMM YYYY')} size="small" variant="outlined" />
                      )}
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        /* Desktop: Table layout */
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    indeterminate={selectedIds.size > 0 && selectedIds.size < filtered.length}
                    onChange={toggleSelectAll}
                  />
                </TableCell>
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Email</strong></TableCell>
                <TableCell><strong>Phone</strong></TableCell>
                <TableCell><strong>Gender</strong></TableCell>
                <TableCell align="center"><strong>Bookings</strong></TableCell>
                <TableCell align="right"><strong>Total Spent</strong></TableCell>
                <TableCell><strong>Last Booking</strong></TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(c => (
                <TableRow
                  key={c.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/admin/customers/${c.id}`)}
                >
                  <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
                    <Checkbox size="small" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} />
                  </TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{c.email}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{c.phone || '-'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{c.gender || '-'}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={c.booking_count || 0} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(c.total_spent || 0, currency)}
                  </TableCell>
                  <TableCell>
                    {c.last_booking_date
                      ? dayjs(c.last_booking_date).format('D MMM YYYY')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small"><ChevronRight /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add Customer Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add {person}</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <TextField fullWidth label="Name" margin="normal" required
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <TextField fullWidth label="Email" type="email" margin="normal" required
            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <TextField fullWidth label="Phone" margin="normal"
            value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            helperText="Optional — 7 to 15 digits" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateCustomer} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Customer Import Dialog */}
      <CustomerImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={fetchCustomers}
        existingCustomers={customers}
      />

      {/* Save Segment Dialog */}
      <Dialog open={saveSegOpen} onClose={() => setSaveSegOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Save Segment</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Segment Name" margin="normal"
            value={segmentName} onChange={e => setSegmentName(e.target.value)} placeholder="e.g. High Spenders" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveSegOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveSegment} disabled={!segmentName}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? person.toLowerCase() : people.toLowerCase()}?`}
        message="This will permanently anonymise their personal data and remove their accounts. Booking revenue records will be preserved with anonymised data. This action cannot be undone."
        warning="This is a GDPR-compliant deletion. All personal data will be permanently removed."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleBulkDelete}
      />

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

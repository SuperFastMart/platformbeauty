import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, TextField, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Chip, InputAdornment,
  Card, CardContent, CardActionArea, Grid, useMediaQuery, useTheme,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert
} from '@mui/material';
import { Search, ChevronRight, Add, Upload, Download, FilterList, Save, Close } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import useSubscriptionTier from '../../hooks/useSubscriptionTier';

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

  // CSV Import
  const [importOpen, setImportOpen] = useState(false);
  const [importData, setImportData] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);

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

  const handleCsvFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { setSnackbar({ open: true, message: 'CSV has no data rows', severity: 'error' }); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      const rows = lines.slice(1).map(line => {
        const vals = line.match(/("([^"]|"")*"|[^,]*)/g)?.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || [];
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      });
      setImportData(rows);
      setImportResult(null);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const { data } = await api.post('/admin/customers/import', { customers: importData });
      setImportResult(data);
      if (data.imported > 0 || data.updated > 0) fetchCustomers();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Import failed', severity: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = 'name,email,phone,notes,tags\nJane Doe,jane@example.com,+447123456789,Regular client,"vip,loyal"';
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'customer_import_template.csv';
    a.click();
  };

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
      setSnackbar({ open: true, message: 'Customer created', severity: 'success' });
      setDialogOpen(false);
      setForm({ name: '', email: '', phone: '' });
      fetchCustomers();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Customers</Typography>
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <Chip label={`${filteredCustomers ? filteredCustomers.length : customers.length} ${filteredCustomers ? 'filtered' : 'total'}`} size="small" />
          {hasAccess('growth') && (
            <Button variant="outlined" size="small" startIcon={<FilterList />} onClick={() => setShowFilters(!showFilters)}>
              Filter
            </Button>
          )}
          {hasAccess('growth') && (
            <Button variant="outlined" size="small" startIcon={<Upload />} onClick={() => { setImportOpen(true); setImportData([]); setImportResult(null); }}>
              Import
            </Button>
          )}
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
              <Typography variant="subtitle2" fontWeight={600}>Filter Customers</Typography>
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
                <TextField fullWidth size="small" label="Min spent (£)" type="number"
                  value={filters.min_spent || ''} onChange={e => setFilters(f => ({ ...f, min_spent: e.target.value }))} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField fullWidth size="small" label="Max spent (£)" type="number"
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
        size="small" sx={{ mb: 3, maxWidth: isMobile ? '100%' : 400 }}
        fullWidth
        value={search}
        onChange={e => setSearch(e.target.value)}
        InputProps={{
          startAdornment: <InputAdornment position="start"><Search /></InputAdornment>
        }}
      />

      {loading ? (
        <Typography>Loading...</Typography>
      ) : filtered.length === 0 ? (
        <Typography color="text.secondary">
          {search ? 'No customers match your search' : 'No customers yet'}
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
                      <Box>
                        <Typography fontWeight={600}>{c.name}</Typography>
                        <Typography variant="body2" color="text.secondary">{c.email}</Typography>
                        {c.phone && (
                          <Typography variant="body2" color="text.secondary">{c.phone}</Typography>
                        )}
                      </Box>
                      <ChevronRight color="action" />
                    </Box>
                    <Box display="flex" gap={1} mt={1} flexWrap="wrap">
                      <Chip label={`${c.booking_count || 0} bookings`} size="small" variant="outlined" />
                      <Chip label={`£${parseFloat(c.total_spent || 0).toFixed(2)}`} size="small" variant="outlined" />
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
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Email</strong></TableCell>
                <TableCell><strong>Phone</strong></TableCell>
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
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{c.email}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{c.phone || '-'}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={c.booking_count || 0} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="right">
                    £{parseFloat(c.total_spent || 0).toFixed(2)}
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
        <DialogTitle>Add Customer</DialogTitle>
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

      {/* CSV Import Dialog */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import Customers</DialogTitle>
        <DialogContent>
          <Box display="flex" gap={1} mb={2}>
            <Button variant="outlined" size="small" startIcon={<Download />} onClick={downloadTemplate}>
              Download Template
            </Button>
          </Box>
          <input type="file" accept=".csv" onChange={handleCsvFile} style={{ marginBottom: 16 }} />
          {importData.length > 0 && !importResult && (
            <Box>
              <Typography variant="body2" mb={1}>{importData.length} row{importData.length !== 1 ? 's' : ''} found</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 200 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Phone</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importData.slice(0, 10).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.name || '—'}</TableCell>
                        <TableCell>{r.email || '—'}</TableCell>
                        <TableCell>{r.phone || '—'}</TableCell>
                      </TableRow>
                    ))}
                    {importData.length > 10 && (
                      <TableRow><TableCell colSpan={3}>...and {importData.length - 10} more</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
          {importResult && (
            <Box mt={2}>
              <Alert severity="success" sx={{ mb: 1 }}>
                {importResult.imported} created, {importResult.updated} updated, {importResult.skipped} skipped
              </Alert>
              {importResult.errors?.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="error" mb={0.5}>Errors:</Typography>
                  {importResult.errors.slice(0, 5).map((e, i) => (
                    <Typography key={i} variant="caption" display="block">Row {e.row} ({e.name}): {e.errors.join(', ')}</Typography>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)}>Close</Button>
          {importData.length > 0 && !importResult && (
            <Button variant="contained" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : `Import ${importData.length} Rows`}
            </Button>
          )}
        </DialogActions>
      </Dialog>

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

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

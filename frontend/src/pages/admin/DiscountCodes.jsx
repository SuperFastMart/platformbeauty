import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Snackbar, Alert, IconButton, useMediaQuery, useTheme
} from '@mui/material';
import { Add, Edit, Delete, Casino } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';

export default function DiscountCodes() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    code: '', description: '', discount_type: 'percentage', discount_value: '',
    max_uses: '', min_spend: '', category: '', expires_at: '', active: true,
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const fetchCodes = () => {
    setLoading(true);
    api.get('/admin/discount-codes')
      .then(({ data }) => setCodes(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCodes(); }, []);

  const resetForm = () => setForm({
    code: '', description: '', discount_type: 'percentage', discount_value: '',
    max_uses: '', min_spend: '', category: '', expires_at: '', active: true,
  });

  const openCreate = () => {
    resetForm();
    setEditing(null);
    setDialog(true);
  };

  const openEdit = (c) => {
    setEditing(c.id);
    setForm({
      code: c.code,
      description: c.description || '',
      discount_type: c.discount_type,
      discount_value: parseFloat(c.discount_value),
      max_uses: c.max_uses || '',
      min_spend: parseFloat(c.min_spend) || '',
      category: c.category || '',
      expires_at: c.expires_at ? dayjs(c.expires_at).format('YYYY-MM-DD') : '',
      active: c.active,
    });
    setDialog(true);
  };

  const generateCode = async () => {
    try {
      const { data } = await api.post('/admin/discount-codes/generate');
      setForm(f => ({ ...f, code: data.code }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        discount_value: parseFloat(form.discount_value),
        max_uses: form.max_uses ? parseInt(form.max_uses) : null,
        min_spend: form.min_spend ? parseFloat(form.min_spend) : 0,
        category: form.category || null,
        expires_at: form.expires_at || null,
      };

      if (editing) {
        await api.put(`/admin/discount-codes/${editing}`, payload);
        setSnackbar({ open: true, message: 'Code updated', severity: 'success' });
      } else {
        await api.post('/admin/discount-codes', payload);
        setSnackbar({ open: true, message: 'Code created', severity: 'success' });
      }
      setDialog(false);
      fetchCodes();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error', severity: 'error' });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this discount code?')) return;
    try {
      await api.delete(`/admin/discount-codes/${id}`);
      setSnackbar({ open: true, message: 'Code deleted', severity: 'success' });
      fetchCodes();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error', severity: 'error' });
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Discount Codes</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
          Create Code
        </Button>
      </Box>

      <Card>
        <CardContent>
          {loading ? (
            <Typography>Loading...</Typography>
          ) : codes.length === 0 ? (
            <Typography color="text.secondary">No discount codes yet</Typography>
          ) : (
            isMobile ? codes.map(c => (
              <Card key={c.id} variant="outlined" sx={{ mb: 1 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography fontWeight={600} fontFamily="monospace">{c.code}</Typography>
                      {c.description && (
                        <Typography variant="caption" color="text.secondary">{c.description}</Typography>
                      )}
                    </Box>
                    <Box display="flex" gap={0.5} ml={1}>
                      <Chip label={c.active ? 'Active' : 'Inactive'} size="small" color={c.active ? 'success' : 'default'} />
                    </Box>
                  </Box>
                  <Box display="flex" gap={1} mt={1} flexWrap="wrap" alignItems="center">
                    <Chip label={c.discount_type === 'percentage' ? `${parseFloat(c.discount_value)}%` : `£${parseFloat(c.discount_value).toFixed(2)} off`} size="small" variant="outlined" />
                    <Typography variant="caption" color="text.secondary">
                      {c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : ''} uses
                    </Typography>
                    {parseFloat(c.min_spend) > 0 && (
                      <Typography variant="caption" color="text.secondary">Min £{parseFloat(c.min_spend).toFixed(2)}</Typography>
                    )}
                    {c.category && <Chip label={c.category} size="small" sx={{ height: 20, fontSize: 11 }} />}
                    {c.expires_at && (
                      <Typography variant="caption" color="text.secondary">Expires {dayjs(c.expires_at).format('D MMM YY')}</Typography>
                    )}
                  </Box>
                  <Box display="flex" justifyContent="flex-end" mt={0.5}>
                    <IconButton size="small" onClick={() => openEdit(c)}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(c.id)}><Delete fontSize="small" /></IconButton>
                  </Box>
                </CardContent>
              </Card>
            )) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Code</TableCell>
                    <TableCell>Discount</TableCell>
                    <TableCell>Uses</TableCell>
                    <TableCell>Min Spend</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Expires</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {codes.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Typography fontWeight={600} fontFamily="monospace">{c.code}</Typography>
                        {c.description && (
                          <Typography variant="caption" color="text.secondary" display="block">{c.description}</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.discount_type === 'percentage'
                          ? `${parseFloat(c.discount_value)}%`
                          : `£${parseFloat(c.discount_value).toFixed(2)}`}
                      </TableCell>
                      <TableCell>
                        {c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : ''}
                      </TableCell>
                      <TableCell>
                        {parseFloat(c.min_spend) > 0 ? `£${parseFloat(c.min_spend).toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell>{c.category || '—'}</TableCell>
                      <TableCell>
                        {c.expires_at ? dayjs(c.expires_at).format('D MMM YYYY') : '—'}
                      </TableCell>
                      <TableCell>
                        <Chip label={c.active ? 'Active' : 'Inactive'} size="small" color={c.active ? 'success' : 'default'} />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEdit(c)}><Edit fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(c.id)}><Delete fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            )
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Discount Code' : 'Create Discount Code'}</DialogTitle>
        <DialogContent>
          <Box display="flex" gap={1} alignItems="flex-end">
            <TextField
              fullWidth label="Code" margin="normal" required
              value={form.code}
              onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              inputProps={{ style: { fontFamily: 'monospace', fontWeight: 600 } }}
            />
            {!editing && (
              <Button onClick={generateCode} sx={{ mb: 1, minWidth: 'auto' }} title="Generate random code">
                <Casino />
              </Button>
            )}
          </Box>
          <TextField
            fullWidth label="Description (optional)" margin="normal"
            value={form.description}
            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <Box display="flex" gap={2}>
            <TextField
              select fullWidth label="Type" margin="normal"
              value={form.discount_type}
              onChange={(e) => setForm(f => ({ ...f, discount_type: e.target.value }))}
            >
              <MenuItem value="percentage">Percentage (%)</MenuItem>
              <MenuItem value="fixed">Fixed Amount (£)</MenuItem>
            </TextField>
            <TextField
              fullWidth label="Value" type="number" margin="normal" required
              value={form.discount_value}
              onChange={(e) => setForm(f => ({ ...f, discount_value: e.target.value }))}
            />
          </Box>
          <Box display="flex" gap={2}>
            <TextField
              fullWidth label="Max Uses (blank = unlimited)" type="number" margin="normal"
              value={form.max_uses}
              onChange={(e) => setForm(f => ({ ...f, max_uses: e.target.value }))}
            />
            <TextField
              fullWidth label="Min Spend (£)" type="number" margin="normal"
              value={form.min_spend}
              onChange={(e) => setForm(f => ({ ...f, min_spend: e.target.value }))}
            />
          </Box>
          <TextField
            fullWidth label="Category (blank = all)" margin="normal"
            value={form.category}
            onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
            placeholder="e.g. Hair, Nails"
          />
          <TextField
            fullWidth label="Expires" type="date" margin="normal"
            value={form.expires_at}
            onChange={(e) => setForm(f => ({ ...f, expires_at: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.code || !form.discount_value}>
            {editing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

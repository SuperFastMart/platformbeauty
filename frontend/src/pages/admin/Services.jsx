import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Snackbar, Alert
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import api from '../../api/client';

const emptyService = { name: '', description: '', duration: 30, price: '', category: '', display_order: 0 };

export default function Services() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyService);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchServices = () => {
    api.get('/admin/services')
      .then(({ data }) => setServices(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchServices(); }, []);

  const handleOpen = (service = null) => {
    if (service) {
      setEditing(service);
      setForm({
        name: service.name, description: service.description || '',
        duration: service.duration, price: service.price,
        category: service.category || '', display_order: service.display_order || 0
      });
    } else {
      setEditing(null);
      setForm(emptyService);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await api.put(`/admin/services/${editing.id}`, form);
        setSnackbar({ open: true, message: 'Service updated', severity: 'success' });
      } else {
        await api.post('/admin/services', form);
        setSnackbar({ open: true, message: 'Service created', severity: 'success' });
      }
      setDialogOpen(false);
      fetchServices();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error saving service', severity: 'error' });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this service?')) return;
    try {
      await api.delete(`/admin/services/${id}`);
      setSnackbar({ open: true, message: 'Service deactivated', severity: 'success' });
      fetchServices();
    } catch (err) {
      setSnackbar({ open: true, message: 'Error deactivating service', severity: 'error' });
    }
  };

  // Group services by category
  const categories = {};
  services.forEach(s => {
    const cat = s.category || 'General';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(s);
  });

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Services</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()}>
          Add Service
        </Button>
      </Box>

      {loading ? (
        <Typography>Loading...</Typography>
      ) : Object.entries(categories).map(([category, items]) => (
        <Box key={category} mb={3}>
          <Typography variant="subtitle1" fontWeight={600} mb={1}>{category}</Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Typography fontWeight={500}>{s.name}</Typography>
                      {s.description && (
                        <Typography variant="body2" color="text.secondary">{s.description}</Typography>
                      )}
                    </TableCell>
                    <TableCell>{s.duration} min</TableCell>
                    <TableCell>£{parseFloat(s.price).toFixed(2)}</TableCell>
                    <TableCell>
                      <Chip label={s.active ? 'Active' : 'Inactive'} size="small"
                        color={s.active ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleOpen(s)}>
                        <Edit fontSize="small" />
                      </IconButton>
                      {s.active && (
                        <IconButton size="small" onClick={() => handleDelete(s.id)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ))}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Service' : 'New Service'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" margin="normal" required
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <TextField fullWidth label="Description" margin="normal" multiline rows={2}
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <Box display="flex" gap={2}>
            <TextField label="Duration (min)" type="number" margin="normal" required
              value={form.duration} onChange={e => setForm(f => ({ ...f, duration: parseInt(e.target.value) || 0 }))} />
            <TextField label="Price (£)" type="number" margin="normal" required inputProps={{ step: 0.01 }}
              value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
          </Box>
          <Box display="flex" gap={2}>
            <TextField fullWidth label="Category" margin="normal"
              value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            <TextField label="Display Order" type="number" margin="normal"
              value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Snackbar, Alert, Card, CardContent,
  MenuItem, Divider, useMediaQuery, useTheme
} from '@mui/material';
import { Add, Edit, Delete, ArrowUpward, ArrowDownward, DragIndicator } from '@mui/icons-material';
import api from '../../api/client';

const emptyService = { name: '', description: '', duration: 30, price: '', category: '', display_order: 0 };

export default function Services() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyService);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [categoryOrder, setCategoryOrder] = useState([]);
  const [orderChanged, setOrderChanged] = useState(false);
  const [newCategoryMode, setNewCategoryMode] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const fetchServices = () => {
    Promise.all([
      api.get('/admin/services'),
      api.get('/admin/site-settings'),
    ])
      .then(([servicesRes, settingsRes]) => {
        setServices(servicesRes.data);
        if (settingsRes.data.category_order) {
          setCategoryOrder(settingsRes.data.category_order);
        }
      })
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
    setNewCategoryMode(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const dur = parseInt(form.duration);
    const prc = parseFloat(form.price);
    if (isNaN(dur) || dur < 5 || dur > 480) {
      setSnackbar({ open: true, message: 'Duration must be between 5 and 480 minutes', severity: 'error' });
      return;
    }
    if (isNaN(prc) || prc < 0 || prc > 10000) {
      setSnackbar({ open: true, message: 'Price must be between 0 and 10,000', severity: 'error' });
      return;
    }
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

  // Get ordered category list
  const categoryNames = Object.keys(categories);
  const orderedCategories = [...categoryNames].sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // Ensure all categories are in the order array
  const fullOrder = [...categoryOrder.filter(c => categoryNames.includes(c)), ...categoryNames.filter(c => !categoryOrder.includes(c))];

  const moveCategory = (cat, direction) => {
    const newOrder = [...fullOrder];
    const idx = newOrder.indexOf(cat);
    if (idx === -1) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= newOrder.length) return;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    setCategoryOrder(newOrder);
    setOrderChanged(true);
  };

  const saveCategoryOrder = async () => {
    try {
      await api.put('/admin/site-settings/category_order', { value: fullOrder });
      setCategoryOrder(fullOrder);
      setOrderChanged(false);
      setSnackbar({ open: true, message: 'Category order saved', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to save order', severity: 'error' });
    }
  };

  // Existing category names for dropdown
  const existingCategories = [...new Set(services.map(s => s.category || 'General').filter(Boolean))];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Services</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()}>
          Add Service
        </Button>
      </Box>

      {/* Category Order */}
      {!loading && orderedCategories.length > 1 && (
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography variant="subtitle2" fontWeight={600}>Category Order</Typography>
              {orderChanged && (
                <Button size="small" variant="contained" onClick={saveCategoryOrder}>
                  Save Order
                </Button>
              )}
            </Box>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Arrange the order your service categories appear on your booking page.
            </Typography>
            {fullOrder.filter(c => categoryNames.includes(c)).map((cat, idx) => (
              <Box
                key={cat}
                display="flex"
                alignItems="center"
                gap={1}
                py={0.75}
                px={1.5}
                mb={0.5}
                sx={{
                  bgcolor: 'action.hover',
                  borderRadius: 2,
                }}
              >
                <DragIndicator sx={{ color: 'text.disabled', fontSize: 20 }} />
                <Typography variant="body2" fontWeight={500} flex={1}>{cat}</Typography>
                <Chip label={categories[cat]?.length || 0} size="small" sx={{ height: 22, fontSize: 12 }} />
                <IconButton
                  size="small"
                  disabled={idx === 0}
                  onClick={() => moveCategory(cat, -1)}
                >
                  <ArrowUpward fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  disabled={idx === fullOrder.filter(c => categoryNames.includes(c)).length - 1}
                  onClick={() => moveCategory(cat, 1)}
                >
                  <ArrowDownward fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Typography>Loading...</Typography>
      ) : orderedCategories.map(category => {
        const items = categories[category];
        if (!items) return null;
        return (
          <Box key={category} mb={3}>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>{category}</Typography>
            {isMobile ? (
              // Mobile: card layout
              items.map(s => (
                <Card key={s.id} variant="outlined" sx={{ mb: 1 }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                      <Box flex={1}>
                        <Typography fontWeight={500}>{s.name}</Typography>
                        {s.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.3 }}>{s.description}</Typography>
                        )}
                        <Box display="flex" gap={1.5} mt={0.5} alignItems="center">
                          <Typography variant="body2">{s.duration} min</Typography>
                          <Typography variant="body2" fontWeight={600}>£{parseFloat(s.price).toFixed(2)}</Typography>
                          <Chip label={s.active ? 'Active' : 'Inactive'} size="small"
                            color={s.active ? 'success' : 'default'} sx={{ height: 20, fontSize: 11 }} />
                        </Box>
                      </Box>
                      <Box display="flex" gap={0.5} ml={1}>
                        <IconButton size="small" onClick={() => handleOpen(s)}>
                          <Edit fontSize="small" />
                        </IconButton>
                        {s.active && (
                          <IconButton size="small" onClick={() => handleDelete(s.id)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))
            ) : (
              // Desktop: table layout
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell sx={{ width: 100 }}>Duration</TableCell>
                      <TableCell sx={{ width: 100 }}>Price</TableCell>
                      <TableCell sx={{ width: 90 }}>Status</TableCell>
                      <TableCell align="right" sx={{ width: 100 }}>Actions</TableCell>
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
            )}
          </Box>
        );
      })}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Service' : 'New Service'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" margin="normal" required
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <TextField fullWidth label="Description" margin="normal" multiline rows={2}
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <Box display="flex" gap={2}>
            <TextField
              label="Duration (min)" type="number" margin="normal" required sx={{ flex: 1 }}
              inputProps={{ min: 5, max: 480 }} helperText="5–480 minutes"
              value={form.duration} onChange={e => setForm(f => ({ ...f, duration: parseInt(e.target.value) || 0 }))}
            />
            <TextField
              label="Price (£)" type="number" margin="normal" required sx={{ flex: 1 }}
              inputProps={{ min: 0, max: 10000, step: 0.01 }}
              value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
            />
          </Box>
          {!newCategoryMode ? (
            <TextField
              fullWidth select label="Category" margin="normal"
              value={form.category}
              onChange={e => {
                if (e.target.value === '__new__') {
                  setNewCategoryMode(true);
                  setForm(f => ({ ...f, category: '' }));
                } else {
                  setForm(f => ({ ...f, category: e.target.value }));
                }
              }}
              helperText="Select an existing category or create a new one"
              SelectProps={{ native: false }}
            >
              {existingCategories.map(cat => (
                <MenuItem key={cat} value={cat}>{cat}</MenuItem>
              ))}
              <Divider />
              <MenuItem value="__new__" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                + Create new category...
              </MenuItem>
            </TextField>
          ) : (
            <Box display="flex" gap={1} alignItems="flex-start">
              <TextField
                fullWidth label="New Category Name" margin="normal"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Nails, Hair Cuts, Semi Perm Makeup"
                autoFocus
              />
              <Button
                size="small" sx={{ mt: 2.5 }}
                onClick={() => {
                  setNewCategoryMode(false);
                  if (!form.category) setForm(f => ({ ...f, category: existingCategories[0] || '' }));
                }}
              >
                Cancel
              </Button>
            </Box>
          )}
          <TextField
            label="Display Order" type="number" margin="normal"
            value={form.display_order}
            onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))}
            helperText="Order within the category (lower = first)"
            sx={{ width: 160 }}
          />
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

import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Switch, TextField, Button,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, Snackbar, Alert, FormControlLabel
} from '@mui/material';
import api from '../../api/client';

export default function Loyalty() {
  const [config, setConfig] = useState(null);
  const [stats, setStats] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Adjust dialog
  const [adjustDialog, setAdjustDialog] = useState(false);
  const [adjustCustomer, setAdjustCustomer] = useState(null);
  const [adjustCategory, setAdjustCategory] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      api.get('/admin/loyalty/config'),
      api.get('/admin/loyalty/stats'),
      api.get('/admin/loyalty/customers'),
    ])
      .then(([configRes, statsRes, customersRes]) => {
        setConfig(configRes.data);
        setStats(statsRes.data);
        setCustomers(customersRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const saveConfig = async () => {
    try {
      const { data } = await api.put('/admin/loyalty/config', config);
      setConfig(data);
      setSnackbar({ open: true, message: 'Loyalty settings saved', severity: 'success' });
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error saving', severity: 'error' });
    }
  };

  const handleAdjust = async () => {
    if (!adjustCategory || !adjustAmount) return;
    try {
      await api.post(`/admin/loyalty/adjust/${adjustCustomer.id}`, {
        category: adjustCategory,
        adjustment: parseInt(adjustAmount),
        reason: adjustReason,
      });
      setSnackbar({ open: true, message: 'Stamps adjusted', severity: 'success' });
      setAdjustDialog(false);
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error', severity: 'error' });
    }
  };

  if (loading || !config) return <Typography>Loading...</Typography>;

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>Loyalty Programme</Typography>

      {/* Config */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} mb={2}>Settings</Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.active}
                    onChange={(e) => setConfig(c => ({ ...c, active: e.target.checked }))}
                  />
                }
                label="Loyalty programme active"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth label="Stamps needed for reward" type="number"
                value={config.stamps_needed}
                onChange={(e) => setConfig(c => ({ ...c, stamps_needed: parseInt(e.target.value) || 1 }))}
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth label="Discount %" type="number"
                value={config.discount_percent}
                onChange={(e) => setConfig(c => ({ ...c, discount_percent: parseInt(e.target.value) || 1 }))}
                size="small"
                InputProps={{ inputProps: { min: 1, max: 100 } }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Button variant="contained" onClick={saveConfig}>Save Settings</Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Stats */}
      {stats && (
        <Grid container spacing={2} mb={3}>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" fontWeight={700}>{stats.total_active_stamps}</Typography>
                <Typography variant="body2" color="text.secondary">Active Stamps</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" fontWeight={700}>{stats.lifetime_stamps}</Typography>
                <Typography variant="body2" color="text.secondary">Lifetime Stamps</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" fontWeight={700}>{stats.total_redemptions}</Typography>
                <Typography variant="body2" color="text.secondary">Redemptions</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" fontWeight={700}>{stats.active_rewards}</Typography>
                <Typography variant="body2" color="text.secondary">Active Rewards</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Customer stamps table */}
      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} mb={2}>Customer Stamps</Typography>
          {customers.length === 0 ? (
            <Typography color="text.secondary">No customers yet</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Stamps</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {customers.map(c => {
                  const stampData = Array.isArray(c.stamp_data) ? c.stamp_data : [];
                  const hasStamps = stampData.some(s => s.stamps > 0);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.email}</TableCell>
                      <TableCell>
                        {hasStamps ? stampData.filter(s => s.stamps > 0).map(s => (
                          <Chip
                            key={s.category}
                            label={`${s.category}: ${s.stamps}/${config.stamps_needed}`}
                            size="small"
                            color={s.stamps >= config.stamps_needed ? 'success' : 'default'}
                            sx={{ mr: 0.5, mb: 0.5 }}
                          />
                        )) : (
                          <Typography variant="body2" color="text.secondary">No stamps</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          onClick={() => {
                            setAdjustCustomer(c);
                            setAdjustCategory('');
                            setAdjustAmount('');
                            setAdjustReason('');
                            setAdjustDialog(true);
                          }}
                        >
                          Adjust
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Adjust Dialog */}
      <Dialog open={adjustDialog} onClose={() => setAdjustDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Adjust Stamps — {adjustCustomer?.name}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Category" margin="normal"
            value={adjustCategory}
            onChange={(e) => setAdjustCategory(e.target.value)}
            placeholder="e.g. Hair, Nails"
          />
          <TextField
            fullWidth label="Adjustment (+/-)" type="number" margin="normal"
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(e.target.value)}
            helperText="Positive to add, negative to remove"
          />
          <TextField
            fullWidth label="Reason (optional)" margin="normal"
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdjust} disabled={!adjustCategory || !adjustAmount}>
            Adjust Stamps
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

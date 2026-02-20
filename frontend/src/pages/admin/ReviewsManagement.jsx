import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Table, TableHead, TableRow,
  TableCell, TableBody, IconButton, Chip, Rating, Snackbar, Alert
} from '@mui/material';
import { Visibility, VisibilityOff, Delete } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';

export default function ReviewsManagement() {
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchData = () => {
    setLoading(true);
    api.get('/admin/reviews')
      .then(({ data }) => {
        setReviews(data.reviews);
        setStats(data.stats);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const toggleVisibility = async (id) => {
    try {
      await api.patch(`/admin/reviews/${id}/toggle`);
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: 'Error toggling visibility', severity: 'error' });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this review permanently?')) return;
    try {
      await api.delete(`/admin/reviews/${id}`);
      setSnackbar({ open: true, message: 'Review deleted', severity: 'success' });
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: 'Error deleting review', severity: 'error' });
    }
  };

  if (loading) return <Typography>Loading...</Typography>;

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>Reviews</Typography>

      {/* Stats */}
      {stats && (
        <Grid container spacing={2} mb={3}>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" fontWeight={700}>{stats.average_rating}</Typography>
                <Rating value={stats.average_rating} precision={0.1} readOnly size="small" />
                <Typography variant="body2" color="text.secondary">{stats.total} reviews</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" fontWeight={700}>{stats.visible_count}</Typography>
                <Typography variant="body2" color="text.secondary">Visible</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" fontWeight={700}>{stats.five_star}</Typography>
                <Typography variant="body2" color="text.secondary">5-Star</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" fontWeight={700} color={stats.low_star > 0 ? 'error.main' : 'text.primary'}>
                  {stats.low_star}
                </Typography>
                <Typography variant="body2" color="text.secondary">Low (1-2 Star)</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Reviews table */}
      <Card>
        <CardContent>
          {reviews.length === 0 ? (
            <Typography color="text.secondary">No reviews yet</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell>Rating</TableCell>
                  <TableCell>Comment</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reviews.map(r => (
                  <TableRow key={r.id} sx={{ opacity: r.visible ? 1 : 0.5 }}>
                    <TableCell>{r.customer_name}</TableCell>
                    <TableCell>
                      <Rating value={r.rating} readOnly size="small" />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>
                      <Typography variant="body2" noWrap>{r.comment || '—'}</Typography>
                    </TableCell>
                    <TableCell>{r.service_category || '—'}</TableCell>
                    <TableCell>{dayjs(r.created_at).format('D MMM YYYY')}</TableCell>
                    <TableCell>
                      <Chip
                        label={r.visible ? 'Visible' : 'Hidden'}
                        size="small"
                        color={r.visible ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => toggleVisibility(r.id)}
                        title={r.visible ? 'Hide' : 'Show'}>
                        {r.visible ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(r.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, IconButton, Chip, Rating, Snackbar, Alert,
  useMediaQuery, useTheme, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, LinearProgress
} from '@mui/material';
import { Visibility, VisibilityOff, Delete, Upload } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import useSubscriptionTier from '../../hooks/useSubscriptionTier';
import FeatureGate from '../../components/FeatureGate';
import useTerminology from '../../hooks/useTerminology';

export default function ReviewsManagement() {
  const { person } = useTerminology();
  const { hasAccess } = useSubscriptionTier();
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importParsed, setImportParsed] = useState([]);
  const [importing, setImporting] = useState(false);

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

  // Parse pasted Fresha reviews text
  const parseReviewsText = (text) => {
    const reviews = [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let i = 0;
    while (i < lines.length) {
      // Skip avatar lines like "The avatar of Name"
      if (lines[i].startsWith('The avatar of ')) { i++; continue; }
      // Skip single-letter initials
      if (lines[i].length === 1 && /^[A-Z]$/.test(lines[i])) { i++; continue; }

      // Try to find a name line followed by a date line
      const nameLine = lines[i];
      // Check if next line is a date pattern
      if (i + 1 < lines.length) {
        const dateLine = lines[i + 1];
        // Match: "28 Feb 2026, 6:57 pm at ..." or "6 Dec 2024, 4:33 pm at ..."
        const dateMatch = dateLine.match(/^(\d{1,2}\s+\w+\s+\d{4}),\s+(\d{1,2}:\d{2}\s*[ap]m)\s+at\s+/i);
        if (dateMatch) {
          // Next line should be rating
          const ratingLine = i + 2 < lines.length ? lines[i + 2] : '';
          const ratingMatch = ratingLine.match(/(\d)\s*rating/);
          const rating = ratingMatch ? parseInt(ratingMatch[1]) : 5;

          // Collect comment lines until next review starts
          let comment = '';
          let j = i + 3;
          while (j < lines.length) {
            // Check if this is a new review (name + date pattern ahead)
            if (lines[j].startsWith('The avatar of ') || (lines[j].length === 1 && /^[A-Z]$/.test(lines[j]))) break;
            if (j + 1 < lines.length && lines[j + 1].match(/^\d{1,2}\s+\w+\s+\d{4},\s+\d{1,2}:\d{2}\s*[ap]m\s+at\s+/i)) break;
            comment += (comment ? ' ' : '') + lines[j];
            j++;
          }

          // Parse date
          const dateStr = dateMatch[1] + ' ' + dateMatch[2];
          let parsedDate;
          try {
            parsedDate = new Date(dateStr).toISOString();
          } catch {
            parsedDate = new Date().toISOString();
          }

          reviews.push({
            customer_name: nameLine,
            rating,
            comment: comment || null,
            date: parsedDate,
          });
          i = j;
          continue;
        }
      }
      i++;
    }
    return reviews;
  };

  const handleParseImport = () => {
    const parsed = parseReviewsText(importText);
    setImportParsed(parsed);
  };

  const handleImport = async () => {
    if (importParsed.length === 0) return;
    setImporting(true);
    try {
      const { data } = await api.post('/admin/reviews/import', { reviews: importParsed });
      setSnackbar({ open: true, message: `Imported ${data.imported} reviews successfully`, severity: 'success' });
      setImportOpen(false);
      setImportText('');
      setImportParsed([]);
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: 'Error importing reviews', severity: 'error' });
    } finally {
      setImporting(false);
    }
  };

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
  if (!hasAccess('pro')) return <FeatureGate requiredTier="pro" featureName="Review Collection" />;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Reviews</Typography>
        <Button variant="outlined" startIcon={<Upload />} onClick={() => setImportOpen(true)}>
          Import Reviews
        </Button>
      </Box>

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
            isMobile ? reviews.map(r => (
              <Card key={r.id} variant="outlined" sx={{ mb: 1, opacity: r.visible ? 1 : 0.5 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography fontWeight={500}>{r.customer_name}</Typography>
                    <Rating value={r.rating} readOnly size="small" />
                  </Box>
                  {r.comment && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {r.comment}
                    </Typography>
                  )}
                  <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
                    <Box display="flex" gap={0.5} flexWrap="wrap">
                      <Typography variant="caption" color="text.secondary">{dayjs(r.created_at).format('D MMM YY')}</Typography>
                      {r.service_category && <Chip label={r.service_category} size="small" sx={{ height: 20, fontSize: 11 }} />}
                      <Chip label={r.visible ? 'Visible' : 'Hidden'} size="small" color={r.visible ? 'success' : 'default'} sx={{ height: 20, fontSize: 11 }} />
                    </Box>
                    <Box>
                      <IconButton size="small" onClick={() => toggleVisibility(r.id)}>
                        {r.visible ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(r.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            )) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{person}</TableCell>
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
                        <Chip label={r.visible ? 'Visible' : 'Hidden'} size="small" color={r.visible ? 'success' : 'default'} />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => toggleVisibility(r.id)} title={r.visible ? 'Hide' : 'Show'}>
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
            </TableContainer>
            )
          )}
        </CardContent>
      </Card>

      {/* Import Dialog */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Import Reviews</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Paste your reviews from Fresha or another platform. The format should include the reviewer name,
            date, rating, and comment. Each review will be parsed automatically.
          </Typography>
          <TextField
            fullWidth multiline rows={10}
            placeholder={"Paste reviews here...\n\nExample format:\nSian P\n28 Feb 2026, 6:57 pm at Business Name\n5 rating\nLove my nails."}
            value={importText}
            onChange={(e) => { setImportText(e.target.value); setImportParsed([]); }}
            sx={{ mb: 2, '& textarea': { fontFamily: 'monospace', fontSize: 12 } }}
          />
          {importParsed.length === 0 && importText.length > 0 && (
            <Button variant="outlined" onClick={handleParseImport}>
              Parse Reviews
            </Button>
          )}
          {importParsed.length > 0 && (
            <Box>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                Found {importParsed.length} reviews to import:
              </Typography>
              <Box sx={{ maxHeight: 200, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1 }}>
                {importParsed.map((r, i) => (
                  <Box key={i} display="flex" justifyContent="space-between" py={0.5} borderBottom="1px solid" sx={{ borderColor: 'divider' }}>
                    <Typography variant="body2">{r.customer_name}</Typography>
                    <Box display="flex" gap={1} alignItems="center">
                      <Rating value={r.rating} readOnly size="small" />
                      <Typography variant="caption" color="text.secondary">
                        {new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
          {importing && <LinearProgress sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={importParsed.length === 0 || importing}
            onClick={handleImport}
          >
            Import {importParsed.length > 0 ? `(${importParsed.length})` : ''}
          </Button>
        </DialogActions>
      </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

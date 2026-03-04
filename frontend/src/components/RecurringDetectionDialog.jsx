import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Alert, Chip, CircularProgress,
  IconButton, Card, CardContent, Switch, TextField,
  Checkbox, FormControlLabel,
} from '@mui/material';
import { Close, Repeat, CheckCircle, Schedule } from '@mui/icons-material';
import api from '../api/client';

const FREQUENCY_LABELS = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  '4-weekly': 'Every 4 Weeks',
  monthly: 'Monthly',
};

function formatFrequency(freq) {
  return FREQUENCY_LABELS[freq] || freq;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function RecurringDetectionDialog({ open, onClose, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [patterns, setPatterns] = useState([]);
  const [totalAnalysed, setTotalAnalysed] = useState(0);
  const [selected, setSelected] = useState({});
  const [continueForward, setContinueForward] = useState({});
  const [continueCounts, setContinueCounts] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const detectPatterns = useCallback(async () => {
    setLoading(true);
    setError('');
    setPatterns([]);
    setResult(null);
    try {
      const { data } = await api.post('/admin/bookings/detect-recurring');
      setPatterns(data.patterns || []);
      setTotalAnalysed(data.total_analysed || 0);

      // Default all patterns to selected
      const sel = {};
      const cont = {};
      const counts = {};
      (data.patterns || []).forEach((_, i) => {
        sel[i] = true;
        cont[i] = false;
        counts[i] = 4;
      });
      setSelected(sel);
      setContinueForward(cont);
      setContinueCounts(counts);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to detect recurring patterns.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      detectPatterns();
    }
  }, [open, detectPatterns]);

  const handleToggleSelected = (index) => {
    setSelected((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleToggleContinue = (index) => {
    setContinueForward((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleCountChange = (index, value) => {
    const num = Math.max(1, Math.min(52, parseInt(value) || 1));
    setContinueCounts((prev) => ({ ...prev, [index]: num }));
  };

  const selectedPatterns = patterns.filter((_, i) => selected[i]);
  const selectedCount = selectedPatterns.length;

  const handleConfirm = async () => {
    setConfirming(true);
    setError('');
    try {
      const payload = patterns
        .map((p, i) => {
          if (!selected[i]) return null;
          return {
            booking_ids: p.booking_ids,
            frequency: p.frequency,
            continueForward: continueForward[i] || false,
            continueCount: continueForward[i] ? continueCounts[i] : 0,
          };
        })
        .filter(Boolean);

      const { data } = await api.post('/admin/bookings/confirm-recurring', { patterns: payload });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to confirm recurring patterns.');
    } finally {
      setConfirming(false);
    }
  };

  const handleClose = () => {
    setLoading(false);
    setPatterns([]);
    setTotalAnalysed(0);
    setSelected({});
    setContinueForward({});
    setContinueCounts({});
    setConfirming(false);
    setError('');
    setResult(null);
    onClose();
  };

  const handleDone = () => {
    onComplete();
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Repeat />
          Recurring Pattern Detection
        </Box>
        <IconButton onClick={handleClose} size="small"><Close /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Loading state */}
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              Analysing bookings for recurring patterns...
            </Typography>
          </Box>
        )}

        {/* Error state */}
        {error && !loading && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}

        {/* No patterns found */}
        {!loading && !error && !result && patterns.length === 0 && totalAnalysed > 0 && (
          <Alert severity="info">
            No recurring patterns detected across {totalAnalysed} analysed booking{totalAnalysed !== 1 ? 's' : ''}.
          </Alert>
        )}

        {/* Patterns list */}
        {!loading && !result && patterns.length > 0 && (
          <Box>
            <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
              Analysed {totalAnalysed} booking{totalAnalysed !== 1 ? 's' : ''} and
              found {patterns.length} recurring pattern{patterns.length !== 1 ? 's' : ''}.
              Review and confirm the ones you would like to mark as recurring.
            </Alert>

            {patterns.map((pattern, index) => (
              <Card
                key={index}
                sx={{
                  boxShadow: 'none',
                  border: '1px solid',
                  borderColor: selected[index] ? 'primary.main' : 'divider',
                  borderRadius: '12px',
                  mb: 1.5,
                  transition: 'border-color 0.2s ease',
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Checkbox
                      checked={!!selected[index]}
                      onChange={() => handleToggleSelected(index)}
                      sx={{ mt: -0.5 }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Top row: customer, service, frequency */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography variant="subtitle1" fontWeight={700}>
                          {pattern.customer_name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {pattern.service_names}
                        </Typography>
                        <Chip
                          icon={<Repeat sx={{ fontSize: 16 }} />}
                          label={formatFrequency(pattern.frequency)}
                          size="small"
                          sx={{
                            bgcolor: '#8B263515',
                            color: '#8B2635',
                            fontWeight: 600,
                          }}
                        />
                      </Box>

                      {/* Day and time */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        <Schedule sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {pattern.day_of_week}s, {pattern.start_time} - {pattern.end_time}
                        </Typography>
                      </Box>

                      {/* Details row */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          {pattern.booking_count} appointment{pattern.booking_count !== 1 ? 's' : ''} found
                          ({formatDate(pattern.first_date)} - {formatDate(pattern.last_date)})
                        </Typography>
                        <Chip
                          label={`${pattern.confidence}% confidence`}
                          size="small"
                          variant="outlined"
                          color={pattern.confidence >= 80 ? 'success' : pattern.confidence >= 60 ? 'warning' : 'default'}
                          sx={{ fontSize: '0.7rem', height: 22 }}
                        />
                      </Box>

                      {/* Continue series toggle */}
                      {selected[index] && (
                        <Box sx={{ mt: 1, pl: 0.5 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={!!continueForward[index]}
                                onChange={() => handleToggleContinue(index)}
                                size="small"
                              />
                            }
                            label={
                              <Typography variant="body2">Continue series</Typography>
                            }
                          />

                          {continueForward[index] && (
                            <Box sx={{ mt: 1, pl: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">
                                  Create next
                                </Typography>
                                <TextField
                                  type="number"
                                  size="small"
                                  value={continueCounts[index] || 4}
                                  onChange={(e) => handleCountChange(index, e.target.value)}
                                  inputProps={{ min: 1, max: 52 }}
                                  sx={{ width: 80 }}
                                />
                                <Typography variant="body2" color="text.secondary">
                                  appointment{(continueCounts[index] || 4) !== 1 ? 's' : ''}
                                </Typography>
                              </Box>

                              {pattern.suggested_next_dates?.length > 0 && (
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                  {pattern.suggested_next_dates
                                    .slice(0, continueCounts[index] || 4)
                                    .map((date) => (
                                      <Chip
                                        key={date}
                                        label={formatDate(date)}
                                        size="small"
                                        variant="outlined"
                                        sx={{ fontSize: '0.7rem', height: 22 }}
                                      />
                                    ))}
                                </Box>
                              )}
                            </Box>
                          )}
                        </Box>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}

        {/* Success result */}
        {result && (
          <Box>
            <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2 }}>
              {result.confirmed !== undefined && (
                <span>
                  <strong>{result.confirmed}</strong> recurring pattern{result.confirmed !== 1 ? 's' : ''} confirmed.
                </span>
              )}
              {result.created !== undefined && result.created > 0 && (
                <span>
                  {' '}<strong>{result.created}</strong> new appointment{result.created !== 1 ? 's' : ''} created.
                </span>
              )}
            </Alert>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {!result ? (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleConfirm}
              disabled={loading || confirming || selectedCount === 0}
              startIcon={confirming ? <CircularProgress size={18} /> : <CheckCircle />}
            >
              {confirming
                ? 'Confirming...'
                : `Confirm Selected (${selectedCount})`}
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={handleDone}>Done</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

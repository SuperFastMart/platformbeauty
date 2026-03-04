import { useState, useMemo } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Alert, Chip,
  LinearProgress, IconButton, Tooltip,
} from '@mui/material';
import {
  CloudUpload, CheckCircle, Error as ErrorIcon,
  Warning, Download, Close,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import api from '../api/client';
import useCurrency, { formatCurrency } from '../hooks/useCurrency';

dayjs.extend(customParseFormat);

const HEADER_MAP = {
  client: ['client', 'customer', 'client name', 'customer name', 'name'],
  status: ['status', 'booking status', 'appt. status'],
  scheduled_date: ['scheduled date', 'date', 'appointment date', 'appt. date'],
  service: ['service', 'service name', 'treatment'],
  duration: ['duration (mins)', 'duration', 'length', 'time'],
  slot: ['appt. slot', 'time slot', 'time', 'slot'],
  price: ['net sales', 'price', 'amount', 'total', 'cost', 'fee'],
  category: ['category', 'service category', 'group'],
};

function detectMapping(headers) {
  const mapping = {};
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const [field, aliases] of Object.entries(HEADER_MAP)) {
    const idx = lower.findIndex(h => aliases.includes(h));
    if (idx !== -1) mapping[field] = headers[idx];
  }
  return mapping;
}

function parseDuration(value) {
  if (!value) return NaN;
  const str = String(value).trim().toLowerCase();
  if (/^\d+$/.test(str)) return parseInt(str);
  const hm = str.match(/(\d+)\s*h(?:ours?|rs?)?\s*(\d+)?\s*m?(?:ins?|inutes?)?/);
  if (hm) return parseInt(hm[1]) * 60 + (parseInt(hm[2]) || 0);
  const mOnly = str.match(/^(\d+)\s*m(?:ins?|inutes?)?$/);
  if (mOnly) return parseInt(mOnly[1]);
  const colon = str.match(/^(\d+):(\d{2})$/);
  if (colon) return parseInt(colon[1]) * 60 + parseInt(colon[2]);
  return NaN;
}

function parsePrice(value) {
  if (value === undefined || value === null || value === '') return 0;
  return parseFloat(String(value).replace(/[£$€,\s]/g, '')) || 0;
}

function parseDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  // Fresha format: "07 May 2027, 11:00am"
  const fresha = dayjs(str, 'DD MMM YYYY, h:mma');
  if (fresha.isValid()) return fresha.format('YYYY-MM-DD');
  // Standard formats
  const standard = dayjs(str);
  if (standard.isValid()) return standard.format('YYYY-MM-DD');
  return null;
}

function parseSlot(value) {
  if (!value) return { start: null, end: null };
  const str = String(value).trim();
  // "11:00:00-12:30:00" or "11:00-12:30"
  const match = str.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (match) {
    return { start: match[1].slice(0, 5), end: match[2].slice(0, 5) };
  }
  return { start: null, end: null };
}

function downloadTemplate() {
  const csv = 'Client,Service,Date,Start Time,End Time,Price,Status,Notes\nJane Doe,Gel Nails,2026-03-15,09:00,10:30,35,confirmed,';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'boukd-bookings-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function parseFile(file, onComplete, onError) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (data.length === 0) { onError('No data found in the spreadsheet'); return; }
        onComplete(data, Object.keys(data[0]));
      } catch {
        onError('Failed to read spreadsheet.');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (result) => {
        if (result.data.length === 0) { onError('No data found in the CSV file'); return; }
        onComplete(result.data, result.meta.fields || []);
      },
      error: () => onError('Failed to read CSV file.'),
    });
  }
}

const STATUS_MAP = {
  'new': 'confirmed', 'confirmed': 'confirmed', 'completed': 'completed',
  'cancelled': 'cancelled', 'no-show': 'confirmed', 'pending': 'pending',
};

export default function BookingImportDialog({ open, onClose, onComplete }) {
  const currency = useCurrency();
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [parseError, setParseError] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [enablingNotifs, setEnablingNotifs] = useState(false);

  const mapped = useMemo(() => {
    if (!mapping.client) return [];
    return rows.map((raw, i) => {
      const client = String(raw[mapping.client] || '').trim();
      const serviceName = mapping.service ? String(raw[mapping.service] || '').trim() : '';
      const rawDate = mapping.scheduled_date ? String(raw[mapping.scheduled_date] || '') : '';
      const rawDuration = mapping.duration ? String(raw[mapping.duration] || '') : '';
      const rawSlot = mapping.slot ? String(raw[mapping.slot] || '') : '';
      const rawPrice = mapping.price ? raw[mapping.price] : '';
      const rawStatus = mapping.status ? String(raw[mapping.status] || '').trim().toLowerCase() : 'confirmed';

      const date = parseDate(rawDate);
      const duration = parseDuration(rawDuration);
      const price = parsePrice(rawPrice);
      const { start, end } = parseSlot(rawSlot);
      const status = STATUS_MAP[rawStatus] || 'confirmed';

      // If no slot column, try separate start/end columns
      const startTime = start || (mapping.start_time ? String(raw[mapping.start_time] || '').trim().slice(0, 5) : null);
      const endTime = end || (mapping.end_time ? String(raw[mapping.end_time] || '').trim().slice(0, 5) : null);

      const errors = [];
      if (!client) errors.push('Client name is required');
      if (!date) errors.push('Valid date is required');
      if (!startTime || !endTime) errors.push('Start and end time are required');

      return {
        row: i + 1, client, service: serviceName, date, start_time: startTime, end_time: endTime,
        duration: isNaN(duration) ? null : duration, price, status, rawStatus,
        errors, valid: errors.length === 0,
      };
    });
  }, [rows, mapping]);

  const validCount = mapped.filter(r => r.valid).length;
  const errorCount = mapped.filter(r => !r.valid).length;
  const cancelledCount = mapped.filter(r => r.status === 'cancelled').length;

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');

    parseFile(
      file,
      (data, headers) => {
        const detected = detectMapping(headers);
        // Also check for separate start_time/end_time columns
        const lower = headers.map(h => h.toLowerCase().trim());
        const startIdx = lower.findIndex(h => ['start time', 'start_time', 'from'].includes(h));
        const endIdx = lower.findIndex(h => ['end time', 'end_time', 'to'].includes(h));
        if (startIdx !== -1) detected.start_time = headers[startIdx];
        if (endIdx !== -1) detected.end_time = headers[endIdx];

        if (!detected.client) {
          setParseError(`Could not find a "Client" or "Customer" column. Detected headers: ${headers.join(', ')}`);
          return;
        }
        setMapping(detected);
        setRows(data);
        setStep(1);
      },
      (err) => setParseError(err)
    );
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const payload = mapped.filter(r => r.valid).map(r => ({
        customer_name: r.client,
        service_name: r.service || null,
        date: r.date,
        start_time: r.start_time,
        end_time: r.end_time,
        price: r.price,
        duration: r.duration,
        status: r.status,
      }));
      const { data } = await api.post('/admin/bookings/import', { bookings: payload });
      setResults(data);
      setStep(2);
    } catch (err) {
      setResults({ error: err.response?.data?.error || 'Import failed', imported: 0, skipped: 0, errors: [] });
      setStep(2);
    } finally {
      setImporting(false);
    }
  };

  const enableNotifications = async () => {
    setEnablingNotifs(true);
    try {
      const { data } = await api.post('/admin/bookings/import/enable-notifications');
      setNotificationsEnabled(true);
      setResults(prev => ({ ...prev, notificationsEnabled: data.updated }));
    } catch {
      // silently ignore
    } finally {
      setEnablingNotifs(false);
    }
  };

  const handleClose = () => {
    setStep(0); setRows([]); setMapping({}); setImporting(false); setResults(null);
    setParseError(''); setNotificationsEnabled(false);
    onClose();
  };

  const handleDone = () => { handleClose(); onComplete(); };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Import Bookings
        <IconButton onClick={handleClose} size="small"><Close /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {step === 0 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              Import bookings from a CSV or Excel file. Fresha appointment exports are supported automatically.
            </Alert>
            <Alert severity="warning" variant="outlined" sx={{ mb: 3 }}>
              Imported bookings will <strong>not</strong> trigger any email or SMS notifications.
              Import your customers first so bookings can be linked to their profiles.
            </Alert>
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              <Button variant="outlined" startIcon={<Download />} onClick={downloadTemplate}>
                Download Template
              </Button>
            </Box>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Required columns: <strong>Client</strong>, <strong>Date</strong>, <strong>Time Slot</strong> (or Start/End Time).
              Optional: Service, Price, Duration, Status.
            </Typography>
            <Box
              sx={{
                border: '2px dashed', borderColor: 'divider', borderRadius: 2, p: 4,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                cursor: 'pointer', '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
              }}
              component="label"
            >
              <input type="file" accept=".csv,.xlsx,.xls" hidden onChange={handleFile} />
              <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body1" fontWeight={600}>Click to upload your file</Typography>
              <Typography variant="caption" color="text.secondary">
                Supports CSV, Excel (.xlsx), and Fresha exports
              </Typography>
            </Box>
            {parseError && <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>}
          </Box>
        )}

        {step === 1 && (
          <Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip icon={<CheckCircle />} label={`${validCount} valid`} color="success" size="small" />
              {errorCount > 0 && <Chip icon={<ErrorIcon />} label={`${errorCount} errors`} color="error" size="small" />}
              {cancelledCount > 0 && <Chip icon={<Warning />} label={`${cancelledCount} cancelled`} color="warning" size="small" />}
              <Chip label={`${mapped.length} total rows`} variant="outlined" size="small" />
            </Box>

            {!mapping.scheduled_date && !mapping.start_time && (
              <Alert severity="warning" sx={{ mb: 2 }}>No date or time column detected. Most rows will fail validation.</Alert>
            )}

            <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
              No notifications will be sent for imported bookings.
            </Alert>

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell width={40}>#</TableCell>
                    <TableCell width={40}>Status</TableCell>
                    <TableCell>Client</TableCell>
                    <TableCell>Service</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell>Booking Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mapped.map((r) => (
                    <TableRow
                      key={r.row}
                      sx={{
                        bgcolor: !r.valid ? 'error.50' : r.status === 'cancelled' ? 'rgba(0,0,0,0.04)' : undefined,
                      }}
                    >
                      <TableCell>{r.row}</TableCell>
                      <TableCell>
                        {!r.valid ? (
                          <Tooltip title={r.errors.join(', ')}><ErrorIcon color="error" fontSize="small" /></Tooltip>
                        ) : (
                          <CheckCircle color="success" fontSize="small" />
                        )}
                      </TableCell>
                      <TableCell>{r.client || <em style={{ color: '#999' }}>empty</em>}</TableCell>
                      <TableCell>{r.service || '—'}</TableCell>
                      <TableCell>{r.date || '—'}</TableCell>
                      <TableCell>{r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : '—'}</TableCell>
                      <TableCell align="right">{r.price ? formatCurrency(r.price, currency) : '—'}</TableCell>
                      <TableCell>
                        <Chip
                          label={r.status}
                          size="small"
                          color={r.status === 'confirmed' ? 'success' : r.status === 'cancelled' ? 'default' : 'warning'}
                          variant="outlined"
                          sx={{ textTransform: 'capitalize' }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {importing && <LinearProgress sx={{ mt: 2 }} />}
          </Box>
        )}

        {step === 2 && results && (
          <Box>
            {results.error && !results.imported ? (
              <Alert severity="error" sx={{ mb: 2 }}>{results.error}</Alert>
            ) : (
              <Alert severity="success" sx={{ mb: 2 }}>
                <strong>{results.imported}</strong> bookings imported.
                {results.skipped > 0 && ` ${results.skipped} skipped.`}
              </Alert>
            )}
            {results.errors?.length > 0 && (
              <Box>
                <Typography variant="subtitle2" mb={1}>Errors:</Typography>
                {results.errors.slice(0, 10).map((e, i) => (
                  <Alert key={i} severity="error" sx={{ mb: 1 }}>
                    Row {e.row} ({e.name}): {e.errors.join(', ')}
                  </Alert>
                ))}
              </Box>
            )}
            {results.imported > 0 && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                <Typography variant="subtitle2" mb={1}>Notifications</Typography>
                <Typography variant="body2" color="text.secondary" mb={1.5}>
                  Imported bookings have notifications disabled by default. If you'd like reminders
                  (email/SMS) to be sent for future imported bookings, you can enable them now.
                </Typography>
                {notificationsEnabled ? (
                  <Alert severity="success" variant="outlined">
                    Notifications enabled for {results.notificationsEnabled} future booking{results.notificationsEnabled !== 1 ? 's' : ''}.
                  </Alert>
                ) : (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={enableNotifications}
                    disabled={enablingNotifs}
                  >
                    {enablingNotifs ? 'Enabling...' : 'Enable notifications for future bookings'}
                  </Button>
                )}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {step === 0 && <Button onClick={handleClose}>Cancel</Button>}
        {step === 1 && (
          <>
            <Button onClick={() => { setStep(0); setRows([]); setMapping({}); }}>Back</Button>
            <Button variant="contained" onClick={handleImport} disabled={importing || validCount === 0}>
              Import {validCount} Booking{validCount !== 1 ? 's' : ''}
            </Button>
          </>
        )}
        {step === 2 && <Button variant="contained" onClick={handleDone}>Done</Button>}
      </DialogActions>
    </Dialog>
  );
}

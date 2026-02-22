import { useState, useMemo } from 'react';
import Papa from 'papaparse';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Alert, Chip,
  FormControlLabel, Checkbox, LinearProgress, IconButton, Tooltip,
} from '@mui/material';
import {
  CloudUpload, CheckCircle, Error as ErrorIcon,
  Warning, Download, Close,
} from '@mui/icons-material';
import api from '../api/client';

// Header aliases for auto-detection (Fresha + our template)
const HEADER_MAP = {
  name: ['service name', 'name', 'treatment', 'service', 'title'],
  category: ['category', 'category name', 'group', 'menu', 'section'],
  duration: ['duration', 'duration (minutes)', 'duration (min)', 'duration (mins)', 'time', 'length'],
  price: ['price', 'retail price', 'cost', 'amount', 'fee', 'rate'],
  description: ['description', 'desc', 'notes', 'details'],
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
  if (value === undefined || value === null || value === '') return NaN;
  return parseFloat(String(value).replace(/[£$€,\s]/g, ''));
}

function downloadTemplate() {
  const csv = 'Service Name,Category,Duration (minutes),Price,Description\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'boukd-services-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function CsvImportDialog({ open, onClose, onComplete, existingServices = [] }) {
  const [step, setStep] = useState(0); // 0=upload, 1=preview, 2=results
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [parseError, setParseError] = useState('');

  const existingNames = useMemo(
    () => new Set(existingServices.filter(s => s.active !== false).map(s => s.name.toLowerCase().trim())),
    [existingServices]
  );

  // Map raw CSV rows to our fields using detected mapping
  const mapped = useMemo(() => {
    if (!mapping.name) return [];
    return rows.map((raw, i) => {
      const name = raw[mapping.name] || '';
      const category = mapping.category ? raw[mapping.category] || '' : '';
      const rawDuration = mapping.duration ? raw[mapping.duration] || '' : '';
      const rawPrice = mapping.price ? raw[mapping.price] || '' : '';
      const description = mapping.description ? raw[mapping.description] || '' : '';
      const duration = parseDuration(rawDuration);
      const price = parsePrice(rawPrice);

      const errors = [];
      if (!name.trim()) errors.push('Name is required');
      if (isNaN(duration) || duration < 5 || duration > 480) errors.push('Duration must be 5-480 min');
      if (isNaN(price) || price < 0 || price > 10000) errors.push('Price must be 0-10,000');

      const isDuplicate = existingNames.has(name.toLowerCase().trim());

      return {
        row: i + 1,
        name: name.trim(),
        category: category.trim(),
        duration,
        price,
        description: description.trim(),
        errors,
        isDuplicate,
        valid: errors.length === 0,
      };
    });
  }, [rows, mapping, existingNames]);

  const validCount = mapped.filter(r => r.valid && !r.isDuplicate).length;
  const errorCount = mapped.filter(r => !r.valid).length;
  const duplicateCount = mapped.filter(r => r.valid && r.isDuplicate).length;
  const importableRows = mapped.filter(r => r.valid && (!r.isDuplicate || !skipDuplicates));

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0 && result.data.length === 0) {
          setParseError('Could not parse CSV file. Please check the format.');
          return;
        }
        const headers = result.meta.fields || [];
        const detected = detectMapping(headers);
        if (!detected.name) {
          setParseError(`Could not find a "Service Name" column. Detected headers: ${headers.join(', ')}`);
          return;
        }
        setMapping(detected);
        setRows(result.data);
        setStep(1);
      },
      error: () => {
        setParseError('Failed to read file. Please ensure it is a valid CSV.');
      },
    });
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const payload = importableRows.map(r => ({
        name: r.name,
        category: r.category || null,
        duration: r.duration,
        price: r.price,
        description: r.description || null,
      }));
      const { data } = await api.post('/admin/services/import', { services: payload });
      setResults(data);
      setStep(2);
    } catch (err) {
      const msg = err.response?.data?.error || 'Import failed';
      setResults({ error: msg, imported: 0, skipped: 0, errors: [] });
      setStep(2);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setStep(0);
    setRows([]);
    setMapping({});
    setSkipDuplicates(true);
    setImporting(false);
    setResults(null);
    setParseError('');
    onClose();
  };

  const handleDone = () => {
    handleClose();
    onComplete();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Import Services from CSV
        <IconButton onClick={handleClose} size="small"><Close /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Step 0: Upload */}
        {step === 0 && (
          <Box>
            <Alert severity="info" sx={{ mb: 3 }}>
              Import your services from a CSV file. You can use our template or upload a Fresha export directly.
            </Alert>

            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              <Button variant="outlined" startIcon={<Download />} onClick={downloadTemplate}>
                Download Template
              </Button>
            </Box>

            <Typography variant="body2" color="text.secondary" mb={2}>
              Template columns: <strong>Service Name</strong>, <strong>Category</strong>, <strong>Duration (minutes)</strong>, <strong>Price</strong>, <strong>Description</strong>
            </Typography>

            <Box
              sx={{
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                p: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
              }}
              component="label"
            >
              <input type="file" accept=".csv" hidden onChange={handleFile} />
              <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body1" fontWeight={600}>
                Click to upload your CSV file
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Supports Boukd template and Fresha exports
              </Typography>
            </Box>

            {parseError && <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>}
          </Box>
        )}

        {/* Step 1: Preview */}
        {step === 1 && (
          <Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip icon={<CheckCircle />} label={`${validCount} valid`} color="success" size="small" />
              {errorCount > 0 && <Chip icon={<ErrorIcon />} label={`${errorCount} errors`} color="error" size="small" />}
              {duplicateCount > 0 && <Chip icon={<Warning />} label={`${duplicateCount} duplicates`} color="warning" size="small" />}
              <Chip label={`${mapped.length} total rows`} variant="outlined" size="small" />
            </Box>

            {!mapping.duration && (
              <Alert severity="warning" sx={{ mb: 2 }}>No duration column detected. All rows will fail validation.</Alert>
            )}
            {!mapping.price && (
              <Alert severity="warning" sx={{ mb: 2 }}>No price column detected. All rows will fail validation.</Alert>
            )}

            {duplicateCount > 0 && (
              <FormControlLabel
                control={<Checkbox checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />}
                label={`Skip ${duplicateCount} duplicate(s) (already exist by name)`}
                sx={{ mb: 2 }}
              />
            )}

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell width={40}>#</TableCell>
                    <TableCell width={40}>Status</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Duration</TableCell>
                    <TableCell align="right">Price</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mapped.map((r) => (
                    <TableRow
                      key={r.row}
                      sx={{
                        bgcolor: !r.valid ? 'error.50' : r.isDuplicate ? 'warning.50' : undefined,
                        opacity: (r.isDuplicate && skipDuplicates) ? 0.5 : 1,
                      }}
                    >
                      <TableCell>{r.row}</TableCell>
                      <TableCell>
                        {!r.valid ? (
                          <Tooltip title={r.errors.join(', ')}><ErrorIcon color="error" fontSize="small" /></Tooltip>
                        ) : r.isDuplicate ? (
                          <Tooltip title="Service with this name already exists"><Warning color="warning" fontSize="small" /></Tooltip>
                        ) : (
                          <CheckCircle color="success" fontSize="small" />
                        )}
                      </TableCell>
                      <TableCell>{r.name || <em style={{ color: '#999' }}>empty</em>}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell align="right">{isNaN(r.duration) ? '—' : `${r.duration}m`}</TableCell>
                      <TableCell align="right">{isNaN(r.price) ? '—' : `£${r.price.toFixed(2)}`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {importing && <LinearProgress sx={{ mt: 2 }} />}
          </Box>
        )}

        {/* Step 2: Results */}
        {step === 2 && results && (
          <Box>
            {results.error && !results.imported ? (
              <Alert severity="error" sx={{ mb: 2 }}>{results.error}</Alert>
            ) : (
              <Alert severity="success" sx={{ mb: 2 }}>
                Successfully imported <strong>{results.imported}</strong> service(s).
                {results.skipped > 0 && ` ${results.skipped} skipped.`}
              </Alert>
            )}

            {results.errors?.length > 0 && (
              <Box>
                <Typography variant="subtitle2" mb={1}>Errors:</Typography>
                {results.errors.map((e, i) => (
                  <Alert key={i} severity="error" sx={{ mb: 1 }}>
                    Row {e.row} ({e.name}): {e.errors.join(', ')}
                  </Alert>
                ))}
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
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={importing || importableRows.length === 0}
            >
              Import {importableRows.length} Service{importableRows.length !== 1 ? 's' : ''}
            </Button>
          </>
        )}
        {step === 2 && <Button variant="contained" onClick={handleDone}>Done</Button>}
      </DialogActions>
    </Dialog>
  );
}

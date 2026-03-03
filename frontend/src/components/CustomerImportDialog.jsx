import { useState, useMemo } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
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

const HEADER_MAP = {
  name: ['client', 'name', 'client name', 'full name', 'customer', 'customer name'],
  email: ['email', 'e-mail', 'email address'],
  phone: ['mobile number', 'phone', 'mobile', 'telephone', 'tel', 'phone number'],
  gender: ['gender', 'sex'],
  client_source: ['client source', 'source', 'referral source'],
  notes: ['notes', 'admin notes', 'comments'],
  tags: ['tags', 'labels', 'groups'],
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

function fixPhone(value) {
  if (!value) return '';
  let str = String(value).trim();
  // Fix scientific notation (e.g. 4.47446E+11 → 447446000000)
  if (/^\d+(\.\d+)?[eE]\+?\d+$/.test(str)) {
    str = Math.round(parseFloat(str)).toString();
  }
  // Remove non-digit except leading +
  const cleaned = str.replace(/[^\d+]/g, '');
  // Add + prefix if starts with country code digits
  if (/^\d{10,}$/.test(cleaned) && !cleaned.startsWith('+')) {
    return '+' + cleaned;
  }
  return cleaned || str;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function downloadTemplate() {
  const csv = 'Name,Email,Phone,Gender,Notes,Tags\nJane Doe,jane@example.com,+447123456789,Female,Regular client,"vip,loyal"';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'boukd-customers-template.csv';
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
        if (data.length === 0) {
          onError('No data found in the spreadsheet');
          return;
        }
        const headers = Object.keys(data[0]);
        onComplete(data, headers);
      } catch {
        onError('Failed to read spreadsheet. Please ensure it is a valid .xlsx file.');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.data.length === 0) {
          onError('No data found in the CSV file');
          return;
        }
        onComplete(result.data, result.meta.fields || []);
      },
      error: () => onError('Failed to read CSV file.'),
    });
  }
}

export default function CustomerImportDialog({ open, onClose, onComplete, existingCustomers = [] }) {
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [parseError, setParseError] = useState('');

  const existingEmails = useMemo(
    () => new Set(existingCustomers.map(c => c.email?.toLowerCase().trim()).filter(Boolean)),
    [existingCustomers]
  );

  const mapped = useMemo(() => {
    if (!mapping.name) return [];
    return rows.map((raw, i) => {
      const name = String(raw[mapping.name] || '').trim();
      const email = mapping.email ? String(raw[mapping.email] || '').trim().toLowerCase() : '';
      const rawPhone = mapping.phone ? String(raw[mapping.phone] || '') : '';
      const phone = fixPhone(rawPhone);
      const gender = mapping.gender ? String(raw[mapping.gender] || '').trim() : '';
      const clientSource = mapping.client_source ? String(raw[mapping.client_source] || '').trim() : '';
      const notes = mapping.notes ? String(raw[mapping.notes] || '').trim() : '';
      const tags = mapping.tags ? String(raw[mapping.tags] || '').trim() : '';

      const errors = [];
      if (!name) errors.push('Name is required');
      if (!email || !validateEmail(email)) errors.push('Valid email is required');
      if (phone) {
        const clean = phone.replace(/[\s\-\(\)+]/g, '');
        if (!/^[0-9]{7,15}$/.test(clean)) errors.push('Invalid phone format');
      }

      const isDuplicate = existingEmails.has(email);
      const cleanGender = gender === 'Not specified' ? '' : gender;

      return {
        row: i + 1, name, email, phone, gender: cleanGender, client_source: clientSource,
        notes, tags, errors, isDuplicate, valid: errors.length === 0,
      };
    });
  }, [rows, mapping, existingEmails]);

  const validCount = mapped.filter(r => r.valid && !r.isDuplicate).length;
  const errorCount = mapped.filter(r => !r.valid).length;
  const duplicateCount = mapped.filter(r => r.valid && r.isDuplicate).length;
  const importableRows = skipDuplicates
    ? mapped.filter(r => r.valid && !r.isDuplicate)
    : mapped.filter(r => r.valid);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');

    parseFile(
      file,
      (data, headers) => {
        const detected = detectMapping(headers);
        if (!detected.name) {
          setParseError(`Could not find a "Name" or "Client" column. Detected headers: ${headers.join(', ')}`);
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
      const payload = importableRows.map(r => ({
        name: r.name,
        email: r.email,
        phone: r.phone || null,
        gender: r.gender || null,
        client_source: r.client_source || null,
        notes: r.notes || null,
        tags: r.tags || null,
      }));
      const { data } = await api.post('/admin/customers/import', { customers: payload });
      setResults(data);
      setStep(2);
    } catch (err) {
      setResults({ error: err.response?.data?.error || 'Import failed', imported: 0, updated: 0, skipped: 0, errors: [] });
      setStep(2);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setStep(0); setRows([]); setMapping({}); setSkipDuplicates(true);
    setImporting(false); setResults(null); setParseError('');
    onClose();
  };

  const handleDone = () => { handleClose(); onComplete(); };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Import Customers
        <IconButton onClick={handleClose} size="small"><Close /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {step === 0 && (
          <Box>
            <Alert severity="info" sx={{ mb: 3 }}>
              Import your customers from a CSV or Excel file. Fresha client exports are supported automatically.
            </Alert>
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              <Button variant="outlined" startIcon={<Download />} onClick={downloadTemplate}>
                Download Template
              </Button>
            </Box>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Required columns: <strong>Name</strong>, <strong>Email</strong>. Optional: Phone, Gender, Notes, Tags.
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
              {duplicateCount > 0 && <Chip icon={<Warning />} label={`${duplicateCount} duplicates`} color="warning" size="small" />}
              <Chip label={`${mapped.length} total rows`} variant="outlined" size="small" />
            </Box>

            {!mapping.email && (
              <Alert severity="warning" sx={{ mb: 2 }}>No email column detected. All rows will fail validation.</Alert>
            )}

            {duplicateCount > 0 && (
              <FormControlLabel
                control={<Checkbox checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />}
                label={`Skip ${duplicateCount} duplicate(s) (already exist by email)`}
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
                    <TableCell>Email</TableCell>
                    <TableCell>Phone</TableCell>
                    {mapping.gender && <TableCell>Gender</TableCell>}
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
                          <Tooltip title="Customer with this email already exists (will update)"><Warning color="warning" fontSize="small" /></Tooltip>
                        ) : (
                          <CheckCircle color="success" fontSize="small" />
                        )}
                      </TableCell>
                      <TableCell>{r.name || <em style={{ color: '#999' }}>empty</em>}</TableCell>
                      <TableCell>{r.email || <em style={{ color: '#999' }}>empty</em>}</TableCell>
                      <TableCell>{r.phone || '—'}</TableCell>
                      {mapping.gender && <TableCell>{r.gender || '—'}</TableCell>}
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
            {results.error && !results.imported && !results.updated ? (
              <Alert severity="error" sx={{ mb: 2 }}>{results.error}</Alert>
            ) : (
              <Alert severity="success" sx={{ mb: 2 }}>
                <strong>{results.imported}</strong> created, <strong>{results.updated}</strong> updated.
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
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {step === 0 && <Button onClick={handleClose}>Cancel</Button>}
        {step === 1 && (
          <>
            <Button onClick={() => { setStep(0); setRows([]); setMapping({}); }}>Back</Button>
            <Button variant="contained" onClick={handleImport} disabled={importing || importableRows.length === 0}>
              Import {importableRows.length} Customer{importableRows.length !== 1 ? 's' : ''}
            </Button>
          </>
        )}
        {step === 2 && <Button variant="contained" onClick={handleDone}>Done</Button>}
      </DialogActions>
    </Dialog>
  );
}

import { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, TextField, IconButton, Alert,
  CircularProgress, LinearProgress,
} from '@mui/material';
import { AttachFile, Delete, Download, Close, CloudUpload } from '@mui/icons-material';
import api from '../../api/client';

const MAX_FORMS = 3;
const MAX_SIZE_MB = 5;
const ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ServiceForms({ open, onClose, serviceId, serviceName }) {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [formName, setFormName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const fileRef = useRef();

  const fetchForms = () => {
    if (!serviceId) return;
    setLoading(true);
    api.get(`/admin/services/${serviceId}/forms`)
      .then(({ data }) => setForms(data))
      .catch(() => setError('Failed to load forms'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open && serviceId) fetchForms();
    if (!open) {
      setSelectedFile(null);
      setFormName('');
      setError('');
    }
  }, [open, serviceId]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_SIZE_MB}MB.`);
      return;
    }
    setSelectedFile(file);
    if (!formName) setFormName(file.name.replace(/\.[^.]+$/, ''));
    setError('');
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('form_name', formName || selectedFile.name.replace(/\.[^.]+$/, ''));
      await api.post(`/admin/services/${serviceId}/forms`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSelectedFile(null);
      setFormName('');
      if (fileRef.current) fileRef.current.value = '';
      fetchForms();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload form');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this form?')) return;
    try {
      await api.delete(`/admin/service-forms/${id}`);
      fetchForms();
    } catch {
      setError('Failed to remove form');
    }
  };

  const handleDownload = async (id, fileName) => {
    try {
      const { data } = await api.get(`/admin/service-forms/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download form');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box display="flex" alignItems="center" gap={1}>
          <AttachFile color="primary" />
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>Service Forms</Typography>
            <Typography variant="caption" color="text.secondary">{serviceName}</Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        <Typography variant="body2" color="text.secondary" mb={2}>
          Upload forms (consent, patch test, medical history) that will be emailed to customers when they book this service.
        </Typography>

        {loading ? (
          <Box textAlign="center" py={4}><CircularProgress size={28} /></Box>
        ) : (
          <>
            {forms.length === 0 && (
              <Box textAlign="center" py={3}>
                <Typography color="text.secondary" mb={1}>No forms uploaded yet.</Typography>
              </Box>
            )}

            {forms.map((f) => (
              <Box
                key={f.id}
                sx={{ p: 2, mb: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}
              >
                <AttachFile fontSize="small" color="action" />
                <Box flex={1} minWidth={0}>
                  <Typography variant="body2" fontWeight={500} noWrap>{f.form_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {f.file_name} &middot; {formatBytes(f.file_size)}
                  </Typography>
                </Box>
                <IconButton size="small" onClick={() => handleDownload(f.id, f.file_name)} title="Download">
                  <Download fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => handleDelete(f.id)} color="error" title="Remove">
                  <Delete fontSize="small" />
                </IconButton>
              </Box>
            ))}

            {/* Upload section */}
            {forms.length < MAX_FORMS && (
              <Box sx={{ mt: 2, p: 2, border: '2px dashed', borderColor: 'primary.main', borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} mb={1.5}>Upload Form</Typography>

                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT}
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                  id="form-upload-input"
                />

                {!selectedFile ? (
                  <Button
                    variant="outlined"
                    fullWidth
                    startIcon={<CloudUpload />}
                    onClick={() => fileRef.current?.click()}
                    sx={{ py: 2 }}
                  >
                    Choose File (PDF, DOC, PNG, JPG — max {MAX_SIZE_MB}MB)
                  </Button>
                ) : (
                  <Box>
                    <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AttachFile fontSize="small" color="primary" />
                      <Typography variant="body2" flex={1} noWrap>{selectedFile.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{formatBytes(selectedFile.size)}</Typography>
                      <IconButton size="small" onClick={() => { setSelectedFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                        <Close fontSize="small" />
                      </IconButton>
                    </Box>

                    <TextField
                      fullWidth size="small" label="Form name (displayed to customers)"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      sx={{ mb: 1.5 }}
                    />

                    {uploading && <LinearProgress sx={{ mb: 1.5 }} />}

                    <Box display="flex" gap={1}>
                      <Button
                        variant="contained" size="small"
                        onClick={handleUpload}
                        disabled={uploading}
                        startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <CloudUpload />}
                      >
                        {uploading ? 'Uploading...' : 'Upload'}
                      </Button>
                      <Button size="small" onClick={() => { setSelectedFile(null); setFormName(''); if (fileRef.current) fileRef.current.value = ''; }}>
                        Cancel
                      </Button>
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {forms.length >= MAX_FORMS && (
              <Typography variant="caption" color="text.secondary" display="block" mt={1} textAlign="center">
                Maximum {MAX_FORMS} forms per service reached. Delete a form to upload a new one.
              </Typography>
            )}

            <Typography variant="caption" color="text.secondary" display="block" mt={2}>
              {forms.length}/{MAX_FORMS} forms &middot; Forms are attached to booking confirmation emails automatically.
            </Typography>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

import { useState, useRef } from 'react';
import {
  Box, Typography, Button, CircularProgress, IconButton, TextField,
  Collapse,
} from '@mui/material';
import { CloudUpload, Delete, Link as LinkIcon } from '@mui/icons-material';
import api from '../api/client';

export default function ImageUpload({
  imageKey,
  label,
  shape = 'rectangle',
  currentUrl,
  onUpload,
  onRemove,
  helperText,
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const fileRef = useRef(null);

  const isCircle = shape === 'circle';
  const hasImage = !!currentUrl;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('File too large (max 5MB)');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Only PNG, JPEG and WebP images are allowed');
      return;
    }

    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.post(`/admin/images/${imageKey}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Append cache-bust param
      const url = res.data.url + '?v=' + Date.now();
      onUpload(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    try {
      await api.delete(`/admin/images/${imageKey}`);
    } catch { /* ignore if not found */ }
    onRemove();
  };

  const handleUrlSubmit = () => {
    if (urlValue.trim()) {
      onUpload(urlValue.trim());
      setUrlValue('');
      setShowUrlInput(false);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>{label}</Typography>

      {hasImage ? (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1 }}>
          <Box
            component="img"
            src={currentUrl}
            alt={label}
            sx={{
              width: isCircle ? 100 : 160,
              height: isCircle ? 100 : 80,
              objectFit: 'cover',
              borderRadius: isCircle ? '50%' : 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CloudUpload />}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <CircularProgress size={16} /> : 'Replace'}
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<Delete />}
              onClick={handleRemove}
            >
              Remove
            </Button>
          </Box>
        </Box>
      ) : (
        <Box
          onClick={() => fileRef.current?.click()}
          sx={{
            border: '2px dashed',
            borderColor: 'divider',
            borderRadius: isCircle ? '50%' : 2,
            width: isCircle ? 120 : '100%',
            height: isCircle ? 120 : 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
            '&:hover': { borderColor: 'primary.main' },
            mb: 1,
          }}
        >
          {uploading ? (
            <CircularProgress size={24} />
          ) : (
            <>
              <CloudUpload sx={{ fontSize: 28, color: 'text.secondary', mb: 0.5 }} />
              <Typography variant="caption" color="text.secondary">
                Click to upload
              </Typography>
            </>
          )}
        </Box>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={handleFile}
      />

      {error && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
          {error}
        </Typography>
      )}

      {helperText && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {helperText}
        </Typography>
      )}

      <Button
        size="small"
        variant="text"
        startIcon={<LinkIcon />}
        onClick={() => setShowUrlInput(!showUrlInput)}
        sx={{ textTransform: 'none', fontSize: '0.75rem' }}
      >
        {showUrlInput ? 'Hide' : 'Or paste URL instead'}
      </Button>

      <Collapse in={showUrlInput}>
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="https://example.com/image.png"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
          />
          <Button size="small" variant="contained" onClick={handleUrlSubmit}>
            Use
          </Button>
        </Box>
      </Collapse>
    </Box>
  );
}

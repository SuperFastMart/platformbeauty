import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, TextField, RadioGroup, Radio, FormControlLabel,
  Checkbox, FormGroup, Select, MenuItem, FormControl, InputLabel,
  Button, Card, CardContent, Alert, CircularProgress
} from '@mui/material';
import { CheckCircle } from '@mui/icons-material';

export default function FormFill() {
  const { slug, token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState(null);
  const [responses, setResponses] = useState({});
  const [signed, setSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    fetch(`/api/t/${slug}/consultation-forms/fill/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        if (data.already_completed) {
          setFormData(data);
          setSubmitted(true);
          return;
        }
        setFormData(data);
        // Initialise responses
        const init = {};
        for (const field of data.fields) {
          if (field.field_type === 'description_text') continue;
          if (field.field_type === 'multiple_choice') init[field.id] = { value: [] };
          else if (field.field_type === 'single_checkbox') init[field.id] = { value: false };
          else init[field.id] = { value: '' };
        }
        setResponses(init);
      })
      .catch(() => setError('Failed to load form'))
      .finally(() => setLoading(false));
  }, [slug, token]);

  const updateResponse = (fieldId, value) => {
    setResponses(prev => ({ ...prev, [fieldId]: { value } }));
    setValidationErrors(prev => ({ ...prev, [fieldId]: undefined }));
  };

  const validate = () => {
    const errors = {};
    for (const field of formData.fields) {
      if (!field.required || field.field_type === 'description_text') continue;
      const val = responses[field.id]?.value;
      if (field.field_type === 'multiple_choice') {
        if (!Array.isArray(val) || val.length === 0) errors[field.id] = 'Please select at least one option';
      } else if (field.field_type === 'single_checkbox') {
        if (!val) errors[field.id] = 'This field is required';
      } else {
        if (!val || (typeof val === 'string' && !val.trim())) errors[field.id] = 'This field is required';
      }
    }
    if (formData.form.require_signature && !signed) {
      errors._signature = 'Signature is required';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/t/${slug}/consultation-forms/fill/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses, signed }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to submit'); return; }
      setSubmitted(true);
    } catch {
      setError('Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  };

  const primaryColor = formData?.tenant?.primary_color || '#8B2635';

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error && !formData) {
    return (
      <Box maxWidth={600} mx="auto" mt={6} px={2}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (submitted) {
    return (
      <Box maxWidth={600} mx="auto" mt={6} px={2} textAlign="center">
        <Card sx={{ p: 4 }}>
          <CheckCircle sx={{ fontSize: 64, color: '#2e7d32', mb: 2 }} />
          <Typography variant="h5" fontWeight={600} mb={1}>
            {formData?.already_completed ? 'Form Already Submitted' : 'Thank You!'}
          </Typography>
          <Typography color="text.secondary">
            {formData?.already_completed
              ? 'This form has already been completed.'
              : `Your consultation form has been submitted successfully. ${formData?.tenant?.name || ''} will review your responses before your appointment.`
            }
          </Typography>
        </Card>
      </Box>
    );
  }

  const renderField = (field) => {
    const opts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
    const err = validationErrors[field.id];

    switch (field.field_type) {
      case 'short_answer':
        return (
          <TextField fullWidth size="small" placeholder="Your answer"
            value={responses[field.id]?.value || ''}
            onChange={e => updateResponse(field.id, e.target.value)}
            error={!!err} helperText={err} />
        );
      case 'long_answer':
        return (
          <TextField fullWidth multiline rows={4} placeholder="Your answer"
            value={responses[field.id]?.value || ''}
            onChange={e => updateResponse(field.id, e.target.value)}
            error={!!err} helperText={err} />
        );
      case 'single_answer':
        return (
          <Box>
            <RadioGroup value={responses[field.id]?.value || ''}
              onChange={e => updateResponse(field.id, e.target.value)}>
              {opts?.choices?.map((choice, i) => (
                <FormControlLabel key={i} value={choice} control={<Radio size="small" />} label={choice} />
              ))}
            </RadioGroup>
            {err && <Typography variant="caption" color="error">{err}</Typography>}
          </Box>
        );
      case 'single_checkbox':
        return (
          <Box>
            <FormControlLabel
              control={<Checkbox checked={!!responses[field.id]?.value}
                onChange={e => updateResponse(field.id, e.target.checked)} />}
              label={field.description || 'I agree'} />
            {err && <Typography variant="caption" color="error">{err}</Typography>}
          </Box>
        );
      case 'multiple_choice':
        return (
          <Box>
            <FormGroup>
              {opts?.choices?.map((choice, i) => (
                <FormControlLabel key={i} label={choice}
                  control={<Checkbox size="small"
                    checked={(responses[field.id]?.value || []).includes(choice)}
                    onChange={e => {
                      const current = responses[field.id]?.value || [];
                      updateResponse(field.id, e.target.checked
                        ? [...current, choice]
                        : current.filter(c => c !== choice));
                    }} />} />
              ))}
            </FormGroup>
            {err && <Typography variant="caption" color="error">{err}</Typography>}
          </Box>
        );
      case 'dropdown':
        return (
          <FormControl fullWidth size="small" error={!!err}>
            <InputLabel>Select an option</InputLabel>
            <Select value={responses[field.id]?.value || ''} label="Select an option"
              onChange={e => updateResponse(field.id, e.target.value)}>
              {opts?.choices?.map((choice, i) => (
                <MenuItem key={i} value={choice}>{choice}</MenuItem>
              ))}
            </Select>
            {err && <Typography variant="caption" color="error" mt={0.5}>{err}</Typography>}
          </FormControl>
        );
      case 'yes_no':
        return (
          <Box>
            <RadioGroup row value={responses[field.id]?.value || ''}
              onChange={e => updateResponse(field.id, e.target.value)}>
              <FormControlLabel value="Yes" control={<Radio size="small" />} label="Yes" />
              <FormControlLabel value="No" control={<Radio size="small" />} label="No" />
            </RadioGroup>
            {err && <Typography variant="caption" color="error">{err}</Typography>}
          </Box>
        );
      case 'description_text':
        return (
          <Box sx={{ bgcolor: 'rgba(0,0,0,0.03)', borderRadius: 2, p: 2 }}>
            <Typography variant="body2" color="text.secondary" whiteSpace="pre-line">
              {field.description || ''}
            </Typography>
          </Box>
        );
      default:
        return null;
    }
  };

  return (
    <Box maxWidth={700} mx="auto" py={4} px={2}>
      {/* Header */}
      <Box textAlign="center" mb={3}>
        {formData.tenant?.logo_url && (
          <img src={formData.tenant.logo_url} alt={formData.tenant.name}
            style={{ maxHeight: 48, marginBottom: 12 }} />
        )}
        <Typography variant="h5" fontWeight={700}>{formData.form.name}</Typography>
        {formData.form.description && (
          <Typography color="text.secondary" mt={0.5}>{formData.form.description}</Typography>
        )}
        {formData.customer_name && (
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            For: {formData.customer_name}
          </Typography>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Fields */}
      {formData.fields.map(field => (
        <Card key={field.id} sx={{ mb: 2, boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: '12px' }}>
          <CardContent>
            {field.field_type !== 'description_text' && (
              <Typography fontWeight={500} mb={1}>
                {field.label}
                {field.required && <Typography component="span" color="error"> *</Typography>}
              </Typography>
            )}
            {field.field_type === 'description_text' && (
              <Typography fontWeight={600} mb={1}>{field.label}</Typography>
            )}
            {field.field_type !== 'description_text' && field.field_type !== 'single_checkbox' && field.description && (
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>{field.description}</Typography>
            )}
            {renderField(field)}
          </CardContent>
        </Card>
      ))}

      {/* Signature */}
      {formData.form.require_signature && (
        <Card sx={{ mb: 2, boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: '12px' }}>
          <CardContent>
            <Typography fontWeight={600} mb={1}>Signature <Typography component="span" color="error">*</Typography></Typography>
            <FormControlLabel
              control={<Checkbox checked={signed} onChange={e => { setSigned(e.target.checked); setValidationErrors(v => ({ ...v, _signature: undefined })); }} />}
              label="I confirm the information above is accurate and I consent to the collection of this data" />
            {validationErrors._signature && (
              <Typography variant="caption" color="error">{validationErrors._signature}</Typography>
            )}
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <Button fullWidth variant="contained" size="large" onClick={handleSubmit} disabled={submitting}
        sx={{ bgcolor: primaryColor, '&:hover': { bgcolor: primaryColor, filter: 'brightness(0.85)' }, py: 1.5, borderRadius: 2 }}>
        {submitting ? 'Submitting...' : 'Submit Form'}
      </Button>
    </Box>
  );
}

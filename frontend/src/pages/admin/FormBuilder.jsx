import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, CardContent, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, FormControlLabel, Checkbox, Snackbar, Alert, Divider,
  RadioGroup, Radio, FormGroup, FormControl, InputLabel, Select
} from '@mui/material';
import {
  ArrowBack, Add, Edit, Delete, DragIndicator, KeyboardArrowUp, KeyboardArrowDown,
  ShortText, Notes, RadioButtonChecked, CheckBox, ChecklistRtl,
  ArrowDropDownCircle, ToggleOn, InfoOutlined, Visibility
} from '@mui/icons-material';
import api from '../../api/client';
import ConfirmDialog from '../../components/ConfirmDialog';

const FIELD_TYPES = [
  { value: 'short_answer', label: 'Short answer', icon: <ShortText /> },
  { value: 'long_answer', label: 'Long answer', icon: <Notes /> },
  { value: 'single_answer', label: 'Single answer', icon: <RadioButtonChecked />, hasOptions: true },
  { value: 'single_checkbox', label: 'Single checkbox', icon: <CheckBox /> },
  { value: 'multiple_choice', label: 'Multiple choice', icon: <ChecklistRtl />, hasOptions: true },
  { value: 'dropdown', label: 'Drop-down', icon: <ArrowDropDownCircle />, hasOptions: true },
  { value: 'yes_no', label: 'Yes or No', icon: <ToggleOn /> },
  { value: 'description_text', label: 'Description text', icon: <InfoOutlined />, isInfo: true },
];

export default function FormBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fieldDialog, setFieldDialog] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [fieldForm, setFieldForm] = useState({
    field_type: 'short_answer', label: '', description: '', required: false, options: { choices: [''] },
  });
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [settingsDialog, setSettingsDialog] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});
  const [services, setServices] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tenant, setTenant] = useState(null);

  const fetchForm = async () => {
    try {
      const { data } = await api.get(`/admin/consultation-forms/${id}`);
      setForm(data);
      setFields(data.fields || []);
      setSettingsForm({
        name: data.name, description: data.description || '', send_mode: data.send_mode,
        frequency: data.frequency, service_scope: data.service_scope,
        service_ids: data.service_ids ? data.service_ids.split(',').map(Number) : [],
        require_signature: data.require_signature,
      });
    } catch {
      setSnackbar({ open: true, message: 'Form not found', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForm();
    api.get('/admin/services').then(({ data }) => setServices(data)).catch(() => {});
    api.get('/admin/settings').then(({ data }) => setTenant(data)).catch(() => {});
  }, [id]);

  const openAddField = () => {
    setEditingField(null);
    setFieldForm({ field_type: 'short_answer', label: '', description: '', required: false, options: { choices: ['', ''] } });
    setFieldDialog(true);
  };

  const openEditField = (field) => {
    setEditingField(field);
    const opts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
    setFieldForm({
      field_type: field.field_type, label: field.label, description: field.description || '',
      required: field.required, options: opts || { choices: ['', ''] },
    });
    setFieldDialog(true);
  };

  const handleSaveField = async () => {
    if (!fieldForm.label.trim()) { setSnackbar({ open: true, message: 'Label is required', severity: 'error' }); return; }
    const typeConfig = FIELD_TYPES.find(t => t.value === fieldForm.field_type);
    const payload = {
      field_type: fieldForm.field_type,
      label: fieldForm.label,
      description: fieldForm.description || null,
      required: typeConfig?.isInfo ? false : fieldForm.required,
      options: typeConfig?.hasOptions ? { choices: fieldForm.options.choices.filter(c => c.trim()) } : null,
    };

    if (typeConfig?.hasOptions && (!payload.options?.choices?.length || payload.options.choices.length < 2)) {
      setSnackbar({ open: true, message: 'At least 2 options required', severity: 'error' }); return;
    }

    setSaving(true);
    try {
      if (editingField) {
        await api.put(`/admin/consultation-forms/${id}/fields/${editingField.id}`, payload);
      } else {
        await api.post(`/admin/consultation-forms/${id}/fields`, payload);
      }
      setFieldDialog(false);
      fetchForm();
      setSnackbar({ open: true, message: editingField ? 'Field updated' : 'Field added', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to save field', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteField = async (fieldId) => {
    try {
      await api.delete(`/admin/consultation-forms/${id}/fields/${fieldId}`);
      fetchForm();
      setSnackbar({ open: true, message: 'Field deleted', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete', severity: 'error' });
    }
  };

  const moveField = async (index, direction) => {
    const newFields = [...fields];
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= newFields.length) return;
    [newFields[index], newFields[swapIdx]] = [newFields[swapIdx], newFields[index]];
    const reordered = newFields.map((f, i) => ({ id: f.id, display_order: i }));
    setFields(newFields);
    try {
      await api.put(`/admin/consultation-forms/${id}/fields/reorder`, { fields: reordered });
    } catch {
      fetchForm();
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/consultation-forms/${id}`, {
        ...settingsForm,
        service_ids: settingsForm.service_scope === 'specific' ? settingsForm.service_ids : null,
      });
      setSettingsDialog(false);
      fetchForm();
      setSnackbar({ open: true, message: 'Settings updated', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to save', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const addOption = () => setFieldForm(f => ({ ...f, options: { choices: [...(f.options?.choices || []), ''] } }));
  const removeOption = (idx) => setFieldForm(f => ({ ...f, options: { choices: f.options.choices.filter((_, i) => i !== idx) } }));
  const updateOption = (idx, val) => setFieldForm(f => {
    const choices = [...f.options.choices];
    choices[idx] = val;
    return { ...f, options: { choices } };
  });

  const typeConfig = (type) => FIELD_TYPES.find(t => t.value === type);

  if (loading) return <Typography>Loading...</Typography>;
  if (!form) return <Typography>Form not found</Typography>;

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={1}>
        <IconButton onClick={() => navigate('/admin/consultation-forms')}><ArrowBack /></IconButton>
        <Typography variant="h5" fontWeight={600}>{form.name}</Typography>
      </Box>

      {form.description && (
        <Typography variant="body2" color="text.secondary" mb={1} ml={6}>{form.description}</Typography>
      )}

      <Box display="flex" gap={0.5} flexWrap="wrap" mb={3} ml={6}>
        <Chip label={form.send_mode === 'before_appointment' ? 'Auto-send' : 'Manual'} size="small"
          color={form.send_mode === 'before_appointment' ? 'success' : 'warning'} variant="outlined" />
        <Chip label={form.frequency === 'every_time' ? 'Every booking' : 'Once only'} size="small" variant="outlined" />
        <Chip label={form.service_scope === 'all' ? 'All services' : 'Specific services'} size="small" variant="outlined" />
        {form.require_signature && <Chip label="Signature required" size="small" variant="outlined" color="info" />}
        <Chip label="Edit Settings" size="small" variant="outlined" onClick={() => setSettingsDialog(true)} icon={<Edit />} />
        <Chip label="Preview" size="small" variant="outlined" onClick={() => setPreviewOpen(true)} icon={<Visibility />} color="primary" />
      </Box>

      {/* Field list */}
      {fields.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center', mb: 2 }}>
          <Typography color="text.secondary" mb={2}>No fields yet. Add your first question or item.</Typography>
          <Button variant="contained" startIcon={<Add />} onClick={openAddField}>Add Field</Button>
        </Card>
      ) : (
        <>
          {fields.map((field, idx) => {
            const tc = typeConfig(field.field_type);
            const opts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
            return (
              <Card key={field.id} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: '12px' }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box display="flex" flexDirection="column">
                      <IconButton size="small" disabled={idx === 0} onClick={() => moveField(idx, -1)}>
                        <KeyboardArrowUp fontSize="small" />
                      </IconButton>
                      <IconButton size="small" disabled={idx === fields.length - 1} onClick={() => moveField(idx, 1)}>
                        <KeyboardArrowDown fontSize="small" />
                      </IconButton>
                    </Box>
                    <Box sx={{ color: 'text.secondary', mr: 0.5 }}>{tc?.icon}</Box>
                    <Box flex={1}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography fontWeight={500}>{field.label}</Typography>
                        {field.required && <Chip label="Required" size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {tc?.label}
                        {opts?.choices?.length > 0 && ` (${opts.choices.length} options)`}
                      </Typography>
                      {field.description && (
                        <Typography variant="caption" color="text.secondary" display="block">{field.description}</Typography>
                      )}
                    </Box>
                    <IconButton size="small" onClick={() => openEditField(field)}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => setConfirmDelete(field.id)}><Delete fontSize="small" /></IconButton>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
          <Box mt={2}>
            <Button variant="outlined" startIcon={<Add />} onClick={openAddField}>Add Field</Button>
          </Box>
        </>
      )}

      {/* Add/Edit Field Dialog */}
      <Dialog open={fieldDialog} onClose={() => setFieldDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingField ? 'Edit Field' : 'Add Field'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth select label="Field Type" margin="normal"
            value={fieldForm.field_type} onChange={e => setFieldForm(f => ({ ...f, field_type: e.target.value }))}>
            {FIELD_TYPES.map(t => (
              <MenuItem key={t.value} value={t.value}>
                <Box display="flex" alignItems="center" gap={1}>{t.icon} {t.label}</Box>
              </MenuItem>
            ))}
          </TextField>
          <TextField fullWidth label={typeConfig(fieldForm.field_type)?.isInfo ? 'Title / Heading' : 'Question Label'}
            margin="normal" required
            value={fieldForm.label} onChange={e => setFieldForm(f => ({ ...f, label: e.target.value }))} />
          <TextField fullWidth label={typeConfig(fieldForm.field_type)?.isInfo ? 'Description Content' : 'Helper Text (optional)'}
            margin="normal" multiline rows={typeConfig(fieldForm.field_type)?.isInfo ? 4 : 2}
            value={fieldForm.description} onChange={e => setFieldForm(f => ({ ...f, description: e.target.value }))} />

          {!typeConfig(fieldForm.field_type)?.isInfo && (
            <FormControlLabel sx={{ mt: 1 }}
              control={<Checkbox checked={fieldForm.required} onChange={e => setFieldForm(f => ({ ...f, required: e.target.checked }))} />}
              label="Required" />
          )}

          {typeConfig(fieldForm.field_type)?.hasOptions && (
            <Box mt={2}>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>Options</Typography>
              {fieldForm.options?.choices?.map((choice, idx) => (
                <Box key={idx} display="flex" alignItems="center" gap={1} mb={1}>
                  <TextField fullWidth size="small" placeholder={`Option ${idx + 1}`}
                    value={choice} onChange={e => updateOption(idx, e.target.value)} />
                  {fieldForm.options.choices.length > 2 && (
                    <IconButton size="small" onClick={() => removeOption(idx)}><Delete fontSize="small" /></IconButton>
                  )}
                </Box>
              ))}
              <Button size="small" onClick={addOption}>Add option</Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFieldDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveField} disabled={saving}>
            {saving ? 'Saving...' : editingField ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Settings Dialog */}
      <Dialog open={settingsDialog} onClose={() => setSettingsDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Form Settings</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Form Name" margin="normal" required
            value={settingsForm.name || ''} onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))} />
          <TextField fullWidth label="Description" margin="normal" multiline rows={2}
            value={settingsForm.description || ''} onChange={e => setSettingsForm(f => ({ ...f, description: e.target.value }))} />
          <TextField fullWidth select label="Send Mode" margin="normal"
            value={settingsForm.send_mode || 'before_appointment'} onChange={e => setSettingsForm(f => ({ ...f, send_mode: e.target.value }))}>
            <MenuItem value="before_appointment">Before appointment (auto-send)</MenuItem>
            <MenuItem value="manually">Manually</MenuItem>
          </TextField>
          <TextField fullWidth select label="Frequency" margin="normal"
            value={settingsForm.frequency || 'every_time'} onChange={e => setSettingsForm(f => ({ ...f, frequency: e.target.value }))}>
            <MenuItem value="every_time">Every time they book</MenuItem>
            <MenuItem value="only_once">Only once</MenuItem>
          </TextField>
          <TextField fullWidth select label="Service Scope" margin="normal"
            value={settingsForm.service_scope || 'all'} onChange={e => setSettingsForm(f => ({ ...f, service_scope: e.target.value }))}>
            <MenuItem value="all">All services</MenuItem>
            <MenuItem value="specific">Specific services</MenuItem>
          </TextField>
          {settingsForm.service_scope === 'specific' && (
            <TextField fullWidth select label="Select Services" margin="normal"
              SelectProps={{ multiple: true, renderValue: (sel) => sel.map(id => services.find(s => s.id === id)?.name || id).join(', ') }}
              value={settingsForm.service_ids || []}
              onChange={e => setSettingsForm(f => ({ ...f, service_ids: e.target.value }))}>
              {services.filter(s => s.active).map(s => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </TextField>
          )}
          <FormControlLabel sx={{ mt: 1 }}
            control={<Checkbox checked={settingsForm.require_signature || false} onChange={e => setSettingsForm(f => ({ ...f, require_signature: e.target.checked }))} />}
            label="Require client signature" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveSettings} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { maxHeight: '90vh', bgcolor: '#fafafa' } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Form Preview
          <Button size="small" onClick={() => setPreviewOpen(false)}>Close</Button>
        </DialogTitle>
        <DialogContent>
          <Box maxWidth={600} mx="auto" py={2}>
            {/* Header — mirrors FormFill */}
            <Box textAlign="center" mb={3}>
              {tenant?.header_logo_url && (
                <img src={tenant.header_logo_url} alt={tenant?.name}
                  style={{ maxHeight: 48, marginBottom: 12 }} />
              )}
              <Typography variant="h5" fontWeight={700}>{form.name}</Typography>
              {form.description && (
                <Typography color="text.secondary" mt={0.5}>{form.description}</Typography>
              )}
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                For: Jane Doe (preview)
              </Typography>
            </Box>

            {/* Fields */}
            {fields.map(field => {
              const opts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
              return (
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
                    {/* Render field by type */}
                    {field.field_type === 'short_answer' && (
                      <TextField fullWidth size="small" placeholder="Your answer" disabled />
                    )}
                    {field.field_type === 'long_answer' && (
                      <TextField fullWidth multiline rows={4} placeholder="Your answer" disabled />
                    )}
                    {field.field_type === 'single_answer' && (
                      <RadioGroup>
                        {opts?.choices?.map((choice, i) => (
                          <FormControlLabel key={i} value={choice} control={<Radio size="small" disabled />} label={choice} />
                        ))}
                      </RadioGroup>
                    )}
                    {field.field_type === 'single_checkbox' && (
                      <FormControlLabel control={<Checkbox disabled />} label={field.description || 'I agree'} />
                    )}
                    {field.field_type === 'multiple_choice' && (
                      <FormGroup>
                        {opts?.choices?.map((choice, i) => (
                          <FormControlLabel key={i} label={choice} control={<Checkbox size="small" disabled />} />
                        ))}
                      </FormGroup>
                    )}
                    {field.field_type === 'dropdown' && (
                      <FormControl fullWidth size="small">
                        <InputLabel>Select an option</InputLabel>
                        <Select value="" label="Select an option" disabled>
                          {opts?.choices?.map((choice, i) => (
                            <MenuItem key={i} value={choice}>{choice}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                    {field.field_type === 'yes_no' && (
                      <RadioGroup row>
                        <FormControlLabel value="Yes" control={<Radio size="small" disabled />} label="Yes" />
                        <FormControlLabel value="No" control={<Radio size="small" disabled />} label="No" />
                      </RadioGroup>
                    )}
                    {field.field_type === 'description_text' && (
                      <Box sx={{ bgcolor: 'rgba(0,0,0,0.03)', borderRadius: 2, p: 2 }}>
                        <Typography variant="body2" color="text.secondary" whiteSpace="pre-line">
                          {field.description || ''}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Signature */}
            {form.require_signature && (
              <Card sx={{ mb: 2, boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: '12px' }}>
                <CardContent>
                  <Typography fontWeight={600} mb={1}>Signature <Typography component="span" color="error">*</Typography></Typography>
                  <FormControlLabel control={<Checkbox disabled />}
                    label="I confirm the information above is accurate and I consent to the collection of this data" />
                </CardContent>
              </Card>
            )}

            {/* Submit button */}
            <Button fullWidth variant="contained" size="large" disabled
              sx={{
                bgcolor: tenant?.primary_color || '#8B2635',
                '&.Mui-disabled': { bgcolor: tenant?.primary_color || '#8B2635', color: 'white', opacity: 0.8 },
                py: 1.5, borderRadius: 2,
              }}>
              Submit Form
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete field?"
        message="This will remove the field from the form."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={() => handleDeleteField(confirmDelete)}
      />

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, TextField, IconButton, Chip,
  FormControlLabel, Switch, MenuItem, Alert, Divider, CircularProgress,
} from '@mui/material';
import { Add, Delete, ArrowUpward, ArrowDownward, Close, QuestionAnswer } from '@mui/icons-material';
import api from '../../api/client';

const questionTypes = [
  { value: 'text', label: 'Text Answer' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'checkbox', label: 'Checkbox (multiple options)' },
];

export default function IntakeQuestions({ open, onClose, serviceId, serviceName }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // New question form
  const [showAdd, setShowAdd] = useState(false);
  const [newQ, setNewQ] = useState({ question_text: '', question_type: 'text', required: false, options: [] });
  const [newOption, setNewOption] = useState('');

  // Edit mode
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editOption, setEditOption] = useState('');

  const fetchQuestions = () => {
    if (!serviceId) return;
    setLoading(true);
    api.get(`/admin/services/${serviceId}/intake-questions`)
      .then(({ data }) => setQuestions(data.filter(q => q.active !== false)))
      .catch(() => setError('Failed to load questions'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open && serviceId) fetchQuestions();
  }, [open, serviceId]);

  const handleAdd = async () => {
    if (!newQ.question_text.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/admin/services/${serviceId}/intake-questions`, {
        question_text: newQ.question_text,
        question_type: newQ.question_type,
        required: newQ.required,
        options: newQ.question_type === 'checkbox' ? newQ.options : null,
      });
      setNewQ({ question_text: '', question_type: 'text', required: false, options: [] });
      setShowAdd(false);
      fetchQuestions();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add question');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this question?')) return;
    try {
      await api.delete(`/admin/intake-questions/${id}`);
      fetchQuestions();
    } catch {
      setError('Failed to remove question');
    }
  };

  const handleSaveEdit = async (id) => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/admin/intake-questions/${id}`, {
        question_text: editForm.question_text,
        question_type: editForm.question_type,
        required: editForm.required,
        options: editForm.question_type === 'checkbox' ? editForm.options : null,
      });
      setEditingId(null);
      fetchQuestions();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update question');
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (index, direction) => {
    const newQuestions = [...questions];
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= newQuestions.length) return;
    [newQuestions[index], newQuestions[swapIdx]] = [newQuestions[swapIdx], newQuestions[index]];
    setQuestions(newQuestions);
    try {
      await api.put('/admin/intake-questions-reorder', {
        items: newQuestions.map((q, i) => ({ id: q.id, display_order: i })),
      });
    } catch {
      fetchQuestions(); // Revert on failure
    }
  };

  const startEdit = (q) => {
    setEditingId(q.id);
    setEditForm({
      question_text: q.question_text,
      question_type: q.question_type,
      required: q.required,
      options: Array.isArray(q.options) ? [...q.options] : [],
    });
    setEditOption('');
  };

  const addOptionToNew = () => {
    if (!newOption.trim()) return;
    setNewQ(q => ({ ...q, options: [...q.options, newOption.trim()] }));
    setNewOption('');
  };

  const addOptionToEdit = () => {
    if (!editOption.trim()) return;
    setEditForm(f => ({ ...f, options: [...f.options, editOption.trim()] }));
    setEditOption('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box display="flex" alignItems="center" gap={1}>
          <QuestionAnswer color="primary" />
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>Intake Questions</Typography>
            <Typography variant="caption" color="text.secondary">{serviceName}</Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {loading ? (
          <Box textAlign="center" py={4}><CircularProgress size={28} /></Box>
        ) : (
          <>
            {questions.length === 0 && !showAdd && (
              <Box textAlign="center" py={4}>
                <Typography color="text.secondary" mb={2}>
                  No intake questions for this service yet.
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Add questions that customers should answer when booking this service, such as medical history, allergies, or preferences.
                </Typography>
              </Box>
            )}

            {questions.map((q, idx) => (
              <Box key={q.id} sx={{ p: 2, mb: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                {editingId === q.id ? (
                  // Edit mode
                  <Box>
                    <TextField
                      fullWidth size="small" label="Question" value={editForm.question_text}
                      onChange={e => setEditForm(f => ({ ...f, question_text: e.target.value }))}
                      sx={{ mb: 1.5 }}
                    />
                    <Box display="flex" gap={1} mb={1.5}>
                      <TextField
                        select size="small" label="Type" value={editForm.question_type}
                        onChange={e => setEditForm(f => ({ ...f, question_type: e.target.value }))}
                        sx={{ minWidth: 160 }}
                      >
                        {questionTypes.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                      </TextField>
                      <FormControlLabel
                        control={<Switch size="small" checked={editForm.required} onChange={e => setEditForm(f => ({ ...f, required: e.target.checked }))} />}
                        label="Required"
                      />
                    </Box>
                    {editForm.question_type === 'checkbox' && (
                      <Box mb={1.5}>
                        <Typography variant="caption" fontWeight={600} mb={0.5} display="block">Options</Typography>
                        <Box display="flex" flexWrap="wrap" gap={0.5} mb={1}>
                          {editForm.options.map((opt, i) => (
                            <Chip key={i} label={opt} size="small" onDelete={() => setEditForm(f => ({ ...f, options: f.options.filter((_, j) => j !== i) }))} />
                          ))}
                        </Box>
                        <Box display="flex" gap={1}>
                          <TextField size="small" placeholder="Add option" value={editOption}
                            onChange={e => setEditOption(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addOptionToEdit())}
                            fullWidth
                          />
                          <Button size="small" variant="outlined" onClick={addOptionToEdit}>Add</Button>
                        </Box>
                      </Box>
                    )}
                    <Box display="flex" gap={1}>
                      <Button size="small" variant="contained" onClick={() => handleSaveEdit(q.id)} disabled={saving}>Save</Button>
                      <Button size="small" onClick={() => setEditingId(null)}>Cancel</Button>
                    </Box>
                  </Box>
                ) : (
                  // View mode
                  <Box display="flex" alignItems="flex-start" gap={1}>
                    <Box flex={1}>
                      <Typography variant="body2" fontWeight={500}>
                        {q.question_text}
                        {q.required && <Chip label="Required" size="small" sx={{ ml: 1, height: 18, fontSize: 10 }} color="error" />}
                      </Typography>
                      <Box display="flex" gap={1} mt={0.5} alignItems="center">
                        <Chip label={questionTypes.find(t => t.value === q.question_type)?.label || q.question_type} size="small" variant="outlined" sx={{ height: 22, fontSize: 11 }} />
                        {q.question_type === 'checkbox' && Array.isArray(q.options) && (
                          <Typography variant="caption" color="text.secondary">
                            {q.options.length} option{q.options.length !== 1 ? 's' : ''}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <Box display="flex" gap={0.5} alignItems="center">
                      <IconButton size="small" disabled={idx === 0} onClick={() => handleMove(idx, -1)}>
                        <ArrowUpward fontSize="small" />
                      </IconButton>
                      <IconButton size="small" disabled={idx === questions.length - 1} onClick={() => handleMove(idx, 1)}>
                        <ArrowDownward fontSize="small" />
                      </IconButton>
                      <Button size="small" onClick={() => startEdit(q)}>Edit</Button>
                      <IconButton size="small" onClick={() => handleDelete(q.id)} color="error">
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                )}
              </Box>
            ))}

            {/* Add new question */}
            {showAdd ? (
              <Box sx={{ p: 2, border: '2px dashed', borderColor: 'primary.main', borderRadius: 2, mt: 1 }}>
                <Typography variant="subtitle2" fontWeight={600} mb={1.5}>New Question</Typography>
                <TextField
                  fullWidth size="small" label="Question text" value={newQ.question_text}
                  onChange={e => setNewQ(q => ({ ...q, question_text: e.target.value }))}
                  sx={{ mb: 1.5 }}
                  autoFocus
                />
                <Box display="flex" gap={1} mb={1.5}>
                  <TextField
                    select size="small" label="Type" value={newQ.question_type}
                    onChange={e => setNewQ(q => ({ ...q, question_type: e.target.value }))}
                    sx={{ minWidth: 160 }}
                  >
                    {questionTypes.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                  </TextField>
                  <FormControlLabel
                    control={<Switch size="small" checked={newQ.required} onChange={e => setNewQ(q => ({ ...q, required: e.target.checked }))} />}
                    label="Required"
                  />
                </Box>
                {newQ.question_type === 'checkbox' && (
                  <Box mb={1.5}>
                    <Typography variant="caption" fontWeight={600} mb={0.5} display="block">Options</Typography>
                    <Box display="flex" flexWrap="wrap" gap={0.5} mb={1}>
                      {newQ.options.map((opt, i) => (
                        <Chip key={i} label={opt} size="small" onDelete={() => setNewQ(q => ({ ...q, options: q.options.filter((_, j) => j !== i) }))} />
                      ))}
                    </Box>
                    <Box display="flex" gap={1}>
                      <TextField size="small" placeholder="Add option" value={newOption}
                        onChange={e => setNewOption(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addOptionToNew())}
                        fullWidth
                      />
                      <Button size="small" variant="outlined" onClick={addOptionToNew}>Add</Button>
                    </Box>
                  </Box>
                )}
                <Box display="flex" gap={1}>
                  <Button variant="contained" size="small" onClick={handleAdd} disabled={saving || !newQ.question_text.trim()}>
                    {saving ? 'Adding...' : 'Add Question'}
                  </Button>
                  <Button size="small" onClick={() => { setShowAdd(false); setNewQ({ question_text: '', question_type: 'text', required: false, options: [] }); }}>
                    Cancel
                  </Button>
                </Box>
              </Box>
            ) : (
              <Button
                startIcon={<Add />}
                variant="outlined"
                fullWidth
                onClick={() => setShowAdd(true)}
                sx={{ mt: 1 }}
              >
                Add Question
              </Button>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

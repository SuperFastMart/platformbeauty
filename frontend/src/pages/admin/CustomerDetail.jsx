import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Chip, Button, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Grid, Alert, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, useMediaQuery, useTheme, Tooltip, Accordion, AccordionSummary,
  AccordionDetails, FormControl, FormControlLabel, InputLabel, Select, MenuItem, CircularProgress, Switch
} from '@mui/material';
import {
  ArrowBack, Delete, PersonOutline, ReportProblem, LocalOffer, Add, CameraAlt, Close,
  ExpandMore, Email, Sms, Send, Assignment, CreditCardOff
} from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import useSubscriptionTier from '../../hooks/useSubscriptionTier';
import FeatureGate from '../../components/FeatureGate';
import useTerminology from '../../hooks/useTerminology';

const statusColors = {
  pending: 'warning', confirmed: 'success', rejected: 'error',
  cancelled: 'default', completed: 'info',
};

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [customer, setCustomer] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [allergies, setAllergies] = useState('');
  const [preferences, setPreferences] = useState('');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [deleteDialog, setDeleteDialog] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { hasAccess } = useSubscriptionTier();
  const { person } = useTerminology();

  // Photos
  const [photos, setPhotos] = useState([]);
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);
  const [photoType, setPhotoType] = useState('before');
  const [photoPairId, setPhotoPairId] = useState('');
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(null);

  // Contact editing
  const [editingContact, setEditingContact] = useState(false);
  const [editContact, setEditContact] = useState({ name: '', email: '', phone: '', gender: '' });

  // Communications & Forms
  const [communications, setCommunications] = useState([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [formResponses, setFormResponses] = useState([]);
  const [sendFormOpen, setSendFormOpen] = useState(false);
  const [availableForms, setAvailableForms] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [sendingForm, setSendingForm] = useState(false);

  useEffect(() => {
    api.get(`/admin/customers/${id}`)
      .then(({ data }) => {
        setCustomer(data.customer);
        setBookings(data.bookings);
        setStats(data.stats);
        setNotes(data.customer.admin_notes || '');
        setAllergies(data.customer.allergies || '');
        setPreferences(data.customer.preferences || '');
        setTags(data.customer.tags ? data.customer.tags.split(',').map(t => t.trim()).filter(Boolean) : []);
        setEditContact({ name: data.customer.name || '', email: data.customer.email || '', phone: data.customer.phone || '', gender: data.customer.gender || '' });
      })
      .catch(err => {
        if (err.response?.status === 404) navigate('/admin/customers');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const fetchPhotos = () => {
    if (hasAccess('growth')) {
      api.get(`/admin/customers/${id}/photos`).then(({ data }) => setPhotos(data)).catch(() => {});
    }
  };
  useEffect(() => { fetchPhotos(); }, [id]);

  // Fetch communications
  useEffect(() => {
    setCommsLoading(true);
    api.get(`/admin/customers/${id}/communications`)
      .then(({ data }) => setCommunications(data))
      .catch(() => {})
      .finally(() => setCommsLoading(false));
  }, [id]);

  // Fetch form responses
  const fetchFormResponses = () => {
    api.get(`/admin/consultation-forms/customer/${id}/responses`)
      .then(({ data }) => setFormResponses(data))
      .catch(() => {});
  };
  useEffect(() => { fetchFormResponses(); }, [id]);

  const handleSendForm = async () => {
    if (!selectedFormId) return;
    setSendingForm(true);
    try {
      await api.post(`/admin/consultation-forms/${selectedFormId}/send`, { customerId: parseInt(id) });
      setSnackbar({ open: true, message: 'Form sent successfully', severity: 'success' });
      setSendFormOpen(false);
      setSelectedFormId('');
      fetchFormResponses();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to send form', severity: 'error' });
    } finally {
      setSendingForm(false);
    }
  };

  const openSendFormDialog = () => {
    api.get('/admin/consultation-forms').then(({ data }) => {
      setAvailableForms(data.filter(f => f.active));
    }).catch(() => {});
    setSendFormOpen(true);
  };

  const formatCommType = (type) => {
    const map = {
      booking_approved: 'Booking Confirmed', booking_rejected: 'Booking Rejected',
      booking_cancelled: 'Booking Cancelled', reminder_24h: '24h Reminder',
      reminder_2h: '2h Reminder', booking_confirmed: 'Booking Confirmed',
      waitlist_notification: 'Waitlist', consultation_form: 'Consultation Form',
      password_reset: 'Password Reset', welcome: 'Welcome',
    };
    return map[type] || (type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const handlePhotoUpload = async () => {
    if (!photoFile) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('photo', photoFile);
      fd.append('photo_type', photoType);
      if (photoPairId) fd.append('pair_id', photoPairId);
      if (photoCaption) fd.append('caption', photoCaption);
      await api.post(`/admin/customers/${id}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSnackbar({ open: true, message: 'Photo uploaded', severity: 'success' });
      setPhotoUploadOpen(false);
      setPhotoFile(null);
      setPhotoCaption('');
      setPhotoPairId('');
      fetchPhotos();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Upload failed', severity: 'error' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const deletePhoto = async (photoId) => {
    try {
      await api.delete(`/admin/customers/${id}/photos/${photoId}`);
      setPhotos(photos.filter(p => p.id !== photoId));
      setSnackbar({ open: true, message: 'Photo deleted', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete', severity: 'error' });
    }
  };

  // Group photos by pair_id
  const photoPairs = photos.reduce((acc, p) => {
    const key = p.pair_id || `single-${p.id}`;
    if (!acc[key]) acc[key] = {};
    acc[key][p.photo_type] = p;
    return acc;
  }, {});

  const unpairedBefores = photos.filter(p => p.photo_type === 'before' && !photos.some(a => a.photo_type === 'after' && a.pair_id === p.pair_id));

  const saveAll = async () => {
    try {
      await Promise.all([
        api.put(`/admin/customers/${id}/notes`, { notes }),
        api.put(`/admin/customers/${id}/preferences`, {
          allergies: allergies || null,
          preferences: preferences || null,
          tags: tags.length > 0 ? tags.join(',') : null,
        }),
      ]);
      setSnackbar({ open: true, message: 'Customer details saved', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to save', severity: 'error' });
    }
  };

  const saveContact = async () => {
    try {
      const { data } = await api.put(`/admin/customers/${id}/contact`, editContact);
      setCustomer(c => ({ ...c, ...data }));
      setEditingContact(false);
      setSnackbar({ open: true, message: 'Contact details updated', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to update', severity: 'error' });
    }
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTag('');
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/admin/customers/${id}`);
      navigate('/admin/customers');
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to delete customer', severity: 'error' });
      setDeleteDialog(false);
    }
  };

  if (loading) return <Typography>Loading...</Typography>;
  if (!customer) return <Typography>{person} not found</Typography>;

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={3}>
        <IconButton onClick={() => navigate('/admin/customers')}><ArrowBack /></IconButton>
        <Typography variant="h5" fontWeight={600} sx={{ flex: 1 }}>{customer.name}</Typography>
        <Button
          variant="contained" size="small"
          startIcon={<Add />}
          onClick={() => navigate('/admin/bookings/create', { state: { customer } })}
        >
          Book
        </Button>
        {customer.allow_admin_impersonation && (
          <Button
            variant="outlined" size="small"
            startIcon={<PersonOutline />}
            onClick={async () => {
              try {
                const { data } = await api.post(`/admin/impersonate/customer/${id}`);
                localStorage.setItem('customer_token', data.token);
                localStorage.setItem('customer_user', JSON.stringify(data.customer));
                window.open(`/t/${data.tenantSlug}/portal`, '_blank');
              } catch (err) {
                setSnackbar({ open: true, message: err.response?.data?.error || 'Impersonation failed', severity: 'error' });
              }
            }}
          >
            View as {person}
          </Button>
        )}
      </Box>

      {/* Stats */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Bookings', value: stats.total || 0 },
          { label: 'Completed', value: stats.completed || 0 },
          { label: 'Cancelled', value: stats.cancelled || 0 },
          { label: 'Total Spent', value: `£${(stats.totalSpent || 0).toFixed(2)}` },
          { label: 'Favourite', value: stats.favouriteService || '-' },
        ].map(s => (
          <Grid item xs={6} sm={4} md key={s.label}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                <Typography fontWeight={600}>{s.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Customer Info */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography fontWeight={600}>Contact Details</Typography>
                {!editingContact && (
                  <Button size="small" onClick={() => setEditingContact(true)}>Edit</Button>
                )}
              </Box>
              {editingContact ? (
                <Box>
                  <TextField fullWidth size="small" label="Name" margin="dense"
                    value={editContact.name} onChange={e => setEditContact(c => ({ ...c, name: e.target.value }))} />
                  <TextField fullWidth size="small" label="Email" margin="dense"
                    value={editContact.email} onChange={e => setEditContact(c => ({ ...c, email: e.target.value }))} />
                  <TextField fullWidth size="small" label="Phone" margin="dense"
                    value={editContact.phone} onChange={e => setEditContact(c => ({ ...c, phone: e.target.value }))} />
                  <FormControl fullWidth size="small" margin="dense">
                    <InputLabel>Gender</InputLabel>
                    <Select value={editContact.gender} label="Gender"
                      onChange={e => setEditContact(c => ({ ...c, gender: e.target.value }))}>
                      <MenuItem value="">Not specified</MenuItem>
                      <MenuItem value="female">Female</MenuItem>
                      <MenuItem value="male">Male</MenuItem>
                      <MenuItem value="non-binary">Non-binary</MenuItem>
                      <MenuItem value="other">Other</MenuItem>
                    </Select>
                  </FormControl>
                  <Box display="flex" gap={1} mt={1.5}>
                    <Button size="small" variant="contained" onClick={saveContact}>Save</Button>
                    <Button size="small" onClick={() => {
                      setEditingContact(false);
                      setEditContact({ name: customer.name || '', email: customer.email || '', phone: customer.phone || '', gender: customer.gender || '' });
                    }}>Cancel</Button>
                  </Box>
                </Box>
              ) : (
                <>
                  <Typography variant="body2"><strong>Email:</strong> {customer.email || 'Not provided'}</Typography>
                  <Typography variant="body2"><strong>Phone:</strong> {customer.phone || 'Not provided'}</Typography>
                  {customer.gender && (
                    <Typography variant="body2"><strong>Gender:</strong> {customer.gender}</Typography>
                  )}
                  {customer.client_source && (
                    <Typography variant="body2"><strong>Source:</strong> {customer.client_source}</Typography>
                  )}
                  <Typography variant="body2">
                    <strong>{person} since:</strong> {dayjs(customer.created_at).format('D MMM YYYY')}
                  </Typography>
                  {customer.first_visit_date && (
                    <Typography variant="body2">
                      <strong>First visit:</strong> {dayjs(customer.first_visit_date).format('D MMM YYYY')}
                    </Typography>
                  )}
                  {customer.last_visit_date && (
                    <Typography variant="body2">
                      <strong>Last visit:</strong> {dayjs(customer.last_visit_date).format('D MMM YYYY')}
                    </Typography>
                  )}
                </>
              )}

              {/* Card confirmation exemption */}
              <Box mt={2} pt={2} borderTop={1} borderColor="divider">
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={!!customer.card_required_exempt}
                      onChange={async (e) => {
                        const exempt = e.target.checked;
                        try {
                          await api.put(`/admin/customers/${id}/card-exempt`, { exempt });
                          setCustomer(c => ({ ...c, card_required_exempt: exempt }));
                          setSnackbar({ open: true, message: exempt ? 'Card confirmation exemption enabled' : 'Card confirmation exemption removed', severity: 'success' });
                        } catch {
                          setSnackbar({ open: true, message: 'Failed to update exemption', severity: 'error' });
                        }
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Exempt from card confirmation</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Skip card requirement when booking for this {person.toLowerCase()}
                      </Typography>
                    </Box>
                  }
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              {/* Allergies / Alerts */}
              <Box sx={{ bgcolor: allergies ? 'rgba(211, 47, 47, 0.06)' : 'transparent', borderRadius: 1, p: allergies ? 1.5 : 0, mb: 2 }}>
                <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                  <ReportProblem sx={{ fontSize: 18, color: allergies ? 'error.main' : 'text.secondary' }} />
                  <Typography fontWeight={600} variant="body2" color={allergies ? 'error.main' : 'text.primary'}>Allergies / Alerts</Typography>
                </Box>
                <TextField
                  fullWidth multiline rows={2} size="small"
                  placeholder="e.g. Nut allergy, sensitive skin, latex..."
                  value={allergies}
                  onChange={e => setAllergies(e.target.value)}
                />
              </Box>

              {/* Preferences */}
              <Typography fontWeight={600} variant="body2" mb={0.5}>Preferences</Typography>
              <TextField
                fullWidth multiline rows={2} size="small" sx={{ mb: 2 }}
                placeholder="Colour formulas, preferred products, notes..."
                value={preferences}
                onChange={e => setPreferences(e.target.value)}
              />

              {/* Tags */}
              <Typography fontWeight={600} variant="body2" mb={0.5}>Tags</Typography>
              <Box display="flex" flexWrap="wrap" gap={0.5} mb={1}>
                {tags.map(tag => (
                  <Chip
                    key={tag} label={tag} size="small" variant="outlined"
                    icon={<LocalOffer sx={{ fontSize: 14 }} />}
                    onDelete={() => setTags(tags.filter(t => t !== tag))}
                  />
                ))}
              </Box>
              <Box display="flex" gap={1} mb={2}>
                <TextField
                  size="small" placeholder="Add tag..." value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  sx={{ flex: 1 }}
                />
                <Button size="small" variant="outlined" onClick={addTag} disabled={!newTag.trim()}>
                  <Add sx={{ fontSize: 18 }} />
                </Button>
              </Box>

              {/* Admin Notes */}
              <Typography fontWeight={600} variant="body2" mb={0.5}>Admin Notes</Typography>
              <TextField
                fullWidth multiline rows={3} size="small"
                placeholder="Private notes about this customer..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />

              <Button size="small" variant="contained" sx={{ mt: 1.5 }} onClick={saveAll}>
                Save All
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Booking History */}
      <Typography variant="h6" fontWeight={600} mb={2}>Booking History</Typography>
      {bookings.length === 0 ? (
        <Typography color="text.secondary">No bookings</Typography>
      ) : (
        isMobile ? bookings.map(b => (
          <Card key={b.id} variant="outlined" sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography fontWeight={500}>{dayjs(b.date).format('D MMM YYYY')}</Typography>
                <Chip label={b.status} color={statusColors[b.status] || 'default'} size="small" />
              </Box>
              <Typography variant="body2" color="text.secondary" mt={0.3}>
                {b.start_time?.slice(0, 5)} - {b.end_time?.slice(0, 5)}
              </Typography>
              <Typography variant="body2" mt={0.3}>{b.service_names}</Typography>
              <Typography variant="body2" fontWeight={600} mt={0.3}>
                £{parseFloat(b.total_price).toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        )) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Date</strong></TableCell>
                <TableCell><strong>Time</strong></TableCell>
                <TableCell><strong>Services</strong></TableCell>
                <TableCell align="right"><strong>Price</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bookings.map(b => (
                <TableRow key={b.id}>
                  <TableCell>{dayjs(b.date).format('D MMM YYYY')}</TableCell>
                  <TableCell>{b.start_time?.slice(0, 5)} - {b.end_time?.slice(0, 5)}</TableCell>
                  <TableCell>{b.service_names}</TableCell>
                  <TableCell align="right">£{parseFloat(b.total_price).toFixed(2)}</TableCell>
                  <TableCell>
                    <Chip label={b.status} color={statusColors[b.status] || 'default'} size="small" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        )
      )}

      {/* Communication History */}
      <Box mt={3}>
        <Typography variant="h6" fontWeight={600} mb={2}>Communication History</Typography>
        {commsLoading ? (
          <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>
        ) : communications.length === 0 ? (
          <Typography color="text.secondary" variant="body2">No communications sent yet</Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Channel</strong></TableCell>
                  <TableCell><strong>Type</strong></TableCell>
                  <TableCell><strong>Subject / Preview</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Date</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {communications.map((c, i) => (
                  <TableRow key={`${c.channel}-${c.id || i}`}>
                    <TableCell>
                      <Chip
                        icon={c.channel === 'email' ? <Email sx={{ fontSize: 14 }} /> : <Sms sx={{ fontSize: 14 }} />}
                        label={c.channel === 'email' ? 'Email' : 'SMS'}
                        size="small" variant="outlined"
                        color={c.channel === 'email' ? 'info' : 'success'}
                      />
                    </TableCell>
                    <TableCell>{formatCommType(c.email_type || c.sms_type)}</TableCell>
                    <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.subject || c.message_preview || '-'}
                    </TableCell>
                    <TableCell>
                      <Chip label={c.status || 'sent'} size="small"
                        color={c.status === 'sent' ? 'success' : c.status === 'failed' ? 'error' : c.status === 'skipped' ? 'default' : 'warning'} />
                    </TableCell>
                    <TableCell>{dayjs(c.created_at).format('D MMM YYYY HH:mm')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Consultation Form Responses */}
      <Box mt={3}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight={600}>Consultation Forms</Typography>
          <Button size="small" variant="outlined" startIcon={<Send />} onClick={openSendFormDialog}>
            Send Form
          </Button>
        </Box>
        {formResponses.length === 0 ? (
          <Typography color="text.secondary" variant="body2">No consultation forms sent yet</Typography>
        ) : (
          formResponses.map(r => (
            <Accordion key={r.id} sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: '12px !important', mb: 1.5, '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box display="flex" alignItems="center" gap={1} flex={1} flexWrap="wrap">
                  <Assignment sx={{ fontSize: 18, color: 'text.secondary' }} />
                  <Typography fontWeight={500}>{r.form_name}</Typography>
                  <Chip label={r.status} size="small"
                    color={r.status === 'completed' ? 'success' : 'warning'} />
                  {r.signed && <Chip label="Signed" size="small" color="info" variant="outlined" />}
                  <Typography variant="caption" color="text.secondary" ml="auto">
                    {r.status === 'completed' ? `Completed ${dayjs(r.completed_at).format('D MMM YYYY')}` : `Sent ${dayjs(r.sent_at).format('D MMM YYYY')}`}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {r.status === 'pending' ? (
                  <Typography variant="body2" color="text.secondary">Awaiting response from {person.toLowerCase()}</Typography>
                ) : r.fields && r.responses ? (
                  <Box>
                    {r.fields.map(field => {
                      if (field.field_type === 'description_text') return null;
                      const val = r.responses[field.id]?.value;
                      return (
                        <Box key={field.id} mb={1.5}>
                          <Typography variant="body2" fontWeight={600}>{field.label}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {Array.isArray(val) ? val.join(', ') : typeof val === 'boolean' ? (val ? 'Yes' : 'No') : (val || '-')}
                          </Typography>
                        </Box>
                      );
                    })}
                    {r.signed && r.signed_at && (
                      <Typography variant="caption" color="text.secondary" mt={1} display="block">
                        Signed on {dayjs(r.signed_at).format('D MMM YYYY [at] HH:mm')}
                      </Typography>
                    )}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">No response data available</Typography>
                )}
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Box>

      {/* Send Form Dialog */}
      <Dialog open={sendFormOpen} onClose={() => setSendFormOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Send Consultation Form</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Select a form to send to {customer?.name}. They will receive an email with a link to fill it out.
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel>Select form</InputLabel>
            <Select value={selectedFormId} label="Select form" onChange={e => setSelectedFormId(e.target.value)}>
              {availableForms.map(f => (
                <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {availableForms.length === 0 && (
            <Typography variant="body2" color="text.secondary" mt={2}>
              No active forms available. Create one in the Forms section first.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendFormOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSendForm} disabled={!selectedFormId || sendingForm}>
            {sendingForm ? 'Sending...' : 'Send'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Photos */}
      {hasAccess('growth') && (
        <Box mt={3}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" fontWeight={600}>Before / After Photos</Typography>
            <Button size="small" variant="outlined" startIcon={<CameraAlt />}
              onClick={() => { setPhotoUploadOpen(true); setPhotoType('before'); setPhotoPairId(''); }}>
              Upload Photo
            </Button>
          </Box>
          {Object.entries(photoPairs).length === 0 ? (
            <Typography color="text.secondary" variant="body2">No photos yet</Typography>
          ) : (
            <Grid container spacing={2}>
              {Object.entries(photoPairs).map(([key, pair]) => (
                <Grid item xs={12} sm={6} key={key}>
                  <Card variant="outlined">
                    <CardContent sx={{ p: 1.5 }}>
                      <Box display="flex" gap={1}>
                        {pair.before && (
                          <Box sx={{ flex: 1, textAlign: 'center' }}>
                            <Typography variant="caption" fontWeight={600} display="block" mb={0.5}>Before</Typography>
                            <Box
                              component="img"
                              src={`/api/admin/customers/${id}/photos/${pair.before.id}`}
                              alt="Before"
                              sx={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 1, cursor: 'pointer' }}
                              onClick={() => setViewPhoto(pair.before)}
                            />
                            <IconButton size="small" color="error" onClick={() => deletePhoto(pair.before.id)}>
                              <Delete sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Box>
                        )}
                        {pair.after && (
                          <Box sx={{ flex: 1, textAlign: 'center' }}>
                            <Typography variant="caption" fontWeight={600} display="block" mb={0.5}>After</Typography>
                            <Box
                              component="img"
                              src={`/api/admin/customers/${id}/photos/${pair.after.id}`}
                              alt="After"
                              sx={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 1, cursor: 'pointer' }}
                              onClick={() => setViewPhoto(pair.after)}
                            />
                            <IconButton size="small" color="error" onClick={() => deletePhoto(pair.after.id)}>
                              <Delete sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Box>
                        )}
                        {pair.before && !pair.after && (
                          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Button size="small" variant="outlined" onClick={() => {
                              setPhotoType('after');
                              setPhotoPairId(pair.before.pair_id);
                              setPhotoUploadOpen(true);
                            }}>
                              + Add After
                            </Button>
                          </Box>
                        )}
                      </Box>
                      {(pair.before?.caption || pair.after?.caption) && (
                        <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                          {pair.before?.caption || pair.after?.caption}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Photo Upload Dialog */}
      <Dialog open={photoUploadOpen} onClose={() => setPhotoUploadOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Upload {photoType === 'before' ? 'Before' : 'After'} Photo</DialogTitle>
        <DialogContent>
          {photoType === 'after' && unpairedBefores.length > 0 && !photoPairId && (
            <Box mb={2}>
              <Typography variant="body2" mb={1}>Link to an existing "before" photo:</Typography>
              {unpairedBefores.map(p => (
                <Chip key={p.id} label={`${p.file_name} (${dayjs(p.created_at).format('D MMM')})`} size="small"
                  onClick={() => setPhotoPairId(p.pair_id)} variant={photoPairId === p.pair_id ? 'filled' : 'outlined'}
                  sx={{ mr: 0.5, mb: 0.5 }} />
              ))}
            </Box>
          )}
          <input type="file" accept="image/png,image/jpeg" onChange={e => setPhotoFile(e.target.files?.[0] || null)} />
          <TextField fullWidth size="small" label="Caption (optional)" margin="normal"
            value={photoCaption} onChange={e => setPhotoCaption(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPhotoUploadOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handlePhotoUpload} disabled={!photoFile || uploadingPhoto}>
            {uploadingPhoto ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Photo Viewer */}
      <Dialog open={!!viewPhoto} onClose={() => setViewPhoto(null)} maxWidth="md">
        <DialogContent sx={{ p: 1, position: 'relative' }}>
          <IconButton onClick={() => setViewPhoto(null)} sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(0,0,0,0.5)', color: '#fff' }}>
            <Close />
          </IconButton>
          {viewPhoto && (
            <Box component="img" src={`/api/admin/customers/${id}/photos/${viewPhoto.id}`}
              alt={viewPhoto.photo_type} sx={{ width: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Box mt={4} pt={3} borderTop={1} borderColor="divider">
        <Button color="error" variant="outlined" startIcon={<Delete />}
          onClick={() => setDeleteDialog(true)}>
          Delete {person} (GDPR)
        </Button>
        <Typography variant="caption" display="block" color="text.secondary" mt={0.5}>
          This will permanently delete this {person.toLowerCase()} and all associated data.
        </Typography>
      </Box>

      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>Delete {person} (GDPR)?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1, mb: 2 }}>
            This will permanently delete <strong>{customer.name}</strong>'s personal data. This action cannot be undone.
          </Alert>
          <Typography variant="body2" fontWeight={600} gutterBottom>What gets deleted:</Typography>
          <Typography variant="body2" color="text.secondary" component="ul" sx={{ pl: 2, mb: 1 }}>
            <li>{person} record (name, email, phone, notes, preferences)</li>
            <li>Messages and booking requests</li>
            <li>Loyalty stamps and redeemed rewards</li>
            <li>Email and SMS history</li>
            <li>Consultation form responses</li>
          </Typography>
          <Typography variant="body2" fontWeight={600} gutterBottom>What gets anonymised (kept for reporting):</Typography>
          <Typography variant="body2" color="text.secondary" component="ul" sx={{ pl: 2 }}>
            <li>Bookings (customer name replaced with "Deleted Customer")</li>
            <li>Reviews (anonymised)</li>
            <li>Payment records (preserved for accounting)</li>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Delete Permanently
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

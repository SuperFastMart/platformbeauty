import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, List, ListItemButton,
  ListItemText, ListItemAvatar, Avatar, Badge, TextField, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Divider,
  Snackbar, Alert, IconButton, CircularProgress, Tab, Tabs,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, ToggleButtonGroup, ToggleButton, useMediaQuery, useTheme,
  InputAdornment
} from '@mui/material';
import { Send, Add, Delete, PersonAdd, MessageOutlined, Email, Sms, Search, CheckCircle, Error as ErrorIcon, Schedule } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import useSubscriptionTier from '../../hooks/useSubscriptionTier';
import FeatureGate from '../../components/FeatureGate';
import ConfirmDialog from '../../components/ConfirmDialog';

const typeLabels = {
  booking_pending: 'Booking Pending',
  booking_approved: 'Booking Confirmed',
  booking_rejected: 'Booking Rejected',
  booking_edited: 'Booking Edited',
  reminder_24h: '24h Reminder',
  reminder_2h: '2h Reminder',
  admin_new_booking: 'New Booking Alert',
  magic_link: 'Magic Link',
  password_reset: 'Password Reset',
  message: 'Direct Message',
  gift_card: 'Gift Card',
  completion_followup: 'Follow-up',
  consultation_form: 'Consultation Form',
  booking_request_cancel: 'Cancel Request',
  booking_request_amend: 'Amend Request',
  request_approved: 'Request Approved',
  request_rejected: 'Request Rejected',
  card_confirmation: 'Card Confirmation',
  booking_confirmed: 'Booking Confirmed',
  waitlist_notification: 'Waitlist Notification',
};

const statusChipProps = {
  sent: { label: 'Sent', color: 'success', icon: <CheckCircle sx={{ fontSize: 14 }} /> },
  failed: { label: 'Failed', color: 'error', icon: <ErrorIcon sx={{ fontSize: 14 }} /> },
  pending: { label: 'Pending', color: 'warning', icon: <Schedule sx={{ fontSize: 14 }} /> },
  skipped: { label: 'Skipped', color: 'default', icon: null },
};

export default function Messages() {
  const { hasAccess } = useSubscriptionTier();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [activeTab, setActiveTab] = useState(0);
  const [messagingEnabled, setMessagingEnabled] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // --- Conversations tab state ---
  const [conversations, setConversations] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomerInfo, setSelectedCustomerInfo] = useState(null);
  const [thread, setThread] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', body: '', category: '' });
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [newConvoDialog, setNewConvoDialog] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState(null);

  // --- Comms log tab state ---
  const [commsLog, setCommsLog] = useState([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [commsPage, setCommsPage] = useState(0);
  const [commsTotal, setCommsTotal] = useState(0);
  const [commsChannel, setCommsChannel] = useState('all');
  const [commsSearch, setCommsSearch] = useState('');

  // Conversations fetching
  const fetchConversations = () => {
    api.get('/admin/messages/conversations')
      .then(({ data }) => setConversations(data))
      .catch(console.error);
  };

  const fetchTemplates = () => {
    api.get('/admin/messages/templates')
      .then(({ data }) => setTemplates(data))
      .catch(console.error);
  };

  useEffect(() => {
    fetchConversations();
    fetchTemplates();
    api.get('/admin/site-settings').then(({ data }) => {
      setMessagingEnabled(data.messaging_enabled !== false && data.messaging_enabled !== 'false');
    }).catch(() => {});
  }, []);

  // Comms log fetching
  const fetchCommsLog = () => {
    setCommsLoading(true);
    const params = new URLSearchParams({
      page: commsPage + 1,
      limit: 25,
      channel: commsChannel,
    });
    if (commsSearch) params.set('search', commsSearch);
    api.get(`/admin/messages/comms-log?${params}`)
      .then(({ data }) => {
        setCommsLog(data.items || []);
        setCommsTotal((data.total_emails || 0) + (data.total_sms || 0));
      })
      .catch(console.error)
      .finally(() => setCommsLoading(false));
  };

  useEffect(() => {
    if (activeTab === 1) fetchCommsLog();
  }, [activeTab, commsPage, commsChannel]);

  // Debounced search for comms log
  useEffect(() => {
    if (activeTab !== 1) return;
    const timeout = setTimeout(fetchCommsLog, 400);
    return () => clearTimeout(timeout);
  }, [commsSearch]);

  // Search customers when typing in new conversation dialog
  useEffect(() => {
    if (customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    setSearchLoading(true);
    const timeout = setTimeout(() => {
      api.get(`/admin/customers/search?q=${encodeURIComponent(customerSearch)}`)
        .then(({ data }) => setCustomerResults(data))
        .catch(console.error)
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [customerSearch]);

  const selectCustomer = (customerId, customerInfo) => {
    setSelectedCustomerId(customerId);
    if (customerInfo) setSelectedCustomerInfo(customerInfo);
    api.get(`/admin/messages/customer/${customerId}`)
      .then(({ data }) => setThread(data))
      .catch(console.error);
  };

  const handleStartConversation = (customer) => {
    setNewConvoDialog(false);
    setCustomerSearch('');
    setSelectedCustomerId(customer.id);
    setSelectedCustomerInfo({ name: customer.name, email: customer.email });
    api.get(`/admin/messages/customer/${customer.id}`)
      .then(({ data }) => setThread(data))
      .catch(console.error);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedCustomerId) return;
    setSending(true);
    try {
      await api.post('/admin/messages/send', {
        customerId: selectedCustomerId,
        subject: subject || null,
        body: newMessage,
      });
      setNewMessage('');
      setSubject('');
      selectCustomer(selectedCustomerId);
      fetchConversations();
      setSnackbar({ open: true, message: 'Message sent', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to send', severity: 'error' });
    } finally {
      setSending(false);
    }
  };

  const applyTemplate = (template) => {
    setSubject(template.subject || '');
    setNewMessage(template.body);
  };

  const handleSaveTemplate = async () => {
    try {
      if (editingTemplate) {
        await api.put(`/admin/messages/templates/${editingTemplate}`, templateForm);
      } else {
        await api.post('/admin/messages/templates', templateForm);
      }
      setTemplateDialog(false);
      setEditingTemplate(null);
      fetchTemplates();
      setSnackbar({ open: true, message: 'Template saved', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error', severity: 'error' });
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteTemplateId) return;
    try {
      await api.delete(`/admin/messages/templates/${deleteTemplateId}`);
      fetchTemplates();
      setDeleteConfirmOpen(false);
      setDeleteTemplateId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const selectedConversation = conversations.find(c => c.id === selectedCustomerId);
  const displayName = selectedConversation?.name || selectedCustomerInfo?.name || '';
  const displayEmail = selectedConversation?.email || selectedCustomerInfo?.email || '';
  const totalUnread = conversations.reduce((sum, c) => sum + parseInt(c.unread_count || 0), 0);

  if (!hasAccess('growth')) return <FeatureGate requiredTier="growth" featureName="Message Centre" />;

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={2}>Message Centre</Typography>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab
          label={
            <Box display="flex" alignItems="center" gap={1}>
              Conversations
              {totalUnread > 0 && <Chip label={totalUnread} color="error" size="small" sx={{ height: 20, fontSize: '0.75rem' }} />}
            </Box>
          }
        />
        <Tab label="Communications Log" />
        <Tab label="Templates" />
      </Tabs>

      {/* ========== TAB 0: Conversations ========== */}
      {activeTab === 0 && (
        <Box>
          {!messagingEnabled && (
            <Alert severity="info" icon={<MessageOutlined />} sx={{ mb: 3 }}>
              Customer messaging is currently disabled — your customers won't see the Messages tab in their portal.
              You can re-enable it in <strong>Settings &gt; Business &gt; Features</strong>.
            </Alert>
          )}
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button
              variant="contained"
              startIcon={<PersonAdd />}
              onClick={() => { setNewConvoDialog(true); setCustomerSearch(''); setCustomerResults([]); }}
            >
              New Message
            </Button>
          </Box>

          <Grid container spacing={2}>
            {/* Conversations sidebar */}
            <Grid item xs={12} md={4}>
              <Card sx={{ height: { xs: 300, md: 500 }, overflow: 'auto' }}>
                <CardContent sx={{ p: 0 }}>
                  {conversations.length === 0 ? (
                    <Box p={3}>
                      <Typography color="text.secondary">No conversations yet. Click "New Message" to send your first message to a customer.</Typography>
                    </Box>
                  ) : (
                    <List disablePadding>
                      {conversations.map(c => (
                        <ListItemButton
                          key={c.id}
                          selected={selectedCustomerId === c.id}
                          onClick={() => selectCustomer(c.id, c)}
                        >
                          <ListItemAvatar>
                            <Badge badgeContent={parseInt(c.unread_count) || 0} color="error">
                              <Avatar sx={{ width: 36, height: 36, fontSize: '0.9rem' }}>
                                {c.name?.charAt(0)}
                              </Avatar>
                            </Badge>
                          </ListItemAvatar>
                          <ListItemText
                            primary={c.name}
                            secondary={c.last_message?.slice(0, 50) + (c.last_message?.length > 50 ? '...' : '')}
                            primaryTypographyProps={{ fontWeight: parseInt(c.unread_count) > 0 ? 700 : 400 }}
                            secondaryTypographyProps={{ noWrap: true }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {c.last_message_at ? dayjs(c.last_message_at).format('D MMM') : ''}
                          </Typography>
                        </ListItemButton>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Message thread */}
            <Grid item xs={12} md={8}>
              <Card sx={{ height: { xs: 350, md: 500 }, display: 'flex', flexDirection: 'column' }}>
                {!selectedCustomerId ? (
                  <CardContent sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography color="text.secondary">Select a conversation or click "New Message" to get started</Typography>
                  </CardContent>
                ) : (
                  <>
                    {/* Header */}
                    <Box px={2} py={1.5} borderBottom={1} borderColor="divider">
                      <Typography fontWeight={600}>{displayName}</Typography>
                      <Typography variant="caption" color="text.secondary">{displayEmail}</Typography>
                    </Box>

                    {/* Messages */}
                    <Box flex={1} overflow="auto" p={2}>
                      {thread.length === 0 ? (
                        <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                          <Typography color="text.secondary">No messages yet. Send the first message below.</Typography>
                        </Box>
                      ) : thread.map(m => (
                        <Box
                          key={m.id}
                          mb={1.5}
                          display="flex"
                          justifyContent={m.direction === 'outbound' ? 'flex-end' : 'flex-start'}
                        >
                          <Box
                            maxWidth="75%"
                            p={1.5}
                            borderRadius={2}
                            bgcolor={m.direction === 'outbound' ? 'primary.main' : 'grey.100'}
                            color={m.direction === 'outbound' ? 'white' : 'text.primary'}
                          >
                            {m.subject && (
                              <Typography variant="caption" fontWeight={600} display="block" mb={0.5}>
                                {m.subject}
                              </Typography>
                            )}
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m.body}</Typography>
                            <Typography variant="caption" sx={{ opacity: 0.7 }} display="block" textAlign="right" mt={0.5}>
                              {dayjs(m.created_at).format('D MMM HH:mm')}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>

                    {/* Compose */}
                    <Box p={2} borderTop={1} borderColor="divider">
                      {templates.length > 0 && (
                        <Box display="flex" gap={0.5} mb={1} flexWrap="wrap">
                          {templates.map(t => (
                            <Chip
                              key={t.id}
                              label={t.name}
                              size="small"
                              onClick={() => applyTemplate(t)}
                              variant="outlined"
                            />
                          ))}
                        </Box>
                      )}
                      <TextField
                        size="small" fullWidth placeholder="Subject (optional)"
                        value={subject} onChange={e => setSubject(e.target.value)}
                        sx={{ mb: 1 }}
                      />
                      <Box display="flex" gap={1}>
                        <TextField
                          size="small" fullWidth placeholder="Type a message..."
                          value={newMessage} onChange={e => setNewMessage(e.target.value)}
                          multiline maxRows={3}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        />
                        <Button
                          variant="contained"
                          onClick={handleSend}
                          disabled={!newMessage.trim() || sending}
                          sx={{ minWidth: 'auto', px: 2 }}
                        >
                          <Send />
                        </Button>
                      </Box>
                    </Box>
                  </>
                )}
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* ========== TAB 1: Communications Log ========== */}
      {activeTab === 1 && (
        <Box>
          <Box display="flex" flexWrap="wrap" gap={2} mb={2} alignItems="center">
            <ToggleButtonGroup
              value={commsChannel}
              exclusive
              onChange={(_, v) => { if (v) { setCommsChannel(v); setCommsPage(0); } }}
              size="small"
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="email"><Email sx={{ mr: 0.5, fontSize: 18 }} /> Email</ToggleButton>
              <ToggleButton value="sms"><Sms sx={{ mr: 0.5, fontSize: 18 }} /> SMS</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              size="small"
              placeholder="Search by name, email, or subject..."
              value={commsSearch}
              onChange={e => { setCommsSearch(e.target.value); setCommsPage(0); }}
              sx={{ minWidth: 260 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18 }} /></InputAdornment>,
              }}
            />
          </Box>

          <Card>
            {commsLoading ? (
              <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>
            ) : commsLog.length === 0 ? (
              <CardContent>
                <Typography color="text.secondary" textAlign="center">No communications found.</Typography>
              </CardContent>
            ) : isMobile ? (
              /* Mobile card layout */
              <Box>
                {commsLog.map(item => (
                  <Box key={`${item.channel}-${item.id}`} p={2} borderBottom={1} borderColor="divider">
                    <Box display="flex" justifyContent="space-between" alignItems="start" mb={0.5}>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        {item.channel === 'email'
                          ? <Email sx={{ fontSize: 16, color: 'info.main' }} />
                          : <Sms sx={{ fontSize: 16, color: 'success.main' }} />}
                        <Typography variant="body2" fontWeight={600}>
                          {typeLabels[item.type] || item.type?.replace(/_/g, ' ')}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={statusChipProps[item.status]?.label || item.status}
                        color={statusChipProps[item.status]?.color || 'default'}
                        sx={{ height: 22, fontSize: '0.7rem' }}
                      />
                    </Box>
                    <Typography variant="body2">{item.recipient_name || item.recipient_email || item.recipient_phone}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {item.subject || item.message_preview || ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {dayjs(item.created_at).format('D MMM YYYY HH:mm')}
                    </Typography>
                    {item.error_message && (
                      <Typography variant="caption" color="error">{item.error_message}</Typography>
                    )}
                  </Box>
                ))}
              </Box>
            ) : (
              /* Desktop table layout */
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Channel</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Recipient</TableCell>
                      <TableCell>Subject / Preview</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {commsLog.map(item => (
                      <TableRow key={`${item.channel}-${item.id}`} hover>
                        <TableCell>
                          {item.channel === 'email'
                            ? <Chip icon={<Email sx={{ fontSize: 14 }} />} label="Email" size="small" color="info" variant="outlined" sx={{ height: 24 }} />
                            : <Chip icon={<Sms sx={{ fontSize: 14 }} />} label="SMS" size="small" color="success" variant="outlined" sx={{ height: 24 }} />}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {typeLabels[item.type] || item.type?.replace(/_/g, ' ')}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{item.recipient_name || '—'}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.recipient_email || item.recipient_phone || ''}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 250 }}>
                          <Typography variant="body2" noWrap>
                            {item.subject || item.message_preview || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={statusChipProps[item.status]?.label || item.status}
                            color={statusChipProps[item.status]?.color || 'default'}
                            sx={{ height: 24, fontSize: '0.75rem' }}
                          />
                          {item.error_message && (
                            <Typography variant="caption" color="error" display="block" mt={0.5}>
                              {item.error_message}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {dayjs(item.created_at).format('D MMM YYYY HH:mm')}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            <TablePagination
              component="div"
              count={commsTotal}
              page={commsPage}
              onPageChange={(_, p) => setCommsPage(p)}
              rowsPerPage={25}
              rowsPerPageOptions={[25]}
            />
          </Card>
        </Box>
      )}

      {/* ========== TAB 2: Templates ========== */}
      {activeTab === 2 && (
        <Box>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button startIcon={<Add />} variant="contained" onClick={() => {
              setEditingTemplate(null);
              setTemplateForm({ name: '', subject: '', body: '', category: '' });
              setTemplateDialog(true);
            }}>
              New Template
            </Button>
          </Box>
          {templates.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No templates yet. Create templates for common messages like appointment reminders or follow-ups.
            </Typography>
          ) : (
            <Grid container spacing={2}>
              {templates.map(t => (
                <Grid item xs={12} sm={6} md={4} key={t.id}>
                  <Card>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box display="flex" justifyContent="space-between" alignItems="start">
                        <Box>
                          <Typography fontWeight={600}>{t.name}</Typography>
                          {t.subject && <Typography variant="caption" color="text.secondary">{t.subject}</Typography>}
                        </Box>
                        <Box>
                          <Button size="small" onClick={() => {
                            setEditingTemplate(t.id);
                            setTemplateForm({ name: t.name, subject: t.subject || '', body: t.body, category: t.category || '' });
                            setTemplateDialog(true);
                          }}>Edit</Button>
                          <IconButton size="small" color="error" onClick={() => {
                            setDeleteTemplateId(t.id);
                            setDeleteConfirmOpen(true);
                          }}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>
                      <Typography variant="body2" color="text.secondary" mt={0.5} noWrap>{t.body}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* New Conversation Dialog */}
      <Dialog open={newConvoDialog} onClose={() => setNewConvoDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Message</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Search for a customer to send them a message.
          </Typography>
          <TextField
            fullWidth
            label="Search customers"
            placeholder="Type a name, email, or phone..."
            value={customerSearch}
            onChange={e => setCustomerSearch(e.target.value)}
            margin="normal"
            autoFocus
            InputProps={{
              endAdornment: searchLoading ? <CircularProgress size={20} /> : null,
            }}
          />
          {customerResults.length > 0 && (
            <List sx={{ maxHeight: 300, overflow: 'auto' }}>
              {customerResults.map(c => (
                <ListItemButton key={c.id} onClick={() => handleStartConversation(c)}>
                  <ListItemAvatar>
                    <Avatar sx={{ width: 32, height: 32, fontSize: '0.85rem' }}>{c.name?.charAt(0)}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={c.name}
                    secondary={c.email}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
          {customerSearch.length >= 2 && !searchLoading && customerResults.length === 0 && (
            <Typography variant="body2" color="text.secondary" mt={1}>
              No customers found matching "{customerSearch}"
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewConvoDialog(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={templateDialog} onClose={() => setTemplateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Template Name" margin="normal" required
            value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} />
          <TextField fullWidth label="Subject (optional)" margin="normal"
            value={templateForm.subject} onChange={e => setTemplateForm(f => ({ ...f, subject: e.target.value }))} />
          <TextField fullWidth label="Message Body" margin="normal" required multiline rows={4}
            value={templateForm.body} onChange={e => setTemplateForm(f => ({ ...f, body: e.target.value }))} />
          <TextField fullWidth label="Category (optional)" margin="normal"
            value={templateForm.category} onChange={e => setTemplateForm(f => ({ ...f, category: e.target.value }))}
            placeholder="e.g. Reminder, Follow-up" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTemplate} disabled={!templateForm.name || !templateForm.body}>
            {editingTemplate ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete template confirm */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteTemplate}
        title="Delete Template"
        message="Are you sure you want to delete this template? This cannot be undone."
        confirmLabel="Delete"
        confirmColor="error"
      />

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, List, ListItemButton,
  ListItemText, ListItemAvatar, Avatar, Badge, TextField, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Divider,
  Snackbar, Alert, IconButton, Autocomplete, CircularProgress
} from '@mui/material';
import { Send, Add, Delete, PersonAdd } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import useSubscriptionTier from '../../hooks/useSubscriptionTier';
import FeatureGate from '../../components/FeatureGate';

export default function Messages() {
  const { hasAccess } = useSubscriptionTier();
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
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // New conversation state
  const [newConvoDialog, setNewConvoDialog] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

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
  }, []);

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
    // Load any existing thread (may be empty)
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

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.delete(`/admin/messages/templates/${id}`);
      fetchTemplates();
    } catch (err) {
      console.error(err);
    }
  };

  const selectedConversation = conversations.find(c => c.id === selectedCustomerId);
  const displayName = selectedConversation?.name || selectedCustomerInfo?.name || '';
  const displayEmail = selectedConversation?.email || selectedCustomerInfo?.email || '';
  const totalUnread = conversations.reduce((sum, c) => sum + parseInt(c.unread_count || 0), 0);

  if (!hasAccess('growth')) return <FeatureGate requiredTier="growth" featureName="Customer Messages" />;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>
          Messages {totalUnread > 0 && <Chip label={totalUnread} color="error" size="small" sx={{ ml: 1 }} />}
        </Typography>
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

      {/* Templates section */}
      <Box mt={4}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight={600}>Message Templates</Typography>
          <Button size="small" startIcon={<Add />} onClick={() => {
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
                        <IconButton size="small" color="error" onClick={() => handleDeleteTemplate(t.id)}>
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

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

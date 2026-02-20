import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, CardContent, Chip, TextField, CircularProgress,
  Snackbar, Alert, IconButton
} from '@mui/material';
import { ArrowBack, Send } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';

const statusColor = { open: 'info', in_progress: 'warning', resolved: 'success', closed: 'default' };
const statusLabel = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
const priorityColor = { low: 'default', normal: 'info', high: 'warning', urgent: 'error' };
const categoryLabel = { general: 'General', bug: 'Bug Report', feature_request: 'Feature Request', billing: 'Billing' };

export default function SupportTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const messagesEndRef = useRef(null);

  const fetchTicket = () => {
    api.get(`/admin/support/${id}`)
      .then(({ data }) => setTicket(data))
      .catch(() => navigate('/admin/support'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTicket(); }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages?.length]);

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/admin/support/${id}/messages`, { content: reply });
      setReply('');
      fetchTicket();
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to send reply', severity: 'error' });
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;
  if (!ticket) return null;

  return (
    <Box>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/admin/support')} sx={{ mb: 2 }}>
        Back to Support
      </Button>

      {/* Ticket Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} mb={1}>{ticket.subject}</Typography>
          <Box display="flex" gap={1} flexWrap="wrap" mb={1}>
            <Chip label={statusLabel[ticket.status] || ticket.status} color={statusColor[ticket.status]} size="small" />
            <Chip label={ticket.priority} color={priorityColor[ticket.priority]} size="small" variant="outlined" />
            <Chip label={categoryLabel[ticket.category] || ticket.category} size="small" variant="outlined" />
          </Box>
          <Typography variant="caption" color="text.secondary">
            Created {dayjs(ticket.created_at).format('D MMM YYYY [at] HH:mm')} by {ticket.created_by_name}
          </Typography>
        </CardContent>
      </Card>

      {/* Messages Thread */}
      <Box sx={{ mb: 3 }}>
        {ticket.messages?.map(msg => (
          <Box
            key={msg.id}
            sx={{
              display: 'flex',
              justifyContent: msg.sender_type === 'tenant' ? 'flex-end' : 'flex-start',
              mb: 1.5,
            }}
          >
            <Box
              sx={{
                maxWidth: '80%',
                p: 2,
                borderRadius: 2,
                bgcolor: msg.sender_type === 'tenant' ? 'primary.main' : 'grey.100',
                color: msg.sender_type === 'tenant' ? 'white' : 'text.primary',
              }}
            >
              <Typography variant="caption" fontWeight={600} display="block" mb={0.5}
                sx={{ color: msg.sender_type === 'tenant' ? 'rgba(255,255,255,0.85)' : 'text.secondary' }}>
                {msg.sender_name}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{msg.content}</Typography>
              <Typography variant="caption" display="block" mt={0.5}
                sx={{ color: msg.sender_type === 'tenant' ? 'rgba(255,255,255,0.7)' : 'text.disabled' }}>
                {dayjs(msg.created_at).format('D MMM HH:mm')}
              </Typography>
            </Box>
          </Box>
        ))}
        <div ref={messagesEndRef} />
      </Box>

      {/* Reply box */}
      {ticket.status !== 'closed' && (
        <Card>
          <CardContent>
            <Box display="flex" gap={1} alignItems="flex-end">
              <TextField
                fullWidth multiline rows={2}
                placeholder="Write a reply..."
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              />
              <IconButton
                color="primary" onClick={handleSend}
                disabled={sending || !reply.trim()}
                sx={{ minWidth: 48, minHeight: 48 }}
              >
                {sending ? <CircularProgress size={24} /> : <Send />}
              </IconButton>
            </Box>
          </CardContent>
        </Card>
      )}

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

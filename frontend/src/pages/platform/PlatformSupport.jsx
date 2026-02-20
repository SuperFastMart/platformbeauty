import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Chip, TextField, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Select, MenuItem, FormControl, InputLabel, InputAdornment, Grid,
  useMediaQuery, useTheme
} from '@mui/material';
import { Search } from '@mui/icons-material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../../api/client';

dayjs.extend(relativeTime);

const statusColor = { open: 'info', in_progress: 'warning', resolved: 'success', closed: 'default' };
const statusLabel = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
const priorityColor = { low: 'default', normal: 'info', high: 'warning', urgent: 'error' };
const categoryLabel = { general: 'General', bug: 'Bug Report', feature_request: 'Feature Request', billing: 'Billing' };

export default function PlatformSupport() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');

  const fetchTickets = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (priorityFilter) params.set('priority', priorityFilter);
    if (search) params.set('search', search);

    api.get(`/platform/support?${params.toString()}`)
      .then(({ data }) => setTickets(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTickets(); }, [statusFilter, priorityFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchTickets, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const stats = {
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    total: tickets.length,
  };

  if (loading) return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Support Tickets</Typography>

      {/* Stats */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Open', value: stats.open, color: '#1976d2' },
          { label: 'In Progress', value: stats.in_progress, color: '#ed6c02' },
          { label: 'Resolved', value: stats.resolved, color: '#2e7d32' },
          { label: 'Total', value: stats.total, color: '#8B2635' },
        ].map(s => (
          <Grid item xs={6} sm={3} key={s.label}>
            <Card sx={{ borderTop: `3px solid ${s.color}` }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" fontWeight={700} color={s.color}>{s.value}</Typography>
                <Typography variant="body2" color="text.secondary">{s.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <TextField
          size="small" placeholder="Search tickets or tenants..."
          value={search} onChange={e => setSearch(e.target.value)}
          sx={{ minWidth: 250 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="open">Open</MenuItem>
            <MenuItem value="in_progress">In Progress</MenuItem>
            <MenuItem value="resolved">Resolved</MenuItem>
            <MenuItem value="closed">Closed</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Priority</InputLabel>
          <Select value={priorityFilter} label="Priority" onChange={e => setPriorityFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="low">Low</MenuItem>
            <MenuItem value="normal">Normal</MenuItem>
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="urgent">Urgent</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <Card><CardContent><Typography color="text.secondary" textAlign="center">No tickets found</Typography></CardContent></Card>
      ) : isMobile ? (
        <Box display="flex" flexDirection="column" gap={2}>
          {tickets.map(ticket => (
            <Card
              key={ticket.id}
              sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 } }}
              onClick={() => navigate(`/platform/support/${ticket.id}`)}
            >
              <CardContent>
                <Typography fontWeight={600} mb={0.5}>{ticket.subject}</Typography>
                <Typography variant="body2" color="text.secondary" mb={1}>
                  {ticket.tenant_name}
                </Typography>
                <Box display="flex" gap={0.5} flexWrap="wrap" mb={1}>
                  <Chip label={statusLabel[ticket.status] || ticket.status} color={statusColor[ticket.status]} size="small" />
                  <Chip label={ticket.priority} color={priorityColor[ticket.priority]} size="small" variant="outlined" />
                  <Chip label={categoryLabel[ticket.category] || ticket.category} size="small" variant="outlined" />
                </Box>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    {ticket.message_count} messages
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {dayjs(ticket.updated_at).fromNow()}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Subject</TableCell>
                <TableCell>Tenant</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Messages</TableCell>
                <TableCell>Last Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tickets.map(ticket => (
                <TableRow
                  key={ticket.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/platform/support/${ticket.id}`)}
                >
                  <TableCell>
                    <Typography fontWeight={600} variant="body2">{ticket.subject}</Typography>
                    <Typography variant="caption" color="text.secondary">{ticket.created_by_name}</Typography>
                  </TableCell>
                  <TableCell>{ticket.tenant_name}</TableCell>
                  <TableCell>
                    <Chip label={categoryLabel[ticket.category] || ticket.category} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip label={ticket.priority} color={priorityColor[ticket.priority]} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip label={statusLabel[ticket.status] || ticket.status} color={statusColor[ticket.status]} size="small" />
                  </TableCell>
                  <TableCell align="center">{ticket.message_count}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{dayjs(ticket.updated_at).fromNow()}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

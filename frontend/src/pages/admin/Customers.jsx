import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, TextField, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Chip, InputAdornment
} from '@mui/material';
import { Search, ChevronRight } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/admin/customers')
      .then(({ data }) => setCustomers(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? customers.filter(c =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search)
      )
    : customers;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>Customers</Typography>
        <Chip label={`${customers.length} total`} size="small" />
      </Box>

      <TextField
        placeholder="Search by name, email, or phone..."
        size="small" sx={{ mb: 3, maxWidth: 400 }}
        fullWidth
        value={search}
        onChange={e => setSearch(e.target.value)}
        InputProps={{
          startAdornment: <InputAdornment position="start"><Search /></InputAdornment>
        }}
      />

      {loading ? (
        <Typography>Loading...</Typography>
      ) : filtered.length === 0 ? (
        <Typography color="text.secondary">
          {search ? 'No customers match your search' : 'No customers yet'}
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Email</strong></TableCell>
                <TableCell><strong>Phone</strong></TableCell>
                <TableCell align="center"><strong>Bookings</strong></TableCell>
                <TableCell align="right"><strong>Total Spent</strong></TableCell>
                <TableCell><strong>Last Booking</strong></TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(c => (
                <TableRow
                  key={c.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/admin/customers/${c.id}`)}
                >
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{c.email}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{c.phone || '-'}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={c.booking_count || 0} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="right">
                    £{parseFloat(c.total_spent || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {c.last_booking_date
                      ? dayjs(c.last_booking_date).format('D MMM YYYY')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small"><ChevronRight /></IconButton>
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

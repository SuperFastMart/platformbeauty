import { useMemo } from 'react';
import { Box, Typography, IconButton, Button, CircularProgress } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import dayjs from 'dayjs';

const DAY_START = 7; // 7:00
const DAY_END = 21; // 21:00
const ROW_HEIGHT = 48; // pixels per 30-min slot
const TOTAL_ROWS = (DAY_END - DAY_START) * 2; // 28 rows
const HEADER_HEIGHT = 52;

const statusColors = {
  pending: { bg: '#fff3e0', border: '#ed6c02', text: '#e65100' },
  confirmed: { bg: '#e8f5e9', border: '#2e7d32', text: '#1b5e20' },
  completed: { bg: '#e3f2fd', border: '#1976d2', text: '#0d47a1' },
  rejected: { bg: '#ffebee', border: '#d32f2f', text: '#b71c1c' },
  cancelled: { bg: '#f5f5f5', border: '#9e9e9e', text: '#616161' },
  pending_confirmation: { bg: '#e3f2fd', border: '#1976d2', text: '#0d47a1' },
};

export default function WeekCalendar({ bookings, weekStart, onBookingClick, onEmptySlotClick, loading }) {
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));
  }, [weekStart]);

  const timeLabels = useMemo(() => {
    const labels = [];
    for (let h = DAY_START; h < DAY_END; h++) {
      labels.push(`${String(h).padStart(2, '0')}:00`);
      labels.push(`${String(h).padStart(2, '0')}:30`);
    }
    return labels;
  }, []);

  // Group bookings by date
  const bookingsByDate = useMemo(() => {
    const map = {};
    days.forEach(d => { map[d.format('YYYY-MM-DD')] = []; });
    (bookings || []).forEach(b => {
      const dateStr = dayjs(b.date).format('YYYY-MM-DD');
      if (map[dateStr]) map[dateStr].push(b);
    });
    return map;
  }, [bookings, days]);

  const getBlockStyle = (booking) => {
    const [sh, sm] = (booking.start_time || '00:00').split(':').map(Number);
    const [eh, em] = (booking.end_time || '00:00').split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const dayStartMin = DAY_START * 60;

    const top = ((startMin - dayStartMin) / 30) * ROW_HEIGHT;
    const height = Math.max(((endMin - startMin) / 30) * ROW_HEIGHT, ROW_HEIGHT * 0.8);

    const colors = statusColors[booking.status] || statusColors.confirmed;

    return {
      position: 'absolute',
      top: `${top}px`,
      height: `${height}px`,
      left: '2px',
      right: '2px',
      bgcolor: colors.bg,
      borderLeft: `3px solid ${colors.border}`,
      borderRadius: '4px',
      px: 0.5,
      py: 0.25,
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'box-shadow 0.2s',
      '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
      zIndex: 2,
    };
  };

  const handleDayClick = (e, day) => {
    // Calculate time from click position
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const slotIndex = Math.floor(y / ROW_HEIGHT);
    const hours = DAY_START + Math.floor(slotIndex / 2);
    const mins = (slotIndex % 2) * 30;
    const time = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    if (onEmptySlotClick) onEmptySlotClick(day.format('YYYY-MM-DD'), time);
  };

  const today = dayjs().format('YYYY-MM-DD');

  return (
    <Box>
      {loading && (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress size={24} /></Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', border: '1px solid', borderColor: 'divider', borderRadius: '8px', overflow: 'hidden', bgcolor: 'background.paper' }}>
        {/* Header row */}
        <Box sx={{ height: HEADER_HEIGHT, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" color="text.secondary">Time</Typography>
        </Box>
        {days.map(day => {
          const isToday = day.format('YYYY-MM-DD') === today;
          return (
            <Box key={day.format('YYYY-MM-DD')} sx={{
              height: HEADER_HEIGHT, borderBottom: '1px solid', borderLeft: '1px solid', borderColor: 'divider',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              bgcolor: isToday ? 'primary.main' : 'grey.50', color: isToday ? '#fff' : 'text.primary',
            }}>
              <Typography variant="caption" fontWeight={600}>{day.format('ddd')}</Typography>
              <Typography variant="body2" fontWeight={isToday ? 700 : 400}>{day.format('D')}</Typography>
            </Box>
          );
        })}

        {/* Time grid */}
        {/* Time gutter */}
        <Box sx={{ position: 'relative' }}>
          {timeLabels.map((label, i) => (
            <Box key={label} sx={{
              height: ROW_HEIGHT, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: 0.3,
              borderBottom: i % 2 === 1 ? '1px solid' : '1px dashed', borderColor: 'divider',
            }}>
              {i % 2 === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>{label}</Typography>
              )}
            </Box>
          ))}
        </Box>

        {/* Day columns */}
        {days.map(day => {
          const dateStr = day.format('YYYY-MM-DD');
          const dayBookings = bookingsByDate[dateStr] || [];

          return (
            <Box key={dateStr} sx={{ position: 'relative', borderLeft: '1px solid', borderColor: 'divider' }}
              onClick={(e) => {
                if (e.target === e.currentTarget || e.target.closest('[data-time-row]')) {
                  handleDayClick(e, day);
                }
              }}
            >
              {/* Time row backgrounds */}
              {timeLabels.map((_, i) => (
                <Box key={i} data-time-row sx={{
                  height: ROW_HEIGHT,
                  borderBottom: i % 2 === 1 ? '1px solid' : '1px dashed', borderColor: 'divider',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }} />
              ))}

              {/* Booking blocks */}
              {dayBookings.map(b => (
                <Box key={b.id} sx={getBlockStyle(b)}
                  onClick={(e) => { e.stopPropagation(); onBookingClick?.(b.id); }}>
                  <Typography variant="caption" fontWeight={600} noWrap sx={{ fontSize: '0.7rem', color: (statusColors[b.status] || statusColors.confirmed).text }}>
                    {b.customer_name}
                  </Typography>
                  <Typography variant="caption" display="block" noWrap sx={{ fontSize: '0.6rem', color: (statusColors[b.status] || statusColors.confirmed).text, opacity: 0.8 }}>
                    {b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)}
                  </Typography>
                  <Typography variant="caption" display="block" noWrap sx={{ fontSize: '0.6rem', color: (statusColors[b.status] || statusColors.confirmed).text, opacity: 0.7 }}>
                    {b.service_names}
                  </Typography>
                </Box>
              ))}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

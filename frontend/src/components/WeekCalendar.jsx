import { useMemo, useRef, useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Button, Tooltip } from '@mui/material';
import { Repeat } from '@mui/icons-material';
import dayjs from 'dayjs';

const frequencyLabels = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  '4-weekly': 'Every 4 weeks',
  monthly: 'Monthly',
};

const DAY_START = 7;
const DAY_END = 21;
const ROW_HEIGHT = 48; // px per 30-min slot
const HEADER_HEIGHT = 52;
const MIN_BLOCK_PX = 22; // minimum visible height for short services

const statusColors = {
  pending: { bg: '#fff3e0', border: '#ed6c02', text: '#e65100' },
  confirmed: { bg: '#e8f5e9', border: '#2e7d32', text: '#1b5e20' },
  completed: { bg: '#e3f2fd', border: '#1976d2', text: '#0d47a1' },
  rejected: { bg: '#ffebee', border: '#d32f2f', text: '#b71c1c' },
  cancelled: { bg: '#f5f5f5', border: '#9e9e9e', text: '#616161' },
  pending_confirmation: { bg: '#e3f2fd', border: '#1976d2', text: '#0d47a1' },
};

const toMin = (t) => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; };
const toTime = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`;

// Side-by-side columns for genuinely overlapping bookings (different clients)
function computeOverlapLayout(dayBookings) {
  const sorted = [...dayBookings].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
  const colEnds = [];
  const layout = {};
  sorted.forEach(b => {
    const start = toMin(b.start_time);
    let col = colEnds.findIndex(end => end <= start);
    if (col === -1) col = colEnds.length;
    colEnds[col] = toMin(b.end_time);
    layout[b.id] = { col };
  });
  const totalCols = colEnds.length || 1;
  Object.values(layout).forEach(l => { l.totalCols = totalCols; });
  return layout;
}

export default function WeekCalendar({ bookings, weekStart, onBookingClick, onEmptySlotClick, loading, categoryColors, servicesMap, onReschedule }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);

  const timeLabels = useMemo(() => {
    const labels = [];
    for (let h = DAY_START; h < DAY_END; h++) {
      labels.push(`${String(h).padStart(2, '0')}:00`);
      labels.push(`${String(h).padStart(2, '0')}:30`);
    }
    return labels;
  }, []);

  // Expand multi-service bookings into consecutive per-service blocks
  const expandedBookings = useMemo(() => {
    const result = [];
    (bookings || []).forEach(b => {
      const ids = (b.service_ids || '').split(',').map(s => parseInt(s.trim())).filter(Boolean);
      const names = (b.service_names || '').split(',').map(s => s.trim());

      if (!servicesMap || ids.length <= 1 || !ids.every(id => servicesMap[id])) {
        result.push(b);
        return;
      }

      let currentStart = toMin(b.start_time);
      ids.forEach((id, idx) => {
        const service = servicesMap[id];
        const duration = service?.duration || Math.round(b.total_duration / ids.length);
        const endMins = currentStart + duration;

        result.push({
          ...b,
          id: `${b.id}_svc_${idx}`,
          _bookingId: b.id,
          start_time: toTime(currentStart),
          end_time: toTime(endMins),
          total_duration: duration,
          service_names: names[idx] || service?.name || b.service_names,
          primary_category: service?.category || b.primary_category,
        });

        currentStart = endMins;
      });
    });
    return result;
  }, [bookings, servicesMap]);

  // Group by date
  const bookingsByDate = useMemo(() => {
    const map = {};
    days.forEach(d => { map[d.format('YYYY-MM-DD')] = []; });
    expandedBookings.forEach(b => {
      const dateStr = dayjs(b.date).format('YYYY-MM-DD');
      if (map[dateStr]) map[dateStr].push(b);
    });
    return map;
  }, [expandedBookings, days]);

  // Active category legend
  const activeCategories = useMemo(() => {
    if (!categoryColors || !Object.keys(categoryColors).length) return [];
    const used = new Set();
    expandedBookings.forEach(b => { if (b.primary_category && categoryColors[b.primary_category]) used.add(b.primary_category); });
    return Array.from(used).sort();
  }, [expandedBookings, categoryColors]);

  // Drag & drop
  const holdTimerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const wasDraggingRef = useRef(false); // stays true through the click event after mouseup
  const [draggingBooking, setDraggingBooking] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [dragConfirm, setDragConfirm] = useState(null);
  const gridRef = useRef(null);

  useEffect(() => {
    return () => { clearTimeout(holdTimerRef.current); };
  }, []);

  const cancelDrag = () => {
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    isDraggingRef.current = false;
    setDraggingBooking(null);
    setDragPos(null);
    setDragTarget(null);
  };

  const handleBookingMouseDown = (e, b) => {
    if (!onReschedule) return;
    e.preventDefault();
    const booking = b;
    holdTimerRef.current = setTimeout(() => {
      isDraggingRef.current = true;
      setDraggingBooking(booking);
      setDragPos({ x: e.clientX, y: e.clientY });
    }, 2000);
  };

  const handleGridMouseMove = (e) => {
    if (!isDraggingRef.current || !gridRef.current) return;
    setDragPos({ x: e.clientX, y: e.clientY });
    const rect = gridRef.current.getBoundingClientRect();
    const relY = e.clientY - rect.top - HEADER_HEIGHT;
    const relX = e.clientX - rect.left - 60;
    if (relY < 0 || relX < 0) return;
    const slotIdx = Math.floor(relY / ROW_HEIGHT);
    const hours = DAY_START + Math.floor(slotIdx / 2);
    const mins = (slotIdx % 2) * 30;
    if (hours < DAY_START || hours >= DAY_END) return;
    const colWidth = (rect.width - 60) / 7;
    const dayIdx = Math.max(0, Math.min(6, Math.floor(relX / colWidth)));
    setDragTarget({
      date: days[dayIdx].format('YYYY-MM-DD'),
      time: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
    });
  };

  const handleGridMouseUp = (e) => {
    clearTimeout(holdTimerRef.current);
    if (isDraggingRef.current) {
      wasDraggingRef.current = true;
      // Clear wasDragging after click events have fired
      setTimeout(() => { wasDraggingRef.current = false; }, 0);
      if (draggingBooking && dragTarget) {
        const origDate = dayjs(draggingBooking.date).format('YYYY-MM-DD');
        const origTime = draggingBooking.start_time?.slice(0, 5);
        if (dragTarget.date !== origDate || dragTarget.time !== origTime) {
          setDragConfirm({ booking: draggingBooking, newDate: dragTarget.date, newTime: dragTarget.time });
        }
      }
    }
    isDraggingRef.current = false;
    setDraggingBooking(null);
    setDragPos(null);
    setDragTarget(null);
  };

  const handleBookingMouseUp = (e, b) => {
    clearTimeout(holdTimerRef.current);
    if (!isDraggingRef.current && !wasDraggingRef.current) {
      onBookingClick?.(b._bookingId || b.id);
    }
  };

  const getBlockStyle = (b, overlapLayout) => {
    const [sh, sm] = (b.start_time || '00:00').split(':').map(Number);
    const [eh, em] = (b.end_time || '00:00').split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const dayStartMin = DAY_START * 60;
    const top = ((startMin - dayStartMin) / 30) * ROW_HEIGHT;
    const rawHeight = ((endMin - startMin) / 30) * ROW_HEIGHT;
    const height = Math.max(rawHeight, MIN_BLOCK_PX);

    const colors = statusColors[b.status] || statusColors.confirmed;
    const catColor = categoryColors?.[b.primary_category] || null;

    const { col = 0, totalCols = 1 } = overlapLayout?.[b.id] || {};
    const colWidthPct = 100 / totalCols;

    return {
      position: 'absolute',
      top: `${top}px`,
      height: `${height}px`,
      left: `calc(${col * colWidthPct}% + 2px)`,
      width: `calc(${colWidthPct}% - 4px)`,
      bgcolor: catColor ? `${catColor}18` : colors.bg,
      borderLeft: catColor ? `4px solid ${catColor}` : `3px solid ${colors.border}`,
      borderRadius: '4px',
      px: 0.5,
      py: 0.25,
      overflow: 'hidden',
      cursor: onReschedule ? 'grab' : 'pointer',
      transition: 'box-shadow 0.2s',
      '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
      zIndex: 2,
      userSelect: 'none',
    };
  };

  const handleDayClick = (e, day) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const slotIndex = Math.floor(y / ROW_HEIGHT);
    const hours = DAY_START + Math.floor(slotIndex / 2);
    const mins = (slotIndex % 2) * 30;
    const time = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    onEmptySlotClick?.(day.format('YYYY-MM-DD'), time);
  };

  const today = dayjs().format('YYYY-MM-DD');

  return (
    <Box>
      {loading && <Box display="flex" justifyContent="center" py={4}><CircularProgress size={24} /></Box>}

      {activeCategories.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1, px: 1 }}>
          {activeCategories.map(cat => (
            <Chip key={cat} size="small"
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: categoryColors[cat], flexShrink: 0 }} />
                  {cat}
                </Box>
              }
              variant="outlined" sx={{ fontSize: '0.7rem', height: 24 }}
            />
          ))}
        </Box>
      )}

      {onReschedule && (
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5} px={1}>
          Hold a booking for 2 seconds to drag and reschedule.
        </Typography>
      )}

      <Box
        ref={gridRef}
        onMouseMove={handleGridMouseMove}
        onMouseUp={handleGridMouseUp}
        onMouseLeave={cancelDrag}
        sx={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', border: '1px solid', borderColor: 'divider', borderRadius: '8px', overflow: 'hidden', bgcolor: 'background.paper' }}
      >
        {/* Header */}
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
          const overlapLayout = computeOverlapLayout(dayBookings);
          const isDragTarget = dragTarget?.date === dateStr;

          return (
            <Box key={dateStr}
              sx={{ position: 'relative', borderLeft: '1px solid', borderColor: 'divider' }}
              onClick={(e) => {
                if (!isDraggingRef.current && !wasDraggingRef.current && (e.target === e.currentTarget || e.target.closest('[data-time-row]'))) {
                  handleDayClick(e, day);
                }
              }}
            >
              {timeLabels.map((_, i) => (
                <Box key={i} data-time-row sx={{
                  height: ROW_HEIGHT,
                  borderBottom: i % 2 === 1 ? '1px solid' : '1px dashed', borderColor: 'divider',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }} />
              ))}

              {/* Drag target highlight */}
              {isDragTarget && dragTarget && (() => {
                const [th, tm] = dragTarget.time.split(':').map(Number);
                const top = ((th * 60 + tm - DAY_START * 60) / 30) * ROW_HEIGHT;
                return (
                  <Box sx={{
                    position: 'absolute', top: `${top}px`, left: 2, right: 2,
                    height: ROW_HEIGHT, bgcolor: 'primary.main', opacity: 0.15,
                    borderRadius: '4px', zIndex: 1, pointerEvents: 'none',
                  }} />
                );
              })()}

              {dayBookings.map(b => (
                <Box key={b.id} sx={getBlockStyle(b, overlapLayout)}
                  onMouseDown={(e) => handleBookingMouseDown(e, b)}
                  onMouseUp={(e) => handleBookingMouseUp(e, b)}
                >
                  {b.is_recurring && (
                    <Tooltip title={`Recurring (${frequencyLabels[b.recurrence_frequency] || b.recurrence_frequency})`} arrow>
                      <Repeat sx={{ fontSize: 12, position: 'absolute', top: 2, right: 2, opacity: 0.7, color: (statusColors[b.status] || statusColors.confirmed).text }} />
                    </Tooltip>
                  )}
                  <Typography variant="caption" fontWeight={600} noWrap sx={{ fontSize: '0.7rem', color: (statusColors[b.status] || statusColors.confirmed).text, pr: b.is_recurring ? 1.5 : 0, lineHeight: 1.2 }}>
                    {b.customer_name}
                  </Typography>
                  <Typography variant="caption" display="block" noWrap sx={{ fontSize: '0.6rem', color: (statusColors[b.status] || statusColors.confirmed).text, opacity: 0.8, lineHeight: 1.2 }}>
                    {b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)}
                  </Typography>
                  <Typography variant="caption" display="block" noWrap sx={{ fontSize: '0.6rem', color: (statusColors[b.status] || statusColors.confirmed).text, opacity: 0.7, lineHeight: 1.2 }}>
                    {b.service_names}
                  </Typography>
                </Box>
              ))}
            </Box>
          );
        })}
      </Box>

      {/* Drag ghost */}
      {draggingBooking && dragPos && (
        <Box sx={{
          position: 'fixed', left: dragPos.x + 12, top: dragPos.y - 16,
          bgcolor: 'primary.main', color: '#fff', borderRadius: '6px',
          px: 1.5, py: 0.75, pointerEvents: 'none', zIndex: 9999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', minWidth: 120, maxWidth: 180,
        }}>
          <Typography variant="caption" fontWeight={700} noWrap display="block">{draggingBooking.customer_name}</Typography>
          <Typography variant="caption" noWrap display="block" sx={{ opacity: 0.85 }}>{draggingBooking.service_names}</Typography>
          {dragTarget && (
            <Typography variant="caption" display="block" sx={{ opacity: 0.75, mt: 0.25 }}>
              → {dayjs(dragTarget.date).format('ddd D MMM')} {dragTarget.time}
            </Typography>
          )}
        </Box>
      )}

      {/* Drag confirm dialog */}
      <Dialog open={!!dragConfirm} onClose={() => setDragConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Reschedule Booking?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Move <strong>{dragConfirm?.booking?.customer_name}</strong> — {dragConfirm?.booking?.service_names}
          </Typography>
          <Typography variant="body2" mt={1}>
            To: <strong>{dragConfirm && dayjs(dragConfirm.newDate).format('ddd D MMM YYYY')} at {dragConfirm?.newTime}</strong>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDragConfirm(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => {
            onReschedule?.(dragConfirm.booking._bookingId || dragConfirm.booking.id, dragConfirm.newDate, dragConfirm.newTime);
            setDragConfirm(null);
          }}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

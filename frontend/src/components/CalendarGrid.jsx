import { useMemo } from 'react';
import { Box, Typography, IconButton, Grid } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import dayjs from 'dayjs';
import { getCalendarDays } from '../utils/slotUtils';

export default function CalendarGrid({
  calendarMonth,
  onMonthChange,
  selectedDate = null,
  onDateSelect,
  multiSelect = false,
  selectedDates = [],
  onDateToggle,
  compact = false,
  disablePast = true,
}) {
  const today = useMemo(() => dayjs().startOf('day'), []);
  const days = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);

  const cellPy = compact ? 0.8 : 1.2;
  const fontSize = compact ? 'caption' : 'body2';

  return (
    <Box>
      {/* Month navigation */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <IconButton
          onClick={() => onMonthChange(calendarMonth.subtract(1, 'month'))}
          disabled={disablePast && calendarMonth.isSame(dayjs().startOf('month'))}
          size="small"
        >
          <ChevronLeft />
        </IconButton>
        <Typography fontWeight={600} variant={compact ? 'body2' : 'body1'}>
          {calendarMonth.format('MMMM YYYY')}
        </Typography>
        <IconButton onClick={() => onMonthChange(calendarMonth.add(1, 'month'))} size="small">
          <ChevronRight />
        </IconButton>
      </Box>

      {/* Day headers */}
      <Grid container>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <Grid item xs={12 / 7} key={d}>
            <Typography variant="caption" color="text.secondary" textAlign="center" display="block" fontWeight={600}>
              {d}
            </Typography>
          </Grid>
        ))}
      </Grid>

      {/* Calendar days */}
      <Grid container>
        {days.map(d => {
          const dateStr = d.format('YYYY-MM-DD');
          const isCurrentMonth = d.month() === calendarMonth.month();
          const isPast = disablePast && d.isBefore(today);
          const isSelected = multiSelect
            ? selectedDates.includes(dateStr)
            : selectedDate === dateStr;
          const isToday = d.isSame(today);
          const disabled = isPast || !isCurrentMonth;

          return (
            <Grid item xs={12 / 7} key={dateStr}>
              <Box
                onClick={() => {
                  if (disabled) return;
                  if (multiSelect) {
                    onDateToggle?.(dateStr);
                  } else {
                    onDateSelect?.(dateStr);
                  }
                }}
                sx={{
                  py: cellPy,
                  textAlign: 'center',
                  cursor: disabled ? 'default' : 'pointer',
                  borderRadius: 2,
                  mx: 0.3,
                  my: 0.3,
                  bgcolor: isSelected ? 'primary.main' : 'transparent',
                  color: isSelected ? 'white' : disabled ? 'text.disabled' : 'text.primary',
                  fontWeight: isSelected || isToday ? 700 : 400,
                  border: isToday && !isSelected ? '1px solid' : 'none',
                  borderColor: 'primary.main',
                  '&:hover': {
                    bgcolor: disabled ? 'transparent' : isSelected ? 'primary.dark' : 'action.hover',
                  },
                  transition: 'background-color 0.15s',
                }}
              >
                <Typography variant={fontSize} fontWeight="inherit" color="inherit">
                  {d.date()}
                </Typography>
              </Box>
            </Grid>
          );
        })}
      </Grid>

      {/* Selected date display (single select only) */}
      {!multiSelect && selectedDate && (
        <Box mt={1.5} p={1} borderRadius={2} textAlign="center"
          sx={{ bgcolor: 'rgba(139, 38, 53, 0.08)' }}>
          <Typography variant="body2" fontWeight={600}>
            {dayjs(selectedDate).format('dddd D MMMM YYYY')}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

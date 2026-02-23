import { useMemo } from 'react';
import { Box, Typography, Button, CircularProgress, Alert } from '@mui/material';
import { groupSlotsByPeriod, filterAvailableSlots } from '../utils/slotUtils';

export default function TimeSlotPicker({
  slots = [],
  totalDuration = 0,
  selectedSlot = null,
  onSlotSelect,
  loading = false,
  emptyMessage = 'No available slots for this date.',
  compact = false,
}) {
  const available = useMemo(() => filterAvailableSlots(slots, totalDuration), [slots, totalDuration]);
  const groups = useMemo(() => groupSlotsByPeriod(available), [available]);

  const btnMinWidth = compact ? 64 : 80;
  const btnMinHeight = compact ? 36 : 44;
  const btnFontSize = compact ? '0.85rem' : '0.95rem';

  if (loading) {
    return (
      <Box textAlign="center" py={compact ? 2 : 4}>
        <CircularProgress size={compact ? 20 : 28} />
      </Box>
    );
  }

  if (slots.length === 0) {
    return <Alert severity="info">{emptyMessage}</Alert>;
  }

  if (available.length === 0) {
    return <Alert severity="info">No slots available with enough consecutive time for this service.</Alert>;
  }

  return (
    <Box>
      {[
        { label: 'Morning', slots: groups.morning },
        { label: 'Afternoon', slots: groups.afternoon },
        { label: 'Evening', slots: groups.evening },
      ].map(group => group.slots.length > 0 && (
        <Box key={group.label} mb={compact ? 1.5 : 2}>
          <Typography variant="subtitle2" color="text.secondary" mb={0.5}>
            {group.label}
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {group.slots.map(slot => {
              const time = slot.start_time?.slice(0, 5);
              const isSelected = selectedSlot === time;
              return (
                <Button
                  key={slot.id}
                  variant={isSelected ? 'contained' : 'outlined'}
                  onClick={() => onSlotSelect(time)}
                  sx={{
                    minWidth: btnMinWidth,
                    minHeight: btnMinHeight,
                    fontSize: btnFontSize,
                    fontWeight: isSelected ? 700 : 400,
                  }}
                >
                  {time}
                </Button>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

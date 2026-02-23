export function groupSlotsByPeriod(slots) {
  const morning = [];
  const afternoon = [];
  const evening = [];
  for (const slot of slots) {
    const hour = parseInt(slot.start_time?.slice(0, 2));
    if (hour < 12) morning.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }
  return { morning, afternoon, evening };
}

export function filterAvailableSlots(slots, totalDuration) {
  if (slots.length === 0 || totalDuration <= 0) return slots;
  const first = slots[0];
  if (!first?.start_time || !first?.end_time) return slots;
  const startMins = parseInt(first.start_time.slice(0, 2)) * 60 + parseInt(first.start_time.slice(3, 5));
  const endMins = parseInt(first.end_time.slice(0, 2)) * 60 + parseInt(first.end_time.slice(3, 5));
  const slotDuration = endMins - startMins || 30;
  const slotsNeeded = Math.ceil(totalDuration / slotDuration);
  if (slotsNeeded <= 1) return slots;

  return slots.filter((slot, i) => {
    if (i + slotsNeeded > slots.length) return false;
    for (let j = 1; j < slotsNeeded; j++) {
      const prev = slots[i + j - 1];
      const next = slots[i + j];
      if (prev.end_time?.slice(0, 5) !== next.start_time?.slice(0, 5)) return false;
    }
    return true;
  });
}

export function getCalendarDays(calendarMonth) {
  const start = calendarMonth.startOf('week');
  const end = calendarMonth.endOf('month').endOf('week');
  const days = [];
  let current = start;
  while (current.isBefore(end) || current.isSame(end, 'day')) {
    days.push(current);
    current = current.add(1, 'day');
  }
  return days;
}

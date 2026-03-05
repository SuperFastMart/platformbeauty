import { Box, Typography, IconButton, Switch, Card } from '@mui/material';
import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';

const SECTION_LABELS = {
  header: 'Header',
  banner: 'Banner Image',
  about: 'About / Meet Me',
  hours: 'Opening Hours',
  social: 'Social Widgets',
  sociallinks: 'Social Media Links',
  quicklinks: 'Quick Links (Gift Cards, Packages, Memberships)',
  services: 'Services',
  reviews: 'Customer Reviews',
  policies: 'Policies',
};

const DEFAULT_ORDER = ['header', 'banner', 'about', 'hours', 'social', 'sociallinks', 'quicklinks', 'services', 'reviews', 'policies'];

export default function SectionReorder({ order, onChange }) {
  const sections = order && order.length > 0 ? order : DEFAULT_ORDER;

  const moveUp = (idx) => {
    if (idx === 0) return;
    const newOrder = [...sections];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    onChange(newOrder);
  };

  const moveDown = (idx) => {
    if (idx === sections.length - 1) return;
    const newOrder = [...sections];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    onChange(newOrder);
  };

  return (
    <Box>
      {sections.map((sectionId, idx) => (
        <Card
          key={sectionId}
          variant="outlined"
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 2,
            py: 0.5,
            mb: 1,
            borderRadius: 2,
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', mr: 1 }}>
            <IconButton
              size="small"
              disabled={idx === 0}
              onClick={() => moveUp(idx)}
              sx={{ p: 0.25 }}
            >
              <KeyboardArrowUp fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              disabled={idx === sections.length - 1}
              onClick={() => moveDown(idx)}
              sx={{ p: 0.25 }}
            >
              <KeyboardArrowDown fontSize="small" />
            </IconButton>
          </Box>
          <Typography variant="body2" fontWeight={500} flex={1}>
            {SECTION_LABELS[sectionId] || sectionId}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ bgcolor: 'action.hover', px: 1, py: 0.25, borderRadius: 1 }}>
            {idx + 1}
          </Typography>
        </Card>
      ))}
    </Box>
  );
}

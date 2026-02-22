import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, Checkbox, Chip, Divider, Container,
  Rating, Grid, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import { AccessTime, Schedule, Star, Place, Gavel, ExpandMore } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function TenantLanding() {
  const { slug } = useParams();
  const tenant = useTenant();
  const navigate = useNavigate();
  const [services, setServices] = useState({});
  const [allServices, setAllServices] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [siteSettings, setSiteSettings] = useState({});
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get(`/t/${slug}/services`),
      api.get(`/t/${slug}/settings`).catch(() => ({ data: {} })),
      api.get(`/t/${slug}/reviews`).catch(() => ({ data: { reviews: [], stats: null } })),
    ])
      .then(([servicesRes, settingsRes, reviewsRes]) => {
        setServices(servicesRes.data.grouped);
        setAllServices(servicesRes.data.services);
        setSiteSettings(settingsRes.data);
        setReviews(reviewsRes.data.reviews || []);
        setReviewStats(reviewsRes.data.stats || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  const toggleService = (serviceId) => {
    setSelected(prev =>
      prev.includes(serviceId) ? prev.filter(id => id !== serviceId) : [...prev, serviceId]
    );
  };

  const selectedServices = allServices.filter(s => selected.includes(s.id));
  const totalPrice = selectedServices.reduce((sum, s) => sum + parseFloat(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);

  const handleBook = () => {
    navigate(`/t/${slug}/book`, { state: { selectedServiceIds: selected } });
  };

  const businessHours = siteSettings.business_hours;

  // Load custom Google Font if set
  useEffect(() => {
    const font = siteSettings.header_font;
    if (font && font !== 'Inter' && (!siteSettings.header_display || siteSettings.header_display === 'text')) {
      const linkId = 'custom-header-font';
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;700&display=swap`;
        document.head.appendChild(link);
      }
    }
  }, [siteSettings.header_font, siteSettings.header_display]);

  if (loading) return <Box p={4}><Typography>Loading...</Typography></Box>;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Header */}
      <Box textAlign="center" mb={4}>
        {siteSettings.header_display === 'logo' && siteSettings.header_logo_url ? (
          <Box
            component="img"
            src={siteSettings.header_logo_url}
            alt={tenant?.name}
            sx={{
              maxHeight: 100,
              maxWidth: '80%',
              objectFit: 'contain',
              mb: 1,
            }}
          />
        ) : (
          <Typography
            variant="h4"
            fontWeight={700}
            gutterBottom
            sx={siteSettings.header_font && siteSettings.header_font !== 'Inter'
              ? { fontFamily: `"${siteSettings.header_font}", serif`, fontSize: '2.4rem' }
              : {}
            }
          >
            {tenant?.name}
          </Typography>
        )}
        {tenant?.business_phone && (
          <Typography color="text.secondary">{tenant.business_phone}</Typography>
        )}
        {reviewStats && reviewStats.total > 0 && (
          <Box display="flex" justifyContent="center" alignItems="center" gap={1} mt={1}>
            <Rating value={reviewStats.average_rating} precision={0.1} readOnly size="small" />
            <Typography variant="body2" color="text.secondary">
              {reviewStats.average_rating} ({reviewStats.total} review{reviewStats.total !== 1 ? 's' : ''})
            </Typography>
          </Box>
        )}
      </Box>

      {/* About / Meet Me Section */}
      {(siteSettings.about_title || siteSettings.about_text || siteSettings.about_profile_image_url) && (
        <Box mb={4}>
          {siteSettings.about_profile_image_url ? (
            <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} gap={3} alignItems={{ sm: 'flex-start' }}>
              <Box
                component="img"
                src={siteSettings.about_profile_image_url}
                alt={siteSettings.about_title || 'About'}
                sx={{
                  width: { xs: 120, sm: 150 },
                  height: { xs: 120, sm: 150 },
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '3px solid',
                  borderColor: 'primary.main',
                  mx: { xs: 'auto', sm: 0 },
                  flexShrink: 0,
                }}
              />
              <Box>
                {siteSettings.about_title && (
                  <Typography variant="h6" fontWeight={600} mb={1}>{siteSettings.about_title}</Typography>
                )}
                {siteSettings.about_text && (
                  <Typography color="text.secondary" whiteSpace="pre-line">{siteSettings.about_text}</Typography>
                )}
              </Box>
            </Box>
          ) : (
            <>
              {siteSettings.about_title && (
                <Typography variant="h6" fontWeight={600} mb={1}>{siteSettings.about_title}</Typography>
              )}
              {siteSettings.about_text && (
                <Typography color="text.secondary" whiteSpace="pre-line">{siteSettings.about_text}</Typography>
              )}
            </>
          )}

          {/* Map embed */}
          {siteSettings.about_show_map && (siteSettings.about_map_embed_url || tenant?.business_address) && (() => {
            const mapSrc = siteSettings.about_map_embed_url
              || `https://www.openstreetmap.org/export/embed.html?bbox=-180,-90,180,90&layer=mapnik&marker=0,0`;
            const address = tenant?.business_address;
            const osmSearchUrl = address
              ? `https://www.openstreetmap.org/export/embed.html?bbox=-180,-90,180,90&layer=mapnik`
              : null;
            // Use Google Maps embed search if no custom URL and address exists
            const autoMapUrl = address && !siteSettings.about_map_embed_url
              ? `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
              : siteSettings.about_map_embed_url;

            return autoMapUrl ? (
              <Box mt={3}>
                <Typography variant="subtitle2" fontWeight={600} mb={1} display="flex" alignItems="center" gap={0.5}>
                  <Place fontSize="small" /> Find Us
                </Typography>
                <Box
                  component="iframe"
                  src={autoMapUrl}
                  width="100%"
                  height="300"
                  sx={{ border: 0, borderRadius: 3 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </Box>
            ) : null;
          })()}

          <Divider sx={{ mt: 3 }} />
        </Box>
      )}

      {/* Business Hours */}
      {businessHours && (
        <Box mb={4}>
          <Typography variant="h6" fontWeight={600} mb={2} display="flex" alignItems="center" gap={1}>
            <Schedule fontSize="small" /> Opening Hours
          </Typography>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              {DAY_ORDER.map(day => {
                const hours = businessHours[day];
                if (!hours) return null;
                const today = dayjs().format('dddd').toLowerCase() === day;
                return (
                  <Box
                    key={day}
                    display="flex" justifyContent="space-between" py={0.5}
                    sx={{ fontWeight: today ? 600 : 400 }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 'inherit', textTransform: 'capitalize' }}>
                      {day}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'inherit' }} color={hours.closed ? 'text.secondary' : 'text.primary'}>
                      {hours.closed ? 'Closed' : `${hours.open} – ${hours.close}`}
                    </Typography>
                  </Box>
                );
              })}
            </CardContent>
          </Card>
          <Divider sx={{ mt: 3 }} />
        </Box>
      )}

      {/* Social Media Embeds */}
      {siteSettings.social_embeds?.filter(e => e.visible !== false && e.code).length > 0 && (
        <Box mb={4}>
          {siteSettings.social_embeds
            .filter(e => e.visible !== false && e.code)
            .map((embed, idx) => (
              <Box key={idx} mb={3}>
                {embed.label && (
                  <Typography variant="h6" fontWeight={600} mb={2}>{embed.label}</Typography>
                )}
                <Box
                  sx={{
                    '& iframe': { maxWidth: '100%', borderRadius: 2 },
                    '& img': { maxWidth: '100%', borderRadius: 2 },
                    overflow: 'hidden',
                  }}
                  dangerouslySetInnerHTML={{ __html: embed.code }}
                />
              </Box>
            ))}
          <Divider sx={{ mt: 3 }} />
        </Box>
      )}

      {/* Services by category */}
      <Typography variant="h6" fontWeight={600} mb={2}>Our Services</Typography>
      <Box sx={{
        '& .MuiAccordion-root': {
          boxShadow: 'none',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '12px !important',
          mb: 1.5,
          '&:before': { display: 'none' },
          '&.Mui-expanded': { margin: '0 0 12px 0' },
        },
        '& .MuiAccordionSummary-root': {
          minHeight: 56,
          '&.Mui-expanded': { minHeight: 56 },
        },
        '& .MuiAccordionSummary-content': {
          margin: '12px 0',
          '&.Mui-expanded': { margin: '12px 0' },
        },
      }}>
        {(() => {
          const categoryOrder = siteSettings.category_order || [];
          const entries = Object.entries(services);
          if (categoryOrder.length > 0) {
            entries.sort((a, b) => {
              const ai = categoryOrder.indexOf(a[0]);
              const bi = categoryOrder.indexOf(b[0]);
              return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
            });
          }
          return entries;
        })().map(([category, categoryServices]) => {
          const selectedInCategory = categoryServices.filter(s => selected.includes(s.id)).length;
          return (
            <Accordion key={category} defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box display="flex" alignItems="center" gap={1.5} width="100%">
                  <Typography fontWeight={600} flex={1}>{category}</Typography>
                  {selectedInCategory > 0 && (
                    <Chip
                      label={`${selectedInCategory} selected`}
                      size="small"
                      color="primary"
                      sx={{ fontWeight: 600, height: 24 }}
                    />
                  )}
                  <Chip
                    label={categoryServices.length}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(139, 38, 53, 0.1)',
                      color: 'primary.main',
                      fontWeight: 600,
                      height: 24,
                    }}
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                {categoryServices.map((service, idx) => {
                  const isSelected = selected.includes(service.id);
                  return (
                    <Box
                      key={service.id}
                      onClick={() => toggleService(service.id)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        p: 2,
                        cursor: 'pointer',
                        borderTop: idx === 0 ? '1px solid' : 'none',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        transition: 'all 0.15s ease',
                        bgcolor: isSelected ? 'rgba(139, 38, 53, 0.06)' : 'transparent',
                        '&:hover': { bgcolor: isSelected ? 'rgba(139, 38, 53, 0.1)' : 'action.hover' },
                        '&:last-child': { borderBottom: 'none', borderRadius: '0 0 12px 12px' },
                      }}
                    >
                      <Checkbox checked={isSelected} size="small" sx={{ mr: 1, p: 0, color: 'grey.400', '&.Mui-checked': { color: 'primary.main' } }} />
                      <Box flex={1} pr={2}>
                        <Typography fontWeight={isSelected ? 600 : 500}>{service.name}</Typography>
                        {service.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.3 }}>{service.description}</Typography>
                        )}
                      </Box>
                      <Box textAlign="right" flexShrink={0}>
                        <Typography fontWeight={600} color="primary.main">£{parseFloat(service.price).toFixed(2)}</Typography>
                        <Typography variant="caption" color="text.secondary">{service.duration} min</Typography>
                      </Box>
                    </Box>
                  );
                })}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>

      {/* Reviews Section */}
      {reviews.length > 0 && (
        <Box mb={4}>
          <Divider sx={{ mb: 3 }} />
          <Typography variant="h6" fontWeight={600} mb={2} display="flex" alignItems="center" gap={1}>
            <Star fontSize="small" /> Customer Reviews
          </Typography>
          {reviewStats && (
            <Box display="flex" alignItems="center" gap={2} mb={2}>
              <Typography variant="h4" fontWeight={700}>{reviewStats.average_rating}</Typography>
              <Box>
                <Rating value={reviewStats.average_rating} precision={0.1} readOnly />
                <Typography variant="body2" color="text.secondary">
                  Based on {reviewStats.total} review{reviewStats.total !== 1 ? 's' : ''}
                </Typography>
              </Box>
            </Box>
          )}
          <Grid container spacing={2}>
            {reviews.slice(0, 6).map(review => (
              <Grid item xs={12} sm={6} key={review.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="start" mb={1}>
                      <Typography fontWeight={600} variant="body2">{review.customer_name}</Typography>
                      <Rating value={review.rating} readOnly size="small" />
                    </Box>
                    {review.comment && (
                      <Typography variant="body2" color="text.secondary">
                        {review.comment}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                      {dayjs(review.created_at).format('D MMM YYYY')}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Policies Section */}
      {(siteSettings.policy_cancellation || siteSettings.policy_noshow || siteSettings.policy_privacy || siteSettings.policy_terms) && (
        <Box mb={4}>
          <Divider sx={{ mb: 3 }} />
          <Typography variant="h6" fontWeight={600} mb={2} display="flex" alignItems="center" gap={1}>
            <Gavel fontSize="small" /> Our Policies
          </Typography>
          {siteSettings.policy_cancellation && (
            <Accordion variant="outlined" disableGutters sx={{ mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography fontWeight={500}>Cancellation Policy</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary" whiteSpace="pre-line">
                  {siteSettings.policy_cancellation}
                </Typography>
              </AccordionDetails>
            </Accordion>
          )}
          {siteSettings.policy_noshow && (
            <Accordion variant="outlined" disableGutters sx={{ mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography fontWeight={500}>No-Show Policy</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary" whiteSpace="pre-line">
                  {siteSettings.policy_noshow}
                </Typography>
              </AccordionDetails>
            </Accordion>
          )}
          {siteSettings.policy_privacy && (
            <Accordion variant="outlined" disableGutters sx={{ mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography fontWeight={500}>Privacy Policy</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary" whiteSpace="pre-line">
                  {siteSettings.policy_privacy}
                </Typography>
              </AccordionDetails>
            </Accordion>
          )}
          {siteSettings.policy_terms && (
            <Accordion variant="outlined" disableGutters>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography fontWeight={500}>Terms &amp; Conditions</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary" whiteSpace="pre-line">
                  {siteSettings.policy_terms}
                </Typography>
              </AccordionDetails>
            </Accordion>
          )}
        </Box>
      )}

      {/* Sticky bottom bar when services selected */}
      {selected.length > 0 && (
        <Box
          position="sticky" bottom={0} bgcolor="background.paper" p={2} mx={-2}
          boxShadow="0 -2px 10px rgba(0,0,0,0.1)" borderRadius="12px 12px 0 0"
          zIndex={10}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="body2" color="text.secondary">
                {selected.length} service{selected.length > 1 ? 's' : ''} selected
              </Typography>
              <Box display="flex" gap={2}>
                <Typography fontWeight={600}>£{totalPrice.toFixed(2)}</Typography>
                <Typography color="text.secondary">{totalDuration} min</Typography>
              </Box>
            </Box>
            <Button variant="contained" size="large" onClick={handleBook}>
              Book Now
            </Button>
          </Box>
        </Box>
      )}
    </Container>
  );
}

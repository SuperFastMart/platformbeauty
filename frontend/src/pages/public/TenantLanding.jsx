import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, Checkbox, Chip, Divider, Container,
  Rating, Grid
} from '@mui/material';
import { AccessTime, Schedule, Star, Place } from '@mui/icons-material';
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

  if (loading) return <Box p={4}><Typography>Loading...</Typography></Box>;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Header */}
      <Box textAlign="center" mb={4}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          {tenant?.name}
        </Typography>
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

          {/* Google Maps embed */}
          {siteSettings.about_show_map && siteSettings.about_map_embed_url && (
            <Box mt={3}>
              <Typography variant="subtitle2" fontWeight={600} mb={1} display="flex" alignItems="center" gap={0.5}>
                <Place fontSize="small" /> Find Us
              </Typography>
              <Box
                component="iframe"
                src={siteSettings.about_map_embed_url}
                width="100%"
                height="300"
                sx={{ border: 0, borderRadius: 3 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </Box>
          )}

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

      {/* Services by category */}
      <Typography variant="h6" fontWeight={600} mb={2}>Our Services</Typography>
      {Object.entries(services).map(([category, categoryServices]) => (
        <Box key={category} mb={4}>
          <Typography variant="subtitle1" fontWeight={600} mb={1} color="text.secondary">{category}</Typography>
          {categoryServices.map(service => {
            const isSelected = selected.includes(service.id);
            return (
              <Card
                key={service.id} sx={{ mb: 1.5, cursor: 'pointer',
                  border: isSelected ? 2 : 1,
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  transition: 'border-color 0.2s'
                }}
                onClick={() => toggleService(service.id)}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Checkbox checked={isSelected} size="small" sx={{ p: 0 }} />
                    <Box flex={1}>
                      <Typography fontWeight={500}>{service.name}</Typography>
                      {service.description && (
                        <Typography variant="body2" color="text.secondary">{service.description}</Typography>
                      )}
                    </Box>
                    <Box textAlign="right">
                      <Typography fontWeight={600}>£{parseFloat(service.price).toFixed(2)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {service.duration} min
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      ))}

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

      {/* Sticky bottom bar when services selected */}
      {selected.length > 0 && (
        <Box
          position="sticky" bottom={0} bgcolor="white" p={2} mx={-2}
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

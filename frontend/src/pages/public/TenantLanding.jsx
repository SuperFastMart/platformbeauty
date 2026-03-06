import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, Checkbox, Chip, Divider, Container,
  Rating, Grid, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import { AccessTime, Schedule, Star, Place, Gavel, ExpandMore, EventBusy, ReportProblem, Security, Article, CardGiftcard, WorkspacePremium, Inventory2 } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';
import { formatCurrency, CURRENCIES } from '../../hooks/useCurrency';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DEFAULT_SECTION_ORDER = ['header', 'banner', 'about', 'hours', 'social', 'quicklinks', 'services', 'reviews', 'policies'];

// ============================================
// Section Sub-Components
// ============================================

function HeaderSection({ tenant, siteSettings, reviewStats }) {
  return (
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
  );
}

function BannerSection({ slug, siteSettings }) {
  const [bannerUrl, setBannerUrl] = useState(null);

  // If banner_image_url setting exists and is empty, banner was explicitly removed
  const bannerDisabled = siteSettings && 'banner_image_url' in siteSettings && !siteSettings.banner_image_url;

  useEffect(() => {
    if (bannerDisabled) return;
    let objectUrl = null;
    api.get(`/t/${slug}/images/banner`, { responseType: 'blob' })
      .then(res => {
        objectUrl = URL.createObjectURL(res.data);
        setBannerUrl(objectUrl);
      })
      .catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [slug]);

  if (!bannerUrl || bannerDisabled) return null;

  return (
    <Box mb={4}>
      <Box
        component="img"
        src={bannerUrl}
        alt="Banner"
        sx={{
          width: '100%',
          maxHeight: 300,
          objectFit: 'cover',
          borderRadius: 3,
          display: 'block',
        }}
      />
    </Box>
  );
}

function AboutSection({ siteSettings, tenant }) {
  if (!siteSettings.about_title && !siteSettings.about_text && !siteSettings.about_profile_image_url) return null;

  return (
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
  );
}

function HoursSection({ siteSettings }) {
  const businessHours = siteSettings.business_hours;
  if (!businessHours) return null;

  return (
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
  );
}

function SocialSection({ siteSettings }) {
  const embeds = siteSettings.social_embeds?.filter(e => e.visible !== false && e.code);
  const hasEmbeds = embeds && embeds.length > 0;

  // Social media icon links
  const socialLinks = [
    { key: 'social_facebook', label: 'Facebook', icon: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z', color: '#1877F2' },
    { key: 'social_instagram', label: 'Instagram', icon: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z', color: '#E4405F' },
    { key: 'social_tiktok', label: 'TikTok', icon: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z', color: '#000000' },
    { key: 'social_twitter', label: 'X', icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z', color: '#000000' },
    { key: 'social_youtube', label: 'YouTube', icon: 'M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z', color: '#FF0000' },
    { key: 'social_linkedin', label: 'LinkedIn', icon: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z', color: '#0A66C2' },
  ];
  const activeLinks = socialLinks.filter(l => siteSettings[l.key]);
  const hasLinks = activeLinks.length > 0;

  if (!hasEmbeds && !hasLinks) return null;

  return (
    <Box mb={4}>
      {hasLinks && (
        <Box display="flex" justifyContent="center" gap={2} flexWrap="wrap" mb={hasEmbeds ? 3 : 0}>
          {activeLinks.map(({ key, label, icon, color }) => (
            <Box
              key={key}
              component="a"
              href={siteSettings[key]}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: '1px solid',
                borderColor: 'divider',
                transition: 'all 0.2s',
                '&:hover': { bgcolor: color + '15', borderColor: color, transform: 'scale(1.1)' },
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={color}><path d={icon} /></svg>
            </Box>
          ))}
        </Box>
      )}
      {hasEmbeds && embeds.map((embed, idx) => (
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
  );
}


function QuickLinksSection({ siteSettings, slug, navigate }) {
  const showGC = siteSettings.section_gift_cards !== false && siteSettings.section_gift_cards !== 'false';
  const showPK = siteSettings.section_packages !== false && siteSettings.section_packages !== 'false';
  const showMB = siteSettings.section_memberships !== false && siteSettings.section_memberships !== 'false';
  if (!showGC && !showPK && !showMB) return null;

  return (
            <Grid container spacing={2} mb={3}>
              {showGC && (
                <Grid item xs>
                  <Card onClick={() => navigate(`/t/${slug}/gift-cards`)} sx={{ cursor: 'pointer', textAlign: 'center', p: 2, border: '1px solid', borderColor: 'divider', transition: 'all 0.3s ease', '&:hover': { borderColor: '#D4A853', boxShadow: '0 4px 16px rgba(212, 168, 83, 0.15)', transform: 'translateY(-2px)' } }}>
                    <CardGiftcard sx={{ fontSize: 32, color: '#D4A853', mb: 0.5 }} />
                    <Typography variant="body2" fontWeight={600}>Gift Cards</Typography>
                    <Typography variant="caption" color="text.secondary">Send to a friend</Typography>
                  </Card>
                </Grid>
              )}
              {showPK && (
                <Grid item xs>
                  <Card onClick={() => navigate(`/t/${slug}/packages`)} sx={{ cursor: 'pointer', textAlign: 'center', p: 2, border: '1px solid', borderColor: 'divider', transition: 'all 0.3s ease', '&:hover': { borderColor: '#D4A853', boxShadow: '0 4px 16px rgba(212, 168, 83, 0.15)', transform: 'translateY(-2px)' } }}>
                    <Inventory2 sx={{ fontSize: 32, color: '#D4A853', mb: 0.5 }} />
                    <Typography variant="body2" fontWeight={600}>Packages</Typography>
                    <Typography variant="caption" color="text.secondary">Save on sessions</Typography>
                  </Card>
                </Grid>
              )}
              {showMB && (
                <Grid item xs>
                  <Card onClick={() => navigate(`/t/${slug}/memberships`)} sx={{ cursor: 'pointer', textAlign: 'center', p: 2, border: '1px solid', borderColor: 'divider', transition: 'all 0.3s ease', '&:hover': { borderColor: '#D4A853', boxShadow: '0 4px 16px rgba(212, 168, 83, 0.15)', transform: 'translateY(-2px)' } }}>
                    <WorkspacePremium sx={{ fontSize: 32, color: '#D4A853', mb: 0.5 }} />
                    <Typography variant="body2" fontWeight={600}>Memberships</Typography>
                    <Typography variant="caption" color="text.secondary">Join a plan</Typography>
                  </Card>
                </Grid>
              )}
            </Grid>
  );
}

function ServicesSection({ services, siteSettings, selected, toggleService, curr }) {
  return (
    <>
          <Typography variant="h6" fontWeight={600} mb={2}>Services</Typography>
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
                            <Typography fontWeight={600} color="primary.main">{formatCurrency(service.price, curr)}</Typography>
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
    </>
  );
}

function ReviewsSection({ reviews, reviewStats }) {
  if (!reviews || reviews.length === 0) return null;

  return (
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
  );
}

function PoliciesSection({ siteSettings }) {
  if (!siteSettings.policy_cancellation && !siteSettings.policy_noshow && !siteSettings.policy_privacy && !siteSettings.policy_terms) return null;

  return (
          <Box mb={4}>
            <Divider sx={{ mb: 3 }} />
            <Typography variant="h6" fontWeight={600} mb={2} display="flex" alignItems="center" gap={1}>
              <Gavel fontSize="small" /> Our Policies
            </Typography>
            <Grid container spacing={2}>
              {[
                { key: 'policy_cancellation', label: 'Cancellation Policy', icon: EventBusy, tint: '#FFF3E0' },
                { key: 'policy_noshow', label: 'No-Show Policy', icon: ReportProblem, tint: '#FBE9E7' },
                { key: 'policy_privacy', label: 'Privacy Policy', icon: Security, tint: '#E8F5E9' },
                { key: 'policy_terms', label: 'Terms & Conditions', icon: Article, tint: '#E3F2FD' },
              ].filter(p => siteSettings[p.key]).map(({ key, label, icon: Icon, tint }) => (
                <Grid item xs={12} sm={6} key={key}>
                  <Accordion
                    disableGutters
                    sx={{
                      border: 'none', borderRadius: '12px !important',
                      bgcolor: tint, '&:before': { display: 'none' }, boxShadow: 'none',
                    }}
                  >
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Box display="flex" alignItems="center" gap={1.5}>
                        <Icon sx={{ fontSize: 20, opacity: 0.7 }} />
                        <Typography fontWeight={600} variant="body1">{label}</Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Typography variant="body2" color="text.secondary" whiteSpace="pre-line" lineHeight={1.7}>
                        {siteSettings[key]}
                      </Typography>
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              ))}
            </Grid>
          </Box>
  );
}

// ============================================
// Section visibility helpers
// ============================================
function isSectionVisible(sectionId, siteSettings) {
  const visibilityMap = {
    hours: 'section_hours',
    reviews: 'section_reviews',
  };
  const key = visibilityMap[sectionId];
  if (!key) return true;
  return siteSettings[key] !== false && siteSettings[key] !== 'false';
}

// ============================================
// Main Component
// ============================================
export default function TenantLanding() {
  const { slug } = useParams();
  const tenant = useTenant();
  const curr = CURRENCIES[tenant?.currency || 'GBP'];
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

  // Dynamic section ordering
  const sectionOrder = siteSettings.section_order || DEFAULT_SECTION_ORDER;

  const SECTION_COMPONENTS = {
    header: <HeaderSection tenant={tenant} siteSettings={siteSettings} reviewStats={reviewStats} />,
    banner: <BannerSection slug={slug} siteSettings={siteSettings} />,
    about: <AboutSection siteSettings={siteSettings} tenant={tenant} />,
    hours: <HoursSection siteSettings={siteSettings} />,
    social: <SocialSection siteSettings={siteSettings} />,
    quicklinks: <QuickLinksSection siteSettings={siteSettings} slug={slug} navigate={navigate} />,
    services: <ServicesSection services={services} siteSettings={siteSettings} selected={selected} toggleService={toggleService} curr={curr} />,
    reviews: <ReviewsSection reviews={reviews} reviewStats={reviewStats} />,
    policies: <PoliciesSection siteSettings={siteSettings} />,
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {sectionOrder
        .filter(id => SECTION_COMPONENTS[id] && isSectionVisible(id, siteSettings))
        .map(id => (
          <Box key={id}>{SECTION_COMPONENTS[id]}</Box>
        ))
      }

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
                <Typography fontWeight={600}>{formatCurrency(totalPrice, curr)}</Typography>
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

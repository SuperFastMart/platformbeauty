import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, Checkbox, Chip, Divider, Container
} from '@mui/material';
import { AccessTime, AttachMoney } from '@mui/icons-material';
import api from '../../api/client';
import { useTenant } from './TenantPublicLayout';

export default function TenantLanding() {
  const { slug } = useParams();
  const tenant = useTenant();
  const navigate = useNavigate();
  const [services, setServices] = useState({});
  const [allServices, setAllServices] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/t/${slug}/services`)
      .then(({ data }) => {
        setServices(data.grouped);
        setAllServices(data.services);
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

  if (loading) return <Box p={4}><Typography>Loading services...</Typography></Box>;

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
      </Box>

      {/* Services by category */}
      {Object.entries(services).map(([category, categoryServices]) => (
        <Box key={category} mb={4}>
          <Typography variant="h6" fontWeight={600} mb={2}>{category}</Typography>
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

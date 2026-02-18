import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CircularProgress, Box } from '@mui/material';

export default function ProtectedRoute({ children, role }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    if (role === 'platform_admin') {
      return <Navigate to="/platform/login" replace />;
    }
    return <Navigate to="/admin/login" replace />;
  }

  if (role && user?.role !== role) {
    if (role === 'platform_admin') {
      return <Navigate to="/platform/login" replace />;
    }
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}

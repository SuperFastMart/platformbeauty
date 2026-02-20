import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

// Platform admin
import PlatformLogin from './pages/platform/PlatformLogin';
import PlatformLayout from './pages/platform/PlatformLayout';
import TenantList from './pages/platform/TenantList';
import TenantCreate from './pages/platform/TenantCreate';
import TenantDetail from './pages/platform/TenantDetail';

// Tenant admin
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Services from './pages/admin/Services';
import Bookings from './pages/admin/Bookings';
import SlotTemplates from './pages/admin/SlotTemplates';
import Customers from './pages/admin/Customers';
import CustomerDetail from './pages/admin/CustomerDetail';
import AdminBookingCreate from './pages/admin/AdminBookingCreate';
import Settings from './pages/admin/Settings';
import Loyalty from './pages/admin/Loyalty';
import DiscountCodes from './pages/admin/DiscountCodes';
import Reports from './pages/admin/Reports';
import Messages from './pages/admin/Messages';
import ReviewsManagement from './pages/admin/ReviewsManagement';
import Support from './pages/admin/Support';
import SupportTicketDetail from './pages/admin/SupportTicketDetail';

// Platform admin - expanded
import PlatformDashboard from './pages/platform/PlatformDashboard';
import PlatformTenantDetail from './pages/platform/PlatformTenantDetail';
import PlatformSupport from './pages/platform/PlatformSupport';
import PlatformTicketDetail from './pages/platform/PlatformTicketDetail';

// Public booking
import TenantPublicLayout from './pages/public/TenantPublicLayout';
import TenantLanding from './pages/public/TenantLanding';
import BookingFlow from './pages/public/BookingFlow';
import CustomerLogin from './pages/public/CustomerLogin';
import VerifyMagicLink from './pages/public/VerifyMagicLink';
import CustomerPortal from './pages/public/CustomerPortal';
import BookingWidget from './pages/public/BookingWidget';

export default function App() {
  return (
    <Routes>
      {/* Platform admin */}
      <Route path="/platform/login" element={<PlatformLogin />} />
      <Route
        path="/platform"
        element={
          <ProtectedRoute role="platform_admin">
            <PlatformLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<PlatformDashboard />} />
        <Route path="tenants" element={<TenantList />} />
        <Route path="tenants/new" element={<TenantCreate />} />
        <Route path="tenants/:id" element={<PlatformTenantDetail />} />
        <Route path="support" element={<PlatformSupport />} />
        <Route path="support/:id" element={<PlatformTicketDetail />} />
      </Route>

      {/* Tenant admin */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="services" element={<Services />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="bookings/create" element={<AdminBookingCreate />} />
        <Route path="slot-templates" element={<SlotTemplates />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="loyalty" element={<Loyalty />} />
        <Route path="discount-codes" element={<DiscountCodes />} />
        <Route path="reports" element={<Reports />} />
        <Route path="messages" element={<Messages />} />
        <Route path="reviews" element={<ReviewsManagement />} />
        <Route path="support" element={<Support />} />
        <Route path="support/:id" element={<SupportTicketDetail />} />
      </Route>

      {/* Public booking */}
      <Route path="/t/:slug" element={<TenantPublicLayout />}>
        <Route index element={<TenantLanding />} />
        <Route path="book" element={<BookingFlow />} />
        <Route path="portal/login" element={<CustomerLogin />} />
        <Route path="portal/verify" element={<VerifyMagicLink />} />
        <Route path="portal" element={<CustomerPortal />} />
      </Route>

      {/* Embeddable widget (no layout wrapper) */}
      <Route path="/t/:slug/widget" element={<BookingWidget />} />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/admin/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

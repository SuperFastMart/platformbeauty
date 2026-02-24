import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import ProtectedRoute from './components/ProtectedRoute';

const Loading = () => (
  <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
    <CircularProgress />
  </Box>
);

// Platform admin
const PlatformLogin = lazy(() => import('./pages/platform/PlatformLogin'));
const PlatformLayout = lazy(() => import('./pages/platform/PlatformLayout'));
const TenantList = lazy(() => import('./pages/platform/TenantList'));
const TenantCreate = lazy(() => import('./pages/platform/TenantCreate'));
const TenantDetail = lazy(() => import('./pages/platform/TenantDetail'));
const PlatformDashboard = lazy(() => import('./pages/platform/PlatformDashboard'));
const PlatformTenantDetail = lazy(() => import('./pages/platform/PlatformTenantDetail'));
const PlatformSupport = lazy(() => import('./pages/platform/PlatformSupport'));
const PlatformTicketDetail = lazy(() => import('./pages/platform/PlatformTicketDetail'));
const PlatformSubscriptions = lazy(() => import('./pages/platform/PlatformSubscriptions'));

// Tenant admin
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Services = lazy(() => import('./pages/admin/Services'));
const Bookings = lazy(() => import('./pages/admin/Bookings'));
const SlotTemplates = lazy(() => import('./pages/admin/SlotTemplates'));
const Customers = lazy(() => import('./pages/admin/Customers'));
const CustomerDetail = lazy(() => import('./pages/admin/CustomerDetail'));
const AdminBookingCreate = lazy(() => import('./pages/admin/AdminBookingCreate'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const Loyalty = lazy(() => import('./pages/admin/Loyalty'));
const DiscountCodes = lazy(() => import('./pages/admin/DiscountCodes'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Messages = lazy(() => import('./pages/admin/Messages'));
const ReviewsManagement = lazy(() => import('./pages/admin/ReviewsManagement'));
const Support = lazy(() => import('./pages/admin/Support'));
const SupportTicketDetail = lazy(() => import('./pages/admin/SupportTicketDetail'));
const SetupWizard = lazy(() => import('./pages/admin/SetupWizard'));
const Waitlist = lazy(() => import('./pages/admin/Waitlist'));
const GiftCards = lazy(() => import('./pages/admin/GiftCards'));
const Packages = lazy(() => import('./pages/admin/Packages'));
const Memberships = lazy(() => import('./pages/admin/Memberships'));

// Public booking
const TenantPublicLayout = lazy(() => import('./pages/public/TenantPublicLayout'));
const TenantLanding = lazy(() => import('./pages/public/TenantLanding'));
const BookingFlow = lazy(() => import('./pages/public/BookingFlow'));
const CustomerLogin = lazy(() => import('./pages/public/CustomerLogin'));
const VerifyMagicLink = lazy(() => import('./pages/public/VerifyMagicLink'));
const CustomerPortal = lazy(() => import('./pages/public/CustomerPortal'));
const BookingWidget = lazy(() => import('./pages/public/BookingWidget'));
const LandingPage = lazy(() => import('./pages/public/LandingPage'));
const EmailVerification = lazy(() => import('./pages/public/EmailVerification'));

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
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
          <Route path="subscriptions" element={<PlatformSubscriptions />} />
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
          <Route path="waitlist" element={<Waitlist />} />
          <Route path="gift-cards" element={<GiftCards />} />
          <Route path="packages" element={<Packages />} />
          <Route path="memberships" element={<Memberships />} />
          <Route path="setup" element={<SetupWizard />} />
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

        {/* Email verification */}
        <Route path="/verify-email" element={<EmailVerification />} />

        {/* Public landing page */}
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

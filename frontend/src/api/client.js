import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  // Don't overwrite if already explicitly set (e.g., customer portal auth)
  if (!config.headers.Authorization) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Determine which token was used in the failed request
      const requestAuth = error.config?.headers?.Authorization || '';
      const customerToken = localStorage.getItem('customer_token');
      const adminToken = localStorage.getItem('auth_token');

      const usedCustomerToken = customerToken && requestAuth === `Bearer ${customerToken}`;
      const usedAdminToken = adminToken && requestAuth === `Bearer ${adminToken}`;

      if (usedCustomerToken) {
        // Only clear customer tokens — don't touch admin session
        localStorage.removeItem('customer_token');
        localStorage.removeItem('customer_user');
      } else if (usedAdminToken) {
        // Only clear admin tokens — don't touch customer session
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        const path = window.location.pathname;
        if (!path.includes('/login') && !path.startsWith('/t/')) {
          window.location.href = '/admin/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

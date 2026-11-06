// src/services/api.js
import axios from 'axios';

// ✅ រៀបចំ Base URL ដោយស្វ័យប្រវត្តិ (ទោះបីនៅលើ Vercel ដាក់ ឬភ្លេចដាក់ /api នៅខាងចុង ក៏ដំណើរការ ១០០%)
const resolveApiBaseUrl = () => {
  const rawUrl = (
    import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
  ).trim();
  const cleanUrl = rawUrl.replace(/\/+$/, '');
  return cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
};

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || '';
      const isPublicAuthRequest =
        requestUrl.includes('/login') ||
        requestUrl.includes('/verify-2fa') ||
        requestUrl.includes('/resend-2fa') ||
        requestUrl.includes('/forgot-password') ||
        requestUrl.includes('/register');

      // ✅ សម្អាតទិន្នន័យគណនីទាំងអស់ចេញពី localStorage និងបញ្ជូនទៅ /login តែពេលមិនមែនកំពុងឈរលើទំព័រ Login/Register
      if (!isPublicAuthRequest) {
        try {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('auth_user');
          localStorage.removeItem('teacher');
        } catch {}

        const currentPath = window.location.pathname;
        if (currentPath !== '/login' && currentPath !== '/register') {
          window.location.replace('/login');
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
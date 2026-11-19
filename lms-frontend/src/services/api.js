// src/services/api.js
import axios from 'axios';

const AUTH_STORAGE_KEYS = [
  'token',
  'auth_token',
  'user',
  'auth_user',
  'teacher',
  'student',
  'lms_last_active_role',
];

// ✅ រៀបចំ Base URL ដោយស្វ័យប្រវត្តិ (ទោះបីនៅលើ Vercel ដាក់ ឬភ្លេចដាក់ /api នៅខាងចុង ក៏ដំណើរការ ១០០%)
const resolveApiBaseUrl = () => {
  const rawUrl = (
    import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
  ).trim();
  const cleanUrl = rawUrl.replace(/\/+$/, '');
  return cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
};

const readAuthTokenSafe = () => {
  try {
    const sToken =
      sessionStorage.getItem('token') || sessionStorage.getItem('auth_token');
    if (sToken && sToken !== 'undefined' && sToken !== 'null') return sToken;
  } catch {}
  try {
    const lToken =
      localStorage.getItem('token') || localStorage.getItem('auth_token');
    if (lToken && lToken !== 'undefined' && lToken !== 'null') return lToken;
  } catch {}
  return null;
};

const clearAllAuthStorage = () => {
  AUTH_STORAGE_KEYS.forEach((key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {}
    try {
      localStorage.removeItem(key);
    } catch {}
  });
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
    const token = readAuthTokenSafe();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    // ✅ លុប Content-Type ដោយស្វ័យប្រវត្តិពេល Upload ឯកសារ/រូបភាព (FormData) ដើម្បីឱ្យ Browser កំណត់ Boundary ត្រឹមត្រូវ
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (config.headers) {
        delete config.headers['Content-Type'];
      }
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

      // ✅ សម្អាតទិន្នន័យគណនីចេញពីទាំង sessionStorage និង localStorage ការពារ Infinite Redirect Loop
      if (!isPublicAuthRequest) {
        clearAllAuthStorage();
        delete api.defaults.headers.common['Authorization'];

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
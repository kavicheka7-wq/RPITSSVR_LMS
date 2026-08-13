// src/components/auth/Login.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { toast } from 'react-toastify';
import {
  EnvelopeIcon,
  LockClosedIcon,
  ArrowRightOnRectangleIcon,
  EyeIcon,
  EyeSlashIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';

// Import logo image
import logo from '../../assets/image/PRIT.png';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        toast.success(t('ចូលប្រព័ន្ធដោយជោគជ័យ!', 'Logged in successfully!'));
        navigate('/');
      } else {
        toast.error(result.error || t('ការចូលប្រព័ន្ធបរាជ័យ', 'Login failed'));
      }
    } catch (error) {
      toast.error(t('មានបញ្ហាក្នុងការចូលប្រព័ន្ធ', 'Error logging in'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-100 via-indigo-100/50 to-purple-100/50 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Language Toggle Fixed Top Right */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md hover:bg-white rounded-2xl border border-gray-200 shadow-lg text-gray-700 font-medium text-sm transition-all hover:scale-105"
        >
          <GlobeAltIcon className="h-5 w-5 text-blue-600" />
          <span>{language === 'km' ? 'ខ្មែរ (KM)' : 'English (EN)'}</span>
        </button>
      </div>

      {/* Decorative circles with vibrant colors */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-linear-to-br from-blue-400/30 to-blue-600/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
      <div className="absolute top-0 -right-4 w-96 h-96 bg-linear-to-br from-emerald-400/30 to-emerald-600/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-96 h-96 bg-linear-to-br from-purple-400/30 to-purple-600/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-linear-to-r from-pink-300/20 to-rose-300/20 rounded-full mix-blend-multiply filter blur-2xl animate-blob animation-delay-3000"></div>

      <div className="max-w-md w-full space-y-8 bg-white/90 backdrop-blur-lg p-8 rounded-3xl shadow-2xl border border-white/30 relative z-10">
        <div className="text-center">
          {/* Logo Section */}
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-emerald-400 to-purple-500 rounded-full blur-2xl opacity-30 animate-pulse"></div>
              <img
                src={logo}
                alt={t('វិទ្យាស្ថានពហុបច្ចេកទេសភូមិភាគតេជោសែនស្វាយរៀង', 'Techo Sen Regional Poly-technic Institute Svay Rieng')}
                className="h-32 w-auto object-contain relative drop-shadow-2xl hover:scale-110 transition-transform duration-300"
                onError={(e) => {
                  e.target.style.display = 'none';
                  const fallback = document.getElementById('logo-fallback');
                  if (fallback) fallback.style.display = 'block';
                }}
              />
            </div>
          </div>
          
          {/* Fallback text if image fails to load */}
          <div id="logo-fallback" style={{ display: 'none' }}>
            <div className="mx-auto h-28 w-28 bg-linear-to-br from-blue-600 via-emerald-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl ring-4 ring-blue-400/30 ring-offset-4 mb-4">
              <span className="text-white text-4xl font-bold tracking-wider">KPI</span>
            </div>
          </div>

          {/* Institute Name - Vibrant colors */}
          <div className="mb-3">
            <h1 className="text-xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-blue-600 via-emerald-500 to-purple-600 tracking-wide leading-tight">
              {t('វិទ្យាស្ថានពហុបច្ចេកទេស', 'Regional Poly-technic')}
            </h1>
            <h1 className="text-xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-blue-600 via-emerald-500 to-purple-600 tracking-wide leading-tight">
              {t('ភូមិភាគតេជោសែនស្វាយរៀង', 'Techo Sen Svay Rieng Institute')}
            </h1>
            <div className="flex justify-center mt-3">
              <div className="h-1.5 w-24 bg-linear-to-r from-blue-400 via-emerald-400 to-purple-400 rounded-full"></div>
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-gray-800 mt-5">
            {t('ស្វាគមន៍ត្រឡប់មកវិញ', 'Welcome Back')}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {t('ចូលប្រព័ន្ធដើម្បីបន្តការងាររបស់អ្នក', 'Sign in to continue to your account')}
          </p>
        </div>
        
        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t('អ៊ីមែល', 'Email')}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <EnvelopeIcon className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors duration-300" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-3.5 pl-10 border-2 border-gray-200 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-300 bg-gray-50/70 hover:bg-white focus:bg-white shadow-sm hover:shadow-md"
                  placeholder={t('អ៊ីមែលរបស់អ្នក', 'Enter your email')}
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t('លេខសម្ងាត់', 'Password')}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LockClosedIcon className="h-5 w-5 text-gray-400 group-focus-within:text-emerald-500 transition-colors duration-300" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-3.5 pl-10 pr-12 border-2 border-gray-200 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-4 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all duration-300 bg-gray-50/70 hover:bg-white focus:bg-white shadow-sm hover:shadow-md"
                  placeholder={t('លេខសម្ងាត់របស់អ្នក', 'Enter your password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-emerald-600 transition-colors duration-300"
                  aria-label={showPassword ? t('លាក់លេខសម្ងាត់', 'Hide password') : t('បង្ហាញលេខសម្ងាត់', 'Show password')}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition-colors duration-200"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-600 hover:text-gray-800 cursor-pointer transition-colors">
                {t('ចងចាំខ្ញុំ', 'Remember me')}
              </label>
            </div>

            <div className="text-sm">
              <a href="#" className="font-medium text-blue-600 hover:text-emerald-600 hover:underline transition-colors duration-200">
                {t('ភ្លេចលេខសម្ងាត់?', 'Forgot password?')}
              </a>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center items-center py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-linear-to-r from-blue-600 via-emerald-500 to-purple-600 hover:from-blue-700 hover:via-emerald-600 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-blue-500/50 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
            >
              <span className="absolute inset-0 rounded-xl bg-linear-to-r from-blue-600 via-emerald-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              <span className="relative flex items-center">
                <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2 group-hover:translate-x-1 group-hover:scale-110 transition-all duration-300" />
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('កំពុងចូលប្រព័ន្ធ...', 'Signing in...')}
                  </>
                ) : (
                  t('ចូលប្រព័ន្ធ', 'Sign In')
                )}
              </span>
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              {t('មិនទាន់មានគណនី?', "Don't have an account?")}{' '}
              <Link to="/register" className="font-semibold text-blue-600 hover:text-emerald-600 hover:underline transition-colors duration-200">
                {t('បង្កើតគណនីថ្មី', 'Create new account')}
              </Link>
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="text-center pt-4 border-t border-gray-200/50">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} {t('វិទ្យាស្ថានពហុបច្ចេកទេសភូមិភាគតេជោសែនស្វាយរៀង', 'Techo Sen Regional Poly-technic Institute Svay Rieng')}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.2); }
          66% { transform: translate(-20px, 20px) scale(0.8); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }
        .animate-blob {
          animation: blob 8s infinite ease-in-out;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-3000 {
          animation-delay: 3s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .animate-pulse {
          animation: pulse-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default Login;
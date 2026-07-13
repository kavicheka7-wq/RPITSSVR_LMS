// src/components/auth/Login.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import {
  EnvelopeIcon,
  LockClosedIcon,
  ArrowRightOnRectangleIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        toast.success('ចូលប្រព័ន្ធដោយជោគជ័យ!');
        navigate('/');
      } else {
        toast.error(result.error || 'ការចូលប្រព័ន្ធបរាជ័យ');
      }
    } catch (error) {
      toast.error('មានបញ្ហាក្នុងការចូលប្រព័ន្ធ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-primary-50 via-white to-accent-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-3xl shadow-2xl border border-gray-100">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-primary-700 rounded-full flex items-center justify-center shadow-md ring-2 ring-accent-400 ring-offset-4 mb-5">
            <svg className="h-7 w-7 text-accent-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-900">ស្វាគមន៍ត្រឡប់មកវិញ</h2>
          <p className="mt-2 text-sm text-gray-600">
            ចូលប្រព័ន្ធដើម្បីបន្តការងាររបស់អ្នក
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                អ៊ីមែល
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2.5 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  placeholder="អ៊ីមែលរបស់អ្នក"
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                លេខសម្ងាត់
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LockClosedIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2.5 pl-10 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  placeholder="លេខសម្ងាត់របស់អ្នក"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? 'លាក់លេខសម្ងាត់' : 'បង្ហាញលេខសម្ងាត់'}
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
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                ចងចាំខ្ញុំ
              </label>
            </div>

            <div className="text-sm">
              <a href="#" className="font-medium text-primary-600 hover:text-primary-500">
                ភ្លេចលេខសម្ងាត់?
              </a>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center items-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-all shadow-lg hover:shadow-xl"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
              {loading ? 'កំពុងចូលប្រព័ន្ធ...' : 'ចូលប្រព័ន្ធ'}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              មិនទាន់មានគណនី?{' '}
              <Link to="/register" className="font-medium text-primary-600 hover:text-primary-500 hover:underline">
                បង្កើតគណនីថ្មី
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
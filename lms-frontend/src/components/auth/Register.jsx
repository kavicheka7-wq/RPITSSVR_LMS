// src/components/auth/Register.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { toast } from 'react-toastify';
import api from '../../services/api';
import {
  UserIcon,
  EnvelopeIcon,
  LockClosedIcon,
  IdentificationIcon,
  UserPlusIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';

const Register = () => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    password_confirmation: '',
    role_id: '',
  });
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const response = await api.get('/roles');
      const rolesData = response.data.data ? response.data.data : response.data;
      setRoles(rolesData);
    } catch (error) {
      console.error('Error fetching roles:', error);
    }
  };

  const getRoleDisplayName = (roleName) => {
    if (language === 'km') {
      switch(roleName) {
        case 'Admin': return 'អ្នកគ្រប់គ្រង';
        case 'Teacher': return 'គ្រូបង្រៀន';
        case 'Student': return 'សិស្ស';
        default: return roleName;
      }
    }
    return roleName;
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await register(formData);
      if (result.success) {
        toast.success(t('ការចុះឈ្មោះជោគជ័យ!', 'Registration successful!'));
        navigate('/');
      } else {
        toast.error(result.error || t('ការចុះឈ្មោះបរាជ័យ', 'Registration failed'));
      }
    } catch (error) {
      toast.error(t('មានបញ្ហាក្នុងការចុះឈ្មោះ', 'Error during registration'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-primary-50 via-white to-accent-50 py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md hover:bg-white rounded-2xl border border-gray-200 shadow-lg text-gray-700 font-medium text-sm transition-all hover:scale-105"
        >
          <GlobeAltIcon className="h-5 w-5 text-blue-600" />
          <span>{language === 'km' ? 'ខ្មែរ (KM)' : 'English (EN)'}</span>
        </button>
      </div>

      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-3xl shadow-2xl border border-gray-100">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-primary-700 rounded-full flex items-center justify-center shadow-md ring-2 ring-accent-400 ring-offset-4 mb-5">
            <UserPlusIcon className="h-7 w-7 text-accent-300" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">{t('បង្កើតគណនីថ្មី', 'Create New Account')}</h2>
          <p className="mt-2 text-sm text-gray-600">
            {t('ចូលរួមជាមួយប្រព័ន្ធគ្រប់គ្រងសិក្សា LMS RPITSSVR', 'Join the LMS RPITSSVR Learning System')}
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('នាមខ្លួន', 'First Name')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="first_name"
                  name="first_name"
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={handleChange}
                  className="appearance-none block w-full px-3 py-2.5 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  placeholder={t('នាមខ្លួន', 'First Name')}
                />
              </div>
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('នាមត្រកូល', 'Last Name')}
              </label>
              <input
                id="last_name"
                name="last_name"
                type="text"
                required
                value={formData.last_name}
                onChange={handleChange}
                className="appearance-none block w-full px-3 py-2.5 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder={t('នាមត្រកូល', 'Last Name')}
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('អ៊ីមែល', 'Email')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <EnvelopeIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="appearance-none block w-full px-3 py-2.5 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder={t('អ៊ីមែលរបស់អ្នក', 'Your Email')}
              />
            </div>
          </div>

          <div>
            <label htmlFor="role_id" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('តួនាទី', 'Role')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <IdentificationIcon className="h-5 w-5 text-gray-400" />
              </div>
              <select
                id="role_id"
                name="role_id"
                required
                value={formData.role_id}
                onChange={handleChange}
                className="appearance-none block w-full px-3 py-2.5 pl-10 border border-gray-300 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all bg-white"
              >
                <option value="">{t('ជ្រើសរើសតួនាទី', 'Select Role')}</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {getRoleDisplayName(role.role_name)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('ពាក្យសម្ងាត់', 'Password')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LockClosedIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="appearance-none block w-full px-3 py-2.5 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  placeholder={t('ពាក្យសម្ងាត់', 'Password')}
                />
              </div>
            </div>
            <div>
              <label htmlFor="password_confirmation" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('បញ្ជាក់ពាក្យសម្ងាត់', 'Confirm Password')}
              </label>
              <input
                id="password_confirmation"
                name="password_confirmation"
                type="password"
                required
                value={formData.password_confirmation}
                onChange={handleChange}
                className="appearance-none block w-full px-3 py-2.5 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder={t('បញ្ជាក់ពាក្យសម្ងាត់', 'Confirm Password')}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center items-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-all shadow-lg hover:shadow-xl"
            >
              <UserPlusIcon className="h-5 w-5 mr-2" />
              {loading ? t('កំពុងបង្កើតគណនី...', 'Creating Account...') : t('បង្កើតគណនី', 'Create Account')}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              {t('មានគណនីរួចហើយ?', 'Already have an account?')}{' '}
              <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500 hover:underline">
                {t('ចូលប្រព័ន្ធ', 'Sign In')}
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
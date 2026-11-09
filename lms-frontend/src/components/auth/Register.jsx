// src/components/auth/Register.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';
import {
  UserIcon,
  EnvelopeIcon,
  LockClosedIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeSlashIcon,
  GlobeAltIcon,
  AcademicCapIcon,
  ShieldCheckIcon,
  SunIcon,
  MoonIcon,
  BuildingLibraryIcon,
  CheckBadgeIcon,
  BriefcaseIcon,
  WrenchScrewdriverIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

import logo from '../../assets/image/PRIT.png';

const ADMIN_SETUP_STORAGE_KEY = 'lms_initial_admin_initialized';
const THEME_PREF_KEY = 'lms_theme_preference';

const checkIsNightTime = () => {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6;
};

// ✅ កំណត់ផ្លូវទៅកាន់ Dashboard ឱ្យត្រូវតាមតួនាទីដូចក្នុង Login.jsx
const resolveTargetDashboardPath = (userObj) => {
  const rawRole = (
    userObj?.role?.role_name ||
    userObj?.role?.name ||
    userObj?.role_name ||
    (typeof userObj?.role === 'string' ? userObj.role : '') ||
    ''
  )
    .toString()
    .toLowerCase();

  if (rawRole.includes('admin') || userObj?.role_id === 1 || String(userObj?.role_id) === '1') {
    return '/admin/dashboard';
  }
  if (rawRole.includes('teacher') || userObj?.role_id === 2) {
    return '/teacher/dashboard';
  }
  if (rawRole.includes('student') || userObj?.role_id === 3) {
    return '/student/dashboard';
  }
  return '/admin/dashboard';
};

const EMPTY_FIELD_ERRORS = Object.freeze({
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  password_confirmation: '',
});

const Register = () => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    password_confirmation: '',
    role_id: '1',
  });

  const [fieldErrors, setFieldErrors] = useState(EMPTY_FIELD_ERRORS);
  const [loading, setLoading] = useState(false);

  const firstNameInputRef = useRef(null);
  const lastNameInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);

  const [isAlreadyInitialized, setIsAlreadyInitialized] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_SETUP_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { isAuthenticated, user, register } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(resolveTargetDashboardPath(user), { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const [themePref, setThemePref] = useState('auto');
  const [isDarkMode, setIsDarkMode] = useState(() => checkIsNightTime());

  useEffect(() => {
    try {
      localStorage.removeItem(THEME_PREF_KEY);
    } catch {}

    const applyTheme = () => {
      const darkActive =
        themePref === 'auto' ? checkIsNightTime() : themePref === 'dark';
      setIsDarkMode(darkActive);

      const root = document.documentElement;
      if (darkActive) {
        root.classList.add('dark');
        try {
          localStorage.setItem('lms_theme_mode', 'dark');
        } catch {}
      } else {
        root.classList.remove('dark');
        try {
          localStorage.setItem('lms_theme_mode', 'light');
        } catch {}
      }
    };

    applyTheme();

    if (themePref === 'auto') {
      const timer = setInterval(applyTheme, 60000);
      return () => clearInterval(timer);
    }
  }, [themePref]);

  const handleToggleTheme = useCallback(() => {
    setThemePref((prev) => {
      const currentDark = prev === 'auto' ? checkIsNightTime() : prev === 'dark';
      return currentDark ? 'light' : 'dark';
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkFirstTimeAdminSetup = async () => {
      try {
        const response = await api.get('/roles');
        if (!isMounted) return;
        const data = response.data || {};
        const rolesData = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
          ? data
          : [];

        if (data.has_admin === true || data.admin_exists === true) {
          try {
            localStorage.setItem(ADMIN_SETUP_STORAGE_KEY, 'true');
          } catch {}
          setIsAlreadyInitialized(true);
          return;
        }

        if (data.has_admin === false || data.admin_exists === false) {
          try {
            localStorage.removeItem(ADMIN_SETUP_STORAGE_KEY);
          } catch {}
          const adminRole = rolesData.find((r) =>
            (r.role_name || r.name || '')
              .toString()
              .trim()
              .toLowerCase()
              .includes('admin')
          );
          if (adminRole) {
            setFormData((prev) => ({ ...prev, role_id: String(adminRole.id) }));
          } else if (rolesData.length > 0) {
            setFormData((prev) => ({
              ...prev,
              role_id: String(rolesData[0].id),
            }));
          }
          setIsAlreadyInitialized(false);
          return;
        }

        const adminRole = rolesData.find((r) =>
          (r.role_name || r.name || '')
            .toString()
            .trim()
            .toLowerCase()
            .includes('admin')
        );

        if (adminRole) {
          setFormData((prev) => ({ ...prev, role_id: String(adminRole.id) }));

          if (
            typeof adminRole.users_count === 'number' &&
            adminRole.users_count === 0
          ) {
            try {
              localStorage.removeItem(ADMIN_SETUP_STORAGE_KEY);
            } catch {}
            setIsAlreadyInitialized(false);
            return;
          }
          if (Array.isArray(adminRole.users) && adminRole.users.length === 0) {
            try {
              localStorage.removeItem(ADMIN_SETUP_STORAGE_KEY);
            } catch {}
            setIsAlreadyInitialized(false);
            return;
          }

          try {
            localStorage.setItem(ADMIN_SETUP_STORAGE_KEY, 'true');
          } catch {}
          setIsAlreadyInitialized(true);
          return;
        }

        try {
          localStorage.removeItem(ADMIN_SETUP_STORAGE_KEY);
        } catch {}
        if (rolesData.length > 0) {
          setFormData((prev) => ({ ...prev, role_id: String(rolesData[0].id) }));
        }
        setIsAlreadyInitialized(false);
      } catch (error) {
        console.error('Error checking initial setup:', error);
      }
    };

    checkFirstTimeAdminSetup();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isAlreadyInitialized) {
      const timer = setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isAlreadyInitialized, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const applyRegistrationValidationError = useCallback(
    (resultObj, rawFallbackMsg = '') => {
      const apiErrors = resultObj?.errors || {};
      const firstErr = Array.isArray(apiErrors.first_name)
        ? apiErrors.first_name[0]
        : apiErrors.first_name;
      const lastErr = Array.isArray(apiErrors.last_name)
        ? apiErrors.last_name[0]
        : apiErrors.last_name;
      const emailErr = Array.isArray(apiErrors.email)
        ? apiErrors.email[0]
        : apiErrors.email;
      const passErr = Array.isArray(apiErrors.password)
        ? apiErrors.password[0]
        : apiErrors.password;

      if (firstErr || lastErr || emailErr || passErr) {
        setFieldErrors({
          first_name: firstErr ? String(firstErr) : '',
          last_name: lastErr ? String(lastErr) : '',
          email: emailErr ? String(emailErr) : '',
          password: passErr ? String(passErr) : '',
          password_confirmation: '',
        });

        if (passErr) {
          setFormData((prev) => ({
            ...prev,
            password: '',
            password_confirmation: '',
          }));
        }

        requestAnimationFrame(() => {
          if (firstErr) firstNameInputRef.current?.focus();
          else if (lastErr) lastNameInputRef.current?.focus();
          else if (emailErr) emailInputRef.current?.focus();
          else if (passErr) passwordInputRef.current?.focus();
        });
        return;
      }

      const msg = String(
        resultObj?.error ||
          resultObj?.message ||
          rawFallbackMsg ||
          t('ការចុះឈ្មោះបរាជ័យ! សូមពិនិត្យទិន្នន័យម្ដងទៀត។', 'Registration failed!')
      ).trim();
      const lower = msg.toLowerCase();

      const isEmailRelated =
        lower.includes('អ៊ីមែល') ||
        lower.includes('email') ||
        lower.includes('taken') ||
        lower.includes('មានរួចហើយ');

      if (isEmailRelated) {
        setFieldErrors({
          ...EMPTY_FIELD_ERRORS,
          email: msg,
        });
        requestAnimationFrame(() => {
          emailInputRef.current?.focus();
        });
      } else {
        setFieldErrors({
          ...EMPTY_FIELD_ERRORS,
          password: msg,
        });
        setFormData((prev) => ({
          ...prev,
          password: '',
          password_confirmation: '',
        }));
        requestAnimationFrame(() => {
          passwordInputRef.current?.focus();
        });
      }
    },
    [t]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setFieldErrors(EMPTY_FIELD_ERRORS);

    if (formData.password.length < 8) {
      setFieldErrors({
        ...EMPTY_FIELD_ERRORS,
        password: t(
          'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៨ តួអក្សរ!',
          'Password must be at least 8 characters!'
        ),
      });
      setFormData((prev) => ({
        ...prev,
        password: '',
        password_confirmation: '',
      }));
      requestAnimationFrame(() => {
        passwordInputRef.current?.focus();
      });
      return;
    }

    if (formData.password !== formData.password_confirmation) {
      setFieldErrors({
        ...EMPTY_FIELD_ERRORS,
        password_confirmation: t(
          'ការបញ្ជាក់ពាក្យសម្ងាត់មិនត្រូវគ្នាទេ!',
          'Passwords do not match!'
        ),
      });
      setFormData((prev) => ({
        ...prev,
        password_confirmation: '',
      }));
      requestAnimationFrame(() => {
        confirmPasswordInputRef.current?.focus();
      });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim(),
      };

      const result = await register(payload);
      if (result.success) {
        setFieldErrors(EMPTY_FIELD_ERRORS);
        try {
          localStorage.setItem(ADMIN_SETUP_STORAGE_KEY, 'true');
        } catch {}

        navigate(resolveTargetDashboardPath(result.user), { replace: true });
      } else {
        applyRegistrationValidationError(result);
      }
    } catch (err) {
      const responseData = err?.response?.data || {};
      applyRegistrationValidationError(
        responseData,
        t('មានបញ្ហាក្នុងការចុះឈ្មោះ', 'Error during registration')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`register-page-font relative min-h-screen lg:h-screen w-full flex flex-col justify-between px-4 py-4 sm:px-8 sm:py-5 lg:px-12 overflow-x-hidden lg:overflow-hidden select-none transition-colors duration-200 ${
        isDarkMode
          ? 'bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-950 text-white'
          : 'bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 text-slate-900'
      }`}
    >
      <div
        className={`absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[120px] pointer-events-none ${
          isDarkMode ? 'bg-blue-500/15' : 'bg-blue-400/25'
        }`}
      ></div>
      <div
        className={`absolute top-1/3 right-10 w-80 h-80 rounded-full blur-[120px] pointer-events-none ${
          isDarkMode ? 'bg-purple-500/15' : 'bg-indigo-400/20'
        }`}
      ></div>
      <div
        className={`absolute -bottom-32 left-1/3 w-96 h-96 rounded-full blur-[120px] pointer-events-none ${
          isDarkMode ? 'bg-indigo-500/15' : 'bg-sky-400/20'
        }`}
      ></div>
      <BuildingLibraryIcon
        className={`absolute -left-10 -bottom-10 w-72 h-72 -rotate-12 pointer-events-none ${
          isDarkMode ? 'text-white/[0.025]' : 'text-blue-950/[0.04]'
        }`}
      />

      {/* ================================================================== */}
      {/* 📌 ១. របារខាងលើបំផុត (Top Navigation Bar)                          */}
      {/* ================================================================== */}
      <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 pt-1 shrink-0">
        <div
          className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-full backdrop-blur-md border shadow-xs transition-colors ${
            isDarkMode
              ? 'bg-white/10 border-white/15 text-blue-100'
              : 'bg-white/95 border-blue-200/80 text-blue-950 shadow-sm'
          }`}
        >
          <AcademicCapIcon
            className={`h-5 w-5 shrink-0 ${
              isDarkMode ? 'text-yellow-400' : 'text-blue-700'
            }`}
          />
          <span className="text-[13px] font-bold tracking-wide leading-relaxed">
            {t(
              'ការរៀបចំគណនីអ្នកគ្រប់គ្រងដំបូង (Initial Admin Setup)',
              'Initial System Administrator Setup'
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-extrabold border backdrop-blur-md shadow-2xs transition-colors ${
              isDarkMode
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30 shadow-emerald-950/20'
                : 'bg-emerald-50/95 text-emerald-700 border-emerald-200/90'
            }`}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="leading-relaxed">
              {t('ដំណើរការធម្មតា', 'Online')}
            </span>
          </div>

          <button
            type="button"
            onClick={handleToggleTheme}
            className={`p-2 rounded-xl border backdrop-blur-md transition-colors cursor-pointer ${
              isDarkMode
                ? 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                : 'bg-white hover:bg-blue-50 border-slate-200 text-slate-700 shadow-2xs'
            }`}
            title={
              isDarkMode
                ? t('ប្តូរទៅទម្រង់ថ្ងៃ', 'Switch to Light Mode')
                : t('ប្តូរទៅទម្រង់យប់', 'Switch to Dark Mode')
            }
          >
            {isDarkMode ? (
              <SunIcon className="h-4 w-4 text-yellow-400" />
            ) : (
              <MoonIcon className="h-4 w-4 text-indigo-600" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleLanguage}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border backdrop-blur-md text-xs font-extrabold transition-colors cursor-pointer ${
              isDarkMode
                ? 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                : 'bg-white hover:bg-blue-50 border-slate-200 text-slate-800 shadow-2xs'
            }`}
          >
            <GlobeAltIcon
              className={`h-4 w-4 ${
                isDarkMode ? 'text-yellow-400' : 'text-blue-600'
              }`}
            />
            <span>{language === 'km' ? 'KH' : 'EN'}</span>
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 📌 ២. ផ្នែកកណ្ដាល                                                   */}
      {/* ================================================================== */}
      <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center my-auto py-3">
        
        <div className="hidden lg:block lg:col-span-7 space-y-6">
          <div className="space-y-2.5">
            <p
              className={`khmer-title-clean text-2xl sm:text-3xl xl:text-[32px] font-extrabold tracking-wide leading-[1.5] ${
                isDarkMode
                  ? 'bg-gradient-to-r from-yellow-300 via-amber-300 to-yellow-100 bg-clip-text text-transparent'
                  : 'text-indigo-600'
              }`}
            >
              {t('ស្វាគមន៍ មកកាន់', 'Welcome to')}
            </p>

            <h1
              className={`khmer-title-clean text-4xl xl:text-[46px] font-black tracking-tight leading-[1.42] ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}
            >
              {t('វិទ្យាស្ថានពហុបច្ចេកទេស', 'Regional Polytechnic Institute')}
              <span
                className={`block mt-2 ${
                  isDarkMode
                    ? 'bg-gradient-to-r from-blue-300 via-indigo-300 to-purple-300 bg-clip-text text-transparent'
                    : 'bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-900 bg-clip-text text-transparent'
                }`}
              >
                {t('ភូមិភាគតេជោសែនស្វាយរៀង', 'Techo Sen Svay Rieng')}
              </span>
            </h1>

            <div className="flex items-center gap-2 pt-2">
              <div className="h-2 w-28 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full shadow-xs"></div>
              <div className="h-2 w-6 bg-indigo-500/70 rounded-full"></div>
              <div className="h-2 w-2.5 bg-indigo-400/40 rounded-full"></div>
            </div>
          </div>

          <div className="relative max-w-xl pl-5 py-1.5">
            <div className="absolute top-0 left-0 h-full w-1.5 rounded-full bg-gradient-to-b from-amber-400 via-yellow-500 to-indigo-600"></div>

            <div className="space-y-1.5">
              <p
                className={`khmer-title-clean text-2xl xl:text-[27px] font-extrabold tracking-wide leading-[1.55] ${
                  isDarkMode ? 'text-yellow-300' : 'text-indigo-700'
                }`}
              >
                {t('«TVET ជំនាញពិត ជីវិតប្រសើរ!', '“TVET Real Skills, Better Life!')}
              </p>
              <p
                className={`khmer-title-clean text-xl xl:text-[22px] font-bold tracking-wide leading-[1.55] ${
                  isDarkMode ? 'text-blue-100/95' : 'text-slate-700'
                }`}
              >
                {t(
                  'រៀនឱ្យចប់ ឱ្យចេះ ឱ្យមានការងារ»',
                  'Study to Finish, to Know, to Get a Job”'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div
              className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-[13.5px] font-bold border backdrop-blur-sm transition-colors ${
                isDarkMode
                  ? 'bg-white/[0.07] border-white/15 text-blue-100'
                  : 'bg-white/95 border-blue-200/80 text-slate-800 shadow-sm'
              }`}
            >
              <WrenchScrewdriverIcon
                className={`h-5 w-5 shrink-0 stroke-[2] ${
                  isDarkMode ? 'text-amber-400' : 'text-indigo-600'
                }`}
              />
              <span className="leading-relaxed">
                {t('ជំនាញបច្ចេកទេសពិតប្រាកដ', 'Practical Technical Skills')}
              </span>
            </div>

            <div
              className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-[13.5px] font-bold border backdrop-blur-sm transition-colors ${
                isDarkMode
                  ? 'bg-white/[0.07] border-white/15 text-blue-100'
                  : 'bg-white/95 border-blue-200/80 text-slate-800 shadow-sm'
              }`}
            >
              <CheckBadgeIcon
                className={`h-5 w-5 shrink-0 stroke-[2] ${
                  isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
                }`}
              />
              <span className="leading-relaxed">
                {t('សីលធម៌ និងវិន័យវិជ្ជាជីវៈ', 'Professional Ethics')}
              </span>
            </div>

            <div
              className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-[13.5px] font-bold border backdrop-blur-sm transition-colors ${
                isDarkMode
                  ? 'bg-white/[0.07] border-white/15 text-blue-100'
                  : 'bg-white/95 border-blue-200/80 text-slate-800 shadow-sm'
              }`}
            >
              <BriefcaseIcon
                className={`h-5 w-5 shrink-0 stroke-[2] ${
                  isDarkMode ? 'text-sky-400' : 'text-blue-600'
                }`}
              />
              <span className="leading-relaxed">
                {t('ឱកាសការងារ និងអនាគតល្អ', 'Career Opportunities')}
              </span>
            </div>
          </div>
        </div>

        {/* 📌 ផ្នែកខាងស្ដាំ៖ ប្រអប់បង្កើតគណនី Admin ដំបូង */}
        <div className="lg:col-span-5 flex justify-center lg:justify-end">
          <div
            className={`relative w-full max-w-[420px] rounded-[1.75rem] backdrop-blur-2xl border p-5 sm:p-6 overflow-hidden transition-colors duration-200 ${
              isDarkMode
                ? 'bg-white/[0.08] border-white/20 shadow-[0_25px_60px_rgba(0,0,0,0.5)]'
                : 'bg-white/95 border-white shadow-[0_20px_50px_rgba(15,23,42,0.12)]'
            }`}
          >
            <div
              className={`absolute -top-20 left-1/2 -translate-x-1/2 w-56 h-28 rounded-full blur-2xl pointer-events-none ${
                isDarkMode ? 'bg-indigo-400/20' : 'bg-blue-400/15'
              }`}
            ></div>

            <div className="relative z-10 flex flex-col items-center text-center mb-3.5">
              <div className="relative mb-2">
                <div className="absolute -inset-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur opacity-35"></div>
                <div
                  className={`relative h-12 w-12 rounded-2xl border p-1.5 flex items-center justify-center shadow-md ${
                    isDarkMode
                      ? 'bg-slate-900/85 border-white/20'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <img
                    src={logo}
                    alt="RPITSSVR Logo"
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              </div>

              <h2
                className={`text-lg font-extrabold tracking-wide leading-relaxed ${
                  isDarkMode ? 'text-white' : 'text-slate-900'
                }`}
              >
                {t('បង្កើតគណនីអ្នកគ្រប់គ្រងដំបូង', 'Create Initial Admin')}
              </h2>
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-bold mt-1 border leading-relaxed ${
                  isDarkMode
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-400/30'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}
              >
                <ShieldCheckIcon className="h-4 w-4 shrink-0" />
                <span>
                  {t(
                    'តួនាទី៖ អ្នកគ្រប់គ្រងប្រព័ន្ធ (Admin)',
                    'Role: System Administrator'
                  )}
                </span>
              </div>
            </div>

            {isAlreadyInitialized ? (
              <div className="relative z-10 text-center py-4 space-y-4">
                <div
                  className={`mx-auto h-13 w-13 rounded-2xl flex items-center justify-center border ${
                    isDarkMode
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/30'
                      : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                  }`}
                >
                  <ShieldCheckIcon className="h-7 w-7" />
                </div>
                <div className="space-y-1">
                  <h3
                    className={`text-sm sm:text-base font-extrabold leading-relaxed ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {t(
                      'គណនីអ្នកគ្រប់គ្រងត្រូវបានបង្កើតរួចហើយ!',
                      'Admin Account Already Initialized!'
                    )}
                  </h3>
                  <p
                    className={`text-xs leading-relaxed ${
                      isDarkMode ? 'text-blue-200/75' : 'text-slate-500'
                    }`}
                  >
                    {t(
                      'ទំព័រនេះបើកសម្រាប់តែការបង្កើតគណនី Admin លើកដំបូងប៉ុណ្ណោះ។ កំពុងបញ្ជូនទៅទំព័រចូលប្រព័ន្ធ...',
                      'This page is only available for first-time setup. Redirecting to login...'
                    )}
                  </p>
                </div>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-5 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-indigo-500 via-blue-600 to-purple-600 shadow-lg transition-colors leading-relaxed"
                >
                  <span>
                    {t('ទៅកាន់ទំព័រចូលប្រព័ន្ធឥឡូវនេះ', 'Go to Login Now')}
                  </span>
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <form className="relative z-10 space-y-3" onSubmit={handleSubmit}>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="first_name"
                      className={`block text-xs font-extrabold tracking-wide mb-1 ml-1 leading-relaxed transition-colors ${
                        fieldErrors.first_name
                          ? isDarkMode
                            ? 'text-rose-400'
                            : 'text-rose-600'
                          : isDarkMode
                          ? 'text-blue-100/90'
                          : 'text-slate-700'
                      }`}
                    >
                      {t('នាមខ្លួន', 'First Name')}
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <UserIcon
                          className={`h-4 w-4 sm:h-5 sm:w-5 transition-colors ${
                            fieldErrors.first_name
                              ? 'text-rose-500'
                              : isDarkMode
                              ? 'text-indigo-300/70 group-focus-within:text-yellow-400'
                              : 'text-slate-400 group-focus-within:text-indigo-600'
                          }`}
                        />
                      </div>
                      <input
                        ref={firstNameInputRef}
                        id="first_name"
                        name="first_name"
                        type="text"
                        required
                        value={formData.first_name}
                        onChange={handleChange}
                        className={`block w-full pl-9 sm:pl-10 pr-3 py-2 border rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                          fieldErrors.first_name
                            ? isDarkMode
                              ? 'register-dark-autofill bg-rose-950/35 border-rose-500 text-white placeholder-rose-300/50 focus:border-rose-400 focus:ring-rose-500/35'
                              : 'register-light-autofill bg-rose-50/60 border-rose-500 text-slate-900 placeholder-rose-400 focus:bg-white focus:border-rose-600 focus:ring-rose-500/25'
                            : isDarkMode
                            ? 'register-dark-autofill bg-slate-950/55 hover:bg-slate-950/70 border-white/15 focus:border-indigo-400 text-white placeholder-blue-200/40 focus:ring-indigo-500/40'
                            : 'register-light-autofill bg-slate-50 hover:bg-slate-100/70 focus:bg-white border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400 focus:ring-indigo-500/25'
                        }`}
                        placeholder={t('នាមខ្លួន', 'First Name')}
                      />
                    </div>
                    {fieldErrors.first_name && (
                      <div className="flex items-start gap-1 mt-1 ml-1 text-rose-500 dark:text-rose-400">
                        <ExclamationCircleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5 stroke-[2.2]" />
                        <p className="text-[11px] font-bold leading-snug">
                          {fieldErrors.first_name}
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="last_name"
                      className={`block text-xs font-extrabold tracking-wide mb-1 ml-1 leading-relaxed transition-colors ${
                        fieldErrors.last_name
                          ? isDarkMode
                            ? 'text-rose-400'
                            : 'text-rose-600'
                          : isDarkMode
                          ? 'text-blue-100/90'
                          : 'text-slate-700'
                      }`}
                    >
                      {t('នាមត្រកូល', 'Last Name')}
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <UserIcon
                          className={`h-4 w-4 sm:h-5 sm:w-5 transition-colors ${
                            fieldErrors.last_name
                              ? 'text-rose-500'
                              : isDarkMode
                              ? 'text-indigo-300/70 group-focus-within:text-yellow-400'
                              : 'text-slate-400 group-focus-within:text-indigo-600'
                          }`}
                        />
                      </div>
                      <input
                        ref={lastNameInputRef}
                        id="last_name"
                        name="last_name"
                        type="text"
                        required
                        value={formData.last_name}
                        onChange={handleChange}
                        className={`block w-full pl-9 sm:pl-10 pr-3 py-2 border rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                          fieldErrors.last_name
                            ? isDarkMode
                              ? 'register-dark-autofill bg-rose-950/35 border-rose-500 text-white placeholder-rose-300/50 focus:border-rose-400 focus:ring-rose-500/35'
                              : 'register-light-autofill bg-rose-50/60 border-rose-500 text-slate-900 placeholder-rose-400 focus:bg-white focus:border-rose-600 focus:ring-rose-500/25'
                            : isDarkMode
                            ? 'register-dark-autofill bg-slate-950/55 hover:bg-slate-950/70 border-white/15 focus:border-indigo-400 text-white placeholder-blue-200/40 focus:ring-indigo-500/40'
                            : 'register-light-autofill bg-slate-50 hover:bg-slate-100/70 focus:bg-white border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400 focus:ring-indigo-500/25'
                        }`}
                        placeholder={t('នាមត្រកូល', 'Last Name')}
                      />
                    </div>
                    {fieldErrors.last_name && (
                      <div className="flex items-start gap-1 mt-1 ml-1 text-rose-500 dark:text-rose-400">
                        <ExclamationCircleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5 stroke-[2.2]" />
                        <p className="text-[11px] font-bold leading-snug">
                          {fieldErrors.last_name}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className={`block text-xs font-extrabold tracking-wide mb-1 ml-1 leading-relaxed transition-colors ${
                      fieldErrors.email
                        ? isDarkMode
                          ? 'text-rose-400'
                          : 'text-rose-600'
                        : isDarkMode
                        ? 'text-blue-100/90'
                        : 'text-slate-700'
                    }`}
                  >
                    {t('អាសយដ្ឋានអ៊ីមែល', 'Email Address')}
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <EnvelopeIcon
                        className={`h-4 w-4 sm:h-5 sm:w-5 transition-colors ${
                          fieldErrors.email
                            ? 'text-rose-500'
                            : isDarkMode
                            ? 'text-indigo-300/70 group-focus-within:text-yellow-400'
                            : 'text-slate-400 group-focus-within:text-indigo-600'
                        }`}
                      />
                    </div>
                    <input
                      ref={emailInputRef}
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className={`block w-full pl-10 pr-4 py-2 border rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                        fieldErrors.email
                          ? isDarkMode
                            ? 'register-dark-autofill bg-rose-950/35 border-rose-500 text-white placeholder-rose-300/50 focus:border-rose-400 focus:ring-rose-500/35'
                            : 'register-light-autofill bg-rose-50/60 border-rose-500 text-slate-900 placeholder-rose-400 focus:bg-white focus:border-rose-600 focus:ring-rose-500/25'
                          : isDarkMode
                          ? 'register-dark-autofill bg-slate-950/55 hover:bg-slate-950/70 border-white/15 focus:border-indigo-400 text-white placeholder-blue-200/40 focus:ring-indigo-500/40'
                          : 'register-light-autofill bg-slate-50 hover:bg-slate-100/70 focus:bg-white border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400 focus:ring-indigo-500/25'
                      }`}
                      placeholder={t(
                        'បញ្ចូលអ៊ីមែលអ្នកគ្រប់គ្រង...',
                        'Enter admin email'
                      )}
                    />
                  </div>
                  {fieldErrors.email && (
                    <div className="flex items-start gap-1.5 mt-1.5 ml-1 text-rose-500 dark:text-rose-400">
                      <ExclamationCircleIcon className="h-4 w-4 shrink-0 mt-0.5 stroke-[2.2]" />
                      <p className="text-[11.5px] font-bold leading-snug">
                        {fieldErrors.email}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label
                        htmlFor="password"
                        className={`block text-xs font-extrabold tracking-wide mb-1 ml-1 leading-relaxed transition-colors ${
                          fieldErrors.password
                            ? isDarkMode
                              ? 'text-rose-400'
                              : 'text-rose-600'
                            : isDarkMode
                            ? 'text-blue-100/90'
                            : 'text-slate-700'
                        }`}
                      >
                        {t('ពាក្យសម្ងាត់', 'Password')}
                      </label>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <LockClosedIcon
                            className={`h-4 w-4 sm:h-5 sm:w-5 transition-colors ${
                              fieldErrors.password
                                ? 'text-rose-500'
                                : isDarkMode
                                ? 'text-indigo-300/70 group-focus-within:text-yellow-400'
                                : 'text-slate-400 group-focus-within:text-indigo-600'
                            }`}
                          />
                        </div>
                        <input
                          ref={passwordInputRef}
                          id="password"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={formData.password}
                          onChange={handleChange}
                          className={`block w-full pl-9 sm:pl-10 pr-8 py-2 border rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                            fieldErrors.password
                              ? isDarkMode
                                ? 'register-dark-autofill bg-rose-950/35 border-rose-500 text-white placeholder-rose-300/50 focus:border-rose-400 focus:ring-rose-500/35'
                                : 'register-light-autofill bg-rose-50/60 border-rose-500 text-slate-900 placeholder-rose-400 focus:bg-white focus:border-rose-600 focus:ring-rose-500/25'
                              : isDarkMode
                              ? 'register-dark-autofill bg-slate-950/55 hover:bg-slate-950/70 border-white/15 focus:border-indigo-400 text-white placeholder-blue-200/40 focus:ring-indigo-500/40'
                              : 'register-light-autofill bg-slate-50 hover:bg-slate-100/70 focus:bg-white border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400 focus:ring-indigo-500/25'
                          }`}
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className={`absolute inset-y-0 right-0 pr-2.5 flex items-center transition-colors cursor-pointer ${
                            fieldErrors.password
                              ? 'text-rose-400 hover:text-rose-500'
                              : isDarkMode
                              ? 'text-blue-200/60 hover:text-white'
                              : 'text-slate-400 hover:text-indigo-600'
                          }`}
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeSlashIcon className="h-4 w-4" />
                          ) : (
                            <EyeIcon className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="password_confirmation"
                        className={`block text-xs font-extrabold tracking-wide mb-1 ml-1 leading-relaxed transition-colors ${
                          fieldErrors.password_confirmation
                            ? isDarkMode
                              ? 'text-rose-400'
                              : 'text-rose-600'
                            : isDarkMode
                            ? 'text-blue-100/90'
                            : 'text-slate-700'
                        }`}
                      >
                        {t('បញ្ជាក់ពាក្យសម្ងាត់', 'Confirm')}
                      </label>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <LockClosedIcon
                            className={`h-4 w-4 sm:h-5 sm:w-5 transition-colors ${
                              fieldErrors.password_confirmation
                                ? 'text-rose-500'
                                : isDarkMode
                                ? 'text-indigo-300/70 group-focus-within:text-yellow-400'
                                : 'text-slate-400 group-focus-within:text-indigo-600'
                            }`}
                          />
                        </div>
                        <input
                          ref={confirmPasswordInputRef}
                          id="password_confirmation"
                          name="password_confirmation"
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          value={formData.password_confirmation}
                          onChange={handleChange}
                          className={`block w-full pl-9 sm:pl-10 pr-8 py-2 border rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                            fieldErrors.password_confirmation
                              ? isDarkMode
                                ? 'register-dark-autofill bg-rose-950/35 border-rose-500 text-white placeholder-rose-300/50 focus:border-rose-400 focus:ring-rose-500/35'
                                : 'register-light-autofill bg-rose-50/60 border-rose-500 text-slate-900 placeholder-rose-400 focus:bg-white focus:border-rose-600 focus:ring-rose-500/25'
                              : isDarkMode
                              ? 'register-dark-autofill bg-slate-950/55 hover:bg-slate-950/70 border-white/15 focus:border-indigo-400 text-white placeholder-blue-200/40 focus:ring-indigo-500/40'
                              : 'register-light-autofill bg-slate-50 hover:bg-slate-100/70 focus:bg-white border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400 focus:ring-indigo-500/25'
                          }`}
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword((prev) => !prev)
                          }
                          className={`absolute inset-y-0 right-0 pr-2.5 flex items-center transition-colors cursor-pointer ${
                            fieldErrors.password_confirmation
                              ? 'text-rose-400 hover:text-rose-500'
                              : isDarkMode
                              ? 'text-blue-200/60 hover:text-white'
                              : 'text-slate-400 hover:text-indigo-600'
                          }`}
                          tabIndex={-1}
                        >
                          {showConfirmPassword ? (
                            <EyeSlashIcon className="h-4 w-4" />
                          ) : (
                            <EyeIcon className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {(fieldErrors.password ||
                    fieldErrors.password_confirmation) && (
                    <div className="flex items-start gap-1.5 mt-1.5 ml-1 text-rose-500 dark:text-rose-400">
                      <ExclamationCircleIcon className="h-4 w-4 shrink-0 mt-0.5 stroke-[2.2]" />
                      <p className="text-[11.5px] font-bold leading-snug">
                        {fieldErrors.password ||
                          fieldErrors.password_confirmation}
                      </p>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full py-2.5 px-5 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-indigo-500 via-blue-600 to-purple-600 hover:from-indigo-400 hover:via-blue-500 hover:to-purple-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/30 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_8px_25px_rgba(99,102,241,0.45)] hover:shadow-[0_10px_30px_rgba(99,102,241,0.65)] transition-colors duration-200 flex items-center justify-center cursor-pointer mt-1.5"
                >
                  <span className="leading-relaxed">
                    {loading
                      ? t('កំពុងបង្កើតគណនី...', 'Creating Account...')
                      : t('បង្កើតគណនីអ្នកគ្រប់គ្រង', 'Create Admin Account')}
                  </span>
                  {!loading && (
                    <ArrowRightIcon className="h-4 w-4 absolute right-5 stroke-[2.5]" />
                  )}
                </button>

                <div
                  className={`pt-2.5 mt-1.5 border-t text-center ${
                    isDarkMode ? 'border-white/10' : 'border-slate-200/80'
                  }`}
                >
                  <p
                    className={`text-xs font-semibold leading-relaxed ${
                      isDarkMode ? 'text-blue-200/75' : 'text-slate-600'
                    }`}
                  >
                    {t('មានគណនីរួចហើយ?', 'Already have an account?')}{' '}
                    <Link
                      to="/login"
                      className={`font-extrabold hover:underline transition-colors ${
                        isDarkMode
                          ? 'text-yellow-400 hover:text-yellow-300'
                          : 'text-indigo-600 hover:text-indigo-800'
                      }`}
                    >
                      {t('ចូលប្រព័ន្ធ', 'Sign In')}
                    </Link>
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>

      </div>

      {/* ================================================================== */}
      {/* 📌 ៣. រក្សាសិទ្ធិខាងក្រោម (Bottom Copyright Footer)                    */}
      {/* ================================================================== */}
      <div
        className={`relative z-10 w-full max-w-6xl mx-auto pt-2.5 border-t text-center shrink-0 ${
          isDarkMode ? 'border-white/10' : 'border-blue-200/80'
        }`}
      >
        <p
          className={`text-xs font-semibold leading-relaxed ${
            isDarkMode ? 'text-blue-200/60' : 'text-slate-500'
          }`}
        >
          &copy; {new Date().getFullYear()}{' '}
          {t(
            'វិទ្យាស្ថានពហុបច្ចេកទេសភូមិភាគតេជោសែនស្វាយរៀង។ រក្សាសិទ្ធិគ្រប់យ៉ាង។',
            'Regional Polytechnic Institute Techo Sen Svay Rieng. All rights reserved.'
          )}
        </p>
      </div>

      <style>{`
        .register-page-font,
        .khmer-title-clean {
          font-family: 'Kantumruy Pro', 'Battambang', 'Khmer OS Siemreap', sans-serif;
        }

        .register-dark-autofill:-webkit-autofill,
        .register-dark-autofill:-webkit-autofill:hover,
        .register-dark-autofill:-webkit-autofill:focus {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0px 1000px #0f172a inset;
          transition: background-color 5000s ease-in-out 0s;
        }
        .register-light-autofill:-webkit-autofill,
        .register-light-autofill:-webkit-autofill:hover,
        .register-light-autofill:-webkit-autofill:focus {
          -webkit-text-fill-color: #0f172a;
          -webkit-box-shadow: 0 0 0px 1000px #f8fafc inset;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  );
};

export default React.memo(Register);
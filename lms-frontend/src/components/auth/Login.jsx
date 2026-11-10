// src/components/auth/Login.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';
import {
  EnvelopeIcon,
  LockClosedIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  EyeIcon,
  EyeSlashIcon,
  GlobeAltIcon,
  AcademicCapIcon,
  SunIcon,
  MoonIcon,
  BuildingLibraryIcon,
  CheckBadgeIcon,
  BriefcaseIcon,
  WrenchScrewdriverIcon,
  ShieldCheckIcon,
  PaperAirplaneIcon,
  ExclamationCircleIcon,
  KeyIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

import logo from '../../assets/image/PRIT.png';

const ADMIN_SETUP_STORAGE_KEY = 'lms_initial_admin_initialized';
const THEME_PREF_KEY = 'lms_theme_preference';
const REMEMBER_EMAIL_STORAGE_KEY = 'lms_remembered_email';
const REMEMBER_CHECKED_STORAGE_KEY = 'lms_remember_me_checked';

const checkIsNightTime = () => {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6;
};

// ✅ កំណត់ផ្លូវទៅកាន់ '/dashboard' រួមតែមួយគត់ (Clean URL លាក់ /admin, /teacher, /student)
const resolveTargetDashboardPath = () => {
  return '/dashboard';
};

const Login = () => {
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      const savedPref = localStorage.getItem(REMEMBER_CHECKED_STORAGE_KEY);
      return savedPref !== null ? savedPref === 'true' : true;
    } catch {
      return true;
    }
  });

  const [email, setEmail] = useState(() => {
    try {
      const isChecked =
        localStorage.getItem(REMEMBER_CHECKED_STORAGE_KEY) !== 'false';
      return isChecked
        ? localStorage.getItem(REMEMBER_EMAIL_STORAGE_KEY) || ''
        : '';
    } catch {
      return '';
    }
  });

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' });
  const [otpError, setOtpError] = useState('');

  const [step, setStep] = useState('credentials');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [detectedRoleName, setDetectedRoleName] = useState('');
  const [mailSent, setMailSent] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramSent, setTelegramSent] = useState(false);
  const [telegramLinkUrl, setTelegramLinkUrl] = useState(null);
  const [waitingTelegramStart, setWaitingTelegramStart] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendingOtp, setResendingOtp] = useState(false);

  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [resetPassError, setResetPassError] = useState('');

  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const newPasswordInputRef = useRef(null);
  const otpInputRefs = useRef([]);
  const lastSubmittedSignatureRef = useRef('');
  const isCheckingTelegramRef = useRef(false);

  const [canShowRegister, setCanShowRegister] = useState(false);

  const {
    isAuthenticated,
    user,
    login,
    verifyTwoFactor,
    resendTwoFactor,
    checkTelegramLinkStatus,
    setUser,
  } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(resolveTargetDashboardPath(user), { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const syncRememberedEmail = useCallback((targetEmail, isRemembered) => {
    try {
      localStorage.setItem(
        REMEMBER_CHECKED_STORAGE_KEY,
        isRemembered ? 'true' : 'false'
      );
      if (isRemembered && targetEmail) {
        localStorage.setItem(REMEMBER_EMAIL_STORAGE_KEY, targetEmail.trim());
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_STORAGE_KEY);
      }
    } catch {}
  }, []);

  const handleToggleRememberMe = (e) => {
    const checked = e.target.checked;
    setRememberMe(checked);
    syncRememberedEmail(email, checked);
  };

  const focusFirstOtpInput = useCallback(() => {
    requestAnimationFrame(() => {
      otpInputRefs.current[0]?.focus();
    });
  }, []);

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
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // ✅ ពិនិត្យស្វ័យប្រវត្តិរៀងរាល់ ៣ វិនាទីម្ដង នៅពេលអ្នកប្រើចុចប៊ូតុងភ្ជាប់ Telegram
  useEffect(() => {
    if (
      (step !== 'otp' && step !== 'forgot_otp') ||
      !waitingTelegramStart ||
      !email
    ) {
      return;
    }

    const checkNow = async () => {
      if (isCheckingTelegramRef.current) return;
      isCheckingTelegramRef.current = true;
      try {
        const status = await checkTelegramLinkStatus(email);
        if (status?.linked) {
          setTelegramLinked(true);
          setTelegramSent(true);
          setWaitingTelegramStart(false);
          setTelegramLinkUrl(null);
          setOtpError('');
          setOtpDigits(['', '', '', '', '', '']);
          lastSubmittedSignatureRef.current = '';
          focusFirstOtpInput();
        }
      } finally {
        isCheckingTelegramRef.current = false;
      }
    };

    checkNow();
    const pollInterval = setInterval(checkNow, 3000);

    return () => {
      clearInterval(pollInterval);
      isCheckingTelegramRef.current = false;
    };
  }, [
    step,
    waitingTelegramStart,
    email,
    checkTelegramLinkStatus,
    focusFirstOtpInput,
  ]);

  useEffect(() => {
    let isMounted = true;
    const checkAdminStatus = async () => {
      try {
        const response = await api.get('/roles');
        if (!isMounted) return;
        const data = response.data || {};

        if (data.has_admin === false || data.admin_exists === false) {
          try {
            localStorage.removeItem(ADMIN_SETUP_STORAGE_KEY);
          } catch {}
          setCanShowRegister(true);
          return;
        }

        if (data.has_admin === true || data.admin_exists === true) {
          try {
            localStorage.setItem(ADMIN_SETUP_STORAGE_KEY, 'true');
          } catch {}
          setCanShowRegister(false);
          return;
        }

        const rolesList = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
          ? data
          : [];
        const adminRole = rolesList.find((r) =>
          (r.role_name || r.name || '')
            .toString()
            .trim()
            .toLowerCase()
            .includes('admin')
        );

        if (!adminRole) {
          try {
            localStorage.removeItem(ADMIN_SETUP_STORAGE_KEY);
          } catch {}
          setCanShowRegister(true);
          return;
        }

        if (typeof adminRole.users_count === 'number') {
          const hasAdminUser = adminRole.users_count > 0;
          if (hasAdminUser) {
            try {
              localStorage.setItem(ADMIN_SETUP_STORAGE_KEY, 'true');
            } catch {}
            setCanShowRegister(false);
          } else {
            try {
              localStorage.removeItem(ADMIN_SETUP_STORAGE_KEY);
            } catch {}
            setCanShowRegister(true);
          }
          return;
        }

        if (Array.isArray(adminRole.users)) {
          const hasAdminUser = adminRole.users.length > 0;
          if (hasAdminUser) {
            try {
              localStorage.setItem(ADMIN_SETUP_STORAGE_KEY, 'true');
            } catch {}
            setCanShowRegister(false);
          } else {
            try {
              localStorage.removeItem(ADMIN_SETUP_STORAGE_KEY);
            } catch {}
            setCanShowRegister(true);
          }
          return;
        }

        try {
          localStorage.setItem(ADMIN_SETUP_STORAGE_KEY, 'true');
        } catch {}
        setCanShowRegister(false);
      } catch {
        if (isMounted) setCanShowRegister(false);
      }
    };

    checkAdminStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  const applyFieldValidationError = useCallback(
    (resultObj, rawFallbackMsg = '') => {
      const apiErrors = resultObj?.errors || {};
      const emailErrFromApi = Array.isArray(apiErrors.email)
        ? apiErrors.email[0]
        : apiErrors.email;
      const passErrFromApi = Array.isArray(apiErrors.password)
        ? apiErrors.password[0]
        : apiErrors.password;

      if (emailErrFromApi || passErrFromApi) {
        setFieldErrors({
          email: emailErrFromApi ? String(emailErrFromApi) : '',
          password: passErrFromApi ? String(passErrFromApi) : '',
        });

        if (passErrFromApi) {
          setPassword('');
        }

        requestAnimationFrame(() => {
          if (emailErrFromApi) {
            emailInputRef.current?.focus();
          } else if (passErrFromApi) {
            passwordInputRef.current?.focus();
          }
        });
        return;
      }

      const msg = String(
        resultObj?.error ||
          resultObj?.message ||
          rawFallbackMsg ||
          t('អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ!', 'Invalid email or password!')
      ).trim();
      const lower = msg.toLowerCase();

      const isEmailRelated =
        lower.includes('អ៊ីមែល') ||
        lower.includes('email') ||
        lower.includes('មិនមានក្នុងប្រព័ន្ធ') ||
        lower.includes('not found') ||
        lower.includes('គណនីរបស់អ្នកត្រូវបានផ្អាក');

      const isPasswordRelated =
        lower.includes('ពាក្យសម្ងាត់') ||
        lower.includes('password') ||
        lower.includes('ឱកាស');

      if (isEmailRelated && !isPasswordRelated) {
        setFieldErrors({ email: msg, password: '' });
        requestAnimationFrame(() => {
          emailInputRef.current?.focus();
        });
      } else {
        setFieldErrors({ email: '', password: msg });
        setPassword('');
        requestAnimationFrame(() => {
          passwordInputRef.current?.focus();
        });
      }
    },
    [t]
  );

  // ==========================================================================
  // 📌 ជំហានទី ១ (Login)៖ ពិនិត្យ Email និង Password ដើម្បីផ្ញើលេខកូដ ៦ ខ្ទង់
  // ==========================================================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setFieldErrors({ email: '', password: '' });
    setOtpError('');
    setLoading(true);
    try {
      const cleanEmail = email.trim();
      const result = await login(cleanEmail, password);
      if (result.success) {
        syncRememberedEmail(cleanEmail, rememberMe);
        setFieldErrors({ email: '', password: '' });

        if (result.requires_2fa) {
          setStep('otp');
          setOtpDigits(['', '', '', '', '', '']);
          setOtpError('');
          lastSubmittedSignatureRef.current = '';
          setDetectedRoleName(result.role_name || '');
          setMailSent(Boolean(result.mail_sent));
          setTelegramLinked(Boolean(result.telegram_linked));
          setTelegramSent(Boolean(result.telegram_sent));
          setTelegramLinkUrl(result.telegram_link_url || null);
          setWaitingTelegramStart(false);
          setResendCooldown(60);
          focusFirstOtpInput();
          return;
        }

        try {
          localStorage.setItem(ADMIN_SETUP_STORAGE_KEY, 'true');
        } catch {}
        navigate(resolveTargetDashboardPath(result.user, result.role_name), {
          replace: true,
        });
      } else {
        applyFieldValidationError(result);
      }
    } catch (err) {
      const responseData = err?.response?.data || {};
      applyFieldValidationError(
        responseData,
        t('មានបញ្ហាក្នុងការចូលប្រព័ន្ធ', 'Error logging in')
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // 📌 ជំហានទី ២ (Login 2FA)៖ មុខងារផ្ទៀងផ្ទាត់ស្វ័យប្រវត្តិភ្លាមៗពេលវាយលេខកូដគ្រប់ ៦ ខ្ទង់
  // ==========================================================================
  const triggerAutoVerifyOtp = useCallback(
    async (codeToVerify) => {
      if (loading) return;
      setOtpError('');
      setLoading(true);
      try {
        const cleanEmail = email.trim();
        const result = await verifyTwoFactor(cleanEmail, codeToVerify, true, '');
        if (result.success) {
          syncRememberedEmail(cleanEmail, rememberMe);
          setOtpError('');
          try {
            localStorage.setItem(ADMIN_SETUP_STORAGE_KEY, 'true');
          } catch {}
          navigate(resolveTargetDashboardPath(result.user, detectedRoleName), {
            replace: true,
          });
        } else {
          const errMsg =
            result.error ||
            result.message ||
            t(
              'លេខកូដផ្ទៀងផ្ទាត់មិនត្រឹមត្រូវ ឬផុតកំណត់ហើយ!',
              'Invalid or expired verification code!'
            );
          setOtpError(String(errMsg));
          setOtpDigits(['', '', '', '', '', '']);
          lastSubmittedSignatureRef.current = '';
          focusFirstOtpInput();
        }
      } catch (err) {
        const errMsg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          t(
            'លេខកូដផ្ទៀងផ្ទាត់មិនត្រឹមត្រូវ ឬបានផុតកំណត់ហើយ!',
            'Invalid or expired verification code!'
          );
        setOtpError(String(errMsg));
        setOtpDigits(['', '', '', '', '', '']);
        lastSubmittedSignatureRef.current = '';
        focusFirstOtpInput();
      } finally {
        setLoading(false);
      }
    },
    [
      email,
      rememberMe,
      loading,
      detectedRoleName,
      navigate,
      t,
      verifyTwoFactor,
      focusFirstOtpInput,
      syncRememberedEmail,
    ]
  );

  // ==========================================================================
  // 📌 មុខងារកំណត់ពាក្យសម្ងាត់ឡើងវិញដោយខ្លួនឯង (SELF-SERVICE PASSWORD RESET ៣ ជំហាន)
  // ==========================================================================

  const handleSendForgotOtp = async (e) => {
    if (e) e.preventDefault();
    if (loading) return;
    if (!email.trim()) {
      setFieldErrors({
        email: t(
          'សូមបញ្ចូលអាសយដ្ឋានអ៊ីមែលគណនីរបស់អ្នក!',
          'Please enter your email!'
        ),
        password: '',
      });
      emailInputRef.current?.focus();
      return;
    }

    setFieldErrors({ email: '', password: '' });
    setOtpError('');
    setLoading(true);
    try {
      const response = await api.post('/forgot-password/send-otp', {
        email: email.trim(),
      });
      const data = response.data || {};
      setDetectedRoleName(data.role_name || '');
      setMailSent(Boolean(data.mail_sent));
      setTelegramLinked(Boolean(data.telegram_linked));
      setTelegramSent(Boolean(data.telegram_sent));
      setTelegramLinkUrl(data.telegram_link_url || null);
      setWaitingTelegramStart(false);
      setOtpDigits(['', '', '', '', '', '']);
      lastSubmittedSignatureRef.current = '';
      setResendCooldown(60);
      setStep('forgot_otp');
      focusFirstOtpInput();
    } catch (err) {
      const errData = err?.response?.data || {};
      const emailErr =
        errData?.errors?.email?.[0] ||
        errData?.message ||
        t('អ៊ីមែលនេះមិនមានក្នុងប្រព័ន្ធទេ!', 'Email not found!');
      setFieldErrors({ email: String(emailErr), password: '' });
      requestAnimationFrame(() => {
        emailInputRef.current?.focus();
      });
    } finally {
      setLoading(false);
    }
  };

  const triggerAutoVerifyForgotOtp = useCallback(
    async (codeToVerify) => {
      if (loading) return;
      setOtpError('');
      setLoading(true);
      try {
        const response = await api.post('/forgot-password/verify-otp', {
          email: email.trim(),
          otp_code: codeToVerify,
        });
        const data = response.data || {};
        if (data.reset_token) {
          setResetToken(data.reset_token);
          setNewPassword('');
          setConfirmNewPassword('');
          setResetPassError('');
          setStep('forgot_new_password');
          requestAnimationFrame(() => {
            newPasswordInputRef.current?.focus();
          });
        }
      } catch (err) {
        const errData = err?.response?.data || {};
        const errMsg =
          errData.message ||
          t(
            'លេខកូដផ្ទៀងផ្ទាត់មិនត្រឹមត្រូវ ឬបានផុតកំណត់ហើយ!',
            'Invalid or expired verification code!'
          );
        setOtpError(String(errMsg));
        setOtpDigits(['', '', '', '', '', '']);
        lastSubmittedSignatureRef.current = '';
        focusFirstOtpInput();
      } finally {
        setLoading(false);
      }
    },
    [email, loading, t, focusFirstOtpInput]
  );

  const handleSaveNewPassword = async (e) => {
    e.preventDefault();
    if (loading) return;
    setResetPassError('');

    if (newPassword.length < 8) {
      setResetPassError(
        t(
          'ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងតិច ៨ តួអក្សរ!',
          'New password must be at least 8 characters!'
        )
      );
      newPasswordInputRef.current?.focus();
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setResetPassError(
        t(
          'ពាក្យសម្ងាត់ថ្មី និងការបញ្ជាក់មិនត្រូវគ្នាទេ!',
          'Passwords do not match!'
        )
      );
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim();
      const response = await api.post('/forgot-password/reset', {
        email: cleanEmail,
        reset_token: resetToken,
        password: newPassword,
        password_confirmation: confirmNewPassword,
      });

      const data = response.data || {};
      syncRememberedEmail(cleanEmail, rememberMe);

      if (data.token && data.user) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        if (data.teacher) {
          localStorage.setItem('teacher', JSON.stringify(data.teacher));
        }
        api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
        if (typeof setUser === 'function') {
          setUser(data.user);
        }

        navigate(resolveTargetDashboardPath(data.user, detectedRoleName), {
          replace: true,
        });
      } else {
        setPassword('');
        setStep('credentials');
      }
    } catch (err) {
      const errMsg =
        err?.response?.data?.message ||
        t(
          'មិនអាចផ្លាស់ប្ដូរពាក្យសម្ងាត់បានទេ សូមព្យាយាមម្ដងទៀត!',
          'Could not reset password, please try again!'
        );
      setResetPassError(String(errMsg));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if ((step !== 'otp' && step !== 'forgot_otp') || loading) return;

    const currentOtpCode = otpDigits.join('');
    const isOtpComplete =
      currentOtpCode.length === 6 && otpDigits.every((d) => d !== '');

    if (isOtpComplete) {
      const sig = `${step}_${currentOtpCode}`;
      if (lastSubmittedSignatureRef.current !== sig) {
        lastSubmittedSignatureRef.current = sig;
        if (step === 'otp') {
          triggerAutoVerifyOtp(currentOtpCode);
        } else if (step === 'forgot_otp') {
          triggerAutoVerifyForgotOtp(currentOtpCode);
        }
      }
    }
  }, [
    step,
    otpDigits,
    loading,
    triggerAutoVerifyOtp,
    triggerAutoVerifyForgotOtp,
  ]);

  const handleOtpChange = (index, value) => {
    if (loading) return;
    if (otpError) setOtpError('');

    const numericVal = value.replace(/\D/g, '');
    const newDigits = [...otpDigits];

    if (!numericVal) {
      newDigits[index] = '';
      lastSubmittedSignatureRef.current = '';
      setOtpDigits(newDigits);
      return;
    }

    const digit = numericVal.slice(-1);
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    if (index < 5 && digit) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (loading) return;
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    if (loading) return;
    if (otpError) setOtpError('');

    const pastedData = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, 6);
    if (!pastedData) return;

    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pastedData[i] || '';
    }
    lastSubmittedSignatureRef.current = '';
    setOtpDigits(newDigits);

    const focusIdx = Math.min(5, pastedData.length - 1);
    if (focusIdx >= 0) {
      otpInputRefs.current[focusIdx]?.focus();
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resendingOtp || loading) return;
    setResendingOtp(true);
    setOtpError('');
    try {
      if (step === 'forgot_otp') {
        const response = await api.post('/forgot-password/send-otp', {
          email: email.trim(),
        });
        const data = response.data || {};
        setOtpDigits(['', '', '', '', '', '']);
        lastSubmittedSignatureRef.current = '';
        setMailSent(Boolean(data.mail_sent));
        setTelegramLinked(Boolean(data.telegram_linked));
        setTelegramSent(Boolean(data.telegram_sent));
        setTelegramLinkUrl(data.telegram_link_url || null);
        setResendCooldown(60);
        focusFirstOtpInput();
      } else {
        const result = await resendTwoFactor(email.trim());
        if (result.success) {
          setOtpDigits(['', '', '', '', '', '']);
          lastSubmittedSignatureRef.current = '';
          setMailSent(Boolean(result.mail_sent));
          setTelegramLinked(Boolean(result.telegram_linked));
          setTelegramSent(Boolean(result.telegram_sent));
          setTelegramLinkUrl(result.telegram_link_url || null);
          setResendCooldown(60);
          focusFirstOtpInput();
        } else {
          setOtpError(
            result.error ||
              t('មិនអាចផ្ញើលេខកូដម្ដងទៀតបានទេ', 'Failed to resend code')
          );
        }
      }
    } catch (err) {
      setOtpError(
        err?.response?.data?.message ||
          t('មិនអាចផ្ញើលេខកូដម្ដងទៀតបានទេ', 'Failed to resend code')
      );
    } finally {
      setResendingOtp(false);
    }
  };

  const getMaskedEmail = (rawEmail) => {
    if (!rawEmail || !rawEmail.includes('@')) return rawEmail;
    const [namePart, domainPart] = rawEmail.split('@');
    if (namePart.length <= 2) return `${namePart[0]}***@${domainPart}`;
    return `${namePart.slice(0, 2)}***${namePart.slice(-1)}@${domainPart}`;
  };

  return (
    <div
      className={`login-page-font relative min-h-screen lg:h-screen w-full flex flex-col justify-between px-4 py-4 sm:px-8 sm:py-5 lg:px-12 overflow-x-hidden lg:overflow-hidden select-none transition-colors duration-200 ${
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
              'ប្រព័ន្ធគ្រប់គ្រងការសិក្សាតាមអនឡាញ',
              'Online Learning Management System'
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
      <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center my-auto py-4">
        
        {/* 📌 ផ្នែកខាងឆ្វេង៖ ពាក្យស្វាគមន៍ ឈ្មោះវិទ្យាស្ថានធំច្បាស់ និងពាក្យស្លោក TVET */}
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

        {/* 📌 ផ្នែកខាងស្ដាំ៖ ប្រអប់ Login, 2FA, និង កំណត់ពាក្យសម្ងាត់ឡើងវិញដោយខ្លួនឯង */}
        <div className="lg:col-span-5 flex justify-center lg:justify-end">
          <div
            className={`relative w-full max-w-[400px] rounded-[1.75rem] backdrop-blur-2xl border p-6 sm:p-7 overflow-hidden transition-colors duration-200 ${
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

            {step === 'credentials' ? (
              <>
                <div className="relative z-10 flex flex-col items-center text-center mb-5">
                  <div className="relative mb-2.5">
                    <div className="absolute -inset-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur opacity-35"></div>
                    <div
                      className={`relative h-14 w-14 rounded-2xl border p-1.5 flex items-center justify-center shadow-md ${
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
                    className={`text-xl font-black tracking-wide ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    RPITSSVR <span className="text-indigo-500 font-black">LMS</span>
                  </h2>
                  <p
                    className={`text-[13px] font-semibold mt-1 leading-relaxed ${
                      isDarkMode ? 'text-blue-200/80' : 'text-slate-500'
                    }`}
                  >
                    {t(
                      'សូមបញ្ចូលគណនីដើម្បីចូលប្រើប្រាស់ប្រព័ន្ធ',
                      'Sign in to access your account'
                    )}
                  </p>
                </div>

                <form className="relative z-10 space-y-3.5" onSubmit={handleSubmit}>
                  <div>
                    <label
                      htmlFor="email"
                      className={`block text-xs font-extrabold tracking-wide mb-1.5 ml-1 leading-relaxed transition-colors ${
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
                          className={`h-5 w-5 transition-colors ${
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
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEmail(val);
                          if (rememberMe) {
                            syncRememberedEmail(val, true);
                          }
                          if (fieldErrors.email) {
                            setFieldErrors((prev) => ({ ...prev, email: '' }));
                          }
                        }}
                        className={`block w-full pl-11 pr-4 py-2.5 border rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                          fieldErrors.email
                            ? isDarkMode
                              ? 'login-dark-autofill bg-rose-950/35 border-rose-500 text-white placeholder-rose-300/50 focus:border-rose-400 focus:ring-rose-500/35'
                              : 'login-light-autofill bg-rose-50/60 border-rose-500 text-slate-900 placeholder-rose-400 focus:bg-white focus:border-rose-600 focus:ring-rose-500/25'
                            : isDarkMode
                            ? 'login-dark-autofill bg-slate-950/55 hover:bg-slate-950/70 border-white/15 focus:border-indigo-400 text-white placeholder-blue-200/40 focus:ring-indigo-500/40'
                            : 'login-light-autofill bg-slate-50 hover:bg-slate-100/70 focus:bg-white border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400 focus:ring-indigo-500/25'
                        }`}
                        placeholder={t('បញ្ចូលអ៊ីមែលរបស់អ្នក...', 'Enter your email')}
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
                    <label
                      htmlFor="password"
                      className={`block text-xs font-extrabold tracking-wide mb-1.5 ml-1 leading-relaxed transition-colors ${
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
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <LockClosedIcon
                          className={`h-5 w-5 transition-colors ${
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
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (fieldErrors.password) {
                            setFieldErrors((prev) => ({
                              ...prev,
                              password: '',
                            }));
                          }
                        }}
                        className={`block w-full pl-11 pr-10 py-2.5 border rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                          fieldErrors.password
                            ? isDarkMode
                              ? 'login-dark-autofill bg-rose-950/35 border-rose-500 text-white placeholder-rose-300/50 focus:border-rose-400 focus:ring-rose-500/35'
                              : 'login-light-autofill bg-rose-50/60 border-rose-500 text-slate-900 placeholder-rose-400 focus:bg-white focus:border-rose-600 focus:ring-rose-500/25'
                            : isDarkMode
                            ? 'login-dark-autofill bg-slate-950/55 hover:bg-slate-950/70 border-white/15 focus:border-indigo-400 text-white placeholder-blue-200/40 focus:ring-indigo-500/40'
                            : 'login-light-autofill bg-slate-50 hover:bg-slate-100/70 focus:bg-white border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400 focus:ring-indigo-500/25'
                        }`}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className={`absolute inset-y-0 right-0 pr-3.5 flex items-center transition-colors cursor-pointer ${
                          fieldErrors.password
                            ? 'text-rose-400 hover:text-rose-500'
                            : isDarkMode
                            ? 'text-blue-200/60 hover:text-white'
                            : 'text-slate-400 hover:text-indigo-600'
                        }`}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeSlashIcon className="h-5 w-5" />
                        ) : (
                          <EyeIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>

                    {fieldErrors.password && (
                      <div className="flex items-start gap-1.5 mt-1.5 ml-1 text-rose-500 dark:text-rose-400">
                        <ExclamationCircleIcon className="h-4 w-4 shrink-0 mt-0.5 stroke-[2.2]" />
                        <p className="text-[11.5px] font-bold leading-snug">
                          {fieldErrors.password}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-0.5 text-xs">
                    <label className="flex items-center cursor-pointer select-none">
                      <input
                        id="remember-me"
                        name="remember-me"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={handleToggleRememberMe}
                        className={`h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500/40 cursor-pointer ${
                          isDarkMode
                            ? 'border-white/25 bg-slate-900/60'
                            : 'border-slate-300 bg-white'
                        }`}
                      />
                      <span
                        className={`ml-2 font-bold leading-relaxed ${
                          isDarkMode ? 'text-blue-100/85' : 'text-slate-600'
                        }`}
                      >
                        {t('ចងចាំគណនី', 'Remember me')}
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setFieldErrors({ email: '', password: '' });
                        setOtpError('');
                        setStep('forgot_email');
                        requestAnimationFrame(() => {
                          emailInputRef.current?.focus();
                        });
                      }}
                      className={`font-bold leading-relaxed transition-colors cursor-pointer ${
                        isDarkMode
                          ? 'text-indigo-300 hover:text-yellow-400'
                          : 'text-indigo-600 hover:text-indigo-800'
                      }`}
                    >
                      {t('ភ្លេចពាក្យសម្ងាត់?', 'Forgot password?')}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full py-3 px-5 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-indigo-500 via-blue-600 to-purple-600 hover:from-indigo-400 hover:via-blue-500 hover:to-purple-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/30 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_8px_25px_rgba(99,102,241,0.45)] hover:shadow-[0_10px_30px_rgba(99,102,241,0.65)] transition-colors duration-200 flex items-center justify-center cursor-pointer mt-1"
                  >
                    <span className="leading-relaxed">
                      {loading
                        ? t('កំពុងពិនិត្យ...', 'Verifying...')
                        : t('ចូលប្រព័ន្ធ', 'Sign In')}
                    </span>
                    {!loading && (
                      <ArrowRightIcon className="h-4 w-4 absolute right-5 stroke-[2.5]" />
                    )}
                  </button>

                  {canShowRegister ? (
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
                        {t('មិនទាន់មានគណនីមែនទេ?', "Don't have an account?")}{' '}
                        <Link
                          to="/register"
                          className={`font-extrabold hover:underline transition-colors ${
                            isDarkMode
                              ? 'text-yellow-400 hover:text-yellow-300'
                              : 'text-indigo-600 hover:text-indigo-800'
                          }`}
                        >
                          {t('បង្កើតគណនី', 'Create Account')}
                        </Link>
                      </p>
                    </div>
                  ) : (
                    <div className="pt-2 flex items-center justify-center gap-3 opacity-75">
                      <span
                        className={`h-px w-12 bg-gradient-to-r from-transparent ${
                          isDarkMode ? 'to-white/25' : 'to-slate-300'
                        }`}
                      ></span>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-indigo-400"></span>
                        <span
                          className={`h-2.5 w-2.5 rounded-full border ${
                            isDarkMode
                              ? 'bg-white/30 border-white/40'
                              : 'bg-indigo-100 border-indigo-300'
                          }`}
                        ></span>
                        <span className="h-2 w-2 rounded-full bg-purple-400"></span>
                      </div>
                      <span
                        className={`h-px w-12 bg-gradient-to-l from-transparent ${
                          isDarkMode ? 'to-white/25' : 'to-slate-300'
                        }`}
                      ></span>
                    </div>
                  )}
                </form>
              </>
            ) : step === 'forgot_email' ? (
              <div className="relative z-10 space-y-5">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-2.5">
                    <div className="absolute -inset-1.5 bg-gradient-to-r from-amber-400 to-indigo-500 rounded-2xl blur opacity-40"></div>
                    <div
                      className={`relative h-13 w-13 rounded-2xl border flex items-center justify-center shadow-md ${
                        isDarkMode
                          ? 'bg-slate-900/90 border-amber-400/30 text-amber-300'
                          : 'bg-amber-50 border-amber-200 text-amber-600'
                      }`}
                    >
                      <KeyIcon className="h-7 w-7 stroke-[2]" />
                    </div>
                  </div>

                  <h2
                    className={`text-lg sm:text-xl font-black tracking-wide ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {t('កំណត់ពាក្យសម្ងាត់ឡើងវិញ', 'Reset Password')}
                  </h2>

                  <p
                    className={`text-xs font-semibold mt-1 leading-relaxed max-w-xs ${
                      isDarkMode ? 'text-blue-200/80' : 'text-slate-500'
                    }`}
                  >
                    {t(
                      'សូមបញ្ចូលអ៊ីមែលគណនីរបស់អ្នក ដើម្បីទទួលលេខកូដផ្ទៀងផ្ទាត់ ៦ ខ្ទង់តាម Telegram ឬ Email៖',
                      'Enter your account email to receive a 6-digit verification code via Telegram or Email:'
                    )}
                  </p>
                </div>

                <form onSubmit={handleSendForgotOtp} className="space-y-4">
                  <div>
                    <label
                      htmlFor="forgot-email"
                      className={`block text-xs font-extrabold tracking-wide mb-1.5 ml-1 leading-relaxed ${
                        fieldErrors.email
                          ? isDarkMode
                            ? 'text-rose-400'
                            : 'text-rose-600'
                          : isDarkMode
                          ? 'text-blue-100/90'
                          : 'text-slate-700'
                      }`}
                    >
                      {t('អាសយដ្ឋានអ៊ីមែលគណនី', 'Account Email Address')}
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <EnvelopeIcon
                          className={`h-5 w-5 transition-colors ${
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
                        id="forgot-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldErrors.email) {
                            setFieldErrors({ email: '', password: '' });
                          }
                        }}
                        className={`block w-full pl-11 pr-4 py-2.5 border rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                          fieldErrors.email
                            ? isDarkMode
                              ? 'login-dark-autofill bg-rose-950/35 border-rose-500 text-white placeholder-rose-300/50 focus:border-rose-400 focus:ring-rose-500/35'
                              : 'login-light-autofill bg-rose-50/60 border-rose-500 text-slate-900 placeholder-rose-400 focus:bg-white focus:border-rose-600 focus:ring-rose-500/25'
                            : isDarkMode
                            ? 'login-dark-autofill bg-slate-950/55 hover:bg-slate-950/70 border-white/15 focus:border-indigo-400 text-white placeholder-blue-200/40 focus:ring-indigo-500/40'
                            : 'login-light-autofill bg-slate-50 hover:bg-slate-100/70 focus:bg-white border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400 focus:ring-indigo-500/25'
                        }`}
                        placeholder={t('បញ្ចូលអ៊ីមែលរបស់អ្នក...', 'Enter your email')}
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

                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full py-3 px-5 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-indigo-500 via-blue-600 to-purple-600 hover:from-indigo-400 hover:via-blue-500 hover:to-purple-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/30 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_8px_25px_rgba(99,102,241,0.45)] transition-colors duration-200 flex items-center justify-center cursor-pointer"
                  >
                    <span className="leading-relaxed">
                      {loading
                        ? t('កំពុងផ្ញើលេខកូដ...', 'Sending Code...')
                        : t('ផ្ញើលេខកូដកំណត់ឡើងវិញ', 'Send Reset Code')}
                    </span>
                    {!loading && (
                      <ArrowRightIcon className="h-4 w-4 absolute right-5 stroke-[2.5]" />
                    )}
                  </button>
                </form>

                <div
                  className={`pt-3 border-t text-center text-xs ${
                    isDarkMode ? 'border-white/10' : 'border-slate-200/80'
                  }`}
                >
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setFieldErrors({ email: '', password: '' });
                      setStep('credentials');
                    }}
                    className={`inline-flex items-center justify-center gap-1.5 font-extrabold transition-colors cursor-pointer mx-auto ${
                      isDarkMode
                        ? 'text-blue-200/80 hover:text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ArrowLeftIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>
                      {t('ត្រឡប់ទៅការចូលប្រព័ន្ធវិញ', 'Back to Sign In')}
                    </span>
                  </button>
                </div>
              </div>
            ) : step === 'forgot_new_password' ? (
              <div className="relative z-10 space-y-4">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-2">
                    <div className="absolute -inset-1.5 bg-gradient-to-r from-emerald-500 to-indigo-500 rounded-2xl blur opacity-40"></div>
                    <div
                      className={`relative h-13 w-13 rounded-2xl border flex items-center justify-center shadow-md ${
                        isDarkMode
                          ? 'bg-slate-900/90 border-emerald-400/30 text-emerald-400'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                      }`}
                    >
                      <LockClosedIcon className="h-7 w-7 stroke-[2]" />
                    </div>
                  </div>

                  <h2
                    className={`text-lg sm:text-xl font-black tracking-wide ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {t('ដាក់ពាក្យសម្ងាត់ថ្មី', 'Set New Password')}
                  </h2>

                  <p
                    className={`text-xs font-semibold mt-1 leading-relaxed max-w-xs ${
                      isDarkMode ? 'text-blue-200/80' : 'text-slate-500'
                    }`}
                  >
                    {t(
                      'សូមបញ្ចូលពាក្យសម្ងាត់ថ្មីយ៉ាងតិច ៨ តួអក្សរសម្រាប់គណនី៖',
                      'Enter a new password (min 8 chars) for:'
                    )}
                  </p>

                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border mt-1.5 ${
                      isDarkMode
                        ? 'bg-indigo-500/15 border-indigo-400/30 text-yellow-300'
                        : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    }`}
                  >
                    <EnvelopeIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>{getMaskedEmail(email)}</span>
                  </span>
                </div>

                <form onSubmit={handleSaveNewPassword} className="space-y-3.5">
                  <div>
                    <label
                      className={`block text-xs font-extrabold tracking-wide mb-1.5 ml-1 ${
                        isDarkMode ? 'text-blue-100/90' : 'text-slate-700'
                      }`}
                    >
                      {t('ពាក្យសម្ងាត់ថ្មី', 'New Password')}
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <LockClosedIcon
                          className={`h-5 w-5 ${
                            isDarkMode ? 'text-indigo-300/70' : 'text-slate-400'
                          }`}
                        />
                      </div>
                      <input
                        ref={newPasswordInputRef}
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          if (resetPassError) setResetPassError('');
                        }}
                        className={`block w-full pl-11 pr-10 py-2.5 border rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                          isDarkMode
                            ? 'login-dark-autofill bg-slate-950/55 border-white/15 focus:border-indigo-400 text-white placeholder-blue-200/40 focus:ring-indigo-500/40'
                            : 'login-light-autofill bg-slate-50 focus:bg-white border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400 focus:ring-indigo-500/25'
                        }`}
                        placeholder={t(
                          'យ៉ាងតិច ៨ តួអក្សរ...',
                          'At least 8 characters...'
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        className={`absolute inset-y-0 right-0 pr-3.5 flex items-center cursor-pointer ${
                          isDarkMode
                            ? 'text-blue-200/60 hover:text-white'
                            : 'text-slate-400 hover:text-indigo-600'
                        }`}
                        tabIndex={-1}
                      >
                        {showNewPassword ? (
                          <EyeSlashIcon className="h-5 w-5" />
                        ) : (
                          <EyeIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      className={`block text-xs font-extrabold tracking-wide mb-1.5 ml-1 ${
                        isDarkMode ? 'text-blue-100/90' : 'text-slate-700'
                      }`}
                    >
                      {t('បញ្ជាក់ពាក្យសម្ងាត់ថ្មី', 'Confirm New Password')}
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <LockClosedIcon
                          className={`h-5 w-5 ${
                            isDarkMode ? 'text-indigo-300/70' : 'text-slate-400'
                          }`}
                        />
                      </div>
                      <input
                        type={showConfirmNewPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={confirmNewPassword}
                        onChange={(e) => {
                          setConfirmNewPassword(e.target.value);
                          if (resetPassError) setResetPassError('');
                        }}
                        className={`block w-full pl-11 pr-10 py-2.5 border rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                          isDarkMode
                            ? 'login-dark-autofill bg-slate-950/55 border-white/15 focus:border-indigo-400 text-white placeholder-blue-200/40 focus:ring-indigo-500/40'
                            : 'login-light-autofill bg-slate-50 focus:bg-white border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400 focus:ring-indigo-500/25'
                        }`}
                        placeholder={t(
                          'វាយពាក្យសម្ងាត់ថ្មីម្ដងទៀត...',
                          'Re-enter new password...'
                        )}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmNewPassword((prev) => !prev)
                        }
                        className={`absolute inset-y-0 right-0 pr-3.5 flex items-center cursor-pointer ${
                          isDarkMode
                            ? 'text-blue-200/60 hover:text-white'
                            : 'text-slate-400 hover:text-indigo-600'
                        }`}
                        tabIndex={-1}
                      >
                        {showConfirmNewPassword ? (
                          <EyeSlashIcon className="h-5 w-5" />
                        ) : (
                          <EyeIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {resetPassError && (
                    <div className="flex items-start gap-1.5 ml-1 text-rose-500 dark:text-rose-400">
                      <ExclamationCircleIcon className="h-4 w-4 shrink-0 mt-0.5 stroke-[2.2]" />
                      <p className="text-[11.5px] font-bold leading-snug">
                        {resetPassError}
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full py-3 px-5 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-emerald-500 via-teal-600 to-indigo-600 hover:from-emerald-400 hover:via-teal-500 hover:to-indigo-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/30 disabled:opacity-60 shadow-lg transition-colors duration-200 flex items-center justify-center cursor-pointer"
                  >
                    <span className="leading-relaxed">
                      {loading
                        ? t('កំពុងរក្សាទុក...', 'Saving...')
                        : t('រក្សាទុក និងចូលប្រព័ន្ធ', 'Save & Sign In')}
                    </span>
                    {!loading && (
                      <ArrowRightIcon className="h-4 w-4 absolute right-5 stroke-[2.5]" />
                    )}
                  </button>
                </form>
              </div>
            ) : (
              /* ============================================================
                 ✅ ផ្ទាំងវាយលេខកូដ ៦ ខ្ទង់ (គ្មានបង្ហាញលេខកូដ ៦ ខ្ទង់លើអេក្រង់ឡើយ)
              ============================================================= */
              <div className="relative z-10 space-y-5">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-2.5">
                    <div
                      className={`absolute -inset-1.5 rounded-2xl blur transition-opacity duration-300 ${
                        otpError
                          ? 'bg-gradient-to-r from-rose-500 to-pink-500 opacity-55'
                          : `bg-gradient-to-r from-emerald-500 to-indigo-500 ${
                              loading ? 'opacity-70' : 'opacity-40'
                            }`
                      }`}
                    ></div>
                    <div
                      className={`relative h-13 w-13 rounded-2xl border flex items-center justify-center shadow-md transition-colors duration-200 ${
                        otpError
                          ? isDarkMode
                            ? 'bg-rose-950/90 border-rose-500 text-rose-400'
                            : 'bg-rose-50 border-rose-300 text-rose-600'
                          : loading
                          ? isDarkMode
                            ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300'
                            : 'bg-emerald-50 border-emerald-400 text-emerald-600'
                          : isDarkMode
                          ? 'bg-slate-900/90 border-emerald-400/30 text-emerald-400'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                      }`}
                    >
                      <ShieldCheckIcon className="h-7 w-7 stroke-[2]" />
                    </div>
                  </div>

                  <h2
                    className={`text-lg sm:text-xl font-black tracking-wide ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {step === 'forgot_otp'
                      ? t('ផ្ទៀងផ្ទាត់កូដប្ដូរពាក្យសម្ងាត់', 'Verify Reset Code')
                      : t('ផ្ទៀងផ្ទាត់លេខកូដសម្ងាត់', 'Verify Security Code')}
                  </h2>

                  <p
                    className={`text-xs font-semibold mt-1 leading-relaxed max-w-xs ${
                      isDarkMode ? 'text-blue-200/80' : 'text-slate-500'
                    }`}
                  >
                    {t(
                      'សូមបញ្ចូលលេខកូដ ៦ ខ្ទង់សម្រាប់គណនី៖',
                      'Enter the 6-digit code for:'
                    )}
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${
                        isDarkMode
                          ? 'bg-indigo-500/15 border-indigo-400/30 text-yellow-300'
                          : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      }`}
                    >
                      <EnvelopeIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>{getMaskedEmail(email)}</span>
                    </span>

                    {mailSent && !telegramSent && (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                          isDarkMode
                            ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        }`}
                      >
                        <EnvelopeIcon className="h-3 w-3" />
                        <span>Email</span>
                      </span>
                    )}

                    {telegramSent && (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                          isDarkMode
                            ? 'bg-sky-500/20 border-sky-400/40 text-sky-300'
                            : 'bg-sky-50 border-sky-200 text-sky-700'
                        }`}
                      >
                        <PaperAirplaneIcon className="h-3 w-3 -rotate-45" />
                        <span>Telegram</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* ប្រអប់វាយលេខកូដទាំង ៦ ខ្ទង់ */}
                <div className="py-1">
                  <div
                    className={`flex items-center justify-center gap-2 sm:gap-2.5 ${
                      otpError ? 'otp-error-shake' : ''
                    }`}
                    onPaste={handleOtpPaste}
                  >
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          otpInputRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        disabled={loading}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        style={
                          loading
                            ? { animationDelay: `${idx * 75}ms` }
                            : undefined
                        }
                        className={`w-11 h-12 sm:w-12 sm:h-13 text-center text-xl sm:text-2xl font-black rounded-xl border-2 focus:outline-none focus:ring-4 transition-all duration-150 ${
                          loading
                            ? isDarkMode
                              ? 'otp-verifying-wave bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                              : 'otp-verifying-wave bg-emerald-50 border-emerald-500 text-emerald-700 shadow-[0_4px_14px_rgba(16,185,129,0.2)]'
                            : otpError
                            ? isDarkMode
                              ? 'bg-rose-950/45 border-rose-500 text-rose-300 focus:border-rose-400 focus:ring-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.25)]'
                              : 'bg-rose-50/80 border-rose-500 text-rose-700 focus:border-rose-600 focus:ring-rose-500/25 shadow-2xs'
                            : digit
                            ? isDarkMode
                              ? 'bg-indigo-950/80 border-yellow-400 text-yellow-300 focus:ring-yellow-400/25 shadow-sm'
                              : 'bg-indigo-50/70 border-indigo-600 text-indigo-900 focus:ring-indigo-500/20 shadow-sm'
                            : isDarkMode
                            ? 'bg-slate-950/60 border-white/15 focus:border-indigo-400 text-white focus:ring-indigo-500/30'
                            : 'bg-slate-50 border-slate-200 focus:border-indigo-500 text-slate-900 focus:ring-indigo-500/20'
                        }`}
                      />
                    ))}
                  </div>

                  {otpError && (
                    <div className="flex items-center justify-center gap-1.5 mt-2.5 px-2 text-center text-rose-500 dark:text-rose-400">
                      <ExclamationCircleIcon className="h-4 w-4 shrink-0 stroke-[2.2]" />
                      <p className="text-[11.5px] font-bold leading-snug">
                        {otpError}
                      </p>
                    </div>
                  )}
                </div>

                {/* ✅ បង្ហាញប៊ូតុងភ្ជាប់ Telegram តែនៅពេលគណនីនោះមិនទាន់បានភ្ជាប់ Telegram ប៉ុណ្ណោះ */}
                {!telegramLinked && telegramLinkUrl && (
                  <div className="space-y-2.5">
                    <a
                      href={telegramLinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setWaitingTelegramStart(true)}
                      className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-sm transition-colors cursor-pointer"
                    >
                      {waitingTelegramStart ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin shrink-0 stroke-[2.2]" />
                      ) : (
                        <PaperAirplaneIcon className="h-4 w-4 -rotate-45 shrink-0 stroke-[2.2]" />
                      )}
                      <span>
                        {waitingTelegramStart
                          ? t(
                              'សូមចុច Start ក្នុង Telegram...',
                              'Press Start in Telegram...'
                            )
                          : t(
                              'ទទួលលេខកូដតាម Telegram',
                              'Get Code via Telegram'
                            )}
                      </span>
                    </a>
                  </div>
                )}

                <div
                  className={`pt-3 border-t flex flex-col gap-2 text-center text-xs ${
                    isDarkMode ? 'border-white/10' : 'border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 font-semibold">
                    <span
                      className={
                        isDarkMode ? 'text-blue-200/75' : 'text-slate-500'
                      }
                    >
                      {t('មិនទាន់ទទួលបានលេខកូដមែនទេ?', "Didn't receive code?")}
                    </span>
                    <button
                      type="button"
                      disabled={resendCooldown > 0 || resendingOtp || loading}
                      onClick={handleResendOtp}
                      className={`font-extrabold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isDarkMode
                          ? 'text-yellow-400 hover:text-yellow-300'
                          : 'text-indigo-600 hover:text-indigo-800'
                      }`}
                    >
                      {resendingOtp
                        ? t('កំពុងផ្ញើ...', 'Sending...')
                        : resendCooldown > 0
                        ? `${t('ផ្ញើម្ដងទៀតក្នុង', 'Resend in')} ${resendCooldown}s`
                        : t('ផ្ញើលេខកូដម្ដងទៀត', 'Resend Code')}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setStep(
                        step === 'forgot_otp' ? 'forgot_email' : 'credentials'
                      );
                      setOtpDigits(['', '', '', '', '', '']);
                      setOtpError('');
                      setWaitingTelegramStart(false);
                      lastSubmittedSignatureRef.current = '';
                    }}
                    className={`inline-flex items-center justify-center gap-1.5 font-extrabold transition-colors cursor-pointer mx-auto disabled:opacity-50 ${
                      isDarkMode
                        ? 'text-blue-200/80 hover:text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ArrowLeftIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>
                      {t('ត្រឡប់ទៅកែអ៊ីមែលវិញ', 'Back to Email')}
                    </span>
                  </button>
                </div>
              </div>
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
        .login-page-font,
        .khmer-title-clean,
        .khmer-slogan-clean {
          font-family: 'Kantumruy Pro', 'Battambang', 'Khmer OS Siemreap', sans-serif;
        }

        @keyframes otpWavePulse {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-4px) scale(1.04);
          }
        }
        .otp-verifying-wave {
          animation: otpWavePulse 0.65s ease-in-out infinite;
        }

        @keyframes otpShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }
        .otp-error-shake {
          animation: otpShake 0.35s ease-in-out;
        }

        .login-dark-autofill:-webkit-autofill,
        .login-dark-autofill:-webkit-autofill:hover,
        .login-dark-autofill:-webkit-autofill:focus {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0px 1000px #0f172a inset;
          transition: background-color 5000s ease-in-out 0s;
        }
        .login-light-autofill:-webkit-autofill,
        .login-light-autofill:-webkit-autofill:hover,
        .login-light-autofill:-webkit-autofill:focus {
          -webkit-text-fill-color: #0f172a;
          -webkit-box-shadow: 0 0 0px 1000px #f8fafc inset;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  );
};

export default React.memo(Login);
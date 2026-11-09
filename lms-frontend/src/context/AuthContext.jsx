// src/context/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const readStoredJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  // ✅ អានទិន្នន័យ User និង Teacher ពី localStorage ភ្លាមៗក្នុង 0 វិនាទី
  const [user, setUser] = useState(() => {
    const savedToken = localStorage.getItem('token');
    if (!savedToken) return null;
    return readStoredJson('user') || readStoredJson('auth_user');
  });

  const [teacher, setTeacher] = useState(() => {
    const savedToken = localStorage.getItem('token');
    if (!savedToken) return null;
    return readStoredJson('teacher');
  });

  const [loading, setLoading] = useState(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = readStoredJson('user') || readStoredJson('auth_user');
    return Boolean(savedToken && !savedUser);
  });

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const applyAuthSession = (newToken, userData, teacherData = null) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('auth_user', JSON.stringify(userData));

    setToken(newToken);
    setUser(userData);

    if (teacherData) {
      setTeacher(teacherData);
      localStorage.setItem('teacher', JSON.stringify(teacherData));
    } else {
      setTeacher(null);
      localStorage.removeItem('teacher');
    }

    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  const clearAuthStorage = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('teacher');
    localStorage.removeItem('user');
    localStorage.removeItem('auth_user');
    setToken(null);
    setUser(null);
    setTeacher(null);
    delete api.defaults.headers.common['Authorization'];
  };

  const fetchUser = async () => {
    try {
      const response = await api.get('/user');
      const userData = response.data.user;
      const teacherData = response.data.teacher || null;

      setUser(userData);
      setTeacher(teacherData);

      if (userData) {
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('auth_user', JSON.stringify(userData));
      }

      if (teacherData) {
        localStorage.setItem('teacher', JSON.stringify(teacherData));
      } else {
        localStorage.removeItem('teacher');
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        clearAuthStorage();
      }
    } finally {
      setLoading(false);
    }
  };

  // ✅ ជំហានទី ១៖ ពិនិត្យ Email និង Password
  const login = async (email, password) => {
    try {
      const response = await api.post('/login', { email, password });
      const data = response.data || {};

      if (data.requires_2fa) {
        return {
          success: true,
          requires_2fa: true,
          email: data.email || email,
          role_name: data.role_name,
          is_new_device: Boolean(data.is_new_device),
          has_security_pin: Boolean(data.has_security_pin),
          requires_pin_verify: Boolean(data.requires_pin_verify),
          requires_pin_setup: Boolean(data.requires_pin_setup),
          mail_sent: Boolean(data.mail_sent),
          mail_error: data.mail_error || null,
          telegram_sent: Boolean(data.telegram_sent),
          telegram_linked: Boolean(data.telegram_linked),
          telegram_link_url: data.telegram_link_url || null,
          delivery_channel: data.delivery_channel || 'none',
          dev_otp: data.dev_otp || null,
          message: data.message,
        };
      }

      const { token: newToken, user: userData, teacher: teacherData } = data;
      if (newToken && userData) {
        applyAuthSession(newToken, userData, teacherData);
      }

      return {
        success: true,
        requires_2fa: false,
        user: userData,
        role_name: data.role_name,
      };
    } catch (error) {
      const validationErrors = error.response?.data?.errors || null;
      const firstError = validationErrors
        ? Object.values(validationErrors).flat()[0]
        : null;

      return {
        success: false,
        errors: validationErrors,
        error:
          firstError ||
          error.response?.data?.message ||
          'ការចូលប្រព័ន្ធបរាជ័យ',
      };
    }
  };

  // ✅ ជំហានទី ២៖ ផ្ទៀងផ្ទាត់លេខកូដ OTP ៦ ខ្ទង់
  const verifyTwoFactor = async (
    email,
    otpCode,
    logoutOtherDevices = true,
    securityPin = ''
  ) => {
    try {
      const payload = {
        email,
        otp_code: otpCode,
        logout_other_devices: logoutOtherDevices,
      };
      if (securityPin && String(securityPin).length === 4) {
        payload.security_pin = String(securityPin);
      }

      const response = await api.post('/verify-2fa', payload);
      const {
        token: newToken,
        user: userData,
        teacher: teacherData,
        message,
      } = response.data || {};

      if (newToken && userData) {
        applyAuthSession(newToken, userData, teacherData);
        return {
          success: true,
          user: userData,
          teacher: teacherData,
          message,
        };
      }

      return {
        success: false,
        error: 'មិនអាចផ្ទៀងផ្ទាត់ទិន្នន័យចូលប្រព័ន្ធបានទេ',
      };
    } catch (error) {
      const validationErrors = error.response?.data?.errors || null;
      const firstError = validationErrors
        ? Object.values(validationErrors).flat()[0]
        : null;

      return {
        success: false,
        errors: validationErrors,
        otp_expired: Boolean(error.response?.data?.otp_expired),
        remaining_attempts: error.response?.data?.remaining_attempts,
        error:
          firstError ||
          error.response?.data?.message ||
          'លេខកូដផ្ទៀងផ្ទាត់មិនត្រឹមត្រូវ ឬបានផុតកំណត់ហើយ!',
      };
    }
  };

  // ✅ មុខងារស្នើសុំផ្ញើលេខកូដម្ដងទៀត
  const resendTwoFactor = async (email) => {
    try {
      const response = await api.post('/resend-2fa', { email });
      const data = response.data || {};
      return {
        success: true,
        mail_sent: Boolean(data.mail_sent),
        mail_error: data.mail_error || null,
        telegram_linked: Boolean(data.telegram_linked),
        telegram_sent: Boolean(data.telegram_sent),
        telegram_link_url: data.telegram_link_url || null,
        delivery_channel: data.delivery_channel || 'none',
        dev_otp: data.dev_otp || null,
        message:
          data.message || 'បានផ្ញើលេខកូដថ្មីទៅកាន់គណនីរបស់អ្នកហើយ!',
      };
    } catch (error) {
      return {
        success: false,
        error:
          error.response?.data?.message ||
          'មិនអាចផ្ញើលេខកូដម្ដងទៀតបានទេ',
      };
    }
  };

  // ✅ ពិនិត្យស្ថានភាពភ្ជាប់ Telegram
  const checkTelegramLinkStatus = async (email) => {
    try {
      const response = await api.post('/check-telegram-link', { email });
      const data = response.data || {};
      return {
        linked: Boolean(data.linked ?? data.telegram_linked),
        telegram_sent: Boolean(data.telegram_sent),
        telegram_link_url: data.telegram_link_url || null,
        delivery_channel: data.delivery_channel || null,
        dev_otp: data.dev_otp || null,
        message: data.message,
      };
    } catch {
      return { linked: false };
    }
  };

  // ✅ ចុះឈ្មោះគណនី Admin ដំបូង
  const register = async (userData) => {
    try {
      const response = await api.post('/register', userData);
      const { token: newToken, user: createdUser } = response.data;
      applyAuthSession(newToken, createdUser, null);
      return { success: true, user: createdUser };
    } catch (error) {
      const validationErrors = error.response?.data?.errors || null;
      const firstError = validationErrors
        ? Object.values(validationErrors).flat()[0]
        : null;

      return {
        success: false,
        errors: validationErrors,
        error:
          firstError ||
          error.response?.data?.message ||
          'ការបង្កើតគណនីបរាជ័យ',
      };
    }
  };

  const logout = async (allDevices = false) => {
    const currentToken = token || localStorage.getItem('token');
    clearAuthStorage();

    if (currentToken) {
      try {
        await api.post(
          '/logout',
          { all_devices: allDevices },
          { headers: { Authorization: `Bearer ${currentToken}` } }
        );
      } catch {
        // អ្នកប្រើប្រាស់បានចាកចេញរួចហើយ
      }
    }
  };

  const hasRole = (roleName) => {
    if (!user) return false;
    const userRole = user?.role?.role_name || user?.role_name || user?.role;
    if (typeof userRole === 'string') {
      return userRole.toLowerCase() === roleName.toLowerCase();
    }
    return false;
  };

  const getTeacherData = () => {
    return teacher || readStoredJson('teacher');
  };

  const getFullName = () => {
    if (hasRole('Teacher') && teacher) {
      return (
        `${
          teacher.first_name || teacher.teacher_first_name || ''
        } ${teacher.last_name || teacher.teacher_last_name || ''}`.trim() ||
        `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
      );
    }
    return `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
  };

  const getEmail = () => {
    if (hasRole('Teacher') && teacher) {
      return teacher.email || teacher.teacher_email || user?.email;
    }
    return user?.email;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        teacher: getTeacherData(),
        loading,
        login,
        verifyTwoFactor,
        resendTwoFactor,
        checkTelegramLinkStatus,
        applyAuthSession,
        register,
        logout,
        hasRole,
        isAuthenticated: !!user,
        getTeacherData,
        getFullName,
        getEmail,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
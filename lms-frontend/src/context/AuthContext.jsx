// src/context/AuthContext.jsx
import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useRef,
  useCallback,
} from 'react';
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

const readValidTokenSync = () => {
  try {
    const raw =
      localStorage.getItem('token') || localStorage.getItem('auth_token');
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    return raw;
  } catch {
    return null;
  }
};

// ✅ កំណត់ Authorization Header ភ្លាមៗតាំងពីវិនាទីដំបូង មុនពេល Component កូនៗហៅ API
const initialBootToken = readValidTokenSync();
if (initialBootToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${initialBootToken}`;
}

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => readValidTokenSync());
  const skipNextFetchRef = useRef(false);

  // ✅ អានទិន្នន័យ User និង Teacher ពី localStorage ភ្លាមៗក្នុង 0 វិនាទី
  const [user, setUser] = useState(() => {
    const savedToken = readValidTokenSync();
    if (!savedToken) return null;
    const rawUser = readStoredJson('user') || readStoredJson('auth_user');
    return rawUser?.user || rawUser?.data || rawUser || null;
  });

  const [teacher, setTeacher] = useState(() => {
    const savedToken = readValidTokenSync();
    if (!savedToken) return null;
    return readStoredJson('teacher');
  });

  const [loading, setLoading] = useState(() => {
    const savedToken = readValidTokenSync();
    const savedUser = readStoredJson('user') || readStoredJson('auth_user');
    return Boolean(savedToken && !savedUser);
  });

  const clearAuthStorage = useCallback(() => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('teacher');
      localStorage.removeItem('student');
      localStorage.removeItem('user');
      localStorage.removeItem('auth_user');
    } catch {}
    setToken(null);
    setUser(null);
    setTeacher(null);
    delete api.defaults.headers.common['Authorization'];
  }, []);

  const applyAuthSession = useCallback(
    (newToken, userData, teacherData = null, studentData = null) => {
      if (!newToken || !userData) return;

      const resolvedTeacher = teacherData || userData?.teacher || null;
      const resolvedStudent = studentData || userData?.student || null;
      const enrichedUser = {
        ...userData,
        ...(resolvedTeacher ? { teacher: resolvedTeacher } : {}),
        ...(resolvedStudent ? { student: resolvedStudent } : {}),
      };

      try {
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(enrichedUser));
        localStorage.setItem('auth_user', JSON.stringify(enrichedUser));

        if (resolvedTeacher) {
          localStorage.setItem('teacher', JSON.stringify(resolvedTeacher));
        } else {
          localStorage.removeItem('teacher');
        }

        if (resolvedStudent) {
          localStorage.setItem('student', JSON.stringify(resolvedStudent));
        } else {
          localStorage.removeItem('student');
        }
      } catch {}

      api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      skipNextFetchRef.current = true;
      setToken(newToken);
      setUser(enrichedUser);
      setTeacher(resolvedTeacher);
      setLoading(false);
    },
    []
  );

  const fetchUser = useCallback(async () => {
    try {
      const response = await api.get('/user');
      const resData = response.data || {};
      const userData =
        resData.user || resData.data?.user || resData.data || resData;
      const teacherData =
        resData.teacher ||
        resData.data?.teacher ||
        userData?.teacher ||
        null;
      const studentData =
        resData.student ||
        resData.data?.student ||
        userData?.student ||
        null;

      if (userData && (userData.id || userData.user_id || userData.email)) {
        const enrichedUser = {
          ...userData,
          ...(teacherData ? { teacher: teacherData } : {}),
          ...(studentData ? { student: studentData } : {}),
        };

        setUser(enrichedUser);
        setTeacher(teacherData);

        try {
          localStorage.setItem('user', JSON.stringify(enrichedUser));
          localStorage.setItem('auth_user', JSON.stringify(enrichedUser));

          if (teacherData) {
            localStorage.setItem('teacher', JSON.stringify(teacherData));
          } else {
            localStorage.removeItem('teacher');
          }

          if (studentData) {
            localStorage.setItem('student', JSON.stringify(studentData));
          } else {
            localStorage.removeItem('student');
          }
        } catch {}
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
  }, [clearAuthStorage]);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      if (skipNextFetchRef.current) {
        skipNextFetchRef.current = false;
        setLoading(false);
        return;
      }
      fetchUser();
    } else {
      delete api.defaults.headers.common['Authorization'];
      setLoading(false);
    }
  }, [token, fetchUser]);

  // ✅ ស្ដាប់ព្រឹត្តិការណ៍ផ្លាស់ប្ដូរទិន្នន័យគណនីពី Navbar, Login (Reset Password) ឬផ្ទាំង Tab ផ្សេងទៀត
  useEffect(() => {
    const syncFromLocalStorage = () => {
      const latestToken = readValidTokenSync();
      if (!latestToken) {
        setToken(null);
        setUser(null);
        setTeacher(null);
        delete api.defaults.headers.common['Authorization'];
        return;
      }

      api.defaults.headers.common['Authorization'] = `Bearer ${latestToken}`;
      const latestUserRaw =
        readStoredJson('user') || readStoredJson('auth_user');
      const latestUser =
        latestUserRaw?.user || latestUserRaw?.data || latestUserRaw || null;
      const latestTeacher =
        readStoredJson('teacher') || latestUser?.teacher || null;

      setToken((prev) => {
        if (prev !== latestToken) {
          skipNextFetchRef.current = true;
          return latestToken;
        }
        return prev;
      });
      if (latestUser) setUser(latestUser);
      setTeacher(latestTeacher);
    };

    window.addEventListener('lms_user_updated', syncFromLocalStorage);
    window.addEventListener('storage', syncFromLocalStorage);
    return () => {
      window.removeEventListener('lms_user_updated', syncFromLocalStorage);
      window.removeEventListener('storage', syncFromLocalStorage);
    };
  }, []);

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

      const {
        token: newToken,
        user: userData,
        teacher: teacherData,
        student: studentData,
      } = data;
      if (newToken && userData) {
        applyAuthSession(newToken, userData, teacherData, studentData);
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
        student: studentData,
        message,
      } = response.data || {};

      if (newToken && userData) {
        applyAuthSession(newToken, userData, teacherData, studentData);
        return {
          success: true,
          user: userData,
          teacher: teacherData,
          student: studentData,
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
      const data = response.data || {};
      const newToken = data.token;
      const createdUser = data.user || data.data;

      if (newToken && createdUser) {
        applyAuthSession(newToken, createdUser, null, null);
      }
      return {
        success: true,
        user: createdUser,
        requires_2fa: Boolean(data.requires_2fa),
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
          'ការបង្កើតគណនីបរាជ័យ',
      };
    }
  };

  const logout = async (allDevices = false) => {
    const currentToken = token || readValidTokenSync();
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

  // ✅ កែលម្អ hasRole ឱ្យស្គាល់ទាំងឈ្មោះ Role និងលេខ role_id (1=Admin, 2=Teacher, 3=Student)
  const hasRole = useCallback(
    (roleName) => {
      if (!user || !roleName) return false;
      const target = String(roleName).trim().toLowerCase();
      const userRole =
        user?.role?.role_name ||
        user?.role?.name ||
        user?.role_name ||
        (typeof user?.role === 'string' ? user.role : '');

      if (userRole) {
        const normRole = String(userRole).trim().toLowerCase();
        if (normRole === target || normRole.includes(target)) {
          return true;
        }
      }

      const rid = Number(user?.role_id);
      if (target === 'admin' && rid === 1) return true;
      if (target === 'teacher' && rid === 2) return true;
      if (target === 'student' && rid === 3) return true;

      return false;
    },
    [user]
  );

  const getTeacherData = useCallback(() => {
    return teacher || readStoredJson('teacher') || user?.teacher || null;
  }, [teacher, user?.teacher]);

  const getFullName = useCallback(() => {
    const activeTeacher = getTeacherData();
    if (hasRole('Teacher') && activeTeacher) {
      return (
        `${
          activeTeacher.first_name || activeTeacher.teacher_first_name || ''
        } ${
          activeTeacher.last_name || activeTeacher.teacher_last_name || ''
        }`.trim() ||
        `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
        user?.name ||
        ''
      );
    }
    return (
      `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
      user?.name ||
      ''
    );
  }, [getTeacherData, hasRole, user]);

  const getEmail = useCallback(() => {
    const activeTeacher = getTeacherData();
    if (hasRole('Teacher') && activeTeacher) {
      return (
        activeTeacher.email || activeTeacher.teacher_email || user?.email || ''
      );
    }
    return user?.email || '';
  }, [getTeacherData, hasRole, user]);

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
        isAuthenticated: Boolean(token && user),
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
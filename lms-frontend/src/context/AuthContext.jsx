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

const AUTH_AVATAR_CACHE_KEY = 'lms_active_user_avatar_v1';

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

// ✅ អនុគមន៍ញែក និងរក្សាទុកទិន្នន័យ User/Teacher ដោយមិនឱ្យពេញទំហំ localStorage ជាដាច់ខាត
const persistAuthSessionSafely = (newToken, enrichedUser, resolvedTeacher, resolvedStudent) => {
  try {
    if (newToken) {
      localStorage.setItem('token', newToken);
    }

    // ទាញយករូបភាព Profile មករក្សាទុកដាច់ដោយឡែកតែ ១ កន្លែង (ជៀសវាងស្ទួន ៣-៤ កន្លែង)
    const avatarImg =
      resolvedTeacher?.profile_image ||
      resolvedStudent?.profile_image ||
      enrichedUser?.profile_image ||
      enrichedUser?.teacher?.profile_image ||
      enrichedUser?.student?.profile_image ||
      null;

    if (avatarImg) {
      try {
        localStorage.setItem(AUTH_AVATAR_CACHE_KEY, avatarImg);
      } catch {}
    }

    // បង្កើតទិន្នន័យគណនីដែលតូចស្រាល (Slim Object) សម្រាប់ធានាថាការ Save ចូល localStorage ជោគជ័យ 100%
    const makeSlimPerson = (person) => {
      if (!person || typeof person !== 'object') return person;
      const isHeavyBase64 =
        typeof person.profile_image === 'string' &&
        person.profile_image.startsWith('data:') &&
        person.profile_image.length > 20000;
      return {
        ...person,
        profile_image: isHeavyBase64 ? '__CACHED_AVATAR__' : person.profile_image,
      };
    };

    const slimTeacher = makeSlimPerson(resolvedTeacher);
    const slimStudent = makeSlimPerson(resolvedStudent);
    const slimUser = {
      ...makeSlimPerson(enrichedUser),
      ...(slimTeacher ? { teacher: slimTeacher } : {}),
      ...(slimStudent ? { student: slimStudent } : {}),
    };

    const serializedUser = JSON.stringify(slimUser);
    localStorage.setItem('user', serializedUser);
    localStorage.setItem('auth_user', serializedUser);

    if (slimTeacher) {
      localStorage.setItem('teacher', JSON.stringify(slimTeacher));
    } else {
      localStorage.removeItem('teacher');
    }

    if (slimStudent) {
      localStorage.setItem('student', JSON.stringify(slimStudent));
    } else {
      localStorage.removeItem('student');
    }
  } catch {
    // Fallback ករណី localStorage ពេញខ្លាំង៖ លុបរូបភាពចេញសិន តែរក្សាឈ្មោះ និងសិទ្ធិ (Role) ឱ្យនៅដដែល ដើម្បីកុំឱ្យ F5 ចេញអេក្រង់ស
    try {
      const stripImg = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const copy = { ...obj };
        delete copy.profile_image;
        return copy;
      };
      const minimalTeacher = stripImg(resolvedTeacher);
      const minimalStudent = stripImg(resolvedStudent);
      const minimalUser = {
        ...stripImg(enrichedUser),
        ...(minimalTeacher ? { teacher: minimalTeacher } : {}),
        ...(minimalStudent ? { student: minimalStudent } : {}),
      };
      localStorage.setItem('user', JSON.stringify(minimalUser));
      localStorage.setItem('auth_user', JSON.stringify(minimalUser));
      if (minimalTeacher) localStorage.setItem('teacher', JSON.stringify(minimalTeacher));
      if (minimalStudent) localStorage.setItem('student', JSON.stringify(minimalStudent));
    } catch {}
  }
};

// ✅ អនុគមន៍ភ្ជាប់រូបភាពពី Cache មកដាក់ក្នុង User និង Teacher វិញភ្លាមៗក្នុង 0ms
const hydratePersonWithAvatar = (person) => {
  if (!person || typeof person !== 'object') return person;
  const cachedAvatar = (() => {
    try {
      return localStorage.getItem(AUTH_AVATAR_CACHE_KEY);
    } catch {
      return null;
    }
  })();

  const restoreImg = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (obj.profile_image === '__CACHED_AVATAR__' || (!obj.profile_image && cachedAvatar)) {
      return { ...obj, profile_image: cachedAvatar };
    }
    return obj;
  };

  const hydrated = restoreImg(person);
  if (hydrated.teacher) hydrated.teacher = restoreImg(hydrated.teacher);
  if (hydrated.student) hydrated.student = restoreImg(hydrated.student);
  return hydrated;
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
    const extracted = rawUser?.user || rawUser?.data || rawUser || null;
    return hydratePersonWithAvatar(extracted);
  });

  const [teacher, setTeacher] = useState(() => {
    const savedToken = readValidTokenSync();
    if (!savedToken) return null;
    const rawTeacher = readStoredJson('teacher');
    return hydratePersonWithAvatar(rawTeacher);
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
      localStorage.removeItem(AUTH_AVATAR_CACHE_KEY);
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

      persistAuthSessionSafely(
        newToken,
        enrichedUser,
        resolvedTeacher,
        resolvedStudent
      );

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

        persistAuthSessionSafely(
          readValidTokenSync(),
          enrichedUser,
          teacherData,
          studentData
        );
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

      const cachedUser = readStoredJson('user') || readStoredJson('auth_user');
      if (cachedUser) {
        setLoading(false);
        const timer = setTimeout(() => {
          fetchUser();
        }, 400);
        return () => clearTimeout(timer);
      } else {
        fetchUser();
      }
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
      const latestUser = hydratePersonWithAvatar(
        latestUserRaw?.user || latestUserRaw?.data || latestUserRaw || null
      );
      const latestTeacher = hydratePersonWithAvatar(
        readStoredJson('teacher') || latestUser?.teacher || null
      );

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
    return (
      teacher ||
      hydratePersonWithAvatar(readStoredJson('teacher')) ||
      user?.teacher ||
      null
    );
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
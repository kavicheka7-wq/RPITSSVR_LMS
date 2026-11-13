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

const AUTH_AVATAR_THUMB_KEY = 'lms_nav_avatar_thumb_v1';
const AUTH_AVATAR_CACHE_KEY = 'lms_active_user_avatar_v2';
const LEGACY_AVATAR_CACHE_KEY = 'lms_active_user_avatar_v1';
const LAST_ACTIVE_ROLE_KEY = 'lms_last_active_role';

// ✅ Global RAM Cache សម្រាប់ឱ្យអានរូបភាព Profile ក្នុងរយៈពេល 0ms
let AUTH_MEM_AVATAR = null;

const readRawStorage = (key) => {
  try {
    const sVal = sessionStorage.getItem(key);
    if (sVal && sVal !== 'undefined' && sVal !== 'null') return sVal;
  } catch {}
  try {
    const lVal = localStorage.getItem(key);
    if (lVal && lVal !== 'undefined' && lVal !== 'null') return lVal;
  } catch {}
  return null;
};

const readStoredJson = (key) => {
  const raw = readRawStorage(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const readValidTokenSync = () => {
  return readRawStorage('token') || readRawStorage('auth_token') || null;
};

// ✅ សម្អាត Cache ចាស់ៗក្នុង localStorage ប្រសិនបើពេញទំហំ 5MB
const freeUpLocalStorageSpace = () => {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith('cached_') ||
          k.startsWith('lms_notifs_') ||
          k === LEGACY_AVATAR_CACHE_KEY)
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch {}
};

const safeSetStorageItem = (key, valueStr) => {
  if (!valueStr) return;
  try {
    sessionStorage.setItem(key, valueStr);
  } catch {}
  try {
    localStorage.setItem(key, valueStr);
  } catch {
    freeUpLocalStorageSpace();
    try {
      localStorage.setItem(key, valueStr);
    } catch {}
  }
};

const readCachedAvatarSync = () => {
  if (AUTH_MEM_AVATAR && AUTH_MEM_AVATAR !== '__CACHED_AVATAR__') {
    return AUTH_MEM_AVATAR;
  }
  const found =
    readRawStorage(AUTH_AVATAR_THUMB_KEY) ||
    readRawStorage(AUTH_AVATAR_CACHE_KEY) ||
    readRawStorage(LEGACY_AVATAR_CACHE_KEY) ||
    null;
  if (found && found !== '__CACHED_AVATAR__') {
    AUTH_MEM_AVATAR = found;
    return found;
  }
  return null;
};

// ✅ បង្រួមរូបភាព Profile Base64 ធំៗឱ្យទៅជា Thumbnail តូចច្បាស់ (~4KB) សម្រាប់បង្ហាញលើ Navbar ក្នុង 0ms
const compressAndCacheAvatar = (rawDataUrl) => {
  if (
    !rawDataUrl ||
    typeof rawDataUrl !== 'string' ||
    rawDataUrl === '__CACHED_AVATAR__'
  ) {
    return;
  }

  AUTH_MEM_AVATAR = rawDataUrl;

  // ១. រក្សាទុកក្នុង sessionStorage ភ្លាមៗក្នុង 0ms ដើម្បីកុំឱ្យរង់ចាំ Canvas បង្រួម
  try {
    sessionStorage.setItem(AUTH_AVATAR_THUMB_KEY, rawDataUrl);
    sessionStorage.setItem(AUTH_AVATAR_CACHE_KEY, rawDataUrl);
  } catch {}

  if (!rawDataUrl.startsWith('data:image') || rawDataUrl.length < 25000) {
    safeSetStorageItem(AUTH_AVATAR_THUMB_KEY, rawDataUrl);
    safeSetStorageItem(AUTH_AVATAR_CACHE_KEY, rawDataUrl);
    safeSetStorageItem(LEGACY_AVATAR_CACHE_KEY, rawDataUrl);
    return;
  }

  // ២. បង្រួមមកទំហំ 128x128px (~4KB) សម្រាប់រក្សាទុកក្នុង localStorage ឱ្យបើកលឿន 0ms ពេល F5
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const targetSize = 128;
        let width = img.width || targetSize;
        let height = img.height || targetSize;

        if (width > height) {
          if (width > targetSize) {
            height = Math.round((height * targetSize) / width);
            width = targetSize;
          }
        } else {
          if (height > targetSize) {
            width = Math.round((width * targetSize) / height);
            height = targetSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/webp', 0.85);
        const finalAvatar =
          compressed.length < rawDataUrl.length ? compressed : rawDataUrl;

        AUTH_MEM_AVATAR = finalAvatar;
        safeSetStorageItem(AUTH_AVATAR_THUMB_KEY, finalAvatar);
        safeSetStorageItem(AUTH_AVATAR_CACHE_KEY, finalAvatar);
        safeSetStorageItem(LEGACY_AVATAR_CACHE_KEY, finalAvatar);
        window.dispatchEvent(new Event('lms_user_updated'));
      } catch {}
    };
    img.src = rawDataUrl;
  } catch {}
};

// ✅ លុបរូបភាព Base64 ធំៗចេញពីគ្រប់កម្រិតនៃ Object (Recursive Strip) ដើម្បីឱ្យទំហំ User JSON < 1KB
const stripHeavyBase64Deep = (obj, depth = 0) => {
  if (!obj || typeof obj !== 'object' || depth > 4) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => stripHeavyBase64Deep(item, depth + 1));
  }

  const cleaned = {};
  Object.keys(obj).forEach((k) => {
    const val = obj[k];
    if (
      typeof val === 'string' &&
      val.startsWith('data:') &&
      val.length > 15000
    ) {
      cleaned[k] = '__CACHED_AVATAR__';
    } else if (val && typeof val === 'object') {
      cleaned[k] = stripHeavyBase64Deep(val, depth + 1);
    } else {
      cleaned[k] = val;
    }
  });
  return cleaned;
};

// ✅ កំណត់ឈ្មោះតួនាទីគោល ('Admin' | 'Teacher' | 'Student') សម្រាប់ Sidebar និង App
const detectRoleLabel = (userObj, teacherObj) => {
  const rawRole =
    userObj?.role?.role_name ||
    userObj?.role?.name ||
    userObj?.role_name ||
    (typeof userObj?.role === 'string' ? userObj.role : '') ||
    '';
  const r = String(rawRole).trim().toLowerCase();
  const rid = Number(userObj?.role_id);

  if (r.includes('admin') || rid === 1) return 'Admin';
  if (
    r.includes('teacher') ||
    rid === 2 ||
    Boolean(teacherObj) ||
    Boolean(userObj?.teacher) ||
    Boolean(userObj?.is_teacher)
  ) {
    return 'Teacher';
  }
  if (r.includes('student') || rid === 3 || Boolean(userObj?.student)) {
    return 'Student';
  }
  return null;
};

// ✅ អនុគមន៍ញែក និងរក្សាទុកទិន្នន័យ User/Teacher ដោយមិនឱ្យពេញទំហំ localStorage ជាដាច់ខាត
const persistAuthSessionSafely = (
  newToken,
  enrichedUser,
  resolvedTeacher,
  resolvedStudent
) => {
  if (newToken) {
    safeSetStorageItem('token', newToken);
  }

  const detectedRole = detectRoleLabel(enrichedUser, resolvedTeacher);
  if (detectedRole) {
    safeSetStorageItem(LAST_ACTIVE_ROLE_KEY, detectedRole);
  }

  // ទាញយករូបភាព Profile មករក្សាទុក និងបង្រួមជា Thumbnail ដាច់ដោយឡែកតែ ១ កន្លែង
  const avatarImg =
    resolvedTeacher?.profile_image ||
    resolvedStudent?.profile_image ||
    enrichedUser?.profile_image ||
    enrichedUser?.teacher?.profile_image ||
    enrichedUser?.student?.profile_image ||
    null;

  if (avatarImg && avatarImg !== '__CACHED_AVATAR__') {
    compressAndCacheAvatar(avatarImg);
  }

  // បង្កើតទិន្នន័យគណនីដែលតូចស្រាល (< 1KB) សម្រាប់ធានាថាការ Save ចូល Storage ជោគជ័យ 100%
  const slimTeacher = stripHeavyBase64Deep(resolvedTeacher);
  const slimStudent = stripHeavyBase64Deep(resolvedStudent);
  const slimUser = {
    ...stripHeavyBase64Deep(enrichedUser),
    ...(slimTeacher ? { teacher: slimTeacher } : {}),
    ...(slimStudent ? { student: slimStudent } : {}),
  };

  const serializedUser = JSON.stringify(slimUser);
  safeSetStorageItem('user', serializedUser);
  safeSetStorageItem('auth_user', serializedUser);

  if (slimTeacher) {
    safeSetStorageItem('teacher', JSON.stringify(slimTeacher));
  } else {
    try {
      sessionStorage.removeItem('teacher');
      localStorage.removeItem('teacher');
    } catch {}
  }

  if (slimStudent) {
    safeSetStorageItem('student', JSON.stringify(slimStudent));
  } else {
    try {
      sessionStorage.removeItem('student');
      localStorage.removeItem('student');
    } catch {}
  }
};

// ✅ អនុគមន៍ភ្ជាប់រូបភាពពី Cache មកដាក់ក្នុង User និង Teacher វិញភ្លាមៗក្នុង 0ms
const hydratePersonWithAvatar = (person) => {
  if (!person || typeof person !== 'object') return person;
  const cachedAvatar = readCachedAvatarSync();

  const restoreImg = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (
      obj.profile_image === '__CACHED_AVATAR__' ||
      (!obj.profile_image && cachedAvatar)
    ) {
      return { ...obj, profile_image: cachedAvatar };
    }
    return obj;
  };

  const hydrated = restoreImg(person);
  if (hydrated.teacher && typeof hydrated.teacher === 'object') {
    hydrated.teacher = restoreImg(hydrated.teacher);
  }
  if (hydrated.student && typeof hydrated.student === 'object') {
    hydrated.student = restoreImg(hydrated.student);
  }
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

  // ✅ អានទិន្នន័យ User និង Teacher ពី Storage ភ្លាមៗក្នុង 0 វិនាទី
  const [user, setUser] = useState(() => {
    const savedToken = readValidTokenSync();
    if (!savedToken) return null;
    const rawUser = readStoredJson('user') || readStoredJson('auth_user');
    const extracted = rawUser?.user || rawUser?.data || rawUser || null;
    if (extracted) {
      return hydratePersonWithAvatar(extracted);
    }
    const fallbackTeacher = readStoredJson('teacher');
    if (fallbackTeacher) {
      return hydratePersonWithAvatar({
        ...fallbackTeacher,
        role_id: fallbackTeacher.role_id || 2,
        role: fallbackTeacher.role || 'Teacher',
        teacher: fallbackTeacher,
        is_teacher: true,
      });
    }
    return null;
  });

  const [teacher, setTeacher] = useState(() => {
    const savedToken = readValidTokenSync();
    if (!savedToken) return null;
    const rawTeacher =
      readStoredJson('teacher') ||
      readStoredJson('user')?.teacher ||
      readStoredJson('auth_user')?.teacher ||
      null;
    return hydratePersonWithAvatar(rawTeacher);
  });

  const [loading, setLoading] = useState(() => {
    const savedToken = readValidTokenSync();
    const hasCachedIdentity = Boolean(
      readStoredJson('user') ||
        readStoredJson('auth_user') ||
        readStoredJson('teacher')
    );
    return Boolean(savedToken && !hasCachedIdentity);
  });

  const clearAuthStorage = useCallback(() => {
    AUTH_MEM_AVATAR = null;
    try {
      [
        'token',
        'auth_token',
        'teacher',
        'student',
        'user',
        'auth_user',
        AUTH_AVATAR_THUMB_KEY,
        AUTH_AVATAR_CACHE_KEY,
        LEGACY_AVATAR_CACHE_KEY,
        LAST_ACTIVE_ROLE_KEY,
      ].forEach((k) => {
        try {
          sessionStorage.removeItem(k);
          localStorage.removeItem(k);
        } catch {}
      });
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
      setUser(hydratePersonWithAvatar(enrichedUser));
      setTeacher(hydratePersonWithAvatar(resolvedTeacher));
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

        persistAuthSessionSafely(
          readValidTokenSync(),
          enrichedUser,
          teacherData,
          studentData
        );

        setUser(hydratePersonWithAvatar(enrichedUser));
        setTeacher(hydratePersonWithAvatar(teacherData));
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

      const hasCachedIdentity = Boolean(
        readStoredJson('user') ||
          readStoredJson('auth_user') ||
          readStoredJson('teacher')
      );
      if (hasCachedIdentity) {
        setLoading(false);
        const timer = setTimeout(() => {
          fetchUser();
        }, 350);
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
    const syncFromStorage = () => {
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

    window.addEventListener('lms_user_updated', syncFromStorage);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener('lms_user_updated', syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
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
      if (!roleName) return false;
      const target = String(roleName).trim().toLowerCase();

      if (user) {
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
        if (
          target === 'teacher' &&
          (rid === 2 || Boolean(teacher) || Boolean(user?.teacher) || Boolean(user?.is_teacher))
        ) {
          return true;
        }
        if (target === 'student' && (rid === 3 || Boolean(user?.student))) {
          return true;
        }
      }

      const cachedRole = readRawStorage(LAST_ACTIVE_ROLE_KEY);
      if (cachedRole && String(cachedRole).trim().toLowerCase() === target) {
        return true;
      }

      return false;
    },
    [user, teacher]
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
        isAuthenticated: Boolean(token && (user || teacher)),
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
// src/components/common/Navbar.jsx
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Menu, Dialog } from '@headlessui/react';
import {
  Bars3Icon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  AcademicCapIcon,
  XMarkIcon,
  CameraIcon,
  PencilIcon,
  EnvelopeIcon,
  PhoneIcon,
  UserIcon,
  BuildingOfficeIcon,
  KeyIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  EyeIcon,
  EyeSlashIcon,
  GlobeAltIcon,
  HomeIcon,
  BuildingLibraryIcon,
  BookOpenIcon,
  ChartBarIcon,
  FolderIcon,
  UsersIcon,
  ClipboardDocumentListIcon,
  DocumentArrowUpIcon,
  PencilSquareIcon,
  SunIcon,
  MoonIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  CheckBadgeIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import logo from '../../assets/image/PRIT.png';

import NotificationBell from './NotificationBell';

const EMPTY_USER_OBJ = Object.freeze({});
const getTelegramLinkCacheKey = (email) =>
  `lms_tg_link_url_${email || 'default'}`;

const readCachedUserSync = () => {
  try {
    const raw =
      localStorage.getItem('user') || localStorage.getItem('auth_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user || parsed?.data || parsed;
  } catch {
    return null;
  }
};

const readCachedTeacherSync = () => {
  try {
    const raw = localStorage.getItem('teacher');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const pushLocalNotification = (notif) => {
  try {
    const userObjStr =
      localStorage.getItem('auth_user') || localStorage.getItem('user');
    let uid = 'default';
    let role = 'admin';
    if (userObjStr) {
      const userObj = JSON.parse(userObjStr);
      const u = userObj?.user || userObj?.data || userObj;
      uid = u?.id || u?.user_id || u?.email || 'default';
      if (u?.role) {
        const rName =
          typeof u.role === 'string'
            ? u.role
            : u.role.role_name || u.role.name || 'admin';
        role = rName.toString().toLowerCase();
      } else if (Number(u?.role_id) === 2) {
        role = 'teacher';
      } else if (Number(u?.role_id) === 3) {
        role = 'student';
      }
    }

    const keysToUpdate = Array.from(
      new Set([`lms_notifs_admin_${uid}`, `lms_notifs_${role}_${uid}`])
    );

    const newNotif = {
      id: `local_act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toISOString(),
      read: false,
      ...notif,
    };

    keysToUpdate.forEach((key) => {
      const saved = localStorage.getItem(key);
      const existing = saved ? JSON.parse(saved) : [];
      const updated = [newNotif, ...existing].slice(0, 40);
      localStorage.setItem(key, JSON.stringify(updated));
    });

    window.dispatchEvent(new Event('lms_notifications_sync_event'));
  } catch (e) {
    console.error('Local notification error:', e);
  }
};

const Navbar = () => {
  const {
    user: contextUser,
    teacher: contextTeacher,
    logout,
    setUser,
    hasRole,
    checkTelegramLinkStatus,
  } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const user = useMemo(
    () => contextUser || readCachedUserSync() || EMPTY_USER_OBJ,
    [contextUser]
  );

  const teacherData = useMemo(
    () => contextTeacher || readCachedTeacherSync() || user?.teacher || null,
    [contextTeacher, user?.teacher]
  );

  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleMediaChange = (e) => setIsMobileViewport(e.matches);
    setIsMobileViewport(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
      return () => mediaQuery.removeEventListener('change', handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
      return () => mediaQuery.removeListener(handleMediaChange);
    }
  }, []);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openMobileSubMenu, setOpenMobileSubMenu] = useState(() =>
    location.pathname.startsWith('/students') ||
    location.pathname.startsWith('/admin/students')
      ? '/students'
      : null
  );
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [instantAvatarPreview, setInstantAvatarPreview] = useState(null);
  const [passwordFormError, setPasswordFormError] = useState('');

  const userEmail = useMemo(
    () =>
      user?.email ||
      teacherData?.email ||
      user?.teacher_email ||
      user?.student?.email ||
      '',
    [user, teacherData]
  );

  const [isTelegramLinked, setIsTelegramLinked] = useState(() =>
    Boolean(user?.telegram_linked || user?.telegram_chat_id)
  );
  const [telegramLinkUrl, setTelegramLinkUrl] = useState(() => {
    try {
      return sessionStorage.getItem(getTelegramLinkCacheKey(userEmail)) || null;
    } catch {
      return null;
    }
  });
  const [waitingTelegramLink, setWaitingTelegramLink] = useState(false);

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    profile_image: '',
  });
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    new_password_confirmation: '',
  });
  const fileInputRef = useRef(null);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    if (
      location.pathname.startsWith('/students') ||
      location.pathname.startsWith('/admin/students')
    ) {
      setOpenMobileSubMenu('/students');
    }
  }, [location.pathname]);

  useEffect(() => {
    setAvatarError(false);
  }, [
    user?.profile_image,
    teacherData?.profile_image,
    user?.student?.profile_image,
    instantAvatarPreview,
  ]);

  useEffect(() => {
    setIsTelegramLinked(
      Boolean(user?.telegram_linked || user?.telegram_chat_id)
    );
  }, [user?.telegram_linked, user?.telegram_chat_id]);

  // ==========================================================================
  // 📌 មុខងារប្តូរពណ៌ផ្ទៃអេក្រង់ ថ្ងៃ-យប់ (LIGHT / DARK MODE)
  // ==========================================================================
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      return localStorage.getItem('lms_theme_mode') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
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
  }, [isDarkMode]);

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  const syncUserToStorage = useCallback((updatedUserObj, updatedTeacherObj) => {
    try {
      const str = JSON.stringify(updatedUserObj);
      localStorage.setItem('user', str);
      localStorage.setItem('auth_user', str);

      if (updatedTeacherObj) {
        localStorage.setItem('teacher', JSON.stringify(updatedTeacherObj));
      } else if (updatedUserObj?.teacher) {
        localStorage.setItem(
          'teacher',
          JSON.stringify(updatedUserObj.teacher)
        );
      }
    } catch (e) {
      console.warn('Failed to sync user to localStorage:', e);
    }
  }, []);

  const handleInstantLogout = useCallback(() => {
    setIsMobileMenuOpen(false);
    setIsProfileModalOpen(false);
    setIsSettingsModalOpen(false);

    if (typeof logout === 'function') {
      logout();
    } else {
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('teacher');
        localStorage.removeItem('user');
        localStorage.removeItem('auth_user');
      } catch {}

      if (typeof setUser === 'function') {
        setUser(null);
      }
    }

    navigate('/login', { replace: true });
  }, [logout, navigate, setUser]);

  const userRoleRaw = useMemo(
    () =>
      user?.role?.role_name ||
      user?.role?.name ||
      user?.role_name ||
      (typeof user?.role === 'string' ? user.role : '') ||
      '',
    [user]
  );

  const isAdmin = useMemo(
    () =>
      (typeof hasRole === 'function' && hasRole('Admin')) ||
      String(userRoleRaw).toLowerCase().includes('admin') ||
      Number(user?.role_id) === 1,
    [hasRole, userRoleRaw, user?.role_id]
  );

  const isTeacher = useMemo(
    () =>
      (typeof hasRole === 'function' && hasRole('Teacher')) ||
      String(userRoleRaw).toLowerCase().includes('teacher') ||
      Number(user?.role_id) === 2,
    [hasRole, userRoleRaw, user?.role_id]
  );

  const isStudent = useMemo(
    () =>
      (typeof hasRole === 'function' && hasRole('Student')) ||
      String(userRoleRaw).toLowerCase().includes('student') ||
      Number(user?.role_id) === 3,
    [hasRole, userRoleRaw, user?.role_id]
  );

  const getRoleName = useCallback(
    (roleName) => {
      const r = (roleName || '').toString().toLowerCase();
      const rid = Number(user?.role_id);
      if (language === 'km') {
        if (r.includes('admin') || rid === 1) return 'អ្នកគ្រប់គ្រង';
        if (r.includes('teacher') || rid === 2) return 'គ្រូបង្រៀន';
        if (r.includes('student') || rid === 3) return 'សិស្ស';
        return roleName;
      }
      if (r.includes('admin') || rid === 1) return 'Administrator';
      if (r.includes('teacher') || rid === 2) return 'Teacher';
      if (r.includes('student') || rid === 3) return 'Student';
      return roleName;
    },
    [language, user?.role_id]
  );

  const resolveImageUrl = useCallback((rawPath) => {
    if (!rawPath) return null;
    if (
      rawPath.startsWith('http') ||
      rawPath.startsWith('data:') ||
      rawPath.startsWith('blob:')
    ) {
      return rawPath;
    }
    const baseUrl = (
      import.meta.env.VITE_API_URL || 'http://localhost:8000'
    ).replace(/\/api\/?$/, '');
    const cleanPath = rawPath.replace(/^\/?storage\//, '').replace(/^\/+/, '');
    return `${baseUrl}/storage/${cleanPath}`;
  }, []);

  const profileImgUrl = useMemo(() => {
    if (instantAvatarPreview) return instantAvatarPreview;
    const rawImg =
      user?.profile_image ||
      teacherData?.profile_image ||
      user?.teacher?.profile_image ||
      user?.student?.profile_image;
    return rawImg ? resolveImageUrl(rawImg) : null;
  }, [user, teacherData, instantAvatarPreview, resolveImageUrl]);

  const resolvedFirstName = useMemo(
    () =>
      user?.first_name ||
      teacherData?.first_name ||
      user?.teacher_first_name ||
      user?.student?.first_name ||
      '',
    [user, teacherData]
  );

  const resolvedLastName = useMemo(
    () =>
      user?.last_name ||
      teacherData?.last_name ||
      user?.teacher_last_name ||
      user?.student?.last_name ||
      '',
    [user, teacherData]
  );

  const userInitials = useMemo(() => {
    const first = (resolvedFirstName || user?.name || '')?.trim()?.[0] || '';
    const last = (resolvedLastName || '')?.trim()?.[0] || '';
    return (first + last).toUpperCase() || 'U';
  }, [resolvedFirstName, resolvedLastName, user?.name]);

  const userDisplayName = useMemo(() => {
    if (resolvedFirstName || resolvedLastName) {
      return `${resolvedFirstName} ${resolvedLastName}`.trim();
    }
    if (user?.name) {
      return user.name;
    }
    return userEmail || 'User';
  }, [resolvedFirstName, resolvedLastName, user?.name, userEmail]);

  const userPhone = useMemo(
    () =>
      user?.phone ||
      teacherData?.phone ||
      user?.teacher_phone ||
      user?.student?.phone ||
      '',
    [user, teacherData]
  );

  const syncTelegramStatus = useCallback(
    async (isPolling = false) => {
      if (!userEmail) return;
      try {
        const res =
          typeof checkTelegramLinkStatus === 'function'
            ? await checkTelegramLinkStatus(userEmail)
            : (await api.post('/check-telegram-link', { email: userEmail }))
                .data;

        if (res?.telegram_link_url) {
          setTelegramLinkUrl(res.telegram_link_url);
          try {
            sessionStorage.setItem(
              getTelegramLinkCacheKey(userEmail),
              res.telegram_link_url
            );
          } catch {}
        }

        if (res?.linked) {
          setIsTelegramLinked(true);
          setWaitingTelegramLink(false);
          const updatedUser = { ...user, telegram_linked: true };
          if (typeof setUser === 'function') {
            setUser(updatedUser);
          }
          syncUserToStorage(updatedUser);

          if (isPolling) {
            pushLocalNotification({
              titleKm: 'បានភ្ជាប់គណនី Telegram ជោគជ័យ',
              titleEn: 'Telegram Account Linked',
              descKm:
                'គណនី Telegram របស់អ្នកត្រូវបានភ្ជាប់ជាមួយប្រព័ន្ធរួចរាល់។',
              descEn:
                'Your Telegram account has been successfully linked to the system.',
              category: 'system',
            });
          }
        }
      } catch {}
    },
    [userEmail, checkTelegramLinkStatus, user, setUser, syncUserToStorage]
  );

  useEffect(() => {
    if (!userEmail || telegramLinkUrl) return;
    const timer = setTimeout(() => {
      syncTelegramStatus(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [userEmail, telegramLinkUrl, syncTelegramStatus]);

  useEffect(() => {
    if (isSettingsModalOpen) {
      syncTelegramStatus(false);
    }
  }, [isSettingsModalOpen, syncTelegramStatus]);

  useEffect(() => {
    if (!isSettingsModalOpen || !waitingTelegramLink || !userEmail) {
      return;
    }

    const timer = setInterval(() => {
      syncTelegramStatus(true);
    }, 3000);

    return () => clearInterval(timer);
  }, [isSettingsModalOpen, waitingTelegramLink, userEmail, syncTelegramStatus]);

  // ✅ ប្រើប្រាស់ Clean URL '/dashboard' ឱ្យស៊ីគ្នាជាមួយ Login.jsx និង Register.jsx
  const dashboardPath = '/dashboard';

  const userCreatedAtFormatted = useMemo(() => {
    if (user?.created_at) {
      return new Date(user.created_at).toLocaleDateString(
        language === 'km' ? 'km-KH' : 'en-US',
        {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }
      );
    }
    return '—';
  }, [user?.created_at, language]);

  // ✅ បញ្ជីម៉ឺនុយសម្រាប់ទូរស័ព្ទ (ប្រើ Clean URLs ស៊ីគ្នាជាមួយ Login.jsx & Register.jsx)
  const navItems = useMemo(() => {
    if (isAdmin) {
      return [
        {
          name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'),
          icon: HomeIcon,
          path: '/dashboard',
          altPaths: ['/admin/dashboard'],
        },
        {
          name: t('ដេប៉ាតឺម៉ង់', 'Departments'),
          icon: BuildingLibraryIcon,
          path: '/departments',
          altPaths: ['/admin/departments'],
        },
        {
          name: t('គ្រូបង្រៀន', 'Teachers'),
          icon: AcademicCapIcon,
          path: '/teachers',
          altPaths: ['/admin/teachers'],
        },
        {
          name: t('មុខវិជ្ជា', 'Courses'),
          icon: BookOpenIcon,
          path: '/courses',
          altPaths: ['/admin/courses'],
        },
        {
          name: t('គ្រប់គ្រងសិស្ស', 'Manage Students'),
          icon: UserGroupIcon,
          path: '/students',
          altPaths: ['/admin/students'],
          children: [
            {
              name: t('ឆ្នាំទី១', 'Year 1'),
              path: '/students/year-1',
              altPath: '/admin/students/year-1',
            },
            {
              name: t('ឆ្នាំទី២', 'Year 2'),
              path: '/students/year-2',
              altPath: '/admin/students/year-2',
            },
            {
              name: t('ឆ្នាំទី៣', 'Year 3'),
              path: '/students/year-3',
              altPath: '/admin/students/year-3',
            },
            {
              name: t('ឆ្នាំទី៤', 'Year 4'),
              path: '/students/year-4',
              altPath: '/admin/students/year-4',
            },
          ],
        },
        {
          name: t('របាយការណ៍', 'Reports'),
          icon: ChartBarIcon,
          path: '/reports',
          altPaths: ['/admin/reports'],
        },
      ];
    }
    if (isTeacher) {
      return [
        {
          name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'),
          icon: HomeIcon,
          path: '/dashboard',
          altPaths: ['/teacher/dashboard'],
        },
        {
          name: t('មុខវិជ្ជា', 'Courses'),
          icon: BookOpenIcon,
          path: '/courses',
          altPaths: ['/teacher/courses'],
        },
        {
          name: t('មេរៀន', 'Lessons'),
          icon: FolderIcon,
          path: '/lessons',
          altPaths: ['/teacher/lessons'],
        },
        {
          name: t('សិស្ស', 'Students'),
          icon: UsersIcon,
          path: '/students',
          altPaths: ['/teacher/students'],
        },
        {
          name: t('វត្តមានសិស្ស', 'Attendance'),
          icon: ClipboardDocumentListIcon,
          path: '/attendance',
          altPaths: ['/teacher/attendance'],
        },
        {
          name: t('ពិន្ទុ', 'Grades'),
          icon: ChartBarIcon,
          path: '/grades',
          altPaths: ['/teacher/grades'],
        },
        {
          name: t('កិច្ចការ', 'Assignments'),
          icon: DocumentArrowUpIcon,
          path: '/assignments',
          altPaths: ['/teacher/assignments'],
        },
        {
          name: t('កម្រងសំណួរ', 'Quizzes'),
          icon: PencilSquareIcon,
          path: '/quizzes',
          altPaths: ['/teacher/quizzes'],
        },
      ];
    }
    if (isStudent) {
      return [
        {
          name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'),
          icon: HomeIcon,
          path: '/dashboard',
          altPaths: ['/student/dashboard'],
        },
        {
          name: t('មុខវិជ្ជា', 'Courses'),
          icon: BookOpenIcon,
          path: '/courses',
          altPaths: ['/student/courses'],
        },
        {
          name: t('មេរៀន', 'Lessons'),
          icon: FolderIcon,
          path: '/lessons',
          altPaths: ['/student/lessons'],
        },
        {
          name: t('វត្តមាន', 'Attendance'),
          icon: ClipboardDocumentListIcon,
          path: '/attendance',
          altPaths: ['/student/attendance'],
        },
        {
          name: t('ពិន្ទុ', 'Grades'),
          icon: ChartBarIcon,
          path: '/grades',
          altPaths: ['/student/grades'],
        },
        {
          name: t('កិច្ចការ', 'Assignments'),
          icon: DocumentArrowUpIcon,
          path: '/assignments',
          altPaths: ['/student/assignments'],
        },
        {
          name: t('កម្រងសំណួរ', 'Quizzes'),
          icon: PencilSquareIcon,
          path: '/quizzes',
          altPaths: ['/student/quizzes'],
        },
      ];
    }
    return [];
  }, [isAdmin, isTeacher, isStudent, t]);

  const openProfileModal = useCallback(() => {
    setProfileData({
      first_name: resolvedFirstName || user?.name || '',
      last_name: resolvedLastName || '',
      email: userEmail,
      phone: userPhone,
      profile_image: profileImgUrl,
    });
    setIsProfileModalOpen(true);
  }, [resolvedFirstName, resolvedLastName, user?.name, userEmail, userPhone, profileImgUrl]);

  const closeProfileModal = useCallback(() => {
    setIsProfileModalOpen(false);
    setIsEditing(false);
  }, []);

  const openSettingsModal = useCallback(() => {
    setPasswordData({
      current_password: '',
      new_password: '',
      new_password_confirmation: '',
    });
    setPasswordFormError('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setIsSettingsModalOpen(true);
  }, []);

  const closeSettingsModal = useCallback(() => {
    setIsSettingsModalOpen(false);
    setWaitingTelegramLink(false);
    setPasswordFormError('');
    setPasswordData({
      current_password: '',
      new_password: '',
      new_password_confirmation: '',
    });
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  }, []);

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    if (passwordFormError) setPasswordFormError('');
    setPasswordData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    setPasswordFormError('');

    if (passwordData.new_password !== passwordData.new_password_confirmation) {
      setPasswordFormError(
        t('ពាក្យសម្ងាត់ថ្មីមិនត្រូវគ្នា', 'New passwords do not match')
      );
      return;
    }
    if (passwordData.new_password.length < 6) {
      setPasswordFormError(
        t(
          'ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងតិច 6 តួ',
          'New password must be at least 6 characters'
        )
      );
      return;
    }

    setIsSavingPassword(true);
    try {
      const response = await api.put('/user/update-password', {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
        new_password_confirmation: passwordData.new_password_confirmation,
      });

      if (response.data) {
        pushLocalNotification({
          titleKm: 'បានផ្លាស់ប្ដូរពាក្យសម្ងាត់ជោគជ័យ',
          titleEn: 'Password Changed Successfully',
          descKm: 'ពាក្យសម្ងាត់គណនីរបស់អ្នកត្រូវបានធ្វើបច្ចុប្បន្នភាពរួចរាល់។',
          descEn: 'Your account password has been updated successfully.',
          category: 'security',
        });
        closeSettingsModal();
      }
    } catch (error) {
      console.error('Password update error:', error);
      const errorMsg =
        error.response?.data?.message ||
        t('មិនអាចកែប្រែពាក្យសម្ងាត់បានទេ', 'Cannot update password');
      setPasswordFormError(String(errorMsg));
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      return;
    }

    const localBlobUrl = URL.createObjectURL(file);
    setAvatarError(false);
    setInstantAvatarPreview(localBlobUrl);
    setProfileData((prev) => ({
      ...prev,
      profile_image: localBlobUrl,
    }));

    try {
      const formData = new FormData();
      formData.append('profile_image', file);

      let endpoint = '/user/profile/update-image';
      if (isTeacher) {
        endpoint = '/teacher/profile/update-image';
      } else if (isStudent) {
        endpoint = '/student/profile/update-image';
      }

      const response = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data) {
        const newImgPath =
          response.data.profile_image || response.data?.data?.profile_image;
        const updatedUser = { ...user };
        let updatedTeacher = teacherData ? { ...teacherData } : null;

        if (newImgPath) {
          updatedUser.profile_image = newImgPath;
          if (updatedUser.teacher) {
            updatedUser.teacher = {
              ...updatedUser.teacher,
              profile_image: newImgPath,
            };
          }
          if (updatedTeacher) {
            updatedTeacher.profile_image = newImgPath;
          }
          if (updatedUser.student) {
            updatedUser.student = {
              ...updatedUser.student,
              profile_image: newImgPath,
            };
          }
        }

        if (typeof setUser === 'function') {
          setUser(updatedUser);
        }
        syncUserToStorage(updatedUser, updatedTeacher);

        const resolvedServerUrl = resolveImageUrl(newImgPath);
        setProfileData((prev) => ({
          ...prev,
          profile_image: resolvedServerUrl || localBlobUrl,
        }));
        setInstantAvatarPreview(null);

        pushLocalNotification({
          titleKm: 'បានដូររូបថតប្រវត្តិរូប',
          titleEn: 'Profile Photo Updated',
          descKm: 'រូបថតប្រវត្តិរូបរបស់អ្នកត្រូវបានផ្លាស់ប្ដូរដោយជោគជ័យ។',
          descEn: 'Your profile photo has been updated successfully.',
          category: 'profile',
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      setInstantAvatarPreview(null);
      setProfileData((prev) => ({
        ...prev,
        profile_image: profileImgUrl,
      }));
    } finally {
      if (e.target) e.target.value = null;
    }
  };

  const handleProfileUpdate = async () => {
    if (!profileData.first_name.trim()) {
      return;
    }

    const payload = {
      first_name: profileData.first_name.trim(),
      last_name: profileData.last_name.trim(),
      email: profileData.email.trim(),
      phone: profileData.phone.trim(),
    };

    const previousUser = { ...user };
    const previousTeacher = teacherData ? { ...teacherData } : null;

    const optimisticTeacher = teacherData
      ? {
          ...teacherData,
          ...payload,
          teacher_first_name: payload.first_name,
          teacher_last_name: payload.last_name,
          teacher_email: payload.email,
          teacher_phone: payload.phone,
        }
      : null;

    const optimisticUser = {
      ...user,
      ...payload,
      ...(isTeacher
        ? {
            teacher_first_name: payload.first_name,
            teacher_last_name: payload.last_name,
            teacher_email: payload.email,
            teacher_phone: payload.phone,
          }
        : {}),
      teacher: user?.teacher ? { ...user.teacher, ...payload } : user?.teacher,
      student: user?.student ? { ...user.student, ...payload } : user?.student,
    };

    if (typeof setUser === 'function') {
      setUser(optimisticUser);
    }
    syncUserToStorage(optimisticUser, optimisticTeacher);
    setIsEditing(false);
    setIsSavingProfile(true);

    try {
      let endpoint = '/user/profile/update';
      if (isTeacher) {
        endpoint = '/teacher/profile/update';
      } else if (isStudent) {
        endpoint = '/student/profile/update';
      }

      const response = await api.put(endpoint, payload);

      if (response.data) {
        const serverData = response.data?.data || response.data?.user || response.data;
        const updatedUser = {
          ...optimisticUser,
          ...(typeof serverData === 'object' ? serverData : {}),
        };
        if (typeof setUser === 'function') {
          setUser(updatedUser);
        }
        syncUserToStorage(updatedUser, optimisticTeacher);

        pushLocalNotification({
          titleKm: 'បានកែប្រែព័ត៌មានប្រវត្តិរូប',
          titleEn: 'Profile Information Updated',
          descKm: 'ព័ត៌មានផ្ទាល់ខ្លួនរបស់អ្នកត្រូវបានរក្សាទុកដោយជោគជ័យ។',
          descEn: 'Your personal profile information has been saved.',
          category: 'profile',
        });
      }
    } catch (error) {
      console.error('Update error:', error);
      if (typeof setUser === 'function') {
        setUser(previousUser);
      }
      syncUserToStorage(previousUser, previousTeacher);
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <>
      <nav
        className={`sticky top-0 z-50 shadow-xl transition-colors duration-200 border-b ${
          isStudent
            ? 'bg-gradient-to-r from-blue-950 via-indigo-900 to-violet-950 border-indigo-500/35'
            : 'bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 border-blue-800/40'
        }`}
      >
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link
                to={dashboardPath}
                className="shrink-0 flex items-center gap-3 group"
              >
                {!logoError ? (
                  <img
                    src={logo}
                    alt="RPITSSVR Logo"
                    className="h-10 w-auto object-contain drop-shadow-lg"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center shadow-lg ring-2 ring-yellow-400/50 ${
                      isStudent ? 'bg-indigo-700' : 'bg-blue-700'
                    }`}
                  >
                    <AcademicCapIcon className="h-5 w-5 text-yellow-300" />
                  </div>
                )}
                <div>
                  <h1 className="text-lg sm:text-xl font-black text-white tracking-wide drop-shadow-sm leading-tight">
                    LMS RPITSSVR
                  </h1>
                  <p
                    className={`hidden sm:block text-[10px] font-semibold tracking-wider ${
                      isStudent ? 'text-indigo-200/85' : 'text-blue-200/80'
                    }`}
                  >
                    {t(
                      'វិទ្យាស្ថានពហុបច្ចេកទេសភូមិភាគតេជោសែនស្វាយរៀង',
                      'Regional Polytechnic Institute Techo Sen Svay Rieng'
                    )}
                  </p>
                </div>
              </Link>
            </div>

            <div className="hidden md:flex md:items-center space-x-3">
              {!isMobileViewport && <NotificationBell />}

              <button
                type="button"
                onClick={toggleTheme}
                className={`p-2.5 rounded-xl border transition-colors text-white cursor-pointer shadow-sm ${
                  isStudent
                    ? 'bg-white/10 hover:bg-white/15 border-indigo-400/35 backdrop-blur-md'
                    : 'bg-blue-800/50 hover:bg-blue-700/60 border-blue-600/30'
                }`}
                title={
                  isDarkMode
                    ? t('ប្តូរទៅទម្រង់ថ្ងៃ', 'Switch to Light Mode')
                    : t('ប្តូរទៅទម្រង់យប់', 'Switch to Dark Mode')
                }
              >
                {isDarkMode ? (
                  <SunIcon className="h-5 w-5 text-amber-300" />
                ) : (
                  <MoonIcon
                    className={`h-5 w-5 ${
                      isStudent ? 'text-indigo-200' : 'text-blue-200'
                    }`}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={toggleLanguage}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-colors text-white cursor-pointer shadow-sm ${
                  isStudent
                    ? 'bg-white/10 hover:bg-white/15 border-indigo-400/35 backdrop-blur-md'
                    : 'bg-blue-800/50 hover:bg-blue-700/60 border-blue-600/30'
                }`}
                title={
                  language === 'km' ? 'Switch to English' : 'ប្ដូរជាភាសាខ្មែរ'
                }
              >
                <GlobeAltIcon className="h-5 w-5 text-yellow-300 shrink-0" />
                <span className="text-xs font-extrabold tracking-wider uppercase text-white">
                  {language === 'km' ? 'KH' : 'EN'}
                </span>
              </button>

              <Menu as="div" className="relative ml-1.5">
                <Menu.Button
                  className="group relative flex items-center justify-center rounded-full focus:outline-none cursor-pointer"
                  title={userDisplayName}
                >
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-xs overflow-hidden shrink-0 ring-2 ring-white/25 shadow-md group-hover:ring-yellow-400 group-focus-visible:ring-yellow-400 transition-colors duration-150 ${
                      isStudent
                        ? 'bg-gradient-to-br from-indigo-500 via-blue-600 to-violet-600'
                        : 'bg-gradient-to-br from-blue-600 to-indigo-700'
                    }`}
                  >
                    {profileImgUrl && !avatarError ? (
                      <img
                        src={profileImgUrl}
                        alt="Profile"
                        className="nav-crisp-avatar h-full w-full object-cover rounded-full"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <span>{userInitials}</span>
                    )}
                  </div>
                </Menu.Button>

                <Menu.Items className="nav-menu-dropdown origin-top-right absolute right-0 mt-2.5 w-60 rounded-2xl shadow-2xl py-1.5 bg-white ring-1 ring-black/5 focus:outline-none overflow-hidden z-50 border border-gray-100">
                  <div
                    className={`nav-dropdown-header px-4 py-3 border-b border-gray-100 ${
                      isStudent
                        ? 'bg-gradient-to-r from-indigo-50 to-purple-50'
                        : 'bg-gradient-to-r from-blue-50 to-indigo-50'
                    }`}
                  >
                    <p className="text-sm font-extrabold text-gray-900 truncate">
                      {userDisplayName}
                    </p>
                    <p className="text-xs font-medium text-gray-500 truncate mt-0.5">
                      {userEmail}
                    </p>
                  </div>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        type="button"
                        onClick={openProfileModal}
                        className={`${
                          active
                            ? 'bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-400'
                            : 'text-gray-700'
                        } flex w-full items-center px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer`}
                      >
                        <UserCircleIcon
                          className={`h-5 w-5 mr-3 ${
                            active ? 'text-blue-600' : 'text-gray-400'
                          }`}
                        />
                        {t('ប្រវត្តិរូប', 'Profile')}
                      </button>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        type="button"
                        onClick={openSettingsModal}
                        className={`${
                          active
                            ? 'bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-400'
                            : 'text-gray-700'
                        } flex w-full items-center px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer`}
                      >
                        <Cog6ToothIcon
                          className={`h-5 w-5 mr-3 ${
                            active ? 'text-blue-600' : 'text-gray-400'
                          }`}
                        />
                        {t('ការកំណត់', 'Settings')}
                      </button>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        type="button"
                        onClick={handleInstantLogout}
                        className={`${
                          active
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600'
                            : 'text-rose-500'
                        } nav-soft-divider flex w-full items-center px-4 py-2.5 text-sm font-medium border-t border-gray-100 transition-colors cursor-pointer`}
                      >
                        <ArrowRightOnRectangleIcon
                          className={`h-5 w-5 mr-3 ${
                            active ? 'text-rose-600' : 'text-rose-400'
                          }`}
                        />
                        {t('ចាកចេញ', 'Logout')}
                      </button>
                    )}
                  </Menu.Item>
                </Menu.Items>
              </Menu>
            </div>

            <div className="flex items-center md:hidden gap-1.5">
              {isMobileViewport && <NotificationBell isMobile={true} />}

              <button
                type="button"
                onClick={toggleTheme}
                className={`p-2 rounded-xl text-yellow-300/80 hover:text-yellow-300 transition-colors cursor-pointer ${
                  isStudent ? 'hover:bg-white/10' : 'hover:bg-blue-800/50'
                }`}
                title={isDarkMode ? t('ថ្ងៃ', 'Light') : t('យប់', 'Dark')}
              >
                {isDarkMode ? (
                  <SunIcon className="h-5 w-5 text-amber-300" />
                ) : (
                  <MoonIcon className="h-5 w-5" />
                )}
              </button>

              <button
                type="button"
                onClick={toggleLanguage}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-yellow-300 transition-colors cursor-pointer ${
                  isStudent
                    ? 'bg-white/10 border-indigo-400/35 hover:bg-white/15'
                    : 'bg-blue-800/40 border-blue-600/30 hover:bg-blue-800/70'
                }`}
                title="Change Language"
              >
                <GlobeAltIcon className="h-4 w-4 text-yellow-300 shrink-0" />
                <span className="text-[11px] font-extrabold tracking-wider uppercase text-white">
                  {language === 'km' ? 'KH' : 'EN'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className={`inline-flex items-center justify-center p-2 rounded-xl text-yellow-300/70 hover:text-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 transition-colors cursor-pointer ${
                  isStudent ? 'hover:bg-white/10' : 'hover:bg-blue-800/50'
                }`}
              >
                {isMobileMenuOpen ? (
                  <XMarkIcon className="h-6 w-6" />
                ) : (
                  <Bars3Icon className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div
            className={`md:hidden border-t backdrop-blur-md max-h-[85vh] overflow-y-auto ${
              isStudent
                ? 'border-indigo-500/30 bg-gradient-to-b from-blue-950/98 via-indigo-950/98 to-violet-950/98'
                : 'border-blue-700/30 bg-blue-950/98'
            }`}
          >
            <div className="pt-3 pb-4 space-y-3 px-4">
              <div
                className={`p-3 rounded-2xl border flex items-center justify-between ${
                  isStudent
                    ? 'bg-white/10 border-indigo-400/30'
                    : 'bg-blue-900/60 border-blue-700/30'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-extrabold text-sm overflow-hidden ring-2 ring-white/25 shadow-md shrink-0 ${
                      isStudent
                        ? 'bg-gradient-to-br from-indigo-500 via-blue-600 to-violet-600'
                        : 'bg-gradient-to-br from-blue-600 to-indigo-700'
                    }`}
                  >
                    {profileImgUrl && !avatarError ? (
                      <img
                        src={profileImgUrl}
                        alt="Profile"
                        className="nav-crisp-avatar h-full w-full object-cover rounded-full"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <span>{userInitials}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-white truncate">
                      {userDisplayName}
                    </p>
                    <p className="text-xs text-yellow-300/70 truncate">
                      {userEmail}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border shrink-0 ${
                    isStudent
                      ? 'bg-cyan-400/20 text-cyan-200 border-cyan-300/35'
                      : 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30'
                  }`}
                >
                  {getRoleName(userRoleRaw)}
                </span>
              </div>

              <div
                className={`space-y-1.5 pt-2 border-t ${
                  isStudent ? 'border-white/15' : 'border-blue-800/40'
                }`}
              >
                <p
                  className={`text-[11px] font-extrabold uppercase tracking-wider px-2 mb-1.5 ${
                    isStudent ? 'text-cyan-300/90' : 'text-blue-300/80'
                  }`}
                >
                  {t('ម៉ឺនុយបញ្ជា', 'Navigation Menu')}
                </p>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  if (item.children) {
                    const isParentActive =
                      location.pathname.startsWith(item.path) ||
                      (item.altPaths || []).some((alt) =>
                        location.pathname.startsWith(alt)
                      );
                    const isSubOpen = openMobileSubMenu === item.path;
                    return (
                      <div key={item.path} className="space-y-1">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMobileSubMenu(isSubOpen ? null : item.path)
                          }
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition-colors cursor-pointer ${
                            isParentActive || isSubOpen
                              ? 'bg-blue-900/85 text-yellow-300 font-extrabold border border-blue-700'
                              : 'text-blue-100 hover:bg-blue-800/60 hover:text-yellow-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="h-5 w-5 shrink-0" />
                            <span>{item.name}</span>
                          </div>
                          <ChevronDownIcon
                            className={`h-4 w-4 transition-transform duration-150 ${
                              isSubOpen ? 'rotate-180 text-yellow-400' : ''
                            }`}
                          />
                        </button>
                        {isSubOpen && (
                          <div className="pl-5 pr-2 py-1 space-y-1 border-l-2 border-blue-800/70 ml-5">
                            {item.children.map((sub) => {
                              const isSubActive =
                                location.pathname === sub.path ||
                                location.pathname === sub.altPath;
                              return (
                                <Link
                                  key={sub.path}
                                  to={sub.path}
                                  onClick={() => setIsMobileMenuOpen(false)}
                                  className={`flex items-center justify-between px-3.5 py-2 rounded-xl text-[13.5px] font-bold transition-colors ${
                                    isSubActive
                                      ? 'bg-yellow-400 text-blue-950 font-extrabold shadow-sm'
                                      : 'text-blue-200 hover:bg-blue-800/50 hover:text-white'
                                  }`}
                                >
                                  <span>{sub.name}</span>
                                  {isSubActive && (
                                    <span className="h-2 w-2 rounded-full bg-blue-950"></span>
                                  )}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const isItemActive =
                    location.pathname === item.path ||
                    location.pathname.startsWith(`${item.path}/`) ||
                    (item.altPaths || []).some(
                      (alt) =>
                        location.pathname === alt ||
                        location.pathname.startsWith(`${alt}/`)
                    );

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={() =>
                        `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition-colors ${
                          isItemActive
                            ? isStudent
                              ? 'bg-white/15 text-white font-extrabold border border-indigo-400/45 shadow-md'
                              : 'bg-yellow-400 text-blue-950 font-extrabold shadow-md'
                            : isStudent
                            ? 'text-indigo-100 hover:bg-white/10 hover:text-white'
                            : 'text-blue-100 hover:bg-blue-800/60 hover:text-yellow-300'
                        }`
                      }
                    >
                      <Icon
                        className={`h-5 w-5 shrink-0 ${
                          isItemActive && isStudent ? 'text-yellow-400' : ''
                        }`}
                      />
                      <span>{item.name}</span>
                      {isItemActive && isStudent && (
                        <span className="ml-auto h-2 w-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)] shrink-0" />
                      )}
                    </NavLink>
                  );
                })}
              </div>

              <div
                className={`pt-2 border-t space-y-1 ${
                  isStudent ? 'border-white/15' : 'border-blue-800/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    openProfileModal();
                  }}
                  className={`flex items-center w-full px-3.5 py-2.5 text-[15px] font-normal rounded-xl transition-colors cursor-pointer ${
                    isStudent
                      ? 'text-indigo-100 hover:bg-white/10 hover:text-white'
                      : 'text-blue-100 hover:bg-blue-800/60 hover:text-yellow-300'
                  }`}
                >
                  <UserCircleIcon className="h-5 w-5 mr-3 text-yellow-400" />
                  {t('ប្រវត្តិរូប', 'Profile')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    openSettingsModal();
                  }}
                  className={`flex items-center w-full px-3.5 py-2.5 text-[15px] font-normal rounded-xl transition-colors cursor-pointer ${
                    isStudent
                      ? 'text-indigo-100 hover:bg-white/10 hover:text-white'
                      : 'text-blue-100 hover:bg-blue-800/60 hover:text-yellow-300'
                  }`}
                >
                  <Cog6ToothIcon className="h-5 w-5 mr-3 text-yellow-400" />
                  {t('ការកំណត់', 'Settings')}
                </button>
                <button
                  type="button"
                  onClick={handleInstantLogout}
                  className="flex items-center w-full px-3.5 py-2.5 text-[15px] font-normal text-rose-300 hover:bg-rose-900/40 rounded-xl transition-colors cursor-pointer"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5 mr-3 text-rose-400" />
                  {t('ចាកចេញ', 'Logout')}
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* ផ្ទាំង MODAL ប្រវត្តិរូប (PROFILE MODAL)                             */}
      {/* ------------------------------------------------------------------ */}
      <Dialog
        as="div"
        className="relative z-50"
        open={isProfileModalOpen}
        onClose={closeProfileModal}
      >
        <div
          className="fixed inset-0 bg-blue-950/60 backdrop-blur-sm"
          aria-hidden="true"
        />

        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
          <Dialog.Panel className="nav-modal-panel w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            <div className="nav-soft-divider flex justify-between items-center p-6 sm:p-8 border-b border-gray-100 shrink-0">
              <Dialog.Title
                as="h3"
                className="text-xl font-extrabold text-gray-900 flex items-center gap-3"
              >
                <div className="nav-icon-badge h-10 w-10 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100 shadow-sm">
                  <UserCircleIcon className="h-6 w-6" />
                </div>
                {t('ប្រវត្តិរូប', 'Profile')}
              </Dialog.Title>
              <button
                type="button"
                onClick={closeProfileModal}
                className="p-2.5 rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto flex-1">
              <div className="flex flex-col items-center mb-8">
                <div className="relative group">
                  <div
                    className={`h-32 w-32 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-xl ring-4 ring-blue-50 overflow-hidden ${
                      isStudent
                        ? 'bg-gradient-to-br from-indigo-600 via-blue-600 to-violet-600'
                        : 'bg-gradient-to-br from-blue-600 to-indigo-600'
                    }`}
                  >
                    {profileData.profile_image && !avatarError ? (
                      <img
                        src={profileData.profile_image}
                        alt="Profile"
                        className="nav-crisp-avatar h-full w-full object-cover"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <span>{userInitials}</span>
                    )}
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`absolute bottom-1 right-1 p-3 rounded-full text-white transition-colors shadow-lg cursor-pointer ${
                      isStudent
                        ? 'bg-indigo-600 hover:bg-indigo-700'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                    title={t('ដូររូបភាព', 'Change Image')}
                  >
                    <CameraIcon className="h-5 w-5" />
                  </button>
                </div>

                <h4 className="mt-5 text-2xl font-black text-gray-900 tracking-tight">
                  {`${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() ||
                    userDisplayName}
                </h4>
                <span className="nav-role-pill inline-flex items-center px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-50 border border-blue-100 text-blue-700 mt-2.5">
                  {getRoleName(userRoleRaw)}
                </span>
              </div>

              {!isEditing ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-gray-50/70 rounded-2xl p-5 border border-gray-100 flex items-start gap-3.5">
                      <UserIcon className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-gray-500 mb-1">
                          {t('ឈ្មោះពេញ', 'Full Name')}
                        </p>
                        <p className="text-sm font-extrabold text-gray-900">
                          {`${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() ||
                            '—'}
                        </p>
                      </div>
                    </div>

                    <div className="bg-gray-50/70 rounded-2xl p-5 border border-gray-100 flex items-start gap-3.5">
                      <EnvelopeIcon className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-gray-500 mb-1">
                          {t('អ៊ីមែល', 'Email')}
                        </p>
                        <p className="text-sm font-extrabold text-gray-900 break-all">
                          {profileData.email}
                        </p>
                      </div>
                    </div>

                    <div className="bg-gray-50/70 rounded-2xl p-5 border border-gray-100 flex items-start gap-3.5">
                      <PhoneIcon className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-gray-500 mb-1">
                          {t('លេខទូរស័ព្ទ', 'Phone')}
                        </p>
                        <p className="text-sm font-extrabold text-gray-900">
                          {profileData.phone || '—'}
                        </p>
                      </div>
                    </div>

                    <div className="bg-gray-50/70 rounded-2xl p-5 border border-gray-100 flex items-start gap-3.5">
                      <BuildingOfficeIcon className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-gray-500 mb-1">
                          {t('តួនាទី', 'Role')}
                        </p>
                        <p className="text-sm font-extrabold text-gray-900">
                          {getRoleName(userRoleRaw)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="nav-status-banner bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-6 border border-emerald-100/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold text-emerald-600 mb-2">
                        {t('ស្ថានភាពគណនី', 'Account Status')}
                      </p>
                      <span className="inline-flex items-center px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-emerald-700 shadow-sm border border-emerald-100">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                        {t('សកម្ម', 'Active')}
                      </span>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-xs font-bold text-emerald-600 mb-2">
                        {t('សមាជិកចាប់តាំងពី', 'Member Since')}
                      </p>
                      <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
                        {userCreatedAtFormatted}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="nav-edit-box bg-blue-50/40 p-6 rounded-2xl border border-blue-100 space-y-5">
                  <div className="flex items-center gap-2 mb-2">
                    <PencilIcon className="h-5 w-5 text-blue-600" />
                    <h4 className="text-sm font-extrabold text-gray-900">
                      {t(
                        'កែប្រែព័ត៌មានផ្ទាល់ខ្លួន',
                        'Edit Personal Information'
                      )}
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">
                        {t('នាមខ្លួន', 'First Name')}
                      </label>
                      <input
                        type="text"
                        className="w-full px-4 py-3.5 border border-gray-200 rounded-xl bg-white font-bold text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        value={profileData.first_name}
                        onChange={(e) =>
                          setProfileData({
                            ...profileData,
                            first_name: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">
                        {t('នាមត្រកូល', 'Last Name')}
                      </label>
                      <input
                        type="text"
                        className="w-full px-4 py-3.5 border border-gray-200 rounded-xl bg-white font-bold text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        value={profileData.last_name}
                        onChange={(e) =>
                          setProfileData({
                            ...profileData,
                            last_name: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">
                        {t('អ៊ីមែល', 'Email')}
                      </label>
                      <input
                        type="email"
                        className="w-full px-4 py-3.5 border border-gray-200 rounded-xl bg-white font-bold text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        value={profileData.email}
                        onChange={(e) =>
                          setProfileData({
                            ...profileData,
                            email: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">
                        {t('លេខទូរស័ព្ទ', 'Phone')}
                      </label>
                      <input
                        type="tel"
                        className="w-full px-4 py-3.5 border border-gray-200 rounded-xl bg-white font-bold text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        value={profileData.phone}
                        onChange={(e) =>
                          setProfileData({
                            ...profileData,
                            phone: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="nav-soft-divider p-6 sm:p-8 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50 shrink-0">
              {!isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={closeProfileModal}
                    className="px-6 py-3.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer"
                  >
                    {t('បិទ', 'Close')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-3.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <PencilIcon className="h-4 w-4" />
                    {t('កែប្រែប្រវត្តិរូប', 'Edit Profile')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-6 py-3.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer"
                    disabled={isSavingProfile}
                  >
                    {t('បោះបង់', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleProfileUpdate}
                    disabled={isSavingProfile}
                    className="px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer"
                  >
                    {isSavingProfile ? (
                      <ArrowPathIcon className="h-5 w-5 animate-spin" />
                    ) : (
                      <ShieldCheckIcon className="h-5 w-5" />
                    )}
                    {t('រក្សាទុកការកែប្រែ', 'Save Changes')}
                  </button>
                </>
              )}
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* ផ្ទាំង MODAL ការកំណត់ (SETTINGS MODAL)                               */}
      {/* ------------------------------------------------------------------ */}
      <Dialog
        as="div"
        className="relative z-50"
        open={isSettingsModalOpen}
        onClose={closeSettingsModal}
      >
        <div
          className="fixed inset-0 bg-blue-950/60 backdrop-blur-sm p-4"
          aria-hidden="true"
        />

        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
          <Dialog.Panel className="nav-modal-panel w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            <div className="nav-soft-divider flex justify-between items-center p-6 sm:p-8 border-b border-gray-100 shrink-0">
              <Dialog.Title
                as="h3"
                className="text-xl font-extrabold text-gray-900 flex items-center gap-3"
              >
                <div className="nav-icon-badge h-10 w-10 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100 shadow-sm">
                  <Cog6ToothIcon className="h-6 w-6" />
                </div>
                {t('ការកំណត់', 'Settings')}
              </Dialog.Title>
              <button
                type="button"
                onClick={closeSettingsModal}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto flex-1">
              <div className="space-y-8">
                {/* ១. ជម្រើសភាសា */}
                <section>
                  <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <GlobeAltIcon className="h-5 w-5 text-blue-600" />
                    {t('ភាសា (Language)', 'Language')}
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        if (language !== 'km') toggleLanguage();
                      }}
                      className={`nav-option-btn flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-colors font-bold text-sm cursor-pointer ${
                        language === 'km'
                          ? 'nav-option-active border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border-gray-100 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span>ខ្មែរ (KH)</span>
                      {language === 'km' && (
                        <span className="text-blue-600">✓</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (language !== 'en') toggleLanguage();
                      }}
                      className={`nav-option-btn flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-colors font-bold text-sm cursor-pointer ${
                        language === 'en'
                          ? 'nav-option-active border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border-gray-100 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span>English (EN)</span>
                      {language === 'en' && (
                        <span className="text-blue-600">✓</span>
                      )}
                    </button>
                  </div>
                </section>

                {/* ២. ជម្រើសពណ៌ផ្ទៃអេក្រង់ ថ្ងៃ-យប់ */}
                <section className="nav-soft-divider pt-6 border-t border-gray-100">
                  <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                    {isDarkMode ? (
                      <MoonIcon className="h-5 w-5 text-indigo-600" />
                    ) : (
                      <SunIcon className="h-5 w-5 text-amber-500" />
                    )}
                    {t('ទម្រង់ពណ៌អេក្រង់ (Theme Mode)', 'Theme Mode')}
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setIsDarkMode(false)}
                      className={`nav-option-btn flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl border-2 transition-colors font-bold text-sm cursor-pointer ${
                        !isDarkMode
                          ? 'nav-option-active border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border-gray-100 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <SunIcon className="h-5 w-5 text-amber-500" />
                      <span>{t('ទម្រង់ថ្ងៃ (Light)', 'Light Mode')}</span>
                      {!isDarkMode && <span className="text-blue-600">✓</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsDarkMode(true)}
                      className={`nav-option-btn flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl border-2 transition-colors font-bold text-sm cursor-pointer ${
                        isDarkMode
                          ? 'nav-option-active border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border-gray-100 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <MoonIcon className="h-5 w-5 text-indigo-600" />
                      <span>{t('ទម្រង់យប់ (Dark)', 'Dark Mode')}</span>
                      {isDarkMode && <span className="text-blue-600">✓</span>}
                    </button>
                  </div>
                </section>

                {/* ✅ ៣. ភ្ជាប់ ឬប្ដូរគណនី Telegram */}
                <section className="nav-soft-divider pt-6 border-t border-gray-100">
                  <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <PaperAirplaneIcon className="h-5 w-5 text-sky-500 -rotate-45" />
                    {t(
                      'ភ្ជាប់គណនី Telegram (Telegram Integration)',
                      'Telegram Account Integration'
                    )}
                  </h4>
                  <div className="nav-edit-box bg-sky-50/50 rounded-2xl p-4 border border-sky-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-extrabold text-gray-900">
                        {isTelegramLinked
                          ? t(
                              'បានភ្ជាប់ជាមួយគណនី Telegram រួចរាល់',
                              'Telegram Account Connected'
                            )
                          : t(
                              'មិនទាន់បានភ្ជាប់គណនី Telegram នៅឡើយទេ',
                              'Telegram Account Not Linked Yet'
                            )}
                      </p>
                      <p className="text-xs font-medium text-gray-500 mt-1">
                        {t(
                          'ទទួលលេខកូដសុវត្ថិភាព ៦ ខ្ទង់តាមរយៈ Telegram Bot រាល់ពេលចូលប្រព័ន្ធ។',
                          'Receive 6-digit verification codes via Telegram Bot when signing in.'
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {isTelegramLinked && (
                        <span className="nav-connected-badge inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckBadgeIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>{t('បានភ្ជាប់រួចរាល់', 'Connected')}</span>
                        </span>
                      )}

                      {telegramLinkUrl && (
                        <a
                          href={telegramLinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setWaitingTelegramLink(true)}
                          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                            isTelegramLinked
                              ? 'nav-switch-tg-btn bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 shadow-2xs'
                              : 'text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-sm'
                          }`}
                        >
                          {waitingTelegramLink ? (
                            <ArrowPathIcon className="h-4 w-4 animate-spin shrink-0" />
                          ) : (
                            <PaperAirplaneIcon className="h-4 w-4 -rotate-45 shrink-0" />
                          )}
                          <span>
                            {waitingTelegramLink
                              ? t(
                                  'សូមចុច Start ក្នុង Telegram...',
                                  'Press Start in Telegram...'
                                )
                              : isTelegramLinked
                              ? t('ប្ដូរ Telegram ថ្មី', 'Switch Telegram')
                              : t('ភ្ជាប់ Telegram', 'Connect Telegram')}
                          </span>
                        </a>
                      )}
                    </div>
                  </div>
                </section>

                {/* ៤. ព័ត៌មានគណនី */}
                <section className="nav-soft-divider pt-6 border-t border-gray-100">
                  <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <UserGroupIcon className="h-5 w-5 text-blue-600" />
                    {t('ព័ត៌មានគណនី', 'Account Information')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        {t('ឈ្មោះពេញ', 'Full Name')}
                      </p>
                      <p className="text-sm font-extrabold text-gray-900">
                        {userDisplayName}
                      </p>
                    </div>
                    <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        {t('អ៊ីមែល', 'Email')}
                      </p>
                      <p className="text-sm font-extrabold text-gray-900 break-all">
                        {userEmail}
                      </p>
                    </div>
                    <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        {t('តួនាទី', 'Role')}
                      </p>
                      <p className="text-sm font-extrabold text-blue-700 dark:text-blue-400">
                        {getRoleName(userRoleRaw)}
                      </p>
                    </div>
                    <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        {t('លេខទូរស័ព្ទ', 'Phone')}
                      </p>
                      <p className="text-sm font-extrabold text-gray-900">
                        {userPhone || '—'}
                      </p>
                    </div>
                  </div>
                </section>

                {/* ៥. ផ្លាស់ប្តូរពាក្យសម្ងាត់ */}
                <section className="nav-soft-divider pt-6 border-t border-gray-100">
                  <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <KeyIcon className="h-5 w-5 text-blue-600" />
                    {t('កែប្រែពាក្យសម្ងាត់', 'Change Password')}
                  </h4>
                  <form
                    id="settingsForm"
                    onSubmit={handlePasswordUpdate}
                    className="space-y-4 bg-gray-50/30 p-5 rounded-2xl border border-gray-100"
                  >
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">
                        {t('ពាក្យសម្ងាត់បច្ចុប្បន្ន', 'Current Password')}{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? 'text' : 'password'}
                          name="current_password"
                          required
                          value={passwordData.current_password}
                          onChange={handlePasswordChange}
                          className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 font-medium shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowCurrentPassword(!showCurrentPassword)
                          }
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-blue-600 cursor-pointer"
                        >
                          {showCurrentPassword ? (
                            <EyeSlashIcon className="h-5 w-5" />
                          ) : (
                            <EyeIcon className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">
                          {t('ពាក្យសម្ងាត់ថ្មី', 'New Password')}{' '}
                          <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            name="new_password"
                            required
                            value={passwordData.new_password}
                            onChange={handlePasswordChange}
                            className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 font-medium shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-blue-600 cursor-pointer"
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
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">
                          {t('បញ្ជាក់ពាក្យសម្ងាត់ថ្មី', 'Confirm New Password')}{' '}
                          <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            name="new_password_confirmation"
                            required
                            value={passwordData.new_password_confirmation}
                            onChange={handlePasswordChange}
                            className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 font-medium shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-blue-600 cursor-pointer"
                          >
                            {showConfirmPassword ? (
                              <EyeSlashIcon className="h-5 w-5" />
                            ) : (
                              <EyeIcon className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {passwordFormError && (
                      <div className="flex items-start gap-1.5 text-rose-600 dark:text-rose-400 pt-1">
                        <ExclamationCircleIcon className="h-4 w-4 shrink-0 mt-0.5 stroke-[2.2]" />
                        <p className="text-xs font-bold leading-snug">
                          {passwordFormError}
                        </p>
                      </div>
                    )}
                  </form>
                </section>
              </div>
            </div>

            <div className="nav-soft-divider p-6 sm:p-8 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50 shrink-0">
              <button
                type="button"
                onClick={closeSettingsModal}
                className="px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer shadow-sm"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                type="submit"
                form="settingsForm"
                disabled={isSavingPassword}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 rounded-xl text-sm font-bold shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isSavingPassword ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                ) : (
                  <ShieldCheckIcon className="h-5 w-5" />
                )}
                {isSavingPassword
                  ? t('កំពុងរក្សាទុក...', 'Saving...')
                  : t('ផ្លាស់ប្តូរពាក្យសម្ងាត់', 'Change Password')}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      <style>{`
        .nav-crisp-avatar {
          backface-visibility: hidden;
          transform: translateZ(0);
        }
        html.dark body, html.dark .bg-gray-50 { background-color: #0f172a !important; color: #f1f5f9 !important; }
        html.dark .bg-white { background-color: #1e293b !important; color: #f1f5f9 !important; }
        html.dark .bg-gray-50\\/50, html.dark .bg-gray-50\\/70, html.dark .bg-gray-50\\/30 { background-color: #0f172a !important; }
        html.dark .nav-menu-dropdown, html.dark .nav-modal-panel { background-color: #1e293b !important; border-color: #334155 !important; }
        html.dark .nav-soft-divider { border-color: rgba(51, 65, 85, 0.7) !important; }
        html.dark .nav-dropdown-header, html.dark .nav-icon-badge, html.dark .nav-role-pill, html.dark .nav-edit-box { background: rgba(30, 58, 138, 0.25) !important; border-color: rgba(59, 130, 246, 0.3) !important; color: #93c5fd !important; }
        html.dark .nav-status-banner { background: rgba(6, 78, 59, 0.25) !important; border-color: rgba(16, 185, 129, 0.3) !important; }
        html.dark .nav-connected-badge { background-color: rgba(16, 185, 129, 0.15) !important; border-color: rgba(16, 185, 129, 0.35) !important; color: #34d399 !important; }
        html.dark .nav-switch-tg-btn { background-color: #0f172a !important; border-color: rgba(56, 189, 248, 0.35) !important; color: #38bdf8 !important; }
        html.dark .nav-switch-tg-btn:hover { background-color: rgba(56, 189, 248, 0.15) !important; }
        html.dark .nav-option-btn { background-color: #0f172a !important; border-color: #334155 !important; color: #cbd5e1 !important; }
        html.dark .nav-option-active { background-color: rgba(37, 99, 235, 0.2) !important; border-color: #3b82f6 !important; color: #60a5fa !important; }
        html.dark .text-gray-900, html.dark .text-gray-800 { color: #f8fafc !important; }
        html.dark .text-gray-700, html.dark .text-gray-600 { color: #cbd5e1 !important; }
        html.dark .text-gray-500 { color: #94a3b8 !important; }
        html.dark .border-gray-100, html.dark .border-gray-200 { border-color: #334155 !important; }
        html.dark input, html.dark select, html.dark textarea { background-color: #0f172a !important; color: #f8fafc !important; border-color: #334155 !important; }
      `}</style>
    </>
  );
};

export default React.memo(Navbar);
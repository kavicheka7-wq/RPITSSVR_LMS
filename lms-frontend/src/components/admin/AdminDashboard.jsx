// src/components/admin/AdminDashboard.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { 
  UsersIcon, 
  BookOpenIcon, 
  AcademicCapIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  BuildingLibraryIcon,
  ChevronRightIcon,
  CheckBadgeIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យល្បឿនលឿន (User-Scoped 0ms Cache & Prefetcher)
// ============================================================================
const LAST_ACTIVE_ADMIN_UID_KEY = 'lms_last_active_admin_uid';
const CACHE_KEY_SHARED_STATS = 'cached_admin_stats';
const CACHE_KEY_SHARED_USERS = 'cached_admin_recent_users';

const getStatsCacheKey = (uid) => `cached_admin_dashboard_stats_v8_${uid}`;
const getUsersCacheKey = (uid) => `cached_admin_recent_users_v8_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់អ្នកគ្រប់គ្រងម្នាក់ៗ
const ADMIN_DASH_MEM_CACHE = {
  uid: null,
  stats: null,
  recentUsers: null,
  lastSyncedAt: 0,
  prefetchedUid: null,
};

const readStorageJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// ✅ អនុគមន៍បិទបាំងផ្នែកកណ្ដាលនៃអ៊ីមែល (ឧ. "classit830@gmail.com" -> "cla*****30@gmail.com")
const maskEmailAddress = (email) => {
  if (!email || typeof email !== 'string' || !email.includes('@')) return email || '';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) return `${localPart[0] || '*'}***@${domain}`;
  if (localPart.length <= 4) return `${localPart.slice(0, 2)}***@${domain}`;
  return `${localPart.slice(0, 3)}*****${localPart.slice(-2)}@${domain}`;
};

// ✅ អនុគមន៍ចាប់យកអត្តសញ្ញាណអ្នកគ្រប់គ្រងឱ្យជាក់លាក់តាំងពីវិនាទីដំបូង
const resolveAdminUid = (contextUser) => {
  if (contextUser) {
    const id =
      contextUser.id ||
      contextUser.user_id ||
      contextUser.admin?.id ||
      contextUser.email;
    if (id) return String(id);
  }
  try {
    const raw =
      localStorage.getItem('user') || localStorage.getItem('auth_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      const u = parsed?.user || parsed?.data || parsed;
      const id = u?.id || u?.user_id || u?.admin?.id || u?.email;
      if (id) return String(id);
    }
  } catch {}
  return 'default_admin';
};

// ✅ អនុគមន៍សម្អាត Cache ចាស់របស់ Admin មុន នៅពេលមាន Admin ថ្មី Login ចូលលើ Browser តែមួយ
const ensureCleanAdminSessionCache = (newUid) => {
  if (!newUid || newUid === 'default_admin') return;
  try {
    const prevUid = localStorage.getItem(LAST_ACTIVE_ADMIN_UID_KEY);
    if (prevUid && prevUid !== String(newUid)) {
      const sharedAdminKeys = [
        'cached_admin_stats',
        'cached_admin_recent_users',
        'cached_admin_users_list',
        'cached_admin_students_list',
        'cached_admin_teachers_list',
        'cached_admin_courses_list',
        'cached_admin_departments_list',
      ];
      sharedAdminKeys.forEach((k) => localStorage.removeItem(k));
    }
    localStorage.setItem(LAST_ACTIVE_ADMIN_UID_KEY, String(newUid));
  } catch (e) {}
};

// ✅ អនុគមន៍ទាញទិន្នន័យគ្រប់ទំព័ររបស់ Admin ទុកមុននៅផ្ទៃខាងក្រោយ (Background Prefetch)
const prefetchAllAdminPagesData = (uid) => {
  if (!uid || uid === 'default_admin') return;
  if (ADMIN_DASH_MEM_CACHE.prefetchedUid === uid) return;
  ADMIN_DASH_MEM_CACHE.prefetchedUid = uid;

  setTimeout(() => {
    api
      .get('/admin/departments')
      .then((res) => {
        const data = res.data?.data || res.data || [];
        if (Array.isArray(data)) {
          try {
            localStorage.setItem(
              `cached_admin_departments_list_v8_${uid}`,
              JSON.stringify(data)
            );
            localStorage.setItem(
              'cached_admin_departments_list',
              JSON.stringify(data)
            );
          } catch {}
        }
      })
      .catch(() => {});

    api
      .get('/admin/courses')
      .then((res) => {
        const data = res.data?.data || res.data || [];
        if (Array.isArray(data)) {
          try {
            localStorage.setItem(
              `cached_admin_courses_list_v8_${uid}`,
              JSON.stringify(data)
            );
            localStorage.setItem(
              'cached_admin_courses_list',
              JSON.stringify(data)
            );
          } catch {}
        }
      })
      .catch(() => {});

    api
      .get('/admin/teachers')
      .then((res) => {
        const data = res.data?.data || res.data || [];
        if (Array.isArray(data)) {
          try {
            localStorage.setItem(
              `cached_admin_teachers_list_v8_${uid}`,
              JSON.stringify(data)
            );
            localStorage.setItem(
              'cached_admin_teachers_list',
              JSON.stringify(data)
            );
          } catch {}
        }
      })
      .catch(() => {});

    api
      .get('/admin/students')
      .then((res) => {
        const data = res.data?.data || res.data || [];
        if (Array.isArray(data)) {
          try {
            localStorage.setItem(
              `cached_admin_students_list_v8_${uid}`,
              JSON.stringify(data)
            );
            localStorage.setItem(
              'cached_admin_students_list',
              JSON.stringify(data)
            );
          } catch {}
        }
      })
      .catch(() => {});
  }, 200);
};

const AdminDashboard = () => {
  const { t, language } = useLanguage();
  const { getFullName, user } = useAuth();
  const [failedAvatars, setFailedAvatars] = useState({});
  const [revealedEmails, setRevealedEmails] = useState({});

  const toggleEmailVisibility = useCallback((userId) => {
    setRevealedEmails((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  }, []);

  // ✅ អនុគមន៍បម្លែងទីតាំងរូបភាពឱ្យគាំទ្រទាំង Base64 Data URI ក្នុង Database លើ Railway និង URL ធម្មតា
  const resolveImageUrl = useCallback((rawPath) => {
    if (!rawPath || typeof rawPath !== 'string') return null;
    const trimmed = rawPath.trim();
    if (!trimmed) return null;
    if (
      trimmed.startsWith('data:') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('blob:')
    ) {
      return trimmed;
    }
    const baseUrl = (
      import.meta.env.VITE_API_URL || 'http://localhost:8000'
    ).replace(/\/api\/?$/, '');
    const cleanPath = trimmed.replace(/^\/?storage\//, '').replace(/^\/+/, '');
    return `${baseUrl}/storage/${cleanPath}`;
  }, []);

  // ✅ កំណត់អត្តសញ្ញាណ Admin បច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentAdminId = useMemo(() => {
    const uid = resolveAdminUid(user);
    ensureCleanAdminSessionCache(uid);
    return uid;
  }, [user]);

  if (
    ADMIN_DASH_MEM_CACHE.uid &&
    ADMIN_DASH_MEM_CACHE.uid !== currentAdminId
  ) {
    ADMIN_DASH_MEM_CACHE.stats = null;
    ADMIN_DASH_MEM_CACHE.recentUsers = null;
    ADMIN_DASH_MEM_CACHE.lastSyncedAt = 0;
  }
  ADMIN_DASH_MEM_CACHE.uid = currentAdminId;

  // ✅ ១. អានពី Cache ភ្លាមៗក្នុង 0 វិនាទី (គ្មាន Skeleton Loading)
  const [stats, setStats] = useState(() => {
    if (ADMIN_DASH_MEM_CACHE.stats) return ADMIN_DASH_MEM_CACHE.stats;
    const cached =
      readStorageJson(getStatsCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_STATS, {});
    if (cached) ADMIN_DASH_MEM_CACHE.stats = cached;
    return cached || {};
  });

  const [recentUsers, setRecentUsers] = useState(() => {
    if (Array.isArray(ADMIN_DASH_MEM_CACHE.recentUsers)) {
      return ADMIN_DASH_MEM_CACHE.recentUsers;
    }
    const cached =
      readStorageJson(getUsersCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_USERS, []);
    if (Array.isArray(cached)) {
      ADMIN_DASH_MEM_CACHE.recentUsers = cached;
      return cached;
    }
    return [];
  });

  // ✅ ធ្វើបច្ចុប្បន្នភាពរូបភាពប្រវត្តិរូបរបស់ Admin បច្ចុប្បន្នក្នុងតារាង Recent Users ភ្លាមៗនៅពេលប្ដូររូបលើ Navbar
  useEffect(() => {
    if (!user?.id || !user?.profile_image) return;
    setFailedAvatars((prev) => {
      if (!prev[user.id]) return prev;
      const next = { ...prev };
      delete next[user.id];
      return next;
    });
    setRecentUsers((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      let changed = false;
      const updated = prev.map((item) => {
        if (
          Number(item.id) === Number(user.id) &&
          item.profile_image !== user.profile_image
        ) {
          changed = true;
          return { ...item, profile_image: user.profile_image };
        }
        return item;
      });
      if (changed) {
        ADMIN_DASH_MEM_CACHE.recentUsers = updated;
        try {
          localStorage.setItem(
            getUsersCacheKey(currentAdminId),
            JSON.stringify(updated)
          );
          localStorage.setItem(
            CACHE_KEY_SHARED_USERS,
            JSON.stringify(updated)
          );
        } catch {}
      }
      return changed ? updated : prev;
    });
  }, [user?.id, user?.profile_image, currentAdminId]);

  // ✅ បម្លែង និងចាប់ទិន្នន័យ Chart ភ្លាមៗដោយប្រើ useMemo
  const chartData = useMemo(() => {
    if (
      stats?.chart_data &&
      Array.isArray(stats.chart_data) &&
      stats.chart_data.length > 0
    ) {
      return stats.chart_data;
    }
    const months = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const monthNameEn = m.toLocaleString('en-US', { month: 'short' });
      const monthNameKm = m.toLocaleString('km-KH', { month: 'short' });
      months.push({
        month: language === 'km' ? monthNameKm : monthNameEn,
        users: 0,
        courses: 0,
      });
    }
    return months;
  }, [stats, language]);

  // ============================================================================
  // 📌 ផ្នែកទី២៖ ទាញយកទិន្នន័យដោយឯករាជ្យមិនរង់ចាំគ្នា (Non-Blocking 0ms Sync)
  // ============================================================================
  const fetchDashboardData = useCallback(() => {
    // ទាញទិន្នន័យទំព័រផ្សេងៗរបស់ Admin ទុកមុននៅផ្ទៃខាងក្រោយភ្លាមៗ
    prefetchAllAdminPagesData(currentAdminId);

    const cachedSt = readStorageJson(getStatsCacheKey(currentAdminId), null);
    const cachedUs = readStorageJson(getUsersCacheKey(currentAdminId), null);

    if (cachedSt && Object.keys(cachedSt).length > 0) {
      setStats(cachedSt);
      ADMIN_DASH_MEM_CACHE.stats = cachedSt;
    }
    if (Array.isArray(cachedUs)) {
      setRecentUsers(cachedUs);
      ADMIN_DASH_MEM_CACHE.recentUsers = cachedUs;
    }

    const now = Date.now();
    if (
      ADMIN_DASH_MEM_CACHE.uid === currentAdminId &&
      ADMIN_DASH_MEM_CACHE.stats &&
      Object.keys(ADMIN_DASH_MEM_CACHE.stats).length > 0 &&
      Array.isArray(ADMIN_DASH_MEM_CACHE.recentUsers) &&
      now - ADMIN_DASH_MEM_CACHE.lastSyncedAt < 25000
    ) {
      return;
    }

    api
      .get('/admin/stats')
      .then((res) => {
        const newStats = res.data?.data || res.data || {};
        setStats(newStats);
        ADMIN_DASH_MEM_CACHE.uid = currentAdminId;
        ADMIN_DASH_MEM_CACHE.stats = newStats;
        ADMIN_DASH_MEM_CACHE.lastSyncedAt = Date.now();
        try {
          localStorage.setItem(
            getStatsCacheKey(currentAdminId),
            JSON.stringify(newStats)
          );
          localStorage.setItem(
            CACHE_KEY_SHARED_STATS,
            JSON.stringify(newStats)
          );
        } catch (e) {
          console.warn('Failed to cache admin stats:', e);
        }
      })
      .catch((err) => {
        console.error('Stats API error:', err);
      });

    api
      .get('/admin/users?per_page=5')
      .then((res) => {
        const rawUsers = res.data?.data || res.data || [];
        const fetchedUsers = Array.isArray(rawUsers) ? rawUsers : [];
        setRecentUsers(fetchedUsers);
        ADMIN_DASH_MEM_CACHE.recentUsers = fetchedUsers;
        try {
          localStorage.setItem(
            getUsersCacheKey(currentAdminId),
            JSON.stringify(fetchedUsers)
          );
          localStorage.setItem(
            CACHE_KEY_SHARED_USERS,
            JSON.stringify(fetchedUsers)
          );
        } catch (e) {
          console.warn('Failed to cache recent users:', e);
        }
      })
      .catch((err) => {
        console.error('Users API error:', err);
      });
  }, [currentAdminId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const statCards = [
    { 
      title: t('អ្នកប្រើប្រាស់សរុប', 'Total Users'), 
      value: stats?.total_users ?? 0, 
      icon: UsersIcon, 
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      themeClass: 'admin-stat-blue',
      link: '/admin/users'
    },
    { 
      title: t('សិស្សសរុប', 'Total Students'), 
      value: stats?.total_students ?? 0, 
      icon: UserGroupIcon, 
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-600',
      themeClass: 'admin-stat-emerald',
      link: '/admin/students'
    },
    { 
      title: t('គ្រូបង្រៀន', 'Teachers'), 
      value: stats?.total_teachers ?? 0, 
      icon: AcademicCapIcon, 
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-600',
      themeClass: 'admin-stat-amber',
      link: '/admin/teachers'
    },
    { 
      title: t('មុខវិជ្ជា', 'Courses'), 
      value: stats?.total_courses ?? 0, 
      icon: BookOpenIcon, 
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600',
      themeClass: 'admin-stat-purple',
      link: '/admin/courses'
    },
    { 
      title: t('ដេប៉ាតឺម៉ង់', 'Departments'), 
      value: stats?.total_departments ?? 0, 
      icon: BuildingLibraryIcon, 
      bgColor: 'bg-cyan-50',
      textColor: 'text-cyan-600',
      themeClass: 'admin-stat-cyan',
      link: '/admin/departments'
    },
  ];

  const getRoleBadgeName = (roleName) => {
    if (language === 'km') {
      switch(roleName) {
        case 'Admin': return 'អ្នកគ្រប់គ្រង';
        case 'Teacher': return 'គ្រូបង្រៀន';
        case 'Student': return 'សិស្ស';
        default: return roleName || 'អ្នកប្រើប្រាស់';
      }
    }
    return roleName || 'User';
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-5 sm:space-y-8 pb-8 sm:pb-10 animate-fadeIn">
      
      {/* ✅ Banner - រៀបចំថ្មីឱ្យស្អាត ស្រឡះ សមរម្យសម្រាប់ Phone និង Tablet */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-blue-950 via-indigo-900 to-slate-950 p-5 sm:p-8 md:p-10 border border-blue-800/30 shadow-xl">
        <div className="absolute top-0 right-0 w-64 sm:w-96 h-64 sm:h-96 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-60 sm:w-80 h-60 sm:h-80 bg-indigo-500/10 rounded-full blur-3xl -ml-24 -mb-24"></div>
        
        {/* រូប Watermark សាលាព្រាលៗនៅផ្ទៃខាងក្រោយខាងស្តាំ */}
        <BuildingLibraryIcon className="absolute -right-6 -bottom-10 w-44 sm:w-64 h-44 sm:h-64 text-white/[0.04] -rotate-12 pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 sm:gap-8">
          <div className="space-y-3.5 sm:space-y-4">
            
            {/* ស្លាកឈ្មោះសាលា (School Identity Badge) */}
            <div className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-200 text-[11px] sm:text-xs font-extrabold tracking-wide shadow-inner max-w-full">
              <BuildingLibraryIcon className="h-4 w-4 text-yellow-400 shrink-0" />
              <span className="truncate">{t('វិទ្យាស្ថានពហុបច្ចេកទេសភូមិភាគតេជោសែនស្វាយរៀង', 'Regional Polytechnic Institute Techo Sen Svay Rieng')}</span>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <h1 className="text-[22px] sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight flex flex-wrap items-center gap-x-2.5 gap-y-1.5 leading-snug">
                <span>{t('ផ្ទាំងគ្រប់គ្រងប្រព័ន្ធ', 'System Dashboard')}</span>
                <span className="inline-flex items-center gap-2 text-blue-400">
                  <span>{getFullName() || user?.name || 'Admin'}</span>
                  <span className="inline-flex items-center justify-center p-1 sm:p-1.5 rounded-xl sm:rounded-2xl bg-blue-500/15 border border-blue-400/30 shadow-inner shrink-0">
                    <CheckBadgeIcon className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8 text-yellow-400 stroke-[2.2]" />
                  </span>
                </span>
              </h1>
              <p className="text-xs sm:text-sm md:text-base text-blue-100/75 max-w-xl leading-relaxed">
                {t('គ្រប់គ្រងអ្នកប្រើប្រាស់ គ្រូបង្រៀន សិស្ស មុខវិជ្ជា និងទិន្នន័យស្ថិតិសាលាទាំងមូល។', 'Manage users, teachers, students, courses, and institution-wide analytics.')}
              </p>
            </div>

            {/* កាលបរិច្ឆេទ និងស្ថានភាពប្រព័ន្ធ (ដាក់ជួរជាមួយគ្នាយ៉ាងស្អាតលើ Phone) */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-blue-200/80 font-medium pt-0.5 sm:pt-1">
              <span className="inline-flex items-center gap-1.5 bg-white/5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-white/10 backdrop-blur-sm">
                <ClockIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-400 shrink-0" />
                <span>{new Date().toLocaleDateString(language === 'km' ? 'km-KH' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </span>
            </div>
          </div>

          {/* កាតរូបភាព/និមិត្តសញ្ញាសាលា (លាក់លើទូរស័ព្ទដើម្បីកុំឱ្យចង្អៀត បង្ហាញលើ Tablet និង Desktop) */}
          <div className="hidden sm:flex items-center gap-4 bg-white/[0.06] backdrop-blur-md border border-white/10 p-4 pr-6 rounded-3xl shadow-2xl shrink-0">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center border border-white/20 shadow-lg shrink-0">
              <AcademicCapIcon className="h-9 w-9 text-yellow-300" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-white tracking-wider">RPITSSVR</span>
                <span className="text-[10px] font-extrabold bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 px-2 py-0.5 rounded-md">LMS</span>
              </div>
              <p className="text-xs font-bold text-blue-200/80">
                {t('ប្រព័ន្ធគ្រប់គ្រងការសិក្សាឌីជីថល', 'Digital Learning Portal')}
              </p>
              <p className="text-[11px] font-semibold text-blue-300/60">
                {t('ឆ្នាំសិក្សា ២០២៥-២០២៦', 'Academic Year 2025-2026')}
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* KPI Stats Grid - 2 Columns លើ Phone/Tablet, 3 លើ Laptop និង 5 លើ Desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-5 lg:gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          const isLastItem = index === statCards.length - 1;
          return (
            <Link 
              key={index}
              to={stat.link || '#'} 
              className={`admin-surface-card bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-100 hover:border-transparent shadow-sm hover:shadow-xl transition-all duration-300 group hover:-translate-y-1 relative overflow-hidden block ${
                isLastItem ? 'col-span-2 sm:col-span-2 md:col-span-1 xl:col-span-1' : ''
              }`}
            >
              <div className="flex items-start sm:items-center justify-between gap-2 relative z-10">
                <div className="space-y-1 sm:space-y-1.5 min-w-0">
                  <p className="admin-text-muted text-[11px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider truncate">{stat.title}</p>
                  <p className="admin-text-primary text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{stat.value}</p>
                </div>
                <div className={`admin-stat-icon ${stat.themeClass} h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl ${stat.bgColor} flex items-center justify-center border border-gray-100/50 group-hover:scale-110 transition-transform duration-300 shrink-0`}>
                  <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${stat.textColor}`} />
                </div>
              </div>
              
              <div className="admin-card-divider mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-gray-100/80 flex items-center justify-between text-[11px] sm:text-xs text-gray-400 relative z-10">
                <span className="admin-text-muted font-medium text-gray-400 truncate">
                  {t('សរុបក្នុងប្រព័ន្ធ', 'Total in system')}
                </span>
                <span className="admin-manage-link font-semibold text-gray-600 group-hover:text-blue-600 transition-colors flex items-center gap-0.5 sm:gap-1 shrink-0">
                  {t('គ្រប់គ្រង', 'Manage')} <ChevronRightIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ✅ ផ្នែក Charts (Responsive សម្រាប់ Phone & Tablet) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8">
        {/* User Growth Chart */}
        <div className="admin-surface-card bg-white rounded-2xl sm:rounded-[2rem] border border-gray-100 shadow-sm p-4 sm:p-7 space-y-4 sm:space-y-6">
          <div className="flex items-start sm:items-center justify-between gap-2">
            <div>
              <h3 className="admin-text-primary text-base sm:text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <ArrowTrendingUpIcon className="w-5 h-5 text-emerald-500 shrink-0" />
                <span>{t('កំណើនអ្នកប្រើប្រាស់', 'User Growth')}</span>
              </h3>
              <p className="admin-text-secondary text-[11px] sm:text-xs font-medium text-gray-500 mt-0.5 sm:mt-1">{t('ស្ថិតិប្រៀបធៀបក្នុងរយៈពេល ៦ ខែចុងក្រោយ', 'Comparison statistics over the last 6 months')}</p>
            </div>
            <span className="admin-badge-emerald text-[11px] sm:text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl shrink-0">{t('៦ ខែ', '6 Months')}</span>
          </div>
          <div className="h-[220px] sm:h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid className="admin-chart-grid" strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="month" stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E293B', color: '#FFF', borderRadius: '12px', border: '1px solid #334155', fontWeight: 'bold', fontSize: '12px' }}
                  itemStyle={{ color: '#10B981' }}
                />
                <Area type="monotone" dataKey="users" name={t('អ្នកប្រើប្រាស់', 'Users')} stroke="#10B981" strokeWidth={3.5} fillOpacity={1} fill="url(#colorUsers)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Course Activity Chart */}
        <div className="admin-surface-card bg-white rounded-2xl sm:rounded-[2rem] border border-gray-100 shadow-sm p-4 sm:p-7 space-y-4 sm:space-y-6">
          <div className="flex items-start sm:items-center justify-between gap-2">
            <div>
              <h3 className="admin-text-primary text-base sm:text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <BookOpenIcon className="w-5 h-5 text-blue-500 shrink-0" />
                <span>{t('សកម្មភាពមុខវិជ្ជា', 'Course Activity')}</span>
              </h3>
              <p className="admin-text-secondary text-[11px] sm:text-xs font-medium text-gray-500 mt-0.5 sm:mt-1">{t('ការកើនឡើងនៃមុខវិជ្ជាបង្រៀនតាមខែ', 'Increase in teaching courses by month')}</p>
            </div>
            <span className="admin-badge-blue text-[11px] sm:text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl shrink-0">{t('៦ ខែ', '6 Months')}</span>
          </div>
          <div className="h-[220px] sm:h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid className="admin-chart-grid" strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="month" stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E293B', color: '#FFF', borderRadius: '12px', border: '1px solid #334155', fontWeight: 'bold', fontSize: '12px' }}
                  itemStyle={{ color: '#3B82F6' }}
                  cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                />
                <Bar dataKey="courses" name={t('មុខវិជ្ជា', 'Courses')} fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ✅ ផ្នែកអ្នកប្រើប្រាស់ថ្មីៗ (Recent Users Table) - គ្មាន Skeleton Loading */}
      <div className="w-full">
        <div className="admin-surface-card bg-white rounded-2xl sm:rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
          <div className="admin-card-divider px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="admin-text-primary text-base sm:text-lg font-extrabold text-gray-900">{t('អ្នកប្រើប្រាស់ថ្មីៗ', 'Recent Users')}</h3>
              <p className="admin-text-secondary text-[11px] sm:text-xs font-medium text-gray-500 mt-0.5 leading-relaxed">
                {t('បញ្ជីអ្នកប្រើប្រាស់ដែលបានចុះឈ្មោះថ្មីៗក្នុងប្រព័ន្ធ', 'List of users recently registered in the system')}
              </p>
            </div>
            <Link to="/admin/users" className="admin-badge-emerald text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 border border-emerald-100 px-3 sm:px-4 py-2 rounded-xl transition-colors shrink-0">
              {t('មើលទាំងអស់', 'View All')}
              <ChevronRightIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left border-collapse">
              <thead>
                <tr className="admin-table-head bg-gray-50/70 border-b border-gray-100 text-[11px] sm:text-xs text-gray-500 font-bold uppercase tracking-wider">
                  <th className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap">{t('ឈ្មោះ', 'Name')}</th>
                  <th className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap">{t('អ៊ីមែល', 'Email')}</th>
                  <th className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap">{t('តួនាទី', 'Role')}</th>
                  <th className="px-4 sm:px-6 py-3.5 sm:py-4 text-center whitespace-nowrap">{t('ស្ថានភាព', 'Status')}</th>
                </tr>
              </thead>
              <tbody className="admin-table-body divide-y divide-gray-100 text-sm">
                {recentUsers.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="admin-text-muted px-6 py-10 text-center text-gray-400 font-bold">
                      {t('មិនទាន់មានអ្នកប្រើប្រាស់ទេ', 'No users found')}
                    </td>
                  </tr>
                ) : (
                  recentUsers.map((u) => {
                    const rawAvatar =
                      (Number(u.id) === Number(user?.id) && user?.profile_image) ||
                      u.profile_image ||
                      u.teacher?.profile_image ||
                      u.student?.profile_image;
                    const avatarUrl = resolveImageUrl(rawAvatar);
                    const hasAvatar = Boolean(avatarUrl && !failedAvatars[u.id]);
                    const initials = (
                      (u.first_name?.[0] || u.name?.[0] || '') +
                      (u.last_name?.[0] || '')
                    ).toUpperCase() || 'U';
                    const isActive = String(u.status || 'active').toLowerCase() === 'active';
                    const isEmailRevealed = Boolean(revealedEmails[u.id]);

                    return (
                      <tr key={u.id} className="admin-table-row hover:bg-blue-50/30 transition-colors">
                        <td className="admin-text-primary px-4 sm:px-6 py-3.5 sm:py-4 font-extrabold text-gray-800 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="admin-user-avatar h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs sm:text-sm shrink-0 border border-emerald-200 shadow-sm overflow-hidden">
                              {hasAvatar ? (
                                <img
                                  src={avatarUrl}
                                  alt={u.first_name || u.name || 'User'}
                                  className="h-full w-full object-cover rounded-full"
                                  onError={() =>
                                    setFailedAvatars((prev) => ({
                                      ...prev,
                                      [u.id]: true,
                                    }))
                                  }
                                />
                              ) : (
                                <span>{initials}</span>
                              )}
                            </div>
                            <span>{u.first_name || u.name} {u.last_name || ''}</span>
                          </div>
                        </td>
                        <td className="admin-text-secondary px-4 sm:px-6 py-3.5 sm:py-4 text-xs sm:text-sm text-gray-500 font-medium whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <span className="font-mono tracking-tight">
                              {isEmailRevealed ? u.email : maskEmailAddress(u.email)}
                            </span>
                            {u.email && (
                              <button
                                type="button"
                                onClick={() => toggleEmailVisibility(u.id)}
                                title={isEmailRevealed ? t('លាក់អ៊ីមែល', 'Hide email') : t('បង្ហាញអ៊ីមែលពេញ', 'Show full email')}
                                className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-gray-100/80 dark:hover:bg-slate-700/60 transition-colors"
                              >
                                {isEmailRevealed ? (
                                  <EyeSlashIcon className="w-4 h-4" />
                                ) : (
                                  <EyeIcon className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap">
                          <span className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-bold rounded-xl inline-block ${
                            u.role?.role_name === 'Admin' 
                              ? 'admin-badge-rose bg-rose-50 text-rose-700 border border-rose-200' 
                              : u.role?.role_name === 'Teacher'
                              ? 'admin-badge-amber bg-amber-50 text-amber-700 border border-amber-200'
                              : 'admin-badge-blue bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {getRoleBadgeName(u.role?.role_name)}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-3.5 sm:py-4 text-center whitespace-nowrap">
                          <span className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-bold rounded-xl inline-block ${
                            isActive 
                              ? 'admin-badge-emerald bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'admin-badge-inactive bg-gray-100 text-gray-600 border border-gray-200'
                          }`}>
                            {isActive ? t('សកម្ម', 'Active') : t('អសកម្ម', 'Inactive')}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ✅ CSS សម្រាប់កំណត់ពណ៌ទម្រង់យប់ (Dark Mode) */}
      <style>{`
        html.dark .admin-surface-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .admin-surface-card:hover {
          border-color: #475569 !important;
        }
        html.dark .admin-text-primary {
          color: #f8fafc !important;
        }
        html.dark .admin-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .admin-text-muted {
          color: #64748b !important;
        }
        html.dark .admin-card-divider {
          border-color: #334155 !important;
        }
        html.dark .admin-manage-link {
          color: #cbd5e1 !important;
        }
        html.dark .group:hover .admin-manage-link {
          color: #60a5fa !important;
        }

        /* ពណ៌ប្រអប់ Icon លើកាតស្ថិតិពេលបើក Dark Mode */
        html.dark .admin-stat-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .admin-stat-blue svg { color: #60a5fa !important; }

        html.dark .admin-stat-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .admin-stat-emerald svg { color: #34d399 !important; }

        html.dark .admin-stat-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
        html.dark .admin-stat-amber svg { color: #fbbf24 !important; }

        html.dark .admin-stat-purple {
          background-color: rgba(168, 85, 247, 0.15) !important;
          border-color: rgba(168, 85, 247, 0.3) !important;
        }
        html.dark .admin-stat-purple svg { color: #c084fc !important; }

        html.dark .admin-stat-cyan {
          background-color: rgba(6, 182, 212, 0.15) !important;
          border-color: rgba(6, 182, 212, 0.3) !important;
        }
        html.dark .admin-stat-cyan svg { color: #22d3ee !important; }

        /* ក្រឡាបន្ទាត់ក្នុង Chart */
        html.dark .admin-chart-grid line {
          stroke: #334155 !important;
        }

        /* តារាងអ្នកប្រើប្រាស់ថ្មីៗ */
        html.dark .admin-table-head {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
          color: #94a3b8 !important;
        }
        html.dark .admin-table-body > tr + tr {
          border-color: #334155 !important;
        }
        html.dark .admin-table-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }
        html.dark .admin-user-avatar {
          background-color: rgba(16, 185, 129, 0.2) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.35) !important;
        }

        /* Badges ក្នុងតារាង និងក្រាហ្វិក */
        html.dark .admin-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .admin-badge-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .admin-badge-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
        html.dark .admin-badge-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .admin-badge-inactive {
          background-color: rgba(148, 163, 184, 0.15) !important;
          color: #cbd5e1 !important;
          border-color: rgba(148, 163, 184, 0.3) !important;
        }
      `}</style>

    </div>
  );
};

export default AdminDashboard;
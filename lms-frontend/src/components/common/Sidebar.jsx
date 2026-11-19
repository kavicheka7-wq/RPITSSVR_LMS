// src/components/common/Sidebar.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  HomeIcon,
  UserGroupIcon,
  BookOpenIcon,
  AcademicCapIcon,
  BuildingLibraryIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  FolderIcon,
  PencilSquareIcon,
  DocumentArrowUpIcon,
  UsersIcon,
  ChevronDownIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const LAST_ACTIVE_ROLE_KEY = 'lms_last_active_role';

const readStorageItemSafe = (key) => {
  try {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession && fromSession !== 'undefined' && fromSession !== 'null') {
      return fromSession;
    }
  } catch {}
  try {
    const fromLocal = localStorage.getItem(key);
    if (fromLocal && fromLocal !== 'undefined' && fromLocal !== 'null') {
      return fromLocal;
    }
  } catch {}
  return null;
};

const parseJsonSafe = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// ✅ ស្រង់យកតួនាទី ('Admin' | 'Teacher' | 'Student') ភ្លាមៗក្នុង 0ms ពីគ្រប់ប្រភពទាំងអស់
const resolveRoleKeySync = (contextUser, contextTeacher, hasRoleFn) => {
  if (typeof hasRoleFn === 'function') {
    if (hasRoleFn('Admin')) return 'Admin';
    if (hasRoleFn('Teacher')) return 'Teacher';
    if (hasRoleFn('Student')) return 'Student';
  }

  const extractRoleFromUserObj = (u) => {
    if (!u || typeof u !== 'object') return null;
    const rawRole =
      typeof u.role === 'string'
        ? u.role
        : u.role?.role_name || u.role?.name || u.role_name || '';
    const norm = String(rawRole).trim().toLowerCase();
    const rid = Number(u.role_id);

    if (norm.includes('admin') || rid === 1) return 'Admin';
    if (
      norm.includes('teacher') ||
      rid === 2 ||
      Boolean(u.is_teacher) ||
      Boolean(u.teacher) ||
      Boolean(u.teacher_id)
    ) {
      return 'Teacher';
    }
    if (
      norm.includes('student') ||
      rid === 3 ||
      Boolean(u.student) ||
      Boolean(u.student_id)
    ) {
      return 'Student';
    }
    return null;
  };

  // ១. ឆែកពី Context ផ្ទាល់
  const fromContext = extractRoleFromUserObj(contextUser);
  if (fromContext) return fromContext;
  if (contextTeacher && typeof contextTeacher === 'object') return 'Teacher';

  // ២. ឆែកពី sessionStorage / localStorage ភ្លាមៗក្នុង 0ms (ពេល F5)
  const hasToken = Boolean(
    readStorageItemSafe('token') || readStorageItemSafe('auth_token')
  );
  if (!hasToken) return null;

  const storedUserRaw =
    parseJsonSafe(readStorageItemSafe('user')) ||
    parseJsonSafe(readStorageItemSafe('auth_user'));
  const storedUser =
    storedUserRaw?.user || storedUserRaw?.data || storedUserRaw || null;
  const fromStoredUser = extractRoleFromUserObj(storedUser);
  if (fromStoredUser) return fromStoredUser;

  const storedTeacher = parseJsonSafe(readStorageItemSafe('teacher'));
  if (storedTeacher && typeof storedTeacher === 'object') return 'Teacher';

  const storedStudent = parseJsonSafe(readStorageItemSafe('student'));
  if (storedStudent && typeof storedStudent === 'object') return 'Student';

  const lastRole = readStorageItemSafe(LAST_ACTIVE_ROLE_KEY);
  if (lastRole === 'Admin' || lastRole === 'Teacher' || lastRole === 'Student') {
    return lastRole;
  }

  return null;
};

const Sidebar = () => {
  const { hasRole, user, teacher } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  // State និង Ref សម្រាប់គ្រប់គ្រងផ្ទាំងម៉ឺនុយរង (Dropdown / Popover)
  const [openPopover, setOpenPopover] = useState(() => {
    const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
    return isDesktop &&
      (location.pathname.startsWith('/students') ||
        location.pathname.startsWith('/admin/students'))
      ? '/students'
      : null;
  });
  const popoverRef = useRef(null);
  const spacerRef = useRef(null);

  // ✅ គណនាទីតាំងពីខាងលើ (Top Offset) ដោយស្វ័យប្រវត្តិតាមកម្ពស់ Navbar ជាក់ស្តែង (ការពារ Bug លើទូរស័ព្ទ/Tablet)
  const [topOffset, setTopOffset] = useState(84);

  useEffect(() => {
    const updatePosition = () => {
      if (window.innerWidth < 768 || !spacerRef.current) return;
      const rect = spacerRef.current.getBoundingClientRect();
      if (rect.width === 0) return;

      if (window.scrollY < 50) {
        const calculatedTop = Math.min(
          120,
          Math.max(68, Math.round(rect.top + window.scrollY))
        );
        setTopOffset(calculatedTop);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, []);

  // ✅ ភ្ជាប់ Event Listener តែពេល openPopover បើកប៉ុណ្ណោះ (មិនរត់ឥតប្រយោជន៍រាល់ពេលចុចលើអេក្រង់)
  useEffect(() => {
    if (!openPopover) return;

    const handleClickOutside = (event) => {
      if (
        window.innerWidth < 1024 &&
        popoverRef.current &&
        !popoverRef.current.contains(event.target)
      ) {
        setOpenPopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [openPopover]);

  // បើកទុកដោយស្វ័យប្រវត្តិនៅលើកុំព្យូទ័រ ពេលកំពុងស្ថិតក្នុងទំព័រគ្រប់គ្រងសិស្ស និងបិទលើ Tablet ពេលប្ដូរទំព័រ
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setOpenPopover(null);
      return;
    }
    if (
      location.pathname.startsWith('/students') ||
      location.pathname.startsWith('/admin/students')
    ) {
      setOpenPopover('/students');
    } else {
      setOpenPopover(null);
    }
  }, [location.pathname, location.search]);

  // ==========================================
  // NAVIGATION CONFIGURATION (CLEAN URLS + ALT PATHS + SHORT LABELS FOR IPAD)
  // ==========================================
  const NAV_CONFIG = useMemo(
    () => ({
      Admin: {
        label: t('អ្នកគ្រប់គ្រង', 'Administrator'),
        items: [
          {
            name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'),
            shortName: t('ទំព័រដើម', 'Home'),
            icon: HomeIcon,
            path: '/dashboard',
            altPaths: ['/', '/admin', '/admin/dashboard'],
          },
          {
            name: t('ដេប៉ាតឺម៉ង់', 'Departments'),
            shortName: t('ដេប៉ាតឺម៉ង់', 'Depts'),
            icon: BuildingLibraryIcon,
            path: '/departments',
            altPaths: ['/admin/departments'],
          },
          {
            name: t('គ្រូបង្រៀន', 'Teachers'),
            shortName: t('គ្រូបង្រៀន', 'Teachers'),
            icon: AcademicCapIcon,
            path: '/teachers',
            altPaths: ['/admin/teachers'],
          },
          {
            name: t('មុខវិជ្ជា', 'Courses'),
            shortName: t('មុខវិជ្ជា', 'Courses'),
            icon: BookOpenIcon,
            path: '/courses',
            altPaths: ['/admin/courses'],
          },
          {
            name: t('គ្រប់គ្រងសិស្ស', 'Manage Students'),
            shortName: t('សិស្ស', 'Students'),
            icon: UserGroupIcon,
            path: '/students',
            altPaths: ['/admin/students'],
            children: [
              {
                name: t('ឆ្នាំទី១', 'Year 1'),
                path: '/students/year-1',
                altPath: '/admin/students/year-1',
                year: 'Year 1',
              },
              {
                name: t('ឆ្នាំទី២', 'Year 2'),
                path: '/students/year-2',
                altPath: '/admin/students/year-2',
                year: 'Year 2',
              },
              {
                name: t('ឆ្នាំទី៣', 'Year 3'),
                path: '/students/year-3',
                altPath: '/admin/students/year-3',
                year: 'Year 3',
              },
              {
                name: t('ឆ្នាំទី៤', 'Year 4'),
                path: '/students/year-4',
                altPath: '/admin/students/year-4',
                year: 'Year 4',
              },
            ],
          },
          {
            name: t('របាយការណ៍', 'Reports'),
            shortName: t('របាយការណ៍', 'Reports'),
            icon: ChartBarIcon,
            path: '/reports',
            altPaths: ['/admin/reports'],
          },
        ],
      },
      Teacher: {
        label: t('គ្រូបង្រៀន', 'Teacher'),
        items: [
          {
            name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'),
            shortName: t('ទំព័រដើម', 'Home'),
            icon: HomeIcon,
            path: '/dashboard',
            altPaths: ['/', '/teacher', '/teacher/dashboard'],
          },
          {
            name: t('មុខវិជ្ជា', 'Courses'),
            shortName: t('មុខវិជ្ជា', 'Courses'),
            icon: BookOpenIcon,
            path: '/courses',
            altPaths: ['/teacher/courses'],
          },
          {
            name: t('មេរៀន', 'Lessons'),
            shortName: t('មេរៀន', 'Lessons'),
            icon: FolderIcon,
            path: '/lessons',
            altPaths: ['/teacher/lessons'],
          },
          {
            name: t('សិស្ស', 'Students'),
            shortName: t('សិស្ស', 'Students'),
            icon: UsersIcon,
            path: '/students',
            altPaths: ['/teacher/students'],
          },
          {
            name: t('វត្តមានសិស្ស', 'Attendance'),
            shortName: t('វត្តមាន', 'Attend'),
            icon: ClipboardDocumentListIcon,
            path: '/attendance',
            altPaths: ['/teacher/attendance'],
          },
          {
            name: t('ពិន្ទុ', 'Grades'),
            shortName: t('ពិន្ទុ', 'Grades'),
            icon: ChartBarIcon,
            path: '/grades',
            altPaths: ['/scores', '/teacher/grades', '/teacher/scores'],
          },
          {
            name: t('កិច្ចការ', 'Assignments'),
            shortName: t('កិច្ចការ', 'Tasks'),
            icon: DocumentArrowUpIcon,
            path: '/assignments',
            altPaths: ['/teacher/assignments'],
          },
          {
            name: t('កម្រងសំណួរ', 'Quizzes'),
            shortName: t('សំណួរ', 'Quizzes'),
            icon: PencilSquareIcon,
            path: '/quizzes',
            altPaths: ['/teacher/quizzes'],
          },
        ],
      },
      Student: {
        label: t('សិស្ស', 'Student'),
        items: [
          {
            name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'),
            shortName: t('ទំព័រដើម', 'Home'),
            icon: HomeIcon,
            path: '/dashboard',
            altPaths: ['/', '/student', '/student/dashboard'],
          },
          {
            name: t('មុខវិជ្ជា', 'Courses'),
            shortName: t('មុខវិជ្ជា', 'Courses'),
            icon: BookOpenIcon,
            path: '/courses',
            altPaths: ['/student/courses'],
          },
          {
            name: t('មេរៀន', 'Lessons'),
            shortName: t('មេរៀន', 'Lessons'),
            icon: FolderIcon,
            path: '/lessons',
            altPaths: ['/student/lessons'],
          },
          {
            name: t('វត្តមាន', 'Attendance'),
            shortName: t('វត្តមាន', 'Attend'),
            icon: ClipboardDocumentListIcon,
            path: '/attendance',
            altPaths: ['/student/attendance'],
          },
          {
            name: t('ពិន្ទុ', 'Grades'),
            shortName: t('ពិន្ទុ', 'Grades'),
            icon: ChartBarIcon,
            path: '/grades',
            altPaths: ['/scores', '/student/grades', '/student/scores'],
          },
          {
            name: t('កិច្ចការ', 'Assignments'),
            shortName: t('កិច្ចការ', 'Tasks'),
            icon: DocumentArrowUpIcon,
            path: '/assignments',
            altPaths: ['/student/assignments'],
          },
          {
            name: t('កម្រងសំណួរ', 'Quizzes'),
            shortName: t('សំណួរ', 'Quizzes'),
            icon: PencilSquareIcon,
            path: '/quizzes',
            altPaths: ['/student/quizzes'],
          },
        ],
      },
    }),
    [t]
  );

  // ✅ កំណត់តួនាទីភ្លាមៗក្នុង 0ms (គាំទ្រទាំង Context និង Storage Fallback)
  const roleKey = useMemo(
    () => resolveRoleKeySync(user, teacher, hasRole),
    [user, teacher, hasRole]
  );

  // ✅ រក្សាទុកតួនាទីចុងក្រោយដែលសកម្ម (ត្រឹម 10 Bytes) ដើម្បីធានាថាពេល F5 ម៉ឺនុយមិនបាត់ដាច់ខាត
  useEffect(() => {
    if (roleKey) {
      try {
        sessionStorage.setItem(LAST_ACTIVE_ROLE_KEY, roleKey);
      } catch {}
      try {
        localStorage.setItem(LAST_ACTIVE_ROLE_KEY, roleKey);
      } catch {}
    }
  }, [roleKey]);

  const isStudent = roleKey === 'Student';
  const section = roleKey ? NAV_CONFIG[roleKey] : null;

  // ✅ Memoize ការច្រោះបញ្ជីម៉ឺនុយ និង URL param ដើម្បីកុំឱ្យគណនាឡើងវិញរាល់ពេល Re-render
  const uniqueNavItems = useMemo(() => {
    const items = section?.items || [];
    return items.reduce((acc, current) => {
      const exists = acc.find(
        (item) => item.path === current.path && item.name === current.name
      );
      if (!exists) {
        acc.push(current);
      }
      return acc;
    }, []);
  }, [section]);

  const currentYearParam = useMemo(
    () => new URLSearchParams(location.search).get('year') || 'all',
    [location.search]
  );

  // ✅ អនុគមន៍ឆែកមើលថាតើម៉ឺនុយនីមួយៗកំពុង Active ឬអត់
  const checkIsNavItemActive = useCallback(
    (item) => {
      const routerPath = (location.pathname || '/').replace(/\/+$/, '') || '/';
      const browserPath =
        typeof window !== 'undefined'
          ? (window.location.pathname || '/').replace(/\/+$/, '') || '/'
          : routerPath;

      const pathsToCheck = [item.path, ...(item.altPaths || [])];

      return pathsToCheck.some((target) => {
        const cleanTarget = (target || '/').replace(/\/+$/, '') || '/';
        if (cleanTarget === '/') {
          return routerPath === '/' || browserPath === '/';
        }
        return (
          routerPath === cleanTarget ||
          routerPath.startsWith(`${cleanTarget}/`) ||
          browserPath === cleanTarget ||
          browserPath.startsWith(`${cleanTarget}/`)
        );
      });
    },
    [location.pathname]
  );

  return (
    <>
      {/* ================================================================== */}
      {/* 📌 1. SPACER DIV សម្រាប់ទប់ទទឹងជួរឈរខាងឆ្វេងលើ iPad, Laptop, Desktop */}
      {/* ================================================================== */}
      <div
        ref={spacerRef}
        className="hidden md:block md:w-[88px] lg:w-[252px] xl:w-[264px] shrink-0 ml-3 lg:ml-4 mr-2 my-3 pointer-events-none select-none transition-all duration-300"
        aria-hidden="true"
      />

      {/* ================================================================== */}
      {/* 📌 2. FLOATING SIDEBAR សម្រាប់ iPad, Tablet, Laptop និង Desktop     */}
      {/* ================================================================== */}
      <aside
        style={{
          top: `${topOffset}px`,
          height: `calc(100vh - ${topOffset + 16}px)`,
        }}
        className={`hidden md:flex md:w-[88px] lg:w-[252px] xl:w-[264px] fixed left-3 lg:left-4 rounded-[1.75rem] flex-col shrink-0 transition-all duration-300 z-30 shadow-[0_20px_50px_rgba(8,15,40,0.45)] md:overflow-visible lg:overflow-hidden ${
          isStudent
            ? 'bg-gradient-to-b from-blue-950 via-indigo-950 to-violet-950 border border-indigo-400/25'
            : 'bg-gradient-to-b from-slate-950 via-blue-950 to-indigo-950 border border-blue-800/45'
        }`}
      >
        {/* ផ្ទៃក្រឡាអុចៗស្រាលៗ និងពន្លឺ Glow (លាក់ blur-3xl លើ Tablet ដើម្បីសម្រាល GPU) */}
        <div className="absolute inset-0 rounded-[1.75rem] overflow-hidden pointer-events-none">
          <div className="std-sidebar-grid-pattern absolute inset-0 opacity-15" />
          <div className="hidden lg:block absolute -top-24 -right-24 w-52 h-52 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="hidden lg:block absolute -bottom-24 -left-24 w-52 h-52 bg-indigo-500/20 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col h-full w-full py-2.5">
          {/* ក្បាល Sidebar (Logo + ផ្លាកតួនាទី) */}
          <div className="px-2.5 lg:px-5 pt-3 pb-2 shrink-0">
            <div className="flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-1.5 lg:gap-3.5">
              <div
                className={`group relative h-10 w-10 lg:h-11 lg:w-11 rounded-2xl flex items-center justify-center shadow-lg shrink-0 border transition-transform duration-300 hover:scale-105 ${
                  isStudent
                    ? 'bg-gradient-to-br from-indigo-500 via-blue-600 to-violet-600 border-indigo-300/40 shadow-indigo-500/25'
                    : 'bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 border-blue-300/40 shadow-blue-500/25'
                }`}
              >
                <AcademicCapIcon className="h-5 w-5 lg:h-6 lg:w-6 stroke-[2.2] text-yellow-300" />
              </div>

              {/* លើ iPad/Tablet បង្ហាញផ្លាកតួនាទីតូចស្អាតនៅក្រោម Logo */}
              {section && (
                <span className="hidden md:inline-flex lg:hidden items-center px-2 py-0.5 rounded-full text-[9.5px] font-extrabold bg-white/10 text-yellow-300 border border-white/15 truncate max-w-[76px]">
                  {section.label}
                </span>
              )}

              {/* លើ Laptop/Desktop បង្ហាញឈ្មោះពេញ */}
              <div className="hidden lg:block min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[15.5px] font-black text-white tracking-wide truncate leading-tight">
                    LMS RPITSSVR
                  </p>
                </div>
                <p className="text-[11.5px] font-semibold text-blue-200/75 mt-0.5 truncate">
                  {t('ប្រព័ន្ធគ្រប់គ្រងការសិក្សា', 'Learning Management')}
                </p>
              </div>
            </div>

            {section && (
              <div className="mt-4 mb-0.5 hidden lg:flex items-center justify-start border-t border-white/10 pt-3.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold border ${
                    isStudent
                      ? 'bg-cyan-400/15 text-cyan-200 border-cyan-400/30'
                      : 'bg-blue-400/15 text-blue-200 border-blue-400/30'
                  }`}
                >
                  <SparklesIcon className="h-3.5 w-3.5 text-yellow-300 shrink-0" />
                  <span>{section.label}</span>
                </span>
              </div>
            )}
          </div>

          {/* បញ្ជីម៉ឺនុយ (លើ iPad បង្ហាញ Icon + អក្សរខ្លីពីក្រោម, លើ Laptop/Desktop បង្ហាញជួរដេកពេញ) */}
          <nav className="sidebar-nav px-2 lg:px-4 pt-1.5 pb-3 flex-1 space-y-1.5 overflow-y-auto">
            {uniqueNavItems.map((item) => {
              // ១. ប៊ូតុងមានម៉ឺនុយរង (គ្រប់គ្រងសិស្ស សម្រាប់ Admin)
              if (item.children) {
                const isParentActive = checkIsNavItemActive(item);
                const isPopoverOpen = openPopover === item.path;

                return (
                  <div
                    key={`${item.path}-${item.name}`}
                    ref={popoverRef}
                    className="relative"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenPopover(isPopoverOpen ? null : item.path)}
                      className={`w-full group relative flex flex-col lg:flex-row items-center justify-center lg:justify-between py-2 px-1.5 lg:px-3 lg:py-2 text-[14.5px] rounded-2xl border transition-all duration-200 cursor-pointer ${
                        isParentActive || isPopoverOpen
                          ? 'bg-gradient-to-r from-white/15 to-white/[0.06] lg:backdrop-blur-md text-white font-extrabold border-white/20 shadow-lg'
                          : 'border-transparent text-blue-100/80 font-semibold hover:bg-white/[0.07] hover:text-white lg:hover:translate-x-1'
                      }`}
                    >
                      {(isParentActive || isPopoverOpen) && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.9)]" />
                      )}

                      <div className="flex flex-col lg:flex-row items-center gap-1 lg:gap-3 min-w-0">
                        <div
                          className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
                            isParentActive || isPopoverOpen
                              ? 'bg-gradient-to-br from-amber-400/25 to-yellow-500/15 border border-yellow-400/40 text-yellow-300 shadow-xs'
                              : 'bg-white/[0.05] border border-white/[0.06] text-blue-200/85 group-hover:bg-white/10 group-hover:text-white group-hover:scale-105'
                          }`}
                        >
                          <item.icon
                            className={`h-[19px] w-[19px] transition-all duration-200 ${
                              isParentActive || isPopoverOpen
                                ? 'stroke-[2.2]'
                                : 'stroke-[1.9]'
                            }`}
                            aria-hidden="true"
                          />
                        </div>

                        {/* អក្សរខ្លីនៅក្រោម Icon សម្រាប់អេក្រង់ iPad / Tablet */}
                        <span
                          className={`hidden md:block lg:hidden text-[10px] leading-tight text-center truncate max-w-[68px] ${
                            isParentActive || isPopoverOpen
                              ? 'text-yellow-300 font-extrabold'
                              : 'text-blue-100/85 font-bold'
                          }`}
                        >
                          {item.shortName || item.name}
                        </span>

                        {/* អក្សរពេញសម្រាប់អេក្រង់ Laptop / Desktop */}
                        <span className="truncate hidden lg:inline leading-relaxed">
                          {item.name}
                        </span>
                      </div>

                      <div className="hidden lg:flex items-center pr-1">
                        <ChevronDownIcon
                          className={`h-4 w-4 shrink-0 transition-transform duration-300 stroke-[2.2] ${
                            isPopoverOpen
                              ? 'rotate-180 text-yellow-400'
                              : 'text-blue-300/75 group-hover:text-white'
                          }`}
                        />
                      </div>
                    </button>

                    {/* ម៉ឺនុយរង (ឆ្នាំទី១ - ឆ្នាំទី៤) */}
                    {isPopoverOpen && (
                      <div className="md:mt-1.5 md:pl-2 md:border-l-2 md:border-white/15 lg:ml-6 lg:pl-3.5 animate-dropDown">
                        <div className="flex flex-col space-y-1 relative z-10">
                          {item.children.map((sub) => {
                            const isSubActive =
                              location.pathname === sub.path ||
                              location.pathname === sub.altPath ||
                              ((location.pathname === '/students' ||
                                location.pathname === '/admin/students') &&
                                currentYearParam === sub.year);

                            return (
                              <Link
                                key={sub.path}
                                to={sub.path}
                                onClick={() => {
                                  if (window.innerWidth < 1024) setOpenPopover(null);
                                }}
                                className={`flex items-center justify-center lg:justify-between px-2 lg:px-3.5 py-1.5 lg:py-2 rounded-xl text-[11px] lg:text-[13.5px] transition-all duration-200 ${
                                  isSubActive
                                    ? 'bg-white/15 text-yellow-300 font-extrabold border border-white/20 shadow-xs'
                                    : 'text-blue-100/75 hover:bg-white/[0.08] hover:text-white lg:hover:translate-x-1 font-bold border border-transparent'
                                }`}
                              >
                                <span className="truncate leading-relaxed">{sub.name}</span>
                                {isSubActive && (
                                  <span className="hidden lg:block h-2 w-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)] shrink-0"></span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // ២. ម៉ឺនុយធម្មតា (សម្រាប់ Admin, Teacher, Student)
              const isCustomActive = checkIsNavItemActive(item);

              return (
                <NavLink
                  key={`${item.path}-${item.name}`}
                  to={item.path}
                  className={({ isActive }) => {
                    const activeState = isActive || isCustomActive;
                    return `group relative flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-1 lg:gap-3 py-2 px-1.5 lg:px-3 lg:py-2 text-[14.5px] rounded-2xl border transition-all duration-200 ${
                      activeState
                        ? 'bg-gradient-to-r from-white/15 to-white/[0.06] lg:backdrop-blur-md text-white font-extrabold border-white/20 shadow-lg'
                        : 'border-transparent text-blue-100/80 font-semibold hover:bg-white/[0.07] hover:text-white lg:hover:translate-x-1'
                    }`;
                  }}
                >
                  {({ isActive }) => {
                    const activeState = isActive || isCustomActive;
                    return (
                      <>
                        {/* របារពន្លឺតូចនៅគែមឆ្វេងពេល Active (បង្ហាញទាំងលើ iPad និង Desktop) */}
                        {activeState && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.9)]" />
                        )}

                        {/* ប្រអប់រូបតំណាងបែប V18 Glass Box */}
                        <div
                          className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
                            activeState
                              ? 'bg-gradient-to-br from-amber-400/25 to-yellow-500/15 border border-yellow-400/40 text-yellow-300 shadow-xs scale-105'
                              : 'bg-white/[0.05] border border-white/[0.06] text-blue-200/85 group-hover:bg-white/10 group-hover:text-white group-hover:scale-105'
                          }`}
                        >
                          <item.icon
                            className={`h-[19px] w-[19px] transition-all duration-200 ${
                              activeState ? 'stroke-[2.2]' : 'stroke-[1.9]'
                            }`}
                            aria-hidden="true"
                          />
                        </div>

                        {/* អក្សរខ្លីនៅក្រោម Icon សម្រាប់អេក្រង់ iPad / Tablet (មិនបាច់ប្រើ Mouse Hover) */}
                        <span
                          className={`hidden md:block lg:hidden text-[10px] leading-tight text-center truncate max-w-[68px] ${
                            activeState
                              ? 'text-yellow-300 font-extrabold'
                              : 'text-blue-100/85 font-bold group-hover:text-white'
                          }`}
                        >
                          {item.shortName || item.name}
                        </span>

                        {/* អក្សរពេញសម្រាប់អេក្រង់ Laptop / Desktop */}
                        <span className="truncate hidden lg:inline leading-relaxed">
                          {item.name}
                        </span>

                        {activeState && (
                          <span className="hidden lg:block ml-auto mr-1 h-2 w-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)] shrink-0" />
                        )}
                      </>
                    );
                  }}
                </NavLink>
              );
            })}
          </nav>

          {/* ផ្នែកខាងក្រោមនៃ Sidebar (Footer) */}
          <div className="px-2.5 lg:px-5 pb-3 pt-2.5 shrink-0 mt-auto border-t border-white/10">
            <div className="hidden lg:flex items-center justify-between text-[11.5px] font-semibold text-blue-200/70">
              <span className="truncate">© {new Date().getFullYear()} RPITSSVR</span>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] text-emerald-300 font-extrabold bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-400/25 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                v2.0
              </span>
            </div>
            <div className="flex lg:hidden justify-center">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-extrabold text-emerald-300 bg-emerald-500/15 border border-emerald-400/25"
                title={t('កំពុងដំណើរការ (v2.0)', 'System Online (v2.0)')}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>v2.0</span>
              </span>
            </div>
          </div>
        </div>
      </aside>

      <style>{`
        .std-sidebar-grid-pattern {
          background-image: radial-gradient(rgba(255, 255, 255, 0.25) 1px, transparent 1px);
          background-size: 20px 20px;
        }
        @keyframes dropDown {
          0% {
            opacity: 0;
            transform: translateY(-6px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-dropDown {
          animation: dropDown 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .sidebar-nav::-webkit-scrollbar {
          width: 4px;
        }
        .sidebar-nav::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-nav::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 10px;
        }
        .sidebar-nav:hover::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
        }
        .sidebar-nav::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }
      `}</style>
    </>
  );
};

export default React.memo(Sidebar);
// src/components/common/BottomNav.jsx
import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  HomeIcon,
  BookOpenIcon,
  AcademicCapIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  FolderIcon,
} from '@heroicons/react/24/outline';

const LAST_ADMIN_STUDENT_PATH_KEY = 'lms_admin_last_student_year_path';
const LAST_ACTIVE_ROLE_KEY = 'lms_last_active_role';

const readStorageSafe = (key) => {
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

// ✅ អនុគមន៍ចាប់យកតួនាទីអ្នកប្រើប្រាស់ភ្លាមៗក្នុង 0ms និងឆែក Token ការពារកុំឱ្យលោតម៉ឺនុយពេល Logout
const resolveRoleSync = (contextUser, hasRoleFn) => {
  if (typeof hasRoleFn === 'function') {
    if (hasRoleFn('Admin')) return 'admin';
    if (hasRoleFn('Teacher')) return 'teacher';
    if (hasRoleFn('Student')) return 'student';
  }

  let u = contextUser;
  if (!u || (!u.role && !u.role_name && !u.role_id)) {
    const hasToken = Boolean(
      readStorageSafe('token') || readStorageSafe('auth_token')
    );
    if (!hasToken) return '';

    try {
      const raw = readStorageSafe('user') || readStorageSafe('auth_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        u = parsed?.user || parsed?.data || parsed;
      }
    } catch {}
  }

  const rawRole =
    u?.role?.role_name ||
    u?.role?.name ||
    u?.role_name ||
    (typeof u?.role === 'string' ? u.role : '') ||
    readStorageSafe(LAST_ACTIVE_ROLE_KEY) ||
    '';
  const r = rawRole.toString().trim().toLowerCase();
  const roleIdNum = Number(u?.role_id);

  if (r.includes('admin') || roleIdNum === 1) return 'admin';
  if (
    r.includes('teacher') ||
    roleIdNum === 2 ||
    Boolean(u?.is_teacher) ||
    Boolean(u?.teacher)
  ) {
    return 'teacher';
  }
  if (
    r.includes('student') ||
    roleIdNum === 3 ||
    Boolean(u?.student)
  ) {
    return 'student';
  }

  return '';
};

const BottomNav = () => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  // ✅ កំណត់តួនាទីភ្លាមៗក្នុង 0 វិនាទី
  const currentRole = useMemo(
    () => resolveRoleSync(user, hasRole),
    [user, hasRole]
  );

  const isStudent = currentRole === 'student';

  // ✅ ចងចាំទំព័រឆ្នាំសិក្សារបស់សិស្សដែល Admin បានចូលមើលចុងក្រោយ
  const [adminStudentPath, setAdminStudentPath] = useState(() => {
    try {
      return (
        sessionStorage.getItem(LAST_ADMIN_STUDENT_PATH_KEY) ||
        '/students/year-1'
      );
    } catch {
      return '/students/year-1';
    }
  });

  useEffect(() => {
    if (
      currentRole === 'admin' &&
      /^\/students\/year-[1-4]/.test(location.pathname)
    ) {
      setAdminStudentPath(location.pathname);
      try {
        sessionStorage.setItem(LAST_ADMIN_STUDENT_PATH_KEY, location.pathname);
      } catch {}
    }
  }, [currentRole, location.pathname]);

  // ✅ គណនាបញ្ជីម៉ឺនុយទាំង ៥ ដោយប្រើ Clean URLs និងរាប់បញ្ចូល '/' សម្រាប់ផ្ទាំងគ្រប់គ្រង
  const navItems = useMemo(() => {
    if (currentRole === 'admin') {
      return [
        {
          name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'),
          icon: HomeIcon,
          path: '/dashboard',
          matchPaths: ['/', '/dashboard', '/admin', '/admin/dashboard'],
        },
        {
          name: t('មុខវិជ្ជា', 'Courses'),
          icon: BookOpenIcon,
          path: '/courses',
          matchPaths: ['/courses', '/admin/courses'],
        },
        {
          name: t('គ្រូ', 'Teachers'),
          icon: AcademicCapIcon,
          path: '/teachers',
          matchPaths: ['/teachers', '/admin/teachers'],
        },
        {
          name: t('សិស្ស', 'Students'),
          icon: UserGroupIcon,
          path: adminStudentPath,
          matchPrefix: '/students',
          altPrefix: '/admin/students',
        },
        {
          name: t('របាយការណ៍', 'Reports'),
          icon: ChartBarIcon,
          path: '/reports',
          matchPaths: ['/reports', '/admin/reports'],
        },
      ];
    }

    if (currentRole === 'teacher') {
      return [
        {
          name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'),
          icon: HomeIcon,
          path: '/dashboard',
          matchPaths: ['/', '/dashboard', '/teacher', '/teacher/dashboard'],
        },
        {
          name: t('មុខវិជ្ជា', 'Courses'),
          icon: BookOpenIcon,
          path: '/courses',
          matchPaths: ['/courses', '/teacher/courses'],
        },
        {
          name: t('មេរៀន', 'Lessons'),
          icon: FolderIcon,
          path: '/lessons',
          matchPaths: ['/lessons', '/teacher/lessons'],
        },
        {
          name: t('វត្តមាន', 'Attendance'),
          icon: ClipboardDocumentListIcon,
          path: '/attendance',
          matchPaths: ['/attendance', '/teacher/attendance'],
        },
        {
          name: t('ពិន្ទុ', 'Grades'),
          icon: ChartBarIcon,
          path: '/grades',
          matchPaths: ['/grades', '/scores', '/teacher/grades', '/teacher/scores'],
        },
      ];
    }

    if (currentRole === 'student') {
      return [
        {
          name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'),
          icon: HomeIcon,
          path: '/dashboard',
          matchPaths: ['/', '/dashboard', '/student', '/student/dashboard'],
        },
        {
          name: t('មុខវិជ្ជា', 'Courses'),
          icon: BookOpenIcon,
          path: '/courses',
          matchPaths: ['/courses', '/student/courses'],
        },
        {
          name: t('មេរៀន', 'Lessons'),
          icon: FolderIcon,
          path: '/lessons',
          matchPaths: ['/lessons', '/student/lessons'],
        },
        {
          name: t('វត្តមាន', 'Attendance'),
          icon: ClipboardDocumentListIcon,
          path: '/attendance',
          matchPaths: ['/attendance', '/student/attendance'],
        },
        {
          name: t('ពិន្ទុ', 'Scores'),
          icon: ChartBarIcon,
          path: '/grades',
          matchPaths: ['/grades', '/scores', '/student/grades', '/student/scores'],
        },
      ];
    }

    return [];
  }, [currentRole, adminStudentPath, t]);

  // ✅ ឆែកស្ថានភាព Active ឱ្យត្រឹមត្រូវ ១០០% ទាំងពេលវាយ Domain ចូលដំបូង ('/' ឬ '/dashboard')
  const checkIsItemActive = useCallback(
    (item) => {
      const routerPath = (location.pathname || '/').replace(/\/+$/, '') || '/';
      const browserPath =
        typeof window !== 'undefined'
          ? (window.location.pathname || '/').replace(/\/+$/, '') || '/'
          : routerPath;

      if (item.matchPrefix) {
        if (
          routerPath.startsWith(item.matchPrefix) ||
          browserPath.startsWith(item.matchPrefix) ||
          (item.altPrefix &&
            (routerPath.startsWith(item.altPrefix) ||
              browserPath.startsWith(item.altPrefix)))
        ) {
          return true;
        }
      }

      if (Array.isArray(item.matchPaths)) {
        return item.matchPaths.some((target) => {
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
      }

      return false;
    },
    [location.pathname]
  );

  if (navItems.length === 0) return null;

  return (
    <div className="md:hidden fixed bottom-3 sm:bottom-4 left-0 right-0 z-40 flex justify-center px-3 sm:px-4 pb-[env(safe-area-inset-bottom,0px)] animate-slideUp pointer-events-none select-none">
      {/* ✅ ដក backdrop-blur-xl ចេញដើម្បីឱ្យអូសរលូន 60fps លើទូរស័ព្ទ */}
      <div
        className={`border rounded-2xl p-1.5 flex items-center justify-between gap-1 w-full max-w-[400px] pointer-events-auto transition-colors duration-200 ${
          isStudent
            ? 'bg-gradient-to-r from-blue-950/95 via-indigo-900/95 to-violet-950/95 border-indigo-400/35 shadow-[0_14px_34px_rgba(30,27,75,0.55)]'
            : 'bg-gradient-to-r from-slate-950/95 via-blue-950/95 to-indigo-950/95 border-blue-700/45 shadow-[0_14px_34px_rgba(15,23,42,0.55)]'
        }`}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isCustomActive = checkIsItemActive(item);

          return (
            <NavLink
              key={item.matchPrefix || item.path}
              to={item.path}
              className={({ isActive }) => {
                const activeState = isActive || isCustomActive;
                return `relative flex-1 min-w-0 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-colors duration-200 ${
                  activeState
                    ? isStudent
                      ? 'bg-white/15 text-white shadow-inner border border-yellow-400/35'
                      : 'bg-blue-800/70 text-white shadow-inner border border-yellow-400/35'
                    : 'text-blue-200/75 hover:text-white hover:bg-white/5 border border-transparent'
                }`;
              }}
            >
              {({ isActive }) => {
                const activeState = isActive || isCustomActive;
                return (
                  <>
                    {/* ចំណុចពន្លឺពណ៌លឿងតូចនៅខាងលើពេល Active */}
                    {activeState && (
                      <span className="absolute top-1 right-2 h-1.5 w-1.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.9)]" />
                    )}

                    <Icon
                      className={`transition-transform duration-200 mb-0.5 shrink-0 ${
                        activeState
                          ? 'h-5 w-5 stroke-[2.4] text-yellow-400 drop-shadow-md scale-105'
                          : 'h-5 w-5 stroke-[1.9] text-blue-200/80'
                      }`}
                    />
                    <span
                      className={`text-[9.5px] xs:text-[10px] transition-colors duration-200 truncate w-full text-center leading-tight px-0.5 ${
                        activeState
                          ? 'font-extrabold text-yellow-300'
                          : 'font-semibold text-blue-100/80'
                      }`}
                    >
                      {item.name}
                    </span>
                  </>
                );
              }}
            </NavLink>
          );
        })}
      </div>

      <style>{`
        @keyframes slideUp {
          0% { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-slideUp {
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default React.memo(BottomNav);
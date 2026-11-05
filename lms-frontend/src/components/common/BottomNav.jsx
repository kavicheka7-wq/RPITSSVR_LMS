// src/components/common/BottomNav.jsx
import React, { useMemo } from 'react';
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

// ✅ អនុគមន៍ចាប់យកតួនាទីអ្នកប្រើប្រាស់ភ្លាមៗក្នុង 0ms (គាំទ្រទាំង Context, LocalStorage និង URL Path)
const resolveRoleSync = (contextUser, hasRoleFn, pathname = '') => {
  let u = contextUser;
  if (!u || (!u.role && !u.role_name)) {
    try {
      const raw =
        localStorage.getItem('user') || localStorage.getItem('auth_user');
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
    '';
  const r = rawRole.toString().toLowerCase();

  if (r.includes('admin')) return 'admin';
  if (r.includes('teacher')) return 'teacher';
  if (r.includes('student')) return 'student';

  if (typeof hasRoleFn === 'function') {
    if (hasRoleFn('Admin')) return 'admin';
    if (hasRoleFn('Teacher')) return 'teacher';
    if (hasRoleFn('Student')) return 'student';
  }

  const p = (pathname || '').toLowerCase();
  if (p.startsWith('/admin')) return 'admin';
  if (p.startsWith('/teacher')) return 'teacher';
  if (p.startsWith('/student')) return 'student';

  return '';
};

const BottomNav = () => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  // ✅ កំណត់តួនាទីភ្លាមៗក្នុង 0 វិនាទី
  const currentRole = useMemo(
    () => resolveRoleSync(user, hasRole, location.pathname),
    [user, hasRole, location.pathname]
  );

  const isStudent = currentRole === 'student';

  // ✅ គណនាបញ្ជីម៉ឺនុយទាំង ៥ ដោយប្រើ useMemo ដើម្បីល្បឿនលឿនបំផុត
  const navItems = useMemo(() => {
    if (currentRole === 'admin') {
      return [
        {
          name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'),
          icon: HomeIcon,
          path: '/admin/dashboard',
        },
        {
          name: t('មុខវិជ្ជា', 'Courses'),
          icon: BookOpenIcon,
          path: '/admin/courses',
        },
        {
          name: t('គ្រូ', 'Teachers'),
          icon: AcademicCapIcon,
          path: '/admin/teachers',
        },
        {
          name: t('សិស្ស', 'Students'),
          icon: UserGroupIcon,
          path: '/admin/students/year-1',
          matchPrefix: '/admin/students',
        },
        {
          name: t('របាយការណ៍', 'Reports'),
          icon: ChartBarIcon,
          path: '/admin/reports',
        },
      ];
    }

    if (currentRole === 'teacher') {
      return [
        {
          name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'),
          icon: HomeIcon,
          path: '/teacher/dashboard',
        },
        {
          name: t('មុខវិជ្ជា', 'Courses'),
          icon: BookOpenIcon,
          path: '/teacher/courses',
        },
        {
          name: t('មេរៀន', 'Lessons'),
          icon: FolderIcon,
          path: '/teacher/lessons',
        },
        {
          name: t('វត្តមាន', 'Attendance'),
          icon: ClipboardDocumentListIcon,
          path: '/teacher/attendance',
        },
        {
          name: t('ពិន្ទុ', 'Grades'),
          icon: ChartBarIcon,
          path: '/teacher/grades',
          matchPaths: ['/teacher/grades', '/teacher/scores'],
        },
      ];
    }

    if (currentRole === 'student') {
      return [
        {
          name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'),
          icon: HomeIcon,
          path: '/student/dashboard',
        },
        {
          name: t('មុខវិជ្ជា', 'Courses'),
          icon: BookOpenIcon,
          path: '/student/courses',
        },
        {
          name: t('មេរៀន', 'Lessons'),
          icon: FolderIcon,
          path: '/student/lessons',
        },
        {
          name: t('វត្តមាន', 'Attendance'),
          icon: ClipboardDocumentListIcon,
          path: '/student/attendance',
        },
        {
          name: t('ពិន្ទុ', 'Scores'),
          icon: ChartBarIcon,
          path: '/student/grades',
          matchPaths: ['/student/grades', '/student/scores'],
        },
      ];
    }

    return [];
  }, [currentRole, t]);

  if (navItems.length === 0) return null;

  return (
    <div className="md:hidden fixed bottom-5 left-0 right-0 z-[90] flex justify-center px-4 animate-slideUp pointer-events-none">
      {/* ✅ ផ្ទៃ Background ស៊ីគ្នាជាមួយ Navbar (Student ពណ៌ Indigo/Violet, Teacher/Admin ពណ៌ Blue/Indigo) */}
      <div
        className={`backdrop-blur-xl border rounded-2xl p-1.5 flex items-center justify-between w-full max-w-[365px] pointer-events-auto transition-colors duration-300 ${
          isStudent
            ? 'bg-gradient-to-r from-blue-950/95 via-indigo-900/95 to-violet-950/95 border-indigo-500/40 shadow-[0_12px_32px_rgba(49,46,129,0.45)]'
            : 'bg-gradient-to-r from-blue-950/95 via-blue-900/95 to-indigo-950/95 border-blue-800/60 shadow-[0_12px_32px_rgba(30,58,138,0.45)]'
        }`}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isCustomActive =
            (item.matchPrefix &&
              location.pathname.startsWith(item.matchPrefix)) ||
            (Array.isArray(item.matchPaths) &&
              item.matchPaths.includes(location.pathname));

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => {
                const activeState = isActive || isCustomActive;
                return `relative flex flex-col items-center justify-center py-2 px-1 w-[64px] rounded-xl transition-all duration-200 ${
                  activeState
                    ? isStudent
                      ? 'bg-white/15 text-white shadow-inner border border-indigo-400/30'
                      : 'bg-blue-800/60 text-white shadow-inner border border-blue-700/40'
                    : 'text-blue-200/75 hover:text-white hover:bg-white/5'
                }`;
              }}
            >
              {({ isActive }) => {
                const activeState = isActive || isCustomActive;
                return (
                  <>
                    <Icon
                      className={`transition-all duration-200 mb-0.5 ${
                        activeState
                          ? 'h-5 w-5 stroke-[2.5] text-yellow-400 drop-shadow-md scale-110'
                          : 'h-5 w-5 stroke-2 text-blue-200/80'
                      }`}
                    />
                    <span
                      className={`text-[10px] transition-all duration-200 truncate w-full text-center ${
                        activeState
                          ? 'font-extrabold text-white'
                          : 'font-medium text-blue-200/75'
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
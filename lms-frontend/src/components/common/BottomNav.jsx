// src/components/common/BottomNav.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
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

const BottomNav = () => {
  const { hasRole } = useAuth();
  const { t } = useLanguage();

  const getNavItems = () => {
    if (hasRole('Admin')) {
      return [
        { name: t('ដើម', 'Home'), icon: HomeIcon, path: '/admin/dashboard' },
        { name: t('មុខវិជ្ជា', 'Courses'), icon: BookOpenIcon, path: '/admin/courses' },
        { name: t('គ្រូ', 'Teachers'), icon: AcademicCapIcon, path: '/admin/teachers' },
        { name: t('សិស្ស', 'Students'), icon: UserGroupIcon, path: '/admin/students' },
        { name: t('របាយការណ៍', 'Reports'), icon: ChartBarIcon, path: '/admin/reports' },
      ];
    }
    if (hasRole('Teacher')) {
      return [
        { name: t('ដើម', 'Home'), icon: HomeIcon, path: '/teacher/dashboard' },
        { name: t('មុខវិជ្ជា', 'Courses'), icon: BookOpenIcon, path: '/teacher/courses' },
        { name: t('មេរៀន', 'Lessons'), icon: FolderIcon, path: '/teacher/lessons' },
        { name: t('វត្តមាន', 'Attendance'), icon: ClipboardDocumentListIcon, path: '/teacher/attendance' },
        { name: t('ពិន្ទុ', 'Grades'), icon: ChartBarIcon, path: '/teacher/grades' },
      ];
    }
    if (hasRole('Student')) {
      return [
        { name: t('ដើម', 'Home'), icon: HomeIcon, path: '/student/dashboard' },
        { name: t('មុខវិជ្ជា', 'Courses'), icon: BookOpenIcon, path: '/student/courses' },
        { name: t('មេរៀន', 'Lessons'), icon: FolderIcon, path: '/student/lessons' },
        { name: t('វត្តមាន', 'Attendance'), icon: ClipboardDocumentListIcon, path: '/student/attendance' },
        { name: t('ពិន្ទុ', 'Scores'), icon: ChartBarIcon, path: '/student/grades' },
      ];
    }
    return [];
  };

  const navItems = getNavItems();

  if (navItems.length === 0) return null;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-r from-blue-950 via-slate-950 to-indigo-950 border-t border-blue-800/40 shadow-2xl backdrop-blur-lg px-2 py-1.5 pb-safe">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl transition-all duration-300 relative ${
                  isActive
                    ? 'text-yellow-400 font-bold scale-105'
                    : 'text-blue-200/60 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute -top-1.5 w-7 h-1 bg-gradient-to-r from-yellow-300 to-yellow-500 rounded-full shadow-lg shadow-yellow-500/50" />
                  )}
                  <Icon
                    className={`h-5 w-5 transition-transform duration-300 ${
                      isActive ? 'scale-110 text-yellow-400 drop-shadow-md' : 'opacity-80'
                    }`}
                  />
                  <span className="text-[10px] mt-1 font-medium tracking-tight truncate max-w-[64px]">
                    {item.name}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNav;

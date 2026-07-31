// src/components/common/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
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
  Cog6ToothIcon,
  FolderIcon,
  VideoCameraIcon,
  PencilSquareIcon,
  DocumentArrowUpIcon,
  UsersIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';

const Sidebar = () => {
  const { hasRole } = useAuth();
  const { t } = useLanguage();

  // ==========================================
  // NAVIGATION CONFIGURATION
  // ==========================================
  const NAV_CONFIG = {
    Admin: {
      label: t('អ្នកគ្រប់គ្រង', 'Administrator'),
      items: [
        { name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'), icon: HomeIcon, path: '/admin/dashboard' },
        { name: t('ដេប៉ាតឺម៉ង់', 'Departments'), icon: BuildingLibraryIcon, path: '/admin/departments' },
        { name: t('គ្រូបង្រៀន', 'Teachers'), icon: AcademicCapIcon, path: '/admin/teachers' },
        { name: t('សិស្ស', 'Students'), icon: UserGroupIcon, path: '/admin/students' },
        { name: t('មុខវិជ្ជា', 'Courses'), icon: BookOpenIcon, path: '/admin/courses' },
        { name: t('របាយការណ៍', 'Reports'), icon: ChartBarIcon, path: '/admin/reports' },
        // { name: t('ការកំណត់', 'Settings'), icon: Cog6ToothIcon, path: '/admin/settings' },
      ],
    },
    Teacher: {
      label: t('គ្រូបង្រៀន', 'Teacher'),
      items: [
        { name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'), icon: HomeIcon, path: '/teacher/dashboard' },
        { name: t('មុខវិជ្ជា', 'Courses'), icon: BookOpenIcon, path: '/teacher/courses' },
        { name: t('មេរៀន', 'Lessons'), icon: FolderIcon, path: '/teacher/lessons' },
        { name: t('សិស្ស', 'Students'), icon: UsersIcon, path: '/teacher/students' },
        { name: t('វត្តមានសិស្ស', 'Attendance'), icon: ClipboardDocumentListIcon, path: '/teacher/attendance' },
        { name: t('ពិន្ទុ', 'Grades'), icon: ChartBarIcon, path: '/teacher/grades' },
        { name: t('កិច្ចការ', 'Assignments'), icon: DocumentArrowUpIcon, path: '/teacher/assignments' },
        { name: t('កម្រងសំណួរ', 'Quizzes'), icon: PencilSquareIcon, path: '/teacher/quizzes' },
      ],
    },
    Student: {
      label: t('សិស្ស', 'Student'),
      items: [
        { name: t('ផ្ទាំងគ្រប់គ្រង', 'Dashboard'), icon: HomeIcon, path: '/student/dashboard' },
        { name: t('មុខវិជ្ជា', 'Courses'), icon: BookOpenIcon, path: '/student/courses' },
        { name: t('មេរៀន', 'Lessons'), icon: FolderIcon, path: '/student/lessons' },
        { name: t('វត្តមាន', 'Attendance'), icon: ClipboardDocumentListIcon, path: '/student/attendance' },
        { name: t('ពិន្ទុ', 'Grades'), icon: ChartBarIcon, path: '/student/grades' },
        { name: t('កិច្ចការ', 'Assignments'), icon: DocumentArrowUpIcon, path: '/student/assignments' },
        { name: t('កម្រងសំណួរ', 'Quizzes'), icon: PencilSquareIcon, path: '/student/quizzes' },
      ],
    },
  };

  // ==========================================
  // GET CURRENT ROLE CONFIG
  // ==========================================
  const roleKey = Object.keys(NAV_CONFIG).find((role) => hasRole(role));
  const section = roleKey ? NAV_CONFIG[roleKey] : null;
  const navItems = section?.items || [];

  // ==========================================
  // REMOVE DUPLICATES
  // ==========================================
  const uniqueNavItems = navItems.reduce((acc, current) => {
    const exists = acc.find(item => item.path === current.path && item.name === current.name);
    if (!exists) {
      acc.push(current);
    }
    return acc;
  }, []);

  return (
    <aside className="w-64 bg-linear-to-b from-blue-950 via-blue-900 to-indigo-950 border-r border-blue-800/30 min-h-screen flex flex-col shadow-2xl relative overflow-hidden">
      
      {/* Decorative Background Elements - Gold accents */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-yellow-500/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-yellow-400/5 rounded-full blur-3xl -ml-10 -mb-10"></div>
      <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-400/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-linear-to-b from-blue-800/10 via-transparent to-blue-950/20"></div>
      
      <div className="relative z-10 flex flex-col h-full">
        {/* Header Logo */}
        <div className="px-5 pt-6 pb-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-linear-to-br from-yellow-400 via-yellow-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-lg shadow-yellow-500/30 border border-yellow-400/30">
              <AcademicCapIcon className="h-7 w-7 text-blue-950" />
            </div>
            <div>
              <p className="text-sm font-bold text-white tracking-wide">
                LMS College
              </p>
              <p className="text-[10px] text-yellow-400/70 mt-0.5 tracking-wider">
                {t('ប្រព័ន្ធគ្រប់គ្រងសិក្សា', 'Learning Management System')}
              </p>
            </div>
          </div>
          {section && (
            <div className="mt-4 flex items-center gap-2">
              <div className="h-px flex-1 bg-linear-to-r from-yellow-500/20 to-transparent"></div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-yellow-400/60 uppercase whitespace-nowrap">
                {section.label}
              </p>
              <div className="h-px flex-1 bg-linear-to-l from-yellow-500/20 to-transparent"></div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="px-3 flex-1 mt-2 overflow-y-auto">
          <div className="space-y-1">
            {uniqueNavItems.map((item) => (
              <NavLink
                key={`${item.path}-${item.name}`}
                to={item.path}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 ${
                    isActive
                      ? 'bg-linear-to-r from-yellow-400 to-yellow-500 text-blue-950 shadow-lg shadow-yellow-500/30 scale-[1.02]'
                      : 'text-blue-200/70 hover:bg-blue-800/50 hover:text-yellow-300 hover:shadow-sm hover:scale-[1.01]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full transition-all duration-300 ${
                        isActive 
                          ? 'bg-linear-to-b from-yellow-300 to-yellow-500 opacity-100 shadow-lg shadow-yellow-500/50' 
                          : 'opacity-0 group-hover:opacity-50 bg-yellow-400'
                      }`}
                    />
                    <item.icon
                      className={`h-5 w-5 shrink-0 transition-all duration-300 ${
                        isActive 
                          ? 'text-blue-950 drop-shadow-md' 
                          : 'text-blue-400/60 group-hover:text-yellow-300 group-hover:scale-110'
                      }`}
                      aria-hidden="true"
                    />
                    <span className={`truncate transition-all duration-300 ${isActive ? 'text-blue-950 font-bold' : 'group-hover:text-yellow-300'}`}>
                      {item.name}
                    </span>
                    {isActive && (
                      <span className="ml-auto flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-950 animate-pulse"></span>
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-950/50 animate-pulse animation-delay-200"></span>
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer Section - Gold themed */}
        <div className="px-3 mt-4 pb-4">
          <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-yellow-500 via-yellow-400 to-yellow-600 p-4 border border-yellow-300/30 shadow-lg shadow-yellow-500/20">
            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-950/20 rounded-full blur-2xl"></div>
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/10 rounded-full blur-xl"></div>
            
            <div className="relative flex items-start gap-3">
              <div className="h-10 w-10 bg-blue-950/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-blue-950/20 shrink-0">
                <AcademicCapIcon className="h-5 w-5 text-blue-950" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-blue-950 truncate">LMS College</p>
                <p className="text-[10px] text-blue-950/70 mt-0.5">
                  {t('ប្រព័ន្ធគ្រប់គ្រងសិក្សា', 'Learning Management System')}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-blue-950/80 font-medium">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50"></span>
                    {t('សកម្ម', 'Active')}
                  </span>
                  <span className="h-3 w-px bg-blue-950/20"></span>
                  <span className="text-[10px] text-blue-950/60">v2.0.1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .animation-delay-200 {
          animation-delay: 200ms;
        }
        
        /* Custom scrollbar */
        ::-webkit-scrollbar {
          width: 4px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(251, 191, 36, 0.3);
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(251, 191, 36, 0.5);
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;
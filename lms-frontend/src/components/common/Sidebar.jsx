// src/components/common/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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

const NAV_CONFIG = {
  Admin: {
    label: 'អ្នកគ្រប់គ្រង',
    items: [
      { name: 'ផ្ទាំងគ្រប់គ្រង', icon: HomeIcon, path: '/admin/dashboard' },
      { name: 'គ្រូបង្រៀន', icon: AcademicCapIcon, path: '/admin/teachers' },
      { name: 'សិស្ស', icon: UserGroupIcon, path: '/admin/students' },
      { name: 'មុខវិជ្ជា', icon: BookOpenIcon, path: '/admin/courses' },
      { name: 'ដេប៉ាតឺម៉ង់', icon: Squares2X2Icon, path: '/admin/departments' }, // បន្ថែមថ្មី "ដេប៉ាតឺម៉ង់"
      { name: 'ការកំណត់', icon: Cog6ToothIcon, path: '/admin/settings' },
    ],
  },
  Teacher: {
    label: 'គ្រូបង្រៀន',
    items: [
      { name: 'ផ្ទាំងគ្រប់គ្រង', icon: HomeIcon, path: '/teacher/dashboard' },
      { name: 'ថ្នាក់រៀន', icon: UserGroupIcon, path: '/teacher/classroom' },
      { name: 'សិស្ស', icon: UsersIcon, path: '/teacher/students/create' },
      { name: 'វត្តមាន', icon: ClipboardDocumentListIcon, path: '/teacher/attendance' },
      { name: 'ពិន្ទុ', icon: ChartBarIcon, path: '/teacher/scores' },
      { name: 'មុខវិជ្ជា', icon: BookOpenIcon, path: '/teacher/subjects/create' },
      { name: 'កិច្ចការ', icon: DocumentArrowUpIcon, path: '/teacher/assignments/upload' },
      { name: 'កិច្ចការផ្ទះ', icon: FolderIcon, path: '/teacher/homework/upload' },
      { name: 'វីដេអូ', icon: VideoCameraIcon, path: '/teacher/videos/upload' },
      { name: 'ការប្រឡងអនឡាញ', icon: PencilSquareIcon, path: '/teacher/exam' },
    ],
  },
  Student: {
    label: 'សិស្ស',
    items: [
      { name: 'ផ្ទាំងគ្រប់គ្រង', icon: HomeIcon, path: '/student/dashboard' },
      { name: 'វត្តមាន', icon: ClipboardDocumentListIcon, path: '/student/attendance' },
      { name: 'ពិន្ទុ', icon: ChartBarIcon, path: '/student/scores' },
      { name: 'កិច្ចការ', icon: DocumentArrowUpIcon, path: '/student/assignments/upload' },
      { name: 'កិច្ចការផ្ទះ', icon: FolderIcon, path: '/student/homework/upload' },
    ],
  },
};

const Sidebar = () => {
  const { hasRole } = useAuth();

  const roleKey = Object.keys(NAV_CONFIG).find((role) => hasRole(role));
  const section = roleKey ? NAV_CONFIG[roleKey] : null;
  const navItems = section?.items || [];

  // យកដេប៉ាតឺម៉ង់ចេញ ប្រសិនបើមានទ្វេ
  const uniqueNavItems = navItems.reduce((acc, current) => {
    const exists = acc.find(item => item.path === current.path && item.name === current.name);
    if (!exists) {
      acc.push(current);
    }
    return acc;
  }, []);

  return (
    <aside className="w-64 bg-white border-r border-gray-100 min-h-screen flex flex-col">
      {section && (
        <div className="px-5 pt-6 pb-3">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-gray-400 uppercase">
            {section.label}
          </p>
        </div>
      )}

      <nav className="px-3 flex-1">
        <div className="space-y-1">
          {uniqueNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors duration-150 ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-primary-600 transition-opacity duration-150 ${
                      isActive ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  <item.icon
                    className={`h-5 w-5 shrink-0 transition-colors duration-150 ${
                      isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.name}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="px-5 py-4 mx-3 mb-4 rounded-xl bg-linear-to-br from-primary-50 to-accent-50 border border-primary-100">
        <p className="text-xs font-medium text-primary-800">LMS College</p>
        <p className="text-[11px] text-primary-600 mt-0.5">ប្រព័ន្ធគ្រប់គ្រងសិក្សា</p>
      </div>
    </aside>
  );
};

export default Sidebar;
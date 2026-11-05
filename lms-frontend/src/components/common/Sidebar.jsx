// src/components/common/Sidebar.jsx
import React, { useState, useEffect, useRef } from 'react';
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

const Sidebar = () => {
  const { hasRole } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  // State និង Ref សម្រាប់គ្រប់គ្រងផ្ទាំងម៉ឺនុយរង (Dropdown / Popover)
  const [openPopover, setOpenPopover] = useState(() => {
    return location.pathname.startsWith('/admin/students') ? '/admin/students' : null;
  });
  const popoverRef = useRef(null);
  const spacerRef = useRef(null);

  // ✅ គណនាទីតាំងពីខាងលើ (Top Offset) ដោយស្វ័យប្រវត្តិតាមកម្ពស់ Navbar ជាក់ស្តែង
  const [topOffset, setTopOffset] = useState(84);

  useEffect(() => {
    const updatePosition = () => {
      if (spacerRef.current) {
        const rect = spacerRef.current.getBoundingClientRect();
        const calculatedTop = Math.max(16, Math.round(rect.top + window.scrollY));
        setTopOffset(calculatedTop);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, []);

  // បិទផ្ទាំងផុសដោយស្វ័យប្រវត្តិ ពេលចុចក្រៅប្រអប់ (សម្រាប់អេក្រង់ Tablet)
  useEffect(() => {
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
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // បើកទុកដោយស្វ័យប្រវត្តិនៅលើកុំព្យូទ័រ ពេលកំពុងស្ថិតក្នុងទំព័រគ្រប់គ្រងសិស្ស
  useEffect(() => {
    if (location.pathname.startsWith('/admin/students') && window.innerWidth >= 1024) {
      setOpenPopover('/admin/students');
    } else if (!location.pathname.startsWith('/admin/students')) {
      setOpenPopover(null);
    }
  }, [location.pathname, location.search]);

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
        { name: t('មុខវិជ្ជា', 'Courses'), icon: BookOpenIcon, path: '/admin/courses' },
        {
          name: t('គ្រប់គ្រងសិស្ស', 'Manage Students'),
          icon: UserGroupIcon,
          path: '/admin/students',
          children: [
            { name: t('ឆ្នាំទី១', 'Year 1'), path: '/admin/students/year-1', year: 'Year 1' },
            { name: t('ឆ្នាំទី២', 'Year 2'), path: '/admin/students/year-2', year: 'Year 2' },
            { name: t('ឆ្នាំទី៣', 'Year 3'), path: '/admin/students/year-3', year: 'Year 3' },
            { name: t('ឆ្នាំទី៤', 'Year 4'), path: '/admin/students/year-4', year: 'Year 4' },
          ],
        },
        { name: t('របាយការណ៍', 'Reports'), icon: ChartBarIcon, path: '/admin/reports' },
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

  const roleKey = Object.keys(NAV_CONFIG).find((role) => hasRole(role));
  const isStudent = roleKey === 'Student';
  const section = roleKey ? NAV_CONFIG[roleKey] : null;
  const navItems = section?.items || [];

  const uniqueNavItems = navItems.reduce((acc, current) => {
    const exists = acc.find((item) => item.path === current.path && item.name === current.name);
    if (!exists) {
      acc.push(current);
    }
    return acc;
  }, []);

  const currentYearParam = new URLSearchParams(location.search).get('year') || 'all';

  return (
    <>
      {/* ✅ Spacer Div សម្រាប់ទប់ទទឹងជួរឈរខាងឆ្វេងឱ្យនៅដដែល */}
      <div
        ref={spacerRef}
        className="hidden md:block md:w-20 lg:w-[260px] shrink-0 ml-4 mr-2 my-3 pointer-events-none select-none"
        aria-hidden="true"
      />

      {/* ✅ Modern V18 Floating Sidebar */}
      <aside
        style={{
          top: `${topOffset}px`,
          height: `calc(100vh - ${topOffset + 16}px)`,
        }}
        className={`hidden md:flex md:w-20 lg:w-[260px] fixed left-4 rounded-[1.75rem] flex-col shrink-0 transition-all duration-300 z-30 shadow-[0_20px_50px_rgba(8,15,40,0.45)] overflow-hidden ${
          isStudent
            ? 'bg-gradient-to-b from-blue-950 via-indigo-950 to-violet-950 border border-indigo-400/25'
            : 'bg-gradient-to-b from-slate-950 via-blue-950 to-indigo-950 border border-blue-800/45'
        }`}
      >
        {/* ផ្ទៃក្រឡាអុចៗស្រាលៗ និងពន្លឺ Glow បែបទំនើប */}
        <div className="std-sidebar-grid-pattern absolute inset-0 opacity-15 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-52 h-52 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full w-full py-2.5">
          {/* ============================================================== */}
          {/* 📌 1. MODERN HEADER LOGO & ROLE BADGE                          */}
          {/* ============================================================== */}
          <div className="px-3.5 lg:px-5 pt-3.5 pb-2 shrink-0">
            <div className="flex items-center justify-center lg:justify-start gap-3.5">
              <div
                className={`group relative h-11 w-11 rounded-2xl flex items-center justify-center shadow-lg shrink-0 border transition-transform duration-300 hover:scale-105 ${
                  isStudent
                    ? 'bg-gradient-to-br from-indigo-500 via-blue-600 to-violet-600 border-indigo-300/40 shadow-indigo-500/25'
                    : 'bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 border-blue-300/40 shadow-blue-500/25'
                }`}
              >
                <AcademicCapIcon className="h-6 w-6 stroke-[2.2] text-yellow-300" />
              </div>

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

            {/* ✅ ដក «ម៉ឺនុយគោល» ចេញ ហើយយកផ្លាកតួនាទី (ឧ. ✨ សិស្ស) មកដាក់ជំនួសនៅខាងឆ្វេង */}
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

          {/* ============================================================== */}
          {/* 📌 2. NAVIGATION LINKS (V18 Smooth Micro-Interactions)         */}
          {/* ============================================================== */}
          <nav className="sidebar-nav px-3 lg:px-4 pt-1.5 pb-3 flex-1 space-y-1.5 md:overflow-visible lg:overflow-y-auto">
            {uniqueNavItems.map((item) => {
              // ១. ប៊ូតុងមានម៉ឺនុយរង (គ្រប់គ្រងសិស្ស សម្រាប់ Admin)
              if (item.children) {
                const isParentActive = location.pathname.startsWith(item.path);
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
                      className={`w-full group relative flex items-center justify-center lg:justify-between p-2 lg:px-3 lg:py-2 text-[14.5px] rounded-2xl border transition-all duration-200 cursor-pointer ${
                        isParentActive || isPopoverOpen
                          ? 'bg-gradient-to-r from-white/15 to-white/[0.06] backdrop-blur-md text-white font-extrabold border-white/20 shadow-lg'
                          : 'border-transparent text-blue-100/80 font-semibold hover:bg-white/[0.07] hover:text-white lg:hover:translate-x-1'
                      }`}
                    >
                      {(isParentActive || isPopoverOpen) && (
                        <span className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.9)]" />
                      )}

                      <div className="flex items-center gap-3 min-w-0">
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

                      {/* Tablet Hover Tooltip */}
                      {!isPopoverOpen && (
                        <span className="hidden md:group-hover:block lg:group-hover:hidden absolute left-full ml-4 px-3.5 py-2 bg-slate-900/95 backdrop-blur-md text-white text-[13px] font-bold rounded-xl shadow-xl border border-white/15 whitespace-nowrap z-50 pointer-events-none">
                          {item.name}
                        </span>
                      )}
                    </button>

                    {/* ម៉ឺនុយរង (ឆ្នាំទី១ - ឆ្នាំទី៤) */}
                    {isPopoverOpen && (
                      <div className="absolute left-full top-0 ml-3 w-52 bg-slate-950/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.45)] p-2 z-50 lg:static lg:ml-6 lg:mt-1.5 lg:w-auto lg:bg-transparent lg:backdrop-blur-none lg:border-0 lg:border-l-2 lg:border-white/15 lg:rounded-none lg:shadow-none lg:p-0 lg:pl-3.5 animate-dropDown">
                        <div className="flex flex-col space-y-1 relative z-10">
                          {item.children.map((sub) => {
                            const isSubActive =
                              location.pathname === sub.path ||
                              (location.pathname === '/admin/students' &&
                                currentYearParam === sub.year);

                            return (
                              <Link
                                key={sub.path}
                                to={sub.path}
                                onClick={() => {
                                  if (window.innerWidth < 1024) setOpenPopover(null);
                                }}
                                className={`flex items-center justify-between px-3.5 py-2 rounded-xl text-[13.5px] transition-all duration-200 ${
                                  isSubActive
                                    ? 'bg-white/15 text-yellow-300 font-extrabold border border-white/20 shadow-xs'
                                    : 'text-blue-100/75 hover:bg-white/[0.08] hover:text-white lg:hover:translate-x-1 font-bold border border-transparent'
                                }`}
                              >
                                <span className="truncate leading-relaxed">{sub.name}</span>
                                {isSubActive && (
                                  <span className="h-2 w-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)] shrink-0"></span>
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
              return (
                <NavLink
                  key={`${item.path}-${item.name}`}
                  to={item.path}
                  className={({ isActive }) =>
                    `group relative flex items-center justify-center lg:justify-start gap-3 p-2 lg:px-3 lg:py-2 text-[14.5px] rounded-2xl border transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-white/15 to-white/[0.06] backdrop-blur-md text-white font-extrabold border-white/20 shadow-lg'
                        : 'border-transparent text-blue-100/80 font-semibold hover:bg-white/[0.07] hover:text-white lg:hover:translate-x-1'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* របារពន្លឺតូចនៅគែមឆ្វេងពេល Active */}
                      {isActive && (
                        <span className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.9)]" />
                      )}

                      {/* ប្រអប់រូបតំណាងបែប V18 Glass Box */}
                      <div
                        className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
                          isActive
                            ? 'bg-gradient-to-br from-amber-400/25 to-yellow-500/15 border border-yellow-400/40 text-yellow-300 shadow-xs scale-105'
                            : 'bg-white/[0.05] border border-white/[0.06] text-blue-200/85 group-hover:bg-white/10 group-hover:text-white group-hover:scale-105'
                        }`}
                      >
                        <item.icon
                          className={`h-[19px] w-[19px] transition-all duration-200 ${
                            isActive ? 'stroke-[2.2]' : 'stroke-[1.9]'
                          }`}
                          aria-hidden="true"
                        />
                      </div>

                      <span className="truncate hidden lg:inline leading-relaxed">
                        {item.name}
                      </span>

                      {isActive && (
                        <span className="hidden lg:block ml-auto mr-1 h-2 w-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)] shrink-0" />
                      )}

                      {/* Tablet Hover Tooltip */}
                      <span className="hidden md:group-hover:block lg:group-hover:hidden absolute left-full ml-4 px-3.5 py-2 bg-slate-900/95 backdrop-blur-md text-white text-[13px] font-bold rounded-xl shadow-xl border border-white/15 whitespace-nowrap z-50 pointer-events-none">
                        {item.name}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* ============================================================== */}
          {/* 📌 3. MINIMALIST FOOTER SECTION                                */}
          {/* ============================================================== */}
          <div className="px-4 lg:px-5 pb-3 pt-2.5 shrink-0 mt-auto border-t border-white/10">
            <div className="hidden lg:flex items-center justify-between text-[11.5px] font-semibold text-blue-200/70">
              <span className="truncate">© 2026 RPITSSVR</span>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] text-emerald-300 font-extrabold bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-400/25 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                v2.0
              </span>
            </div>
            <div className="flex lg:hidden justify-center">
              <span
                className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/15 border border-emerald-400/25"
                title={t('កំពុងដំណើរការ (v2.0)', 'System Online (v2.0)')}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              </span>
            </div>
          </div>
        </div>

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
      </aside>
    </>
  );
};

export default Sidebar;
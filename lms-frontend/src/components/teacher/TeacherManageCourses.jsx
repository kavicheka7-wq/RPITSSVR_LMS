// src/components/teacher/TeacherManageCourses.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import XLSX from 'xlsx-js-style';
import {
  BookOpenIcon,
  ChartBarIcon,
  BuildingLibraryIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  ListBulletIcon,
  FolderIcon,
  ClipboardDocumentListIcon,
  XMarkIcon,
  DocumentIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនីគ្រូម្នាក់ៗ (User-Scoped 0ms Cache)
// ============================================================================
const CACHE_KEY_SHARED_COURSES = 'cached_teacher_courses_list_v6';
const CACHE_KEY_VIEW_MODE = 'teacher_courses_view_mode';
const getTeacherCoursesCacheKey = (uid) => `cached_teacher_courses_list_v8_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់គ្រូម្នាក់ៗ
const TEACHER_COURSES_MEM_CACHE = {
  uid: null,
  courses: null,
  lastSyncedAt: 0,
};

const readStorageJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// ✅ អនុគមន៍ចាប់យកអត្តសញ្ញាណគ្រូឱ្យជាក់លាក់តាំងពីវិនាទីដំបូង
const resolveTeacherUid = (contextUser) => {
  if (contextUser) {
    const id =
      contextUser.id ||
      contextUser.user_id ||
      contextUser.teacher?.id ||
      contextUser.email;
    if (id) return String(id);
  }
  try {
    const raw =
      localStorage.getItem('user') || localStorage.getItem('auth_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      const u = parsed?.user || parsed?.data || parsed;
      const id = u?.id || u?.user_id || u?.teacher?.id || u?.email;
      if (id) return String(id);
    }
  } catch {}
  return 'default_teacher';
};

// ✅ អនុគមន៍បញ្ជូនសារជូនដំណឹងទៅកាន់រូបកណ្ដឹង (NotificationBell) លើ Navbar
const pushLocalNotification = (notif) => {
  try {
    const userObjStr =
      localStorage.getItem('auth_user') || localStorage.getItem('user');
    let uid = 'default';
    let role = 'teacher';
    if (userObjStr) {
      const userObj = JSON.parse(userObjStr);
      uid = userObj.id || userObj.user_id || userObj.email || 'default';
      if (userObj.role) {
        const rName =
          typeof userObj.role === 'string'
            ? userObj.role
            : userObj.role.role_name || userObj.role.name || 'teacher';
        role = rName.toString().toLowerCase();
      }
    }

    const keysToUpdate = Array.from(
      new Set([`lms_notifs_teacher_${uid}`, `lms_notifs_${role}_${uid}`])
    );

    const newNotif = {
      id: `local_crs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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

// ពណ៌លម្អសម្រាប់កាតមុខវិជ្ជានីមួយៗ (គាំទ្រទាំងថ្ងៃ និងយប់យ៉ាងស្រស់ស្អាត)
const CARD_THEMES = [
  {
    bar: 'from-blue-600 to-indigo-600',
    iconClass: 'course-theme-blue',
  },
  {
    bar: 'from-emerald-500 to-teal-600',
    iconClass: 'course-theme-emerald',
  },
  {
    bar: 'from-purple-600 to-indigo-600',
    iconClass: 'course-theme-purple',
  },
  {
    bar: 'from-amber-500 to-orange-500',
    iconClass: 'course-theme-amber',
  },
  {
    bar: 'from-rose-500 to-pink-600',
    iconClass: 'course-theme-rose',
  },
  {
    bar: 'from-cyan-500 to-blue-600',
    iconClass: 'course-theme-cyan',
  },
];

const TeacherManageCourses = () => {
  const { t } = useLanguage();
  const { user } = useAuth();

  // ✅ កំណត់អត្តសញ្ញាណគ្រូបច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentTeacherId = useMemo(() => resolveTeacherUid(user), [user]);

  // បើប្ដូរគណនីគ្រូ ឱ្យសម្អាត RAM Cache ចាស់ចោលភ្លាមៗ
  if (
    TEACHER_COURSES_MEM_CACHE.uid &&
    TEACHER_COURSES_MEM_CACHE.uid !== currentTeacherId
  ) {
    TEACHER_COURSES_MEM_CACHE.courses = null;
    TEACHER_COURSES_MEM_CACHE.lastSyncedAt = 0;
  }
  TEACHER_COURSES_MEM_CACHE.uid = currentTeacherId;

  // ✅ ១. អានពី Cache ភ្លាមៗក្នុង 0 វិនាទី
  const [courses, setCourses] = useState(() => {
    if (Array.isArray(TEACHER_COURSES_MEM_CACHE.courses)) {
      return TEACHER_COURSES_MEM_CACHE.courses;
    }
    const fromUserKey = readStorageJson(
      getTeacherCoursesCacheKey(currentTeacherId),
      null
    );
    if (Array.isArray(fromUserKey)) {
      TEACHER_COURSES_MEM_CACHE.courses = fromUserKey;
      return fromUserKey;
    }
    return readStorageJson(CACHE_KEY_SHARED_COURSES, []);
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');

  // State សម្រាប់ប្តូរទម្រង់បង្ហាញ (grid = កាត, list = តារាង)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(CACHE_KEY_VIEW_MODE) || 'grid';
    } catch {
      return 'grid';
    }
  });

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(CACHE_KEY_VIEW_MODE, mode);
    } catch {}
  };

  // ============================================================================
  // 📌 ផ្នែកទី២៖ ធ្វើបច្ចុប្បន្នភាពទិន្នន័យមុខវិជ្ជាដោយមិនរាំងស្ទះ UI (Non-blocking 0ms Sync)
  // ============================================================================
  const fetchCourses = useCallback(async () => {
    const now = Date.now();
    const cachedForUser =
      TEACHER_COURSES_MEM_CACHE.courses !== null
        ? TEACHER_COURSES_MEM_CACHE.courses
        : readStorageJson(getTeacherCoursesCacheKey(currentTeacherId), null);

    if (Array.isArray(cachedForUser)) {
      setCourses(cachedForUser);
      TEACHER_COURSES_MEM_CACHE.courses = cachedForUser;

      if (
        TEACHER_COURSES_MEM_CACHE.uid === currentTeacherId &&
        now - TEACHER_COURSES_MEM_CACHE.lastSyncedAt < 25000
      ) {
        return;
      }
    }

    try {
      const response = await api.get('/teacher/courses');
      const coursesData = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
        ? response.data
        : [];

      setCourses(coursesData);
      TEACHER_COURSES_MEM_CACHE.uid = currentTeacherId;
      TEACHER_COURSES_MEM_CACHE.courses = coursesData;
      TEACHER_COURSES_MEM_CACHE.lastSyncedAt = Date.now();

      try {
        localStorage.setItem(
          getTeacherCoursesCacheKey(currentTeacherId),
          JSON.stringify(coursesData)
        );
        localStorage.setItem(
          CACHE_KEY_SHARED_COURSES,
          JSON.stringify(coursesData)
        );
        localStorage.setItem(
          'cached_teacher_courses_list',
          JSON.stringify(coursesData)
        );
      } catch (e) {
        console.warn('Failed to cache teacher courses:', e);
      }
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  }, [currentTeacherId]);

  useEffect(() => {
    setSelectedDept('all');
    setSearchTerm('');
    fetchCourses();
  }, [fetchCourses]);

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ ការច្រោះទិន្នន័យតាមដេប៉ាតឺម៉ង់ និងការនាំចេញឯកសារ Excel (.xlsx)
  // ============================================================================
  const departmentFilters = useMemo(() => {
    const map = new Map();
    courses.forEach((c) => {
      const deptId = c.department_id || c.department?.id;
      const deptName = c.department?.department_name || c.department?.name;
      if (deptId && deptName) {
        if (!map.has(deptId)) {
          map.set(deptId, {
            department_id: deptId,
            department_name: deptName,
            course_count: 0,
          });
        }
        map.get(deptId).course_count += 1;
      }
    });
    return Array.from(map.values());
  }, [courses]);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const deptId = course.department_id || course.department?.id;
      const matchesDept =
        selectedDept === 'all' || String(deptId) === String(selectedDept);

      const q = searchTerm.toLowerCase().trim();
      if (!q) return matchesDept;

      const nameMatch = course.course_name?.toLowerCase().includes(q);
      const codeMatch = course.course_code?.toLowerCase().includes(q);
      const descMatch = course.description?.toLowerCase().includes(q);
      const deptNameMatch = (
        course.department?.department_name ||
        course.department?.name ||
        ''
      )
        .toLowerCase()
        .includes(q);

      return matchesDept && (nameMatch || codeMatch || descMatch || deptNameMatch);
    });
  }, [courses, selectedDept, searchTerm]);

  const handleExportExcel = () => {
    if (filteredCourses.length === 0) {
      toast.warning(
        t('គ្មានទិន្នន័យមុខវិជ្ជាសម្រាប់នាំចេញទេ', 'No courses to export')
      );
      return;
    }

    const exportData = filteredCourses.map((course, idx) => ({
      'ល.រ': idx + 1,
      'កូដមុខវិជ្ជា': course.course_code || '—',
      'ឈ្មោះមុខវិជ្ជា': course.course_name || '—',
      'ដេប៉ាតឺម៉ង់':
        course.department?.department_name || course.department?.name || '—',
      'ចំនួនក្រេឌីត': course.credit ?? 3,
      'ការពិពណ៌នា': course.description || '—',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const range = XLSX.utils.decode_range(worksheet['!ref']);

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!worksheet[cellAddress]) continue;
        const isHeader = R === 0;
        worksheet[cellAddress].s = {
          font: {
            name: 'Khmer OS Siemreap',
            sz: isHeader ? 11 : 10,
            bold: isHeader,
            color: { rgb: isHeader ? 'FFFFFF' : '1E293B' },
          },
          fill: {
            fgColor: {
              rgb: isHeader ? '1E3A8A' : R % 2 === 1 ? 'FFFFFF' : 'F8FAFC',
            },
          },
          alignment: {
            vertical: 'center',
            horizontal: isHeader || C === 0 || C === 4 ? 'center' : 'left',
            wrapText: true,
          },
          border: {
            top: { style: 'thin', color: { rgb: 'CBD5E1' } },
            bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } },
          },
        };
      }
    }

    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 16 },
      { wch: 28 },
      { wch: 26 },
      { wch: 14 },
      { wch: 38 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Teaching_Courses');
    XLSX.writeFile(
      workbook,
      `My_Teaching_Courses_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    toast.success(
      t(
        'បាននាំចេញបញ្ជីមុខវិជ្ជាទៅជា Excel ដោយជោគជ័យ!',
        'Courses exported to Excel successfully!'
      )
    );

    pushLocalNotification({
      titleKm: 'បាននាំចេញបញ្ជីមុខវិជ្ជាបង្រៀនទៅ Excel',
      titleEn: 'Teaching Courses Exported to Excel',
      descKm: `បញ្ជីមុខវិជ្ជាបង្រៀនចំនួន ${filteredCourses.length} មុខវិជ្ជា ត្រូវបានទាញយកជា Excel ជោគជ័យ។`,
      descEn: `Exported ${filteredCourses.length} teaching courses to Excel.`,
      category: 'export',
      link: '/teacher/courses',
    });
  };

  return (
    <div className="tc-page-bg p-4 sm:p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6 animate-fadeIn pb-28 lg:pb-10">
      
      {/* ================================================================== */}
      {/* 📌 1. HEADER BANNER                                                */}
      {/* ================================================================== */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-6 sm:p-8 shadow-xl border border-blue-900">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-[28px] lg:text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shrink-0">
                <BookOpenIcon className="h-7 w-7 sm:h-8 sm:w-8 text-yellow-400" />
              </div>
              <span>{t('បញ្ជីមុខវិជ្ជាបង្រៀន', 'Teaching Courses List')}</span>
            </h1>
            <p className="text-blue-200/80 text-xs sm:text-sm max-w-2xl font-medium leading-relaxed">
              {t(
                'ពិនិត្យមើលបញ្ជីមុខវិជ្ជា ក្រេឌីត និងដេប៉ាតឺម៉ង់ដែលលោកគ្រូ/អ្នកគ្រូត្រូវបានចាត់តាំងឱ្យបង្រៀន។',
                'View your assigned teaching courses, credits, and departments.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <span className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-xs sm:text-sm font-extrabold text-yellow-300">
              <AcademicCapIcon className="h-5 w-5 shrink-0" />
              <span>
                {courses.length} {t('មុខវិជ្ជាសរុប', 'Total Courses')}
              </span>
            </span>

            {filteredCourses.length > 0 && (
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center justify-center px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <DocumentIcon className="h-5 w-5 mr-2" />
                {t('នាំចេញ Excel', 'Export Excel')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 📌 2. SEARCH BAR, DEPARTMENT PILLS & VIEW SWITCHER                 */}
      {/* ================================================================== */}
      <div className="tc-surface-card bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Search Input */}
          <div className="relative w-full md:max-w-md">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder={t(
                'ស្វែងរកឈ្មោះមុខវិជ្ជា ឬកូដមុខវិជ្ជា...',
                'Search course name or code...'
              )}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="tc-input w-full pl-11 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* View Mode Toggle (Grid Cards vs Table List) */}
          <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-3">
            <span className="tc-text-secondary text-xs font-bold text-gray-500">
              {t('បង្ហាញ៖', 'Showing:')}{' '}
              <strong className="text-blue-600 dark:text-blue-400">
                {filteredCourses.length}
              </strong>{' '}
              {t('មុខវិជ្ជា', 'Courses')}
            </span>
            <div className="course-view-switcher inline-flex items-center p-1 bg-gray-100 rounded-xl border border-gray-200">
              <button
                type="button"
                onClick={() => handleViewModeChange('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'course-view-btn-active bg-white text-blue-600 shadow-xs'
                    : 'course-view-btn-inactive text-gray-500 hover:text-gray-800'
                }`}
              >
                <Squares2X2Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t('កាត', 'Cards')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'course-view-btn-active bg-white text-blue-600 shadow-xs'
                    : 'course-view-btn-inactive text-gray-500 hover:text-gray-800'
                }`}
              >
                <ListBulletIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{t('តារាង', 'Table')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Department Filter Pills */}
        {departmentFilters.length > 0 && (
          <div className="tc-divider pt-3 border-t border-gray-100 flex flex-nowrap md:flex-wrap items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
            <span className="tc-text-secondary text-xs font-bold text-gray-500 flex items-center gap-1.5 shrink-0 mr-1">
              <BuildingLibraryIcon className="h-4 w-4 text-gray-400" />
              {t('ដេប៉ាតឺម៉ង់៖', 'Departments:')}
            </span>
            <button
              type="button"
              onClick={() => setSelectedDept('all')}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                selectedDept === 'all'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'course-dept-pill bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {t('ទាំងអស់', 'All')} ({courses.length})
            </button>

            {departmentFilters.map((dept) => {
              const isSelected =
                String(selectedDept) === String(dept.department_id);
              return (
                <button
                  key={dept.department_id}
                  type="button"
                  onClick={() => setSelectedDept(dept.department_id)}
                  className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'course-dept-pill bg-blue-50/70 text-blue-800 border-blue-100 hover:bg-blue-100/70'
                  }`}
                >
                  <span>{dept.department_name}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {dept.course_count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* 📌 3. MAIN CONTENT AREA (Empty State / Cards / Table)              */}
      {/* ================================================================== */}
      {filteredCourses.length === 0 ? (
        <div className="tc-surface-card bg-white rounded-[1.5rem] lg:rounded-3xl border border-gray-200 shadow-sm px-6 py-16 text-center">
          <div className="flex flex-col items-center">
            <BookOpenIcon className="h-16 w-16 text-gray-300 mb-3" />
            <p className="tc-text-primary font-extrabold text-gray-700 text-base">
              {searchTerm || selectedDept !== 'all'
                ? t('មិនឃើញមុខវិជ្ជាតាមការស្វែងរកទេ', 'No matching courses found')
                : t('មិនទាន់មានមុខវិជ្ជានៅឡើយទេ', 'No courses assigned yet')}
            </p>
            <p className="tc-text-secondary text-sm text-gray-400 mt-1">
              {searchTerm || selectedDept !== 'all'
                ? t(
                    'សូមសាកល្បងប្តូរពាក្យស្វែងរក ឬជ្រើសរើសដេប៉ាតឺម៉ង់ផ្សេង',
                    'Try changing your search keyword or department filter'
                  )
                : t(
                    'រង់ចាំការចាត់តាំងពីអ្នកគ្រប់គ្រងប្រព័ន្ធ',
                    'Waiting for assignment from administrator'
                  )}
            </p>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* ==============================================================
           OPTION A: MODERN COURSE CARDS GRID (ទម្រង់កាតមុខវិជ្ជាទំនើប)
        =============================================================== */
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {filteredCourses.map((course, index) => {
            const theme = CARD_THEMES[index % CARD_THEMES.length];
            const deptName =
              course.department?.department_name ||
              course.department?.name ||
              t('ទូទៅ', 'General');

            return (
              <div
                key={course.id}
                className="course-card bg-white rounded-2xl sm:rounded-3xl border border-gray-200/80 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between overflow-hidden group"
              >
                <div>
                  <div
                    className={`h-1.5 sm:h-2 w-full bg-gradient-to-r ${theme.bar}`}
                  />

                  <div className="p-3.5 sm:p-6">
                    {/* Top Row: Icon + Course Code & Credit Badge */}
                    <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-2.5 sm:gap-3 mb-3 sm:mb-4">
                      <div
                        className={`course-icon-box ${theme.iconClass} h-10 w-10 sm:h-12 sm:w-12 rounded-[10px] sm:rounded-2xl border flex items-center justify-center shrink-0 shadow-2xs`}
                      >
                        <BookOpenIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                      </div>

                      <div className="flex flex-wrap items-center justify-start xl:justify-end gap-1.5 sm:gap-2">
                        <span className="course-code-badge text-[9px] sm:text-xs font-extrabold px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg border">
                          {course.course_code}
                        </span>
                        <span className="course-credit-badge inline-flex items-center px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg text-[9px] sm:text-xs font-extrabold border">
                          {course.credit}{' '}
                          <span className="hidden sm:inline ml-1">
                            {t('ក្រេឌីត', 'Credits')}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Course Title & Description */}
                    <h3 className="tc-text-primary text-[13px] sm:text-lg font-extrabold text-gray-900 group-hover:text-blue-500 transition-colors line-clamp-2 sm:line-clamp-1 leading-snug">
                      {course.course_name}
                    </h3>
                    <p className="tc-text-secondary text-[10px] sm:text-xs font-medium text-gray-500 mt-1 sm:mt-1.5 line-clamp-2 min-h-[30px] sm:min-h-[34px] leading-relaxed">
                      {course.description ||
                        t('គ្មានការពិពណ៌នា', 'No description')}
                    </p>

                    {/* Department Tag */}
                    <div className="tc-divider mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100 flex items-center gap-1.5 sm:gap-2">
                      <BuildingLibraryIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 shrink-0" />
                      <span className="tc-text-secondary text-[10px] sm:text-xs font-bold text-gray-700 truncate">
                        {deptName}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ✅ Card Footer: បង្ហាញផ្លាកធម្មតា មិនឱ្យចុចបាន (Static Badges) */}
                <div className="course-card-footer px-2 sm:px-6 py-2.5 sm:py-4 bg-gray-50/50 border-t border-gray-100 grid grid-cols-3 gap-1 sm:gap-2.5">
                  <span className="course-static-badge flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg sm:rounded-xl bg-white text-gray-700 border border-gray-200/80 text-[9px] sm:text-[11px] font-extrabold shadow-2xs cursor-default select-none">
                    <FolderIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500 shrink-0" />
                    <span className="truncate">{t('មេរៀន', 'Lessons')}</span>
                  </span>
                  <span className="course-static-badge flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg sm:rounded-xl bg-white text-gray-700 border border-gray-200/80 text-[9px] sm:text-[11px] font-extrabold shadow-2xs cursor-default select-none">
                    <ClipboardDocumentListIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500 shrink-0" />
                    <span className="truncate">{t('វត្តមាន', 'Attendance')}</span>
                  </span>
                  <span className="course-static-badge flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg sm:rounded-xl bg-white text-gray-700 border border-gray-200/80 text-[9px] sm:text-[11px] font-extrabold shadow-2xs cursor-default select-none">
                    <ChartBarIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-500 shrink-0" />
                    <span className="truncate">{t('ពិន្ទុ', 'Grades')}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ==============================================================
           OPTION B: CLEAN TABLE VIEW (ទម្រង់តារាងសម្រាប់អ្នកចូលចិត្តមើលជាបញ្ជី)
        =============================================================== */
        <div className="tc-surface-card bg-white rounded-[1.5rem] lg:rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto hide-scrollbar">
            <table className="min-w-full border-collapse">
              <thead className="tc-table-head bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider w-16 whitespace-nowrap">
                    {t('ល.រ', 'No')}
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('មុខវិជ្ជា', 'Course')}
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('កូដមុខវិជ្ជា', 'Course Code')}
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('ដេប៉ាតឺម៉ង់', 'Department')}
                  </th>
                  <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('ក្រេឌីត', 'Credits')}
                  </th>
                  <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('ផ្នែកគ្រប់គ្រង', 'Modules')}
                  </th>
                </tr>
              </thead>
              <tbody className="tc-table-body bg-white">
                {filteredCourses.map((course, index) => {
                  const theme = CARD_THEMES[index % CARD_THEMES.length];
                  return (
                    <tr
                      key={course.id}
                      className="tc-table-row hover:bg-blue-50/30 transition-colors group"
                    >
                      <td className="tc-text-secondary px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-400">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div
                            className={`course-icon-box ${theme.iconClass} h-10 w-10 rounded-xl flex items-center justify-center font-medium text-sm border shadow-2xs shrink-0 transition-colors`}
                          >
                            <BookOpenIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="tc-text-primary text-sm font-extrabold text-gray-900 group-hover:text-blue-500 transition-colors">
                              {course.course_name}
                            </div>
                            <div className="tc-text-secondary text-[11px] font-medium text-gray-400 mt-0.5 line-clamp-1 max-w-md">
                              {course.description ||
                                t(
                                  'គ្មានការពិពណ៌នា',
                                  'No description available'
                                )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="course-code-badge text-xs font-extrabold px-3 py-1.5 rounded-lg border">
                          {course.course_code}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <BuildingLibraryIcon className="h-4 w-4 text-gray-400" />
                          <span className="tc-text-secondary text-sm font-bold text-gray-700">
                            {course.department?.department_name ||
                              course.department?.name ||
                              '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="course-credit-badge inline-flex items-center px-3.5 py-1.5 rounded-xl text-xs font-extrabold border">
                          {course.credit} {t('ក្រេឌីត', 'Credits')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {/* ✅ បង្ហាញផ្លាកធម្មតាក្នុងតារាង មិនឱ្យចុចបាន */}
                        <div className="inline-flex items-center gap-2">
                          <span className="course-static-badge inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-gray-700 text-xs font-bold border border-gray-200 cursor-default select-none">
                            <FolderIcon className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            {t('មេរៀន', 'Lessons')}
                          </span>
                          <span className="course-static-badge inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-gray-700 text-xs font-bold border border-gray-200 cursor-default select-none">
                            <ClipboardDocumentListIcon className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            {t('វត្តមាន', 'Attendance')}
                          </span>
                          <span className="course-static-badge inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-gray-700 text-xs font-bold border border-gray-200 cursor-default select-none">
                            <ChartBarIcon className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                            {t('ពិន្ទុ', 'Grades')}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 📌 4. CSS សម្រាប់កំណត់ពណ៌កាត ប៊ូតុង តារាង និងទម្រង់យប់ (DARK MODE)     */}
      {/* ================================================================== */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        /* Light mode subtle row dividers */
        .tc-table-row + .tc-table-row > td {
          border-top: 1px solid #f1f5f9;
        }

        /* ទម្រង់ថ្ងៃ (Light Mode Defaults) */
        .course-code-badge {
          background-color: #f1f5f9;
          color: #334155;
          border-color: #e2e8f0;
        }
        .course-credit-badge {
          background-color: #fffbeb;
          color: #b45309;
          border-color: #fde68a;
        }
        .course-theme-blue { background-color: #eff6ff; color: #2563eb; border-color: #dbeafe; }
        .course-theme-emerald { background-color: #ecfdf5; color: #059669; border-color: #d1fae5; }
        .course-theme-purple { background-color: #faf5ff; color: #9333ea; border-color: #f3e8ff; }
        .course-theme-amber { background-color: #fffbeb; color: #d97706; border-color: #fef3c7; }
        .course-theme-rose { background-color: #fff1f2; color: #e11d48; border-color: #ffe4e6; }
        .course-theme-cyan { background-color: #ecfeff; color: #0891b2; border-color: #cffafe; }

        /* ទម្រង់យប់ (Dark Mode Overrides) */
        html.dark .tc-page-bg {
          background-color: transparent !important;
        }
        html.dark .tc-surface-card,
        html.dark .course-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .tc-text-primary {
          color: #f8fafc !important;
        }
        html.dark .tc-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .tc-divider {
          border-color: #334155 !important;
        }
        html.dark .tc-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        html.dark .tc-input::placeholder {
          color: #64748b !important;
        }
        html.dark .tc-table-head {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .tc-table-head th {
          color: #94a3b8 !important;
        }
        html.dark .tc-table-body {
          background-color: #1e293b !important;
        }
        html.dark .tc-table-row + .tc-table-row > td {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .tc-table-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }
        html.dark .course-view-switcher {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .course-view-btn-active {
          background-color: #2563eb !important;
          color: #ffffff !important;
        }
        html.dark .course-view-btn-inactive {
          color: #94a3b8 !important;
        }
        html.dark .course-view-btn-inactive:hover {
          color: #f8fafc !important;
        }
        html.dark .course-dept-pill {
          background-color: #0f172a !important;
          color: #cbd5e1 !important;
          border-color: #334155 !important;
        }
        html.dark .course-dept-pill:hover {
          border-color: #3b82f6 !important;
          color: #60a5fa !important;
        }
        html.dark .course-card-footer {
          background-color: rgba(15, 23, 42, 0.55) !important;
          border-color: #334155 !important;
        }
        html.dark .course-code-badge {
          background-color: #0f172a !important;
          color: #e2e8f0 !important;
          border-color: #334155 !important;
        }
        html.dark .course-credit-badge {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
        html.dark .course-theme-blue { background-color: rgba(59, 130, 246, 0.15) !important; color: #60a5fa !important; border-color: rgba(59, 130, 246, 0.3) !important; }
        html.dark .course-theme-emerald { background-color: rgba(16, 185, 129, 0.15) !important; color: #34d399 !important; border-color: rgba(16, 185, 129, 0.3) !important; }
        html.dark .course-theme-purple { background-color: rgba(168, 85, 247, 0.15) !important; color: #c084fc !important; border-color: rgba(168, 85, 247, 0.3) !important; }
        html.dark .course-theme-amber { background-color: rgba(245, 158, 11, 0.15) !important; color: #fbbf24 !important; border-color: rgba(245, 158, 11, 0.3) !important; }
        html.dark .course-theme-rose { background-color: rgba(244, 63, 94, 0.15) !important; color: #fb7185 !important; border-color: rgba(244, 63, 94, 0.3) !important; }
        html.dark .course-theme-cyan { background-color: rgba(6, 182, 212, 0.15) !important; color: #22d3ee !important; border-color: rgba(6, 182, 212, 0.3) !important; }

        html.dark .course-static-badge {
          background-color: #0f172a !important;
          color: #cbd5e1 !important;
          border-color: #334155 !important;
        }
      `}</style>
    </div>
  );
};

export default TeacherManageCourses;
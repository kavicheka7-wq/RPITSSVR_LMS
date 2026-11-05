// src/components/admin/AdminReports.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../../services/api';
import { getCachedDepartments, getCachedCourses } from '../../services/metadataService';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import XLSX from 'xlsx-js-style';
import logo from '../../assets/image/PRIT.png';
import {
  ChartBarIcon,
  UserGroupIcon,
  AcademicCapIcon,
  BookOpenIcon,
  BuildingLibraryIcon,
  DocumentIcon,
  PrinterIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentChartBarIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
} from 'recharts';

// ============================================================================
// 📌 ផ្នែកទី ១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនី Admin ម្នាក់ៗ (User-Scoped 0ms Cache)
// ============================================================================
const CACHE_KEY_LEGACY_OVERVIEW = 'cached_admin_report_overview';
const CACHE_KEY_SHARED_DEPTS = 'cached_admin_departments_list';
const CACHE_KEY_SHARED_COURSES = 'cached_admin_courses_list';

const getOverviewCacheKey = (uid) => `cached_admin_report_overview_v8_${uid}`;
const getEnrollmentsCacheKey = (uid) => `cached_admin_report_enrollments_v8_${uid}`;
const getAttendanceCacheKey = (uid) => `cached_admin_report_attendance_v8_${uid}`;
const getAcademicCacheKey = (uid) => `cached_admin_report_academic_v8_${uid}`;
const getDeptsCacheKey = (uid) => `cached_admin_departments_list_v8_${uid}`;
const getCoursesCacheKey = (uid) => `cached_admin_courses_list_v8_${uid}`;

const DEFAULT_OVERVIEW_STATE = {
  stats: {
    total_students: 0,
    total_enrollments: 0,
    total_teachers: 0,
    total_departments: 0,
    total_courses: 0,
    total_lessons: 0,
    overall_attendance_rate: 0,
    total_assignments: 0,
  },
  department_distribution: [],
  enrollment_trend: [],
};

// ✅ Global Memory Cache បែងចែកតាម uid របស់អ្នកគ្រប់គ្រងម្នាក់ៗ
const ADMIN_REPORTS_MEM_CACHE = {
  uid: null,
  overview: null,
  enrollments: null,
  enrollmentMeta: null,
  attendance: null,
  academic: null,
  academicMeta: null,
  departments: null,
  courses: null,
  lastSyncedOverviewAt: 0,
};

const readStorageJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
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

// ✅ អនុគមន៍កាត់យកតែថ្ងៃខែឆ្នាំ (YYYY-MM-DD) ដោយលុប T00:00:00.000000Z ចេញ
const formatDateOnly = (dateVal) => {
  if (!dateVal) return '—';
  const str = String(dateVal).trim();
  if (str.includes('T')) return str.split('T')[0];
  if (str.includes(' ')) return str.split(' ')[0];
  return str;
};

// ✅ បម្លែងពិន្ទុឆៅលើ 100 មកជាពិន្ទុតាមទម្ងន់ពិតប្រាកដ (ឧ. កិច្ចការ 20%, សំណួរខ្លី 20%, ពាក់កណ្តាលឆមាស 25%, ប្រឡងបញ្ចប់ 35%)
const toWeightedScore = (rawVal100, maxWeight) => {
  if (rawVal100 === null || rawVal100 === undefined || rawVal100 === '') return null;
  const num = Number(rawVal100);
  if (isNaN(num)) return null;
  const scaled = (num * maxWeight) / 100;
  return Math.min(maxWeight, Math.max(0, Math.round(scaled * 100) / 100));
};

// ✅ គណនាពិន្ទុលម្អិតរបស់សិស្សម្នាក់ៗក្នុងរបាយការណ៍ ឱ្យត្រូវគ្នា ១០០% ជាមួយ ViewScores.jsx និង TeacherManageGrades.jsx
const computeAcademicRowMetrics = (g) => {
  const assignPts20 = toWeightedScore(
    g?.assignment_score ?? g?.auto_assignment_score,
    20
  );
  const quizPts20 = toWeightedScore(g?.quiz_score ?? g?.auto_quiz_score, 20);
  const midtermPts25 = toWeightedScore(g?.midterm_score, 25);
  const examPts35 = toWeightedScore(g?.exam_score, 35);

  const gradedParts = [
    assignPts20,
    quizPts20,
    midtermPts25,
    examPts35,
  ].filter((v) => v !== null && v > 0);

  const anyGradedParts = [
    assignPts20,
    quizPts20,
    midtermPts25,
    examPts35,
  ].filter((v) => v !== null);

  const rawFinal =
    g?.final_score !== null &&
    g?.final_score !== undefined &&
    g?.final_score !== ''
      ? Math.round(Number(g.final_score) * 100) / 100
      : null;

  const sumOfParts =
    anyGradedParts.length > 0
      ? Math.round(anyGradedParts.reduce((acc, v) => acc + v, 0) * 100) / 100
      : null;

  // បើ final_score ពី Backend ស្មើ 0 ឬ null ប៉ុន្តែមានពិន្ទុតាមផ្នែក (ដូចជាសំណួរខ្លីបាន 10) ឱ្យយកផលបូកពិន្ទុពិតប្រាកដ
  let totalPoints = sumOfParts !== null ? sumOfParts : rawFinal ?? 0;
  if (rawFinal !== null && rawFinal > totalPoints) {
    totalPoints = rawFinal;
  }

  const hasAnyScore =
    gradedParts.length > 0 || (rawFinal !== null && rawFinal > 0);

  let status = 'pending';
  if (hasAnyScore) {
    status = totalPoints >= 50 ? 'passed' : 'failed';
  }

  return {
    assignPts20: assignPts20 ?? 0,
    quizPts20: quizPts20 ?? 0,
    midtermPts25: midtermPts25 ?? 0,
    examPts35: examPts35 ?? 0,
    totalPoints,
    status,
  };
};

// ✅ អនុគមន៍សម្រាប់បញ្ជូនសារជូនដំណឹងចូលទៅកាន់រូបកណ្ដឹង (NotificationBell) នៅលើ Navbar
const pushLocalNotification = (notif) => {
  try {
    const userObjStr = localStorage.getItem('auth_user') || localStorage.getItem('user');
    let uid = 'default';
    let role = 'admin';
    if (userObjStr) {
      const userObj = JSON.parse(userObjStr);
      uid = userObj.id || userObj.user_id || userObj.email || 'default';
      if (userObj.role) {
        const rName =
          typeof userObj.role === 'string'
            ? userObj.role
            : userObj.role.role_name || userObj.role.name || 'admin';
        role = rName.toString().toLowerCase();
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

const AdminReports = () => {
  // ==========================================================================
  // 📌 ផ្នែកទី ២៖ ការប្រកាស STATES និង REFS សម្រាប់គ្រប់គ្រងទិន្នន័យរបាយការណ៍
  // ==========================================================================
  const { t, language } = useLanguage();
  const { user } = useAuth();

  // ✅ កំណត់អត្តសញ្ញាណ Admin បច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentAdminId = useMemo(() => resolveAdminUid(user), [user]);

  if (
    ADMIN_REPORTS_MEM_CACHE.uid &&
    ADMIN_REPORTS_MEM_CACHE.uid !== currentAdminId
  ) {
    ADMIN_REPORTS_MEM_CACHE.overview = null;
    ADMIN_REPORTS_MEM_CACHE.enrollments = null;
    ADMIN_REPORTS_MEM_CACHE.enrollmentMeta = null;
    ADMIN_REPORTS_MEM_CACHE.attendance = null;
    ADMIN_REPORTS_MEM_CACHE.academic = null;
    ADMIN_REPORTS_MEM_CACHE.academicMeta = null;
    ADMIN_REPORTS_MEM_CACHE.departments = null;
    ADMIN_REPORTS_MEM_CACHE.courses = null;
    ADMIN_REPORTS_MEM_CACHE.lastSyncedOverviewAt = 0;
  }
  ADMIN_REPORTS_MEM_CACHE.uid = currentAdminId;

  // 2.1. State សម្រាប់កំណត់ផ្ទាំងរបាយការណ៍ដែលកំពុងបើក ('overview' | 'enrollments' | 'academic' | 'attendance')
  const [activeTab, setActiveTab] = useState('overview');

  // ✅ 2.2. អានទិន្នន័យពី Cache មកបង្ហាញភ្លាមៗក្នុង 0 វិនាទី (គ្មាន Skeleton Loading)
  const [overviewData, setOverviewData] = useState(() => {
    if (ADMIN_REPORTS_MEM_CACHE.overview) return ADMIN_REPORTS_MEM_CACHE.overview;
    const cached =
      readStorageJson(getOverviewCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_LEGACY_OVERVIEW, null);
    if (cached) {
      ADMIN_REPORTS_MEM_CACHE.overview = cached;
      return cached;
    }
    return DEFAULT_OVERVIEW_STATE;
  });

  // 2.3. States សម្រាប់ប្រអប់តម្រងទិន្នន័យ (Filters: ដេប៉ាតឺម៉ង់, មុខវិជ្ជា, ស្ថានភាព, ថ្ងៃខែ និងពាក្យស្វែងរក)
  const [departments, setDepartments] = useState(() => {
    if (Array.isArray(ADMIN_REPORTS_MEM_CACHE.departments)) {
      return ADMIN_REPORTS_MEM_CACHE.departments;
    }
    const cached =
      readStorageJson(getDeptsCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_DEPTS, []);
    if (Array.isArray(cached)) {
      ADMIN_REPORTS_MEM_CACHE.departments = cached;
      return cached;
    }
    return [];
  });

  const [courses, setCourses] = useState(() => {
    if (Array.isArray(ADMIN_REPORTS_MEM_CACHE.courses)) {
      return ADMIN_REPORTS_MEM_CACHE.courses;
    }
    const cached =
      readStorageJson(getCoursesCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES, []);
    if (Array.isArray(cached)) {
      ADMIN_REPORTS_MEM_CACHE.courses = cached;
      return cached;
    }
    return [];
  });

  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // 2.4. States សម្រាប់ការបែងចែកទំព័រ (Pagination) និងផ្ទុកទិន្នន័យតាមផ្ទាំងរបាយការណ៍នីមួយៗ
  const [enrollmentPage, setEnrollmentPage] = useState(1);
  const [enrollmentMeta, setEnrollmentMeta] = useState(
    () => ADMIN_REPORTS_MEM_CACHE.enrollmentMeta || {}
  );
  const [academicPage, setAcademicPage] = useState(1);
  const [academicMeta, setAcademicMeta] = useState(
    () => ADMIN_REPORTS_MEM_CACHE.academicMeta || {}
  );

  const [enrollmentData, setEnrollmentData] = useState(() => {
    if (ADMIN_REPORTS_MEM_CACHE.enrollments) return ADMIN_REPORTS_MEM_CACHE.enrollments;
    const cached = readStorageJson(getEnrollmentsCacheKey(currentAdminId), {
      summary: {},
      data: [],
    });
    ADMIN_REPORTS_MEM_CACHE.enrollments = cached;
    return cached;
  });

  const [attendanceData, setAttendanceData] = useState(() => {
    if (ADMIN_REPORTS_MEM_CACHE.attendance) return ADMIN_REPORTS_MEM_CACHE.attendance;
    const cached = readStorageJson(getAttendanceCacheKey(currentAdminId), {
      summary: {},
      course_breakdown: [],
    });
    ADMIN_REPORTS_MEM_CACHE.attendance = cached;
    return cached;
  });

  const [academicData, setAcademicData] = useState(() => {
    if (ADMIN_REPORTS_MEM_CACHE.academic) return ADMIN_REPORTS_MEM_CACHE.academic;
    const cached = readStorageJson(getAcademicCacheKey(currentAdminId), {
      summary: {},
      data: [],
    });
    ADMIN_REPORTS_MEM_CACHE.academic = cached;
    return cached;
  });

  // Ref សម្រាប់ផ្តាច់ (Cancel) ការហៅ API ចាស់ៗចោល នៅពេលអ្នកប្រើប្តូរ Tab ឬប្តូរ Filter លឿនៗ
  const abortControllerRef = useRef(null);

  // ==========================================================================
  // 📌 ផ្នែកទី ៣៖ ការទាញទិន្នន័យពី BACKEND API ដោយមិនរាំងស្ទះ UI (Non-Blocking 0ms Sync)
  // ==========================================================================

  const fetchMetadata = useCallback(async () => {
    try {
      const [deptList, courseList] = await Promise.all([
        getCachedDepartments().catch(() => []),
        getCachedCourses().catch(() => []),
      ]);
      if (Array.isArray(deptList)) {
        setDepartments(deptList);
        ADMIN_REPORTS_MEM_CACHE.departments = deptList;
        try {
          localStorage.setItem(getDeptsCacheKey(currentAdminId), JSON.stringify(deptList));
          localStorage.setItem(CACHE_KEY_SHARED_DEPTS, JSON.stringify(deptList));
        } catch {}
      }
      if (Array.isArray(courseList)) {
        setCourses(courseList);
        ADMIN_REPORTS_MEM_CACHE.courses = courseList;
        try {
          localStorage.setItem(getCoursesCacheKey(currentAdminId), JSON.stringify(courseList));
          localStorage.setItem(CACHE_KEY_SHARED_COURSES, JSON.stringify(courseList));
        } catch {}
      }
    } catch (err) {
      console.error('Error fetching metadata:', err);
    }
  }, [currentAdminId]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // ✅ ច្រោះបញ្ជីមុខវិជ្ជាតាមដេប៉ាតឺម៉ង់ដែលបានជ្រើសរើសក្នុងប្រអប់ Filter
  const filteredCourses = useMemo(() => {
    if (!selectedDept) return courses;
    return courses.filter(
      (c) => String(c.department_id || c.department?.id) === String(selectedDept)
    );
  }, [courses, selectedDept]);

  // 3.2. មុខងារពន្យារពេលស្វែងរក (Debounce Search 150ms)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setDebouncedSearch('');
      setEnrollmentPage(1);
      setAcademicPage(1);
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setEnrollmentPage(1);
      setAcademicPage(1);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 3.3. អនុគមន៍គោលសម្រាប់ទាញយកទិន្នន័យរបាយការណ៍ទាំង ៤ ប្រភេទពី Backend API
  const fetchReportData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const config = { signal: abortController.signal };

    const isDefaultFilter =
      !selectedDept &&
      !selectedCourse &&
      !selectedStatus &&
      !dateFrom &&
      !dateTo &&
      !debouncedSearch;

    try {
      let res;
      if (activeTab === 'overview') {
        res = await api.get('/admin/reports/overview', config);
        const d = res.data || {};
        const formatted = {
          ...d,
          stats: d.stats || DEFAULT_OVERVIEW_STATE.stats,
          department_distribution: Array.isArray(d.department_distribution)
            ? d.department_distribution
            : [],
          enrollment_trend: Array.isArray(d.enrollment_trend)
            ? d.enrollment_trend
            : [],
        };
        setOverviewData(formatted);
        ADMIN_REPORTS_MEM_CACHE.uid = currentAdminId;
        ADMIN_REPORTS_MEM_CACHE.overview = formatted;
        ADMIN_REPORTS_MEM_CACHE.lastSyncedOverviewAt = Date.now();
        try {
          localStorage.setItem(
            getOverviewCacheKey(currentAdminId),
            JSON.stringify(formatted)
          );
          localStorage.setItem(
            CACHE_KEY_LEGACY_OVERVIEW,
            JSON.stringify(formatted)
          );
        } catch (e) {
          console.warn('Failed to cache overview report:', e);
        }
      } else if (activeTab === 'enrollments') {
        const params = {
          department_id: selectedDept,
          course_id: selectedCourse,
          status: selectedStatus,
          search: debouncedSearch,
          page: enrollmentPage,
          per_page: 200,
        };
        res = await api.get('/admin/reports/enrollments', { ...config, params });
        const d = res.data || {};
        const formattedEnr = {
          ...d,
          data: Array.isArray(d.data) ? d.data : [],
          summary: d.summary || {},
        };
        setEnrollmentData(formattedEnr);
        setEnrollmentMeta(d.meta || {});
        if (isDefaultFilter && enrollmentPage === 1) {
          ADMIN_REPORTS_MEM_CACHE.enrollments = formattedEnr;
          ADMIN_REPORTS_MEM_CACHE.enrollmentMeta = d.meta || {};
          try {
            localStorage.setItem(
              getEnrollmentsCacheKey(currentAdminId),
              JSON.stringify(formattedEnr)
            );
          } catch {}
        }
      } else if (activeTab === 'attendance') {
        const params = {
          department_id: selectedDept,
          course_id: selectedCourse,
          date_from: dateFrom,
          date_to: dateTo,
        };
        res = await api.get('/admin/reports/attendance', { ...config, params });
        const d = res.data || {};
        const formattedAtt = {
          ...d,
          course_breakdown: Array.isArray(d.course_breakdown)
            ? d.course_breakdown
            : [],
          summary: d.summary || {},
        };
        setAttendanceData(formattedAtt);
        if (isDefaultFilter) {
          ADMIN_REPORTS_MEM_CACHE.attendance = formattedAtt;
          try {
            localStorage.setItem(
              getAttendanceCacheKey(currentAdminId),
              JSON.stringify(formattedAtt)
            );
          } catch {}
        }
      } else if (activeTab === 'academic') {
        const params = {
          department_id: selectedDept,
          course_id: selectedCourse,
          search: debouncedSearch,
          page: academicPage,
          per_page: 200,
        };
        res = await api.get('/admin/reports/academic', { ...config, params });
        const d = res.data || {};
        const formattedAcad = {
          ...d,
          data: Array.isArray(d.data) ? d.data : [],
          summary: d.summary || {},
        };
        setAcademicData(formattedAcad);
        setAcademicMeta(d.meta || {});
        if (isDefaultFilter && academicPage === 1) {
          ADMIN_REPORTS_MEM_CACHE.academic = formattedAcad;
          ADMIN_REPORTS_MEM_CACHE.academicMeta = d.meta || {};
          try {
            localStorage.setItem(
              getAcademicCacheKey(currentAdminId),
              JSON.stringify(formattedAcad)
            );
          } catch {}
        }
      }
    } catch (err) {
      if (
        err.name !== 'CanceledError' &&
        err.name !== 'AbortError' &&
        err.code !== 'ERR_CANCELED'
      ) {
        console.error('Failed to load report data:', err);
      }
    }
  }, [
    activeTab,
    selectedDept,
    selectedCourse,
    selectedStatus,
    dateFrom,
    dateTo,
    debouncedSearch,
    enrollmentPage,
    academicPage,
    currentAdminId,
  ]);

  useEffect(() => {
    fetchReportData();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchReportData]);

  // ==========================================================================
  // 📌 ផ្នែកទី ៤៖ ការគណនា និងរៀបចំទិន្នន័យសម្រាប់ក្រាហ្វ និងស្ថិតិ (MEMOIZED DATA)
  // ==========================================================================

  // ✅ អនុគមន៍បកប្រែស្ថានភាពចុះឈ្មោះសិក្សាជាភាសាខ្មែរ ឬអង់គ្លេស
  const getEnrollmentStatusLabel = useCallback((status) => {
    const s = (status || '').toString().toLowerCase().trim();
    if (s === 'active') return t('កំពុងសិក្សា', 'Active');
    if (s === 'completed') return t('បានបញ្ចប់', 'Completed');
    if (s === 'dropped') return t('បោះបង់', 'Dropped');
    return status || '—';
  }, [t]);

  // ✅ អនុគមន៍ទាញយកព័ត៌មានតម្រងដែលកំពុងជ្រើសរើស សម្រាប់ដាក់បង្ហាញលើក្បាលលិខិតពេលបោះពុម្ព (Print)
  const activeFilterPrintSummary = useMemo(() => {
    if (activeTab === 'overview') return '';
    const parts = [];
    if (selectedDept) {
      const deptObj = departments.find((d) => String(d.id) === String(selectedDept));
      if (deptObj) {
        parts.push(`${t('ដេប៉ាតឺម៉ង់៖', 'Department:')} ${deptObj.department_name || deptObj.name}`);
      }
    }
    if (selectedCourse) {
      const courseObj = courses.find((c) => String(c.id) === String(selectedCourse));
      if (courseObj) {
        parts.push(`${t('មុខវិជ្ជា៖', 'Course:')} ${courseObj.course_name}`);
      }
    }
    if (activeTab === 'enrollments' && selectedStatus) {
      parts.push(`${t('ស្ថានភាព៖', 'Status:')} ${getEnrollmentStatusLabel(selectedStatus)}`);
    }
    if (activeTab === 'attendance' && (dateFrom || dateTo)) {
      parts.push(`${t('កាលបរិច្ឆេទ៖', 'Date:')} ${dateFrom || '...'} → ${dateTo || '...'}`);
    }
    return parts.join(' | ');
  }, [activeTab, selectedDept, selectedCourse, selectedStatus, dateFrom, dateTo, departments, courses, t, getEnrollmentStatusLabel]);

  // 4.1. រៀបចំទិន្នន័យសម្រាប់ក្រាហ្វបង្គោល (BarChart) បង្ហាញចំនួនសិស្ស និងគ្រូតាមដេប៉ាតឺម៉ង់
  const departmentChartData = useMemo(() => {
    const rawList = Array.isArray(overviewData?.department_distribution)
      ? overviewData.department_distribution
      : [];
    return rawList.map((dept, idx) => {
      const fullName = dept.department_name || dept.name || dept.department_code || `${t('ដេប៉ាតឺម៉ង់', 'Dept')} ${idx + 1}`;
      const displayLabel = dept.department_code
        ? dept.department_code
        : (fullName.length > 18 ? `${fullName.slice(0, 16)}…` : fullName);

      return {
        ...dept,
        display_label: displayLabel,
        full_name: fullName,
        students_count: Number(dept.students_count || 0),
        teachers_count: Number(dept.teachers_count || 0),
        courses_count: Number(dept.courses_count || 0),
      };
    });
  }, [overviewData, t]);

  // 4.2. រៀបចំទិន្នន័យសម្រាប់ក្រាហ្វខ្សែកោង (AreaChart) បង្ហាញកំណើនការចុះឈ្មោះក្នុងរយៈពេល ៦ ខែចុងក្រោយ
  const enrollmentTrendChartData = useMemo(() => {
    const rawTrend = Array.isArray(overviewData?.enrollment_trend)
      ? overviewData.enrollment_trend
      : [];

    const mapByMonth = {};
    rawTrend.forEach((item) => {
      if (item && item.month) {
        mapByMonth[String(item.month).trim()] = Number(item.count || 0);
      }
    });

    let baseDate = new Date();
    if (rawTrend.length > 0) {
      const lastMonthStr = String(rawTrend[rawTrend.length - 1].month || '');
      const match = lastMonthStr.match(/^(\d{4})-(\d{1,2})$/);
      if (match) {
        baseDate = new Date(Number(match[1]), Number(match[2]) - 1, 1);
      }
    }

    const sixMonths = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      sixMonths.push({
        month: ym,
        count: mapByMonth[ym] !== undefined ? mapByMonth[ym] : 0,
      });
    }

    rawTrend.forEach((item) => {
      const m = String(item.month || '').trim();
      if (m && !sixMonths.some((x) => x.month === m)) {
        sixMonths.push({ month: m, count: Number(item.count || 0) });
      }
    });

    return sixMonths;
  }, [overviewData]);

  // 4.3. គណនាស្ថិតិវត្តមានសរុប និងភាគរយ (%) សម្រាប់បង្ហាញលើកាតទាំង ៥ និងតារាងបោះពុម្ព
  const attendanceStatsComputed = useMemo(() => {
    const total = Number(attendanceData.summary?.total_records || 0);
    const present = Number(attendanceData.summary?.present || 0);
    const absent = Number(attendanceData.summary?.absent || 0);
    const permission = Number(attendanceData.summary?.permission || 0);
    const late = Number(attendanceData.summary?.late || 0);

    const overallRate = total > 0
      ? Number(attendanceData.summary?.rate ?? Math.round(((present + late) / total) * 100))
      : 0;

    const getPct = (val) => (total > 0 ? Math.round((val / total) * 100) : 0);

    return {
      total,
      overallRate,
      present,
      presentPct: getPct(present),
      absent,
      absentPct: getPct(absent),
      permission,
      permissionPct: getPct(permission),
      late,
      latePct: getPct(late),
    };
  }, [attendanceData]);

  // ✅ 4.4. គណនាពិន្ទុលម្អិតរបស់សិស្សម្នាក់ៗ និងស្ថិតិ «ប្រឡងជាប់ / ប្រឡងធ្លាក់ / រង់ចាំពិន្ទុ» (ជំនួសឱ្យនិទ្ទេស A-F)
  const enrichedAcademicRows = useMemo(() => {
    const rows = Array.isArray(academicData?.data) ? academicData.data : [];
    return rows.map((r) => ({
      ...r,
      computed: computeAcademicRowMetrics(r),
    }));
  }, [academicData]);

  const academicSummaryComputed = useMemo(() => {
    let passed = 0;
    let failed = 0;
    let pending = 0;
    let assignSum = 0;
    let quizSum = 0;
    let totalSum = 0;

    enrichedAcademicRows.forEach((row) => {
      const { assignPts20, quizPts20, totalPoints, status } = row.computed;
      assignSum += assignPts20;
      quizSum += quizPts20;
      totalSum += totalPoints;
      if (status === 'passed') passed += 1;
      else if (status === 'failed') failed += 1;
      else pending += 1;
    });

    const count = enrichedAcademicRows.length;
    const rawAssignAvg = Number(academicData.summary?.avg_assignment || 0);
    const rawQuizAvg = Number(academicData.summary?.avg_quiz || 0);
    const rawFinalAvg = Number(academicData.summary?.avg_final || 0);

    return {
      assign20:
        count > 0
          ? Math.round((assignSum / count) * 100) / 100
          : toWeightedScore(rawAssignAvg, 20) ?? 0,
      quiz20:
        count > 0
          ? Math.round((quizSum / count) * 100) / 100
          : toWeightedScore(rawQuizAvg, 20) ?? 0,
      final100:
        count > 0
          ? Math.round((totalSum / count) * 100) / 100
          : Math.round(rawFinalAvg * 100) / 100,
      passedCount: passed,
      failedCount: failed,
      pendingCount: pending,
      totalCount: academicData.summary?.total_graded || count,
    };
  }, [enrichedAcademicRows, academicData]);

  const passFailChartData = useMemo(() => {
    return [
      {
        name: t('ប្រឡងជាប់ (≥ 50 ពិន្ទុ)', 'Passed (≥ 50 pts)'),
        count: academicSummaryComputed.passedCount,
        color: '#10B981',
      },
      {
        name: t('ប្រឡងធ្លាក់ (< 50 ពិន្ទុ)', 'Failed (< 50 pts)'),
        count: academicSummaryComputed.failedCount,
        color: '#EF4444',
      },
      {
        name: t('រង់ចាំពិន្ទុ', 'Pending'),
        count: academicSummaryComputed.pendingCount,
        color: '#F59E0B',
      },
    ];
  }, [academicSummaryComputed, t]);

  // ==========================================================================
  // 📌 ផ្នែកទី ៥៖ មុខងារនាំចេញរបាយការណ៍ជា EXCEL (.XLSX) និងមុខងារបោះពុម្ព (PRINT)
  // ==========================================================================

  const applyExcelStyling = (worksheet, colWidths = [], textColumnIndices = []) => {
    if (!worksheet || !worksheet['!ref']) return;
    const range = XLSX.utils.decode_range(worksheet['!ref']);

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!worksheet[cellAddress]) {
          worksheet[cellAddress] = { t: 's', v: '' };
        }

        const isHeader = R === 0;
        const isTextCol = !isHeader && textColumnIndices.includes(C);

        if (isTextCol) {
          worksheet[cellAddress].t = 's';
          worksheet[cellAddress].z = '@';
          if (worksheet[cellAddress].v !== undefined && worksheet[cellAddress].v !== null) {
            worksheet[cellAddress].v = String(worksheet[cellAddress].v);
          }
        }

        worksheet[cellAddress].s = {
          font: {
            name: 'Khmer OS Siemreap',
            sz: isHeader ? 11 : 10,
            bold: isHeader,
            color: { rgb: isHeader ? 'FFFFFF' : '1E293B' },
          },
          fill: {
            fgColor: { rgb: isHeader ? '1E3A8A' : (R % 2 === 1 ? 'FFFFFF' : 'F8FAFC') },
          },
          alignment: {
            vertical: 'center',
            horizontal: isHeader ? 'center' : 'left',
            wrapText: true,
          },
          ...(isTextCol ? { numFmt: '@' } : {}),
          border: {
            top: { style: 'thin', color: { rgb: 'CBD5E1' } },
            bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } },
          },
        };
      }
    }

    if (colWidths.length > 0) {
      worksheet['!cols'] = colWidths;
    }

    const rows = [];
    for (let R = range.s.r; R <= range.e.r; ++R) {
      rows.push({ hpt: R === 0 ? 28 : 22 });
    }
    worksheet['!rows'] = rows;
  };

  // 5.2. អនុគមន៍ទាញយកទិន្នន័យរបាយការណ៍តាម Tab បច្ចុប្បន្នចេញជាឯកសារ Excel (.xlsx)
  const handleExportExcel = () => {
    let exportRows = [];
    let colWidths = [];
    let textCols = [];
    let sheetName = 'Report';
    const dateStr = new Date().toISOString().slice(0, 10);
    let filename = `LMS_Report_${activeTab}_${dateStr}.xlsx`;

    if (activeTab === 'enrollments') {
      sheetName = 'Enrollments';
      const offset = ((enrollmentMeta?.current_page || 1) - 1) * (enrollmentMeta?.per_page || 200);
      exportRows = (enrollmentData.data || []).map((r, idx) => ({
        [t('ល.រ', 'No')]: offset + idx + 1,
        [t('លេខកូដសិស្ស', 'Student Code')]: r.student_code || '',
        [t('ឈ្មោះសិស្ស', 'Student Name')]: r.student_name || '',
        [t('អ៊ីមែល', 'Email')]: r.email || '',
        [t('មុខវិជ្ជា', 'Course')]: r.course_name || '',
        [t('ដេប៉ាតឺម៉ង់', 'Department')]: r.department_name || '',
        [t('ថ្ងៃចុះឈ្មោះ', 'Enrolled Date')]: formatDateOnly(r.enrolled_date),
        [t('ស្ថានភាព', 'Status')]: getEnrollmentStatusLabel(r.status),
      }));
      colWidths = [{ wch: 8 }, { wch: 18 }, { wch: 24 }, { wch: 28 }, { wch: 26 }, { wch: 26 }, { wch: 16 }, { wch: 16 }];
      textCols = [1, 6];
    } else if (activeTab === 'attendance') {
      sheetName = 'Attendance';
      exportRows = (attendanceData.course_breakdown || []).map((r, idx) => {
        const teacherName = r.teacher_name
          || r.teacher?.name
          || (r.teacher?.first_name ? `${r.teacher.first_name} ${r.teacher.last_name || ''}`.trim() : '')
          || r.course?.teacher?.name
          || (r.course?.teacher?.first_name ? `${r.course.teacher.first_name} ${r.course.teacher.last_name || ''}`.trim() : '')
          || '';
        return {
          [t('ល.រ', 'No')]: idx + 1,
          [t('កូដមុខវិជ្ជា', 'Course Code')]: r.course_code || '',
          [t('ឈ្មោះមុខវិជ្ជា', 'Course Name')]: r.course_name || '',
          [t('គ្រូបង្រៀន', 'Teacher')]: teacherName,
          [t('សរុប', 'Total')]: r.total || 0,
          [t('វត្តមាន', 'Present')]: r.present || 0,
          [t('អវត្តមាន', 'Absent')]: r.absent || 0,
          [t('ច្បាប់', 'Permission')]: r.permission || 0,
          [t('យឺត', 'Late')]: r.late || 0,
          [t('អត្រា (%)', 'Rate (%)')]: `${r.total > 0 ? (r.rate ?? 0) : 0}%`,
        };
      });
      colWidths = [{ wch: 8 }, { wch: 16 }, { wch: 28 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
      textCols = [1];
    } else if (activeTab === 'academic') {
      sheetName = 'Grades';
      const offset = ((academicMeta?.current_page || 1) - 1) * (academicMeta?.per_page || 200);
      exportRows = enrichedAcademicRows.map((r, idx) => {
        const { assignPts20, quizPts20, totalPoints, status } = r.computed;
        const resultLabel =
          status === 'passed'
            ? t('ប្រឡងជាប់ (Passed)', 'Passed')
            : status === 'failed'
            ? t('ប្រឡងធ្លាក់ (Failed)', 'Failed')
            : t('រង់ចាំពិន្ទុ (Pending)', 'Pending');

        return {
          [t('ល.រ', 'No')]: offset + idx + 1,
          [t('លេខកូដសិស្ស', 'Student Code')]: r.student_code || '',
          [t('ឈ្មោះសិស្ស', 'Student Name')]: r.student_name || '',
          [t('កូដមុខវិជ្ជា', 'Course Code')]: r.course_code || '',
          [t('ឈ្មោះមុខវិជ្ជា', 'Course Name')]: r.course_name || '',
          [t('ដេប៉ាតឺម៉ង់', 'Department')]: r.department_name || '',
          [t('កិច្ចការ (20%)', 'Assignment (20%)')]: assignPts20,
          [t('សំណួរខ្លី (20%)', 'Quiz (20%)')]: quizPts20,
          [t('ពិន្ទុសរុប', 'Total Score')]: `${totalPoints} ${t('ពិន្ទុ', 'pts')}`,
          [t('លទ្ធផល', 'Result')]: resultLabel,
        };
      });
      colWidths = [{ wch: 8 }, { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 26 }, { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];
      textCols = [1, 3];
    } else {
      sheetName = 'Overview';
      exportRows = departmentChartData.map((r, idx) => ({
        [t('ល.រ', 'No')]: idx + 1,
        [t('ឈ្មោះដេប៉ាតឺម៉ង់', 'Department Name')]: r.full_name || '',
        [t('ចំនួនមុខវិជ្ជា', 'Courses Count')]: r.courses_count || 0,
        [t('ចំនួនសិស្ស', 'Students Count')]: r.students_count || 0,
        [t('ចំនួនគ្រូ', 'Teachers Count')]: r.teachers_count || 0,
      }));
      colWidths = [{ wch: 8 }, { wch: 32 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
      textCols = [];
    }

    if (exportRows.length === 0) {
      toast.warning(t('គ្មានទិន្នន័យសម្រាប់នាំចេញទៅ Excel ទេ', 'No data available to export to Excel'));
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    applyExcelStyling(worksheet, colWidths, textCols);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);

    pushLocalNotification({
      titleKm: 'បាននាំចេញរបាយការណ៍ទៅ Excel',
      titleEn: 'Report Exported to Excel',
      descKm: `${getActiveReportTitle()} (${exportRows.length} ជួរ) ត្រូវបានទាញយកជា Excel ជោគជ័យ។`,
      descEn: `${getActiveReportTitle()} (${exportRows.length} rows) was exported to Excel.`,
      category: 'export',
      link: '/admin/reports',
    });
  };

  // 5.3. អនុគមន៍បើកផ្ទាំងបោះពុម្ពរបាយការណ៍ផ្លូវការ (Print Report)
  const handlePrint = () => {
    window.print();
  };

  // 5.4. អនុគមន៍កំណត់ចំណងជើងរបាយការណ៍ផ្លូវការតាម Tab ដែលកំពុងជ្រើសរើស
  const getActiveReportTitle = () => {
    if (activeTab === 'enrollments') return t('របាយការណ៍ការចុះឈ្មោះសិក្សា', 'Student Enrollment Report');
    if (activeTab === 'attendance') return t('របាយការណ៍ស្ថិតិវត្តមានសិស្ស', 'Student Attendance Report');
    if (activeTab === 'academic') return t('របាយការណ៍លទ្ធផលសិក្សា និងពិន្ទុសិស្ស', 'Academic Performance & Grades Report');
    return t('របាយការណ៍ទិដ្ឋភាពទូទៅនៃប្រព័ន្ធសិក្សា', 'System Overview Report');
  };

  const getRateColor = (rate) => {
    if (rate >= 80) return { bg: 'bg-emerald-500', text: 'text-emerald-600' };
    if (rate >= 60) return { bg: 'bg-amber-500', text: 'text-amber-600' };
    return { bg: 'bg-rose-500', text: 'text-rose-600' };
  };

  // ✅ 5.5. Component រងសម្រាប់បង្ហាញប៊ូតុងប្តូរទំព័រ (Sliding Window Pagination Bar)
  const Pagination = ({ meta, onPageChange }) => {
    if (!meta || !meta.last_page || meta.last_page <= 1) return null;
    const current = Number(meta.current_page || 1);
    const last = Number(meta.last_page || 1);
    const maxButtons = 5;
    let startPage = Math.max(1, current - Math.floor(maxButtons / 2));
    let endPage = Math.min(last, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }
    const pages = [];
    for (let p = startPage; p <= endPage; p++) {
      pages.push(p);
    }

    return (
      <div className="rep-pagination-bar px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50 no-print">
        <p className="rep-text-secondary text-xs font-bold text-gray-600">
          {t('ទំព័រ', 'Page')} {current} / {last} ({meta.total} {t('កំណត់ត្រា', 'records')})
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, current - 1))}
            disabled={current === 1}
            className="rep-page-btn px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {t('មុន', 'Previous')}
          </button>
          {pages.map((pageNum) => (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`px-3 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                current === pageNum
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'rep-page-btn bg-white border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {pageNum}
            </button>
          ))}
          <button
            onClick={() => onPageChange(Math.min(last, current + 1))}
            disabled={current === last}
            className="rep-page-btn px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {t('បន្ទាប់', 'Next')}
          </button>
        </div>
      </div>
    );
  };

  // គណនារង្វាស់រង្វង់ភាគរយ (SVG Circle Progress) សម្រាប់កាតធំ អត្រាវត្តមានសរុប
  const ringRadius = 30;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (Math.min(100, Math.max(0, attendanceStatsComputed.overallRate)) / 100) * ringCircumference;

  // ==========================================================================
  // 📌 ផ្នែកទី ៦៖ ការបង្ហាញផ្ទាំង UI គោលលើអេក្រង់ និងទម្រង់បោះពុម្ព (MAIN JSX RENDER)
  // ==========================================================================
  return (
    <div className="rep-page-bg p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6 animate-fadeIn">

      <div id="admin-report-container" className="space-y-6">
        
        {/* ------------------------------------------------------------------ */}
        {/* 6.1. ក្បាលលិខិតរដ្ឋបាលផ្លូវការ (បង្ហាញតែពេលចុច Print ប៉ុណ្ណោះ - only-print) */}
        {/* ------------------------------------------------------------------ */}
        <div className="only-print hidden mb-6">
          <div className="text-center">
            <p className="print-muol text-[13px] text-slate-900 leading-[1.9]">
              {t('ព្រះរាជាណាចក្រកម្ពុជា', 'KINGDOM OF CAMBODIA')}
            </p>
            <p className="print-muol text-[12px] text-slate-900 mt-0.5 leading-[1.9]">
              {t('ជាតិ សាសនា ព្រះមហាក្សត្រ', 'NATION RELIGION KING')}
            </p>
          </div>

          <div className="mt-1 flex justify-start">
            <div className="inline-flex flex-col items-center text-center">
              <img
                src={logo}
                alt="Institute Logo"
                className="h-16 w-auto object-contain mb-1.5"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <p className="print-muol text-[11.5px] text-slate-900 leading-[1.9]">
                {t('ក្រសួងការងារ និងបណ្តុះបណ្តាលវិជ្ជាជីវៈ', 'Ministry of Labour and Vocational Training')}
              </p>
              <p className="print-muol text-[11.5px] text-slate-900 leading-[1.9]">
                {t('វិទ្យាស្ថានពហុបច្ចេកទេសភូមិភាគតេជោសែនស្វាយរៀង', 'Regional Polytechnic Institute Techo Sen Svay Rieng')}
              </p>
              <p className="print-siemreap text-[11px] text-slate-800 mt-0.5">
                {t('លេខ៖ ....................', 'No: ....................')}
              </p>
            </div>
          </div>

          <div className="text-center mt-4">
            <h1 className="print-muol text-[15px] text-slate-900 tracking-wide leading-[2]">
              {getActiveReportTitle()}
            </h1>
            {activeFilterPrintSummary && (
              <p className="print-siemreap text-[11.5px] font-bold text-slate-800 mt-0.5">
                {activeFilterPrintSummary}
              </p>
            )}
            <p className="print-siemreap text-[11px] font-semibold text-slate-700 mt-0.5">
              {t('គិតត្រឹមថ្ងៃទី៖', 'As of Date:')} {new Date().toLocaleDateString(language === 'km' ? 'km-KH' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 6.2. ផ្ទាំងក្បាលខាងលើសម្រាប់អេក្រង់កុំព្យូទ័រ និងប៊ូតុង Excel / Print (no-print) */}
        {/* ------------------------------------------------------------------ */}
        <div className="no-print relative overflow-hidden rounded-[1.5rem] bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-8 shadow-xl border border-blue-900">
          <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <h1 className="text-[28px] sm:text-3xl font-extrabold tracking-tight flex items-center gap-3">
                <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                  <DocumentChartBarIcon className="w-8 h-8 text-yellow-400" />
                </div>
                {t('របាយការណ៍ និងការវិភាគ', 'Reports & Analytics')}
              </h1>
              <p className="text-blue-200/80 text-sm max-w-2xl font-medium">
                {t('ពិនិត្យមើល និងទាញយករាយការណ៍សង្ខេបអំពីការសិក្សា ការចុះឈ្មោះ វត្តមានសិស្ស និងពិន្ទុ។', 'Overview, enrollment tracking, attendance statistics, and academic performance.')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={handleExportExcel}
                className="inline-flex items-center justify-center px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg border border-emerald-400/30 transition-all hover:-translate-y-0.5 cursor-pointer"
                title={t('នាំចេញរបាយការណ៍ជាឯកសារ Excel (.xlsx)', 'Export report to Excel (.xlsx)')}
              >
                <DocumentIcon className="w-5 h-5 mr-2 stroke-[2.2]" />
                {t('នាំចេញ Excel', 'Export Excel')}
              </button>
              <button
                onClick={handlePrint}
                className="inline-flex items-center justify-center px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-sm font-bold rounded-xl shadow-lg border border-amber-300/30 transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <PrinterIcon className="w-5 h-5 mr-2 stroke-[2.2]" />
                {t('បោះពុម្ពរបាយការណ៍', 'Print Report')}
              </button>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 6.3. របារប៊ូតុងជ្រើសរើសប្រភេទរបាយការណ៍ទាំង ៤ (Navigation Tabs)     */}
        {/* ------------------------------------------------------------------ */}
        <div className="rep-tab-container flex flex-nowrap overflow-x-auto bg-white rounded-2xl p-2 shadow-sm border border-gray-100 no-print gap-1">
          {[
            { id: 'overview', name: t('ទិដ្ឋភាពទូទៅ', 'Overview'), icon: ChartBarIcon },
            { id: 'enrollments', name: t('ការចុះឈ្មោះ', 'Enrollments'), icon: UserGroupIcon },
            { id: 'academic', name: t('ពិន្ទុ', 'Grades'), icon: AcademicCapIcon },
            { id: 'attendance', name: t('វត្តមាន', 'Attendance'), icon: CheckCircleIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setEnrollmentPage(1);
                  setAcademicPage(1);
                }}
                className={`flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'rep-tab-inactive text-gray-500 hover:text-blue-900 hover:bg-blue-50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-yellow-400' : 'text-gray-400'}`} />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 6.4. ប្រអប់តម្រងទិន្នន័យ (Filter Controls សម្រាប់ផ្ទាំងការចុះឈ្មោះ ពិន្ទុ និងវត្តមាន) */}
        {/* ------------------------------------------------------------------ */}
        {activeTab !== 'overview' && (
          <div className="rep-surface-card bg-white rounded-2xl p-5 shadow-sm border border-gray-100 no-print space-y-4">
            <div className="rep-filter-header flex items-center justify-between gap-2 text-gray-900 font-extrabold text-sm border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <FunnelIcon className="w-5 h-5 text-blue-600" />
                <span>{t('តម្រងទិន្នន័យ', 'Filter Reports')}</span>
              </div>
              {(selectedDept || selectedCourse || selectedStatus || dateFrom || dateTo || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDept('');
                    setSelectedCourse('');
                    setSelectedStatus('');
                    setDateFrom('');
                    setDateTo('');
                    setSearchQuery('');
                    setDebouncedSearch('');
                    setEnrollmentPage(1);
                    setAcademicPage(1);
                  }}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  {t('សម្អាតតម្រងទាំងអស់', 'Reset Filters')}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div>
                <label className="rep-label block text-xs font-bold text-gray-700 mb-1.5">
                  {t('ដេប៉ាតឺម៉ង់', 'Department')}
                </label>
                <select
                  value={selectedDept}
                  onChange={(e) => {
                    setSelectedDept(e.target.value);
                    setSelectedCourse('');
                    setEnrollmentPage(1);
                    setAcademicPage(1);
                  }}
                  className="rep-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm"
                >
                  <option value="">{t('-- ទាំងអស់ --', '-- All Departments --')}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.department_name || d.name} {d.department_code ? `(${d.department_code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="rep-label block text-xs font-bold text-gray-700 mb-1.5">
                  {t('មុខវិជ្ជា', 'Course')}
                </label>
                <select
                  value={selectedCourse}
                  onChange={(e) => {
                    setSelectedCourse(e.target.value);
                    setEnrollmentPage(1);
                    setAcademicPage(1);
                  }}
                  className="rep-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm"
                >
                  <option value="">{t('-- ទាំងអស់ --', '-- All Courses --')}</option>
                  {filteredCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.course_name} ({c.course_code})
                    </option>
                  ))}
                </select>
              </div>

              {activeTab === 'enrollments' && (
                <div>
                  <label className="rep-label block text-xs font-bold text-gray-700 mb-1.5">
                    {t('ស្ថានភាព', 'Status')}
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => {
                      setSelectedStatus(e.target.value);
                      setEnrollmentPage(1);
                    }}
                    className="rep-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm"
                  >
                    <option value="">{t('-- គ្រប់ស្ថានភាព --', '-- All Statuses --')}</option>
                    <option value="active">{t('កំពុងសិក្សា', 'Active')}</option>
                    <option value="completed">{t('បានបញ្ចប់', 'Completed')}</option>
                    <option value="dropped">{t('បោះបង់', 'Dropped')}</option>
                  </select>
                </div>
              )}

              {activeTab === 'attendance' && (
                <div className="flex items-center gap-3 md:col-span-2">
                  <div className="flex-1">
                    <label className="rep-label block text-xs font-bold text-gray-700 mb-1.5">
                      {t('ចាប់ពីថ្ងៃ', 'From Date')}
                    </label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="rep-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="rep-label block text-xs font-bold text-gray-700 mb-1.5">
                      {t('ដល់ថ្ងៃ', 'To Date')}
                    </label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="rep-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm"
                    />
                  </div>
                </div>
              )}

              {(activeTab === 'enrollments' || activeTab === 'academic') && (
                <div>
                  <label className="rep-label block text-xs font-bold text-gray-700 mb-1.5">
                    {t('ស្វែងរក', 'Search Keyword')}
                  </label>
                  <div className="relative">
                    <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={t('ឈ្មោះ ឬលេខកូដ...', 'Name or Code...')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="rep-input w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="w-full space-y-6">
          {/* ================================================================= */}
          {/* 📌 ផ្នែកទី ៧៖ ផ្ទាំងរបាយការណ៍ទី ១ - ទិដ្ឋភាពទូទៅ (OVERVIEW TAB)     */}
          {/* ================================================================= */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="rep-surface-card bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-all">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                    <UserGroupIcon className="w-20 h-20 text-blue-900" />
                  </div>
                  <p className="rep-text-muted text-xs font-extrabold text-gray-500 uppercase tracking-wider mb-2">
                    {t('សិស្សសរុប', 'Total Students')}
                  </p>
                  <h3 className="rep-text-primary text-3xl font-black text-blue-950">
                    {overviewData?.stats?.total_students ?? 0}
                  </h3>
                  <span className="rep-badge-blue inline-block mt-3 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-md">
                    {overviewData?.stats?.total_enrollments ?? 0} {t('ការចុះឈ្មោះ', 'Enrollments')}
                  </span>
                </div>

                <div className="rep-surface-card bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-emerald-200 transition-all">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                    <AcademicCapIcon className="w-20 h-20 text-emerald-600" />
                  </div>
                  <p className="rep-text-muted text-xs font-extrabold text-gray-500 uppercase tracking-wider mb-2">
                    {t('គ្រូបង្រៀនសរុប', 'Total Teachers')}
                  </p>
                  <h3 className="rep-text-primary text-3xl font-black text-emerald-950">
                    {overviewData?.stats?.total_teachers ?? 0}
                  </h3>
                  <span className="rep-badge-emerald inline-block mt-3 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-md">
                    {overviewData?.stats?.total_departments ?? 0} {t('ដេប៉ាតឺម៉ង់', 'Departments')}
                  </span>
                </div>

                <div className="rep-surface-card bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-amber-200 transition-all">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                    <BookOpenIcon className="w-20 h-20 text-amber-500" />
                  </div>
                  <p className="rep-text-muted text-xs font-extrabold text-gray-500 uppercase tracking-wider mb-2">
                    {t('មុខវិជ្ជាសរុប', 'Total Courses')}
                  </p>
                  <h3 className="rep-text-primary text-3xl font-black text-amber-950">
                    {overviewData?.stats?.total_courses ?? 0}
                  </h3>
                  <span className="rep-badge-amber inline-block mt-3 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-md">
                    {overviewData?.stats?.total_lessons ?? 0} {t('មេរៀន', 'Lessons')}
                  </span>
                </div>

                <div className="rep-surface-card bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-indigo-200 transition-all">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                    <CheckCircleIcon className="w-20 h-20 text-indigo-600" />
                  </div>
                  <p className="rep-text-muted text-xs font-extrabold text-gray-500 uppercase tracking-wider mb-2">
                    {t('អត្រាវត្តមានសរុប', 'Attendance Rate')}
                  </p>
                  <h3 className="rep-text-primary text-3xl font-black text-indigo-950">
                    {overviewData?.stats?.overall_attendance_rate ?? 0}%
                  </h3>
                  <span className="rep-badge-indigo inline-block mt-3 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md">
                    {overviewData?.stats?.total_assignments ?? 0} {t('កិច្ចការ', 'Assignments')}
                  </span>
                </div>
              </div>

              <div className="only-print hidden mb-5">
                <h3 className="print-muol text-[12px] text-slate-900 mb-2 leading-[1.8]">
                  {t('១. តារាងសង្ខេបស្ថិតិទូទៅនៃប្រព័ន្ធ', '1. System Overview Summary')}
                </h3>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('សិស្សសរុប', 'Total Students')}</th>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('គ្រូបង្រៀនសរុប', 'Total Teachers')}</th>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('ដេប៉ាតឺម៉ង់សរុប', 'Departments')}</th>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('មុខវិជ្ជាសរុប', 'Total Courses')}</th>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('ការចុះឈ្មោះសរុប', 'Total Enrollments')}</th>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('អត្រាវត្តមានសរុប', 'Attendance Rate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-center text-xs font-bold">{overviewData?.stats?.total_students ?? 0}</td>
                      <td className="text-center text-xs font-bold">{overviewData?.stats?.total_teachers ?? 0}</td>
                      <td className="text-center text-xs font-bold">{overviewData?.stats?.total_departments ?? 0}</td>
                      <td className="text-center text-xs font-bold">{overviewData?.stats?.total_courses ?? 0}</td>
                      <td className="text-center text-xs font-bold">{overviewData?.stats?.total_enrollments ?? 0}</td>
                      <td className="text-center text-xs font-bold">{overviewData?.stats?.overall_attendance_rate ?? 0}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">
                <div className="rep-surface-card bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <h3 className="rep-text-primary text-[16px] font-extrabold text-gray-900 mb-6 flex items-center gap-2">
                    <div className="rep-icon-box-blue p-1.5 bg-blue-50 rounded-lg"><BuildingLibraryIcon className="w-5 h-5 text-blue-600" /></div>
                    {t('ចំនួនសិស្ស និងគ្រូតាមដេប៉ាតឺម៉ង់', 'Students & Teachers by Department')}
                  </h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={departmentChartData}>
                        <CartesianGrid className="rep-chart-grid" strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                        <XAxis dataKey="display_label" stroke="#6B7280" fontSize={12} fontWeight="bold" />
                        <YAxis allowDecimals={false} stroke="#6B7280" fontSize={12} fontWeight="bold" />
                        <Tooltip
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.full_name || ''}
                          contentStyle={{ backgroundColor: '#1E293B', color: '#FFF', borderRadius: '12px', fontWeight: 'bold' }}
                        />
                        <Legend wrapperStyle={{ fontWeight: 'bold', fontSize: '12px' }} />
                        <Bar dataKey="students_count" name={t('សិស្ស', 'Students')} fill="#3B82F6" radius={[6, 6, 0, 0]} maxBarSize={55} />
                        <Bar dataKey="teachers_count" name={t('គ្រូ', 'Teachers')} fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={55} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rep-surface-card bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <h3 className="rep-text-primary text-[16px] font-extrabold text-gray-900 mb-6 flex items-center gap-2">
                    <div className="rep-icon-box-indigo p-1.5 bg-indigo-50 rounded-lg"><UserGroupIcon className="w-5 h-5 text-indigo-600" /></div>
                    {t('កំណើនការចុះឈ្មោះក្នុងរយៈពេល ៦ ខែ', '6-Month Enrollment Growth')}
                  </h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={enrollmentTrendChartData}>
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366F1" stopOpacity={0.5}/>
                            <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid className="rep-chart-grid" strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                        <XAxis dataKey="month" stroke="#6B7280" fontSize={12} fontWeight="bold" />
                        <YAxis allowDecimals={false} stroke="#6B7280" fontSize={12} fontWeight="bold" />
                        <Tooltip contentStyle={{ backgroundColor: '#1E293B', color: '#FFF', borderRadius: '12px', fontWeight: 'bold' }} />
                        <Area
                          type="monotone"
                          dataKey="count"
                          name={t('ការចុះឈ្មោះ', 'Enrollments')}
                          stroke="#6366F1"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#colorCount)"
                          dot={{ r: 4, fill: '#6366F1', strokeWidth: 2, stroke: '#fff' }}
                          activeDot={{ r: 6 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="rep-surface-card bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="rep-table-bar px-6 py-5 border-b border-gray-100 bg-white print:px-0 print:py-2 print:border-0">
                  <h3 className="rep-text-primary print-muol text-[18px] print:text-[12px] font-extrabold text-gray-900">
                    <span className="only-print hidden mr-1">២.</span>
                    {t('ព័ត៌មានលម្អិតតាមដេប៉ាតឺម៉ង់', 'Department Breakdown Details')}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="rep-table-head bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-12 whitespace-nowrap">{t('ល.រ', 'No')}</th>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('ឈ្មោះដេប៉ាតឺម៉ង់', 'Department Name')}</th>
                        <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-28 whitespace-nowrap">{t('ចំនួនមុខវិជ្ជា', 'Courses')}</th>
                        <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-28 whitespace-nowrap">{t('ចំនួនសិស្ស', 'Students')}</th>
                        <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-28 whitespace-nowrap">{t('ចំនួនគ្រូ', 'Teachers')}</th>
                      </tr>
                    </thead>
                    <tbody className="rep-table-body bg-white divide-y divide-gray-100">
                      {departmentChartData.length === 0 ? (
                        <tr><td colSpan="5" className="px-6 py-10 text-center text-gray-400 font-bold">{t('មិនរកឃើញទិន្នន័យទេ', 'No records found')}</td></tr>
                      ) : (
                        departmentChartData.map((dept, index) => (
                          <tr key={dept.id || index} className="rep-table-row hover:bg-blue-50/30 transition-colors">
                            <td className="rep-text-secondary px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-500">{index + 1}</td>
                            <td className="rep-text-primary px-6 py-4 whitespace-nowrap text-sm font-extrabold text-gray-900">{dept.full_name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-amber-600">{dept.courses_count}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-blue-600">{dept.students_count}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-emerald-600">{dept.teachers_count}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* 📌 ផ្នែកទី ៨៖ ផ្ទាំងរបាយការណ៍ទី ២ - ការចុះឈ្មោះសិក្សា (ENROLLMENTS)  */}
          {/* ================================================================= */}
          {activeTab === 'enrollments' && (
            <div className="space-y-6">
              <div className="no-print grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rep-surface-card bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center items-center">
                  <p className="rep-text-muted text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t('ការចុះឈ្មោះសរុប', 'Total Filtered')}</p>
                  <p className="rep-text-primary text-3xl font-black text-gray-900 mt-1">{enrollmentData.summary?.total || 0}</p>
                </div>
                <div className="rep-stat-emerald bg-emerald-50 p-5 rounded-2xl border border-emerald-100 flex flex-col justify-center items-center">
                  <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">{t('កំពុងសិក្សា (Active)', 'Active')}</p>
                  <h3 className="text-3xl font-black text-emerald-900 mt-1">{enrollmentData.summary?.active || 0}</h3>
                </div>
                <div className="rep-stat-blue bg-blue-50 p-5 rounded-2xl border border-blue-100 flex flex-col justify-center items-center">
                  <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">{t('បានបញ្ចប់ (Completed)', 'Completed')}</p>
                  <h3 className="text-3xl font-black text-blue-900 mt-1">{enrollmentData.summary?.completed || 0}</h3>
                </div>
                <div className="rep-stat-rose bg-rose-50 p-5 rounded-2xl border border-rose-100 flex flex-col justify-center items-center">
                  <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">{t('បោះបង់ (Dropped)', 'Dropped')}</p>
                  <h3 className="text-3xl font-black text-rose-900 mt-1">{enrollmentData.summary?.dropped || 0}</h3>
                </div>
              </div>

              <div className="only-print hidden mb-5">
                <h3 className="print-muol text-[12px] text-slate-900 mb-2 leading-[1.8]">
                  {t('១. តារាងសង្ខេបស្ថិតិការចុះឈ្មោះសិក្សា', '1. Enrollment Summary')}
                </h3>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('ការចុះឈ្មោះសរុប', 'Total Enrollments')}</th>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('កំពុងសិក្សា (Active)', 'Active')}</th>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('បានបញ្ចប់ (Completed)', 'Completed')}</th>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('បោះបង់ (Dropped)', 'Dropped')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-center text-xs font-bold">{enrollmentData.summary?.total || 0}</td>
                      <td className="text-center text-xs font-bold">{enrollmentData.summary?.active || 0}</td>
                      <td className="text-center text-xs font-bold">{enrollmentData.summary?.completed || 0}</td>
                      <td className="text-center text-xs font-bold">{enrollmentData.summary?.dropped || 0}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="rep-surface-card bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="only-print hidden mb-2">
                  <h3 className="print-muol text-[12px] text-slate-900 leading-[1.8]">
                    {t('២. បញ្ជីរាយនាមសិស្សចុះឈ្មោះសិក្សាលម្អិត', '2. Detailed Student Enrollment List')}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="rep-table-head bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('លេខកូដសិស្ស', 'Student Code')}</th>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('ឈ្មោះសិស្ស', 'Student Name')}</th>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('មុខវិជ្ជា', 'Course')}</th>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('ដេប៉ាតឺម៉ង់', 'Department')}</th>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('ថ្ងៃចុះឈ្មោះ', 'Enrolled Date')}</th>
                        <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('ស្ថានភាព', 'Status')}</th>
                      </tr>
                    </thead>
                    <tbody className="rep-table-body bg-white divide-y divide-gray-100">
                      {(!Array.isArray(enrollmentData?.data) || enrollmentData.data.length === 0) ? (
                        <tr>
                          <td colSpan="6" className="px-6 py-16 text-center text-gray-400 font-bold">
                            {t('មិនរកឃើញទិន្នន័យចុះឈ្មោះទេ', 'No enrollment records found')}
                          </td>
                        </tr>
                      ) : (
                        enrollmentData.data.map((item, idx) => (
                          <tr key={item.id || idx} className="rep-table-row hover:bg-blue-50/30 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">{item.student_code || '—'}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="rep-text-primary font-extrabold text-gray-900 text-sm">{item.student_name || '—'}</div>
                              <div className="rep-text-secondary text-xs text-gray-500 font-medium">{item.email || ''}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="rep-text-primary font-bold text-gray-800 text-sm">{item.course_name || '—'}</div>
                              <div className="rep-text-secondary text-xs text-gray-500 font-medium">{item.course_code || ''}</div>
                            </td>
                            <td className="rep-text-secondary px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">{item.department_name || '—'}</td>
                            <td className="rep-text-secondary px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-500">{formatDateOnly(item.enrolled_date)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <span
                                className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold border ${
                                  item.status === 'active'
                                    ? 'rep-badge-emerald bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : item.status === 'completed'
                                    ? 'rep-badge-blue bg-blue-50 text-blue-700 border-blue-200'
                                    : 'rep-badge-rose bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {getEnrollmentStatusLabel(item.status)}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination meta={enrollmentMeta} onPageChange={setEnrollmentPage} />
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* 📌 ផ្នែកទី ៩៖ ផ្ទាំងរបាយការណ៍ទី ៣ - វត្តមានសិស្ស (ATTENDANCE TAB)   */}
          {/* ================================================================= */}
          {activeTab === 'attendance' && (
            <div className="space-y-6">
              <div className="no-print space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                  
                  <div className="xl:col-span-4 bg-gradient-to-br from-blue-900 via-indigo-800 to-indigo-950 rounded-3xl p-6 text-white shadow-xl border border-indigo-500/30 relative overflow-hidden flex flex-col justify-between min-h-[175px]">
                    <div className="absolute -right-8 -top-8 w-36 h-36 bg-blue-400/10 rounded-full blur-2xl pointer-events-none"></div>

                    <div className="relative z-10 flex items-center justify-between gap-4">
                      <div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-white/10 text-blue-100 border border-white/15">
                          <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-300" />
                          {t('អត្រាវត្តមានសរុប', 'Overall Rate')}
                        </span>
                        <div className="mt-3 flex items-baseline gap-2">
                          <span className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                            {attendanceStatsComputed.overallRate}%
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-blue-200/80 mt-1">
                          {attendanceStatsComputed.total > 0
                            ? t('គណនាពីវត្តមានសរុបទាំងអស់', 'Calculated from all records')
                            : t('មិនទាន់មានកំណត់ត្រាវត្តមាននៅឡើយទេ', 'No attendance records yet')}
                        </p>
                      </div>

                      <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                        <svg className="w-20 h-20 -rotate-90 transform" viewBox="0 0 76 76">
                          <circle
                            cx="38"
                            cy="38"
                            r={ringRadius}
                            stroke="rgba(255,255,255,0.12)"
                            strokeWidth="7"
                            fill="transparent"
                          />
                          <circle
                            cx="38"
                            cy="38"
                            r={ringRadius}
                            stroke="#34d399"
                            strokeWidth="7"
                            strokeDasharray={ringCircumference}
                            strokeDashoffset={ringOffset}
                            strokeLinecap="round"
                            fill="transparent"
                            className="transition-all duration-700"
                          />
                        </svg>
                        <ChartBarIcon className="w-6 h-6 text-emerald-300 absolute" />
                      </div>
                    </div>

                    <div className="relative z-10 mt-5 pt-3 border-t border-white/15 flex items-center justify-between text-xs">
                      <span className="font-bold text-blue-100 flex items-center gap-1.5">
                        <DocumentChartBarIcon className="w-4 h-4 text-amber-300" />
                        {t('កំណត់ត្រាសរុប', 'Total Records')}
                      </span>
                      <span className="font-black text-white bg-white/15 px-3.5 py-1 rounded-xl border border-white/15">
                        {attendanceStatsComputed.total} {t('កំណត់ត្រា', 'records')}
                      </span>
                    </div>
                  </div>

                  <div className="xl:col-span-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rep-surface-card rep-att-card-emerald bg-white rounded-3xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
                      <div className="absolute top-0 inset-x-0 h-1 bg-emerald-500"></div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="rep-att-icon-emerald w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform shrink-0">
                          <CheckCircleIcon className="w-6 h-6 stroke-[2.2]" />
                        </div>
                        <span className="rep-badge-emerald text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          {attendanceStatsComputed.presentPct}%
                        </span>
                      </div>
                      <div className="mt-4">
                        <p className="rep-text-secondary text-xs font-extrabold text-gray-600 uppercase tracking-wider">
                          {t('វត្តមាន', 'Present')}
                        </p>
                        <div className="flex items-baseline justify-between mt-1.5">
                          <h4 className="rep-text-primary text-3xl font-black text-gray-900">
                            {attendanceStatsComputed.present}
                          </h4>
                          <span className="rep-text-muted text-[11px] font-bold text-gray-400">
                            {t('នាក់/ដង', 'records')}
                          </span>
                        </div>
                      </div>
                      <div className="rep-progress-track w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-3.5">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${attendanceStatsComputed.presentPct}%` }} />
                      </div>
                    </div>

                    <div className="rep-surface-card rep-att-card-rose bg-white rounded-3xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
                      <div className="absolute top-0 inset-x-0 h-1 bg-rose-500"></div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="rep-att-icon-rose w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 group-hover:scale-105 transition-transform shrink-0">
                          <XCircleIcon className="w-6 h-6 stroke-[2.2]" />
                        </div>
                        <span className="rep-badge-rose text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200/60">
                          {attendanceStatsComputed.absentPct}%
                        </span>
                      </div>
                      <div className="mt-4">
                        <p className="rep-text-secondary text-xs font-extrabold text-gray-600 uppercase tracking-wider">
                          {t('អវត្តមាន', 'Absent')}
                        </p>
                        <div className="flex items-baseline justify-between mt-1.5">
                          <h4 className="rep-text-primary text-3xl font-black text-gray-900">
                            {attendanceStatsComputed.absent}
                          </h4>
                          <span className="rep-text-muted text-[11px] font-bold text-gray-400">
                            {t('នាក់/ដង', 'records')}
                          </span>
                        </div>
                      </div>
                      <div className="rep-progress-track w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-3.5">
                        <div className="h-full bg-rose-500 rounded-full transition-all duration-500" style={{ width: `${attendanceStatsComputed.absentPct}%` }} />
                      </div>
                    </div>

                    <div className="rep-surface-card rep-att-card-blue bg-white rounded-3xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
                      <div className="absolute top-0 inset-x-0 h-1 bg-blue-500"></div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="rep-att-icon-blue w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform shrink-0">
                          <DocumentChartBarIcon className="w-6 h-6 stroke-[2.2]" />
                        </div>
                        <span className="rep-badge-blue text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/60">
                          {attendanceStatsComputed.permissionPct}%
                        </span>
                      </div>
                      <div className="mt-4">
                        <p className="rep-text-secondary text-xs font-extrabold text-gray-600 uppercase tracking-wider">
                          {t('ច្បាប់', 'Permission')}
                        </p>
                        <div className="flex items-baseline justify-between mt-1.5">
                          <h4 className="rep-text-primary text-3xl font-black text-gray-900">
                            {attendanceStatsComputed.permission}
                          </h4>
                          <span className="rep-text-muted text-[11px] font-bold text-gray-400">
                            {t('នាក់/ដង', 'records')}
                          </span>
                        </div>
                      </div>
                      <div className="rep-progress-track w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-3.5">
                        <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${attendanceStatsComputed.permissionPct}%` }} />
                      </div>
                    </div>

                    <div className="rep-surface-card rep-att-card-amber bg-white rounded-3xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
                      <div className="absolute top-0 inset-x-0 h-1 bg-amber-500"></div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="rep-att-icon-amber w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-transform shrink-0">
                          <ClockIcon className="w-6 h-6 stroke-[2.2]" />
                        </div>
                        <span className="rep-badge-amber text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60">
                          {attendanceStatsComputed.latePct}%
                        </span>
                      </div>
                      <div className="mt-4">
                        <p className="rep-text-secondary text-xs font-extrabold text-gray-600 uppercase tracking-wider">
                          {t('យឺត', 'Late')}
                        </p>
                        <div className="flex items-baseline justify-between mt-1.5">
                          <h4 className="rep-text-primary text-3xl font-black text-gray-900">
                            {attendanceStatsComputed.late}
                          </h4>
                          <span className="rep-text-muted text-[11px] font-bold text-gray-400">
                            {t('នាក់/ដង', 'records')}
                          </span>
                        </div>
                      </div>
                      <div className="rep-progress-track w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-3.5">
                        <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${attendanceStatsComputed.latePct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-1">
                    <h3 className="rep-text-primary text-base font-extrabold text-gray-900 flex items-center gap-2">
                      <BookOpenIcon className="w-5 h-5 text-indigo-600" />
                      {t('របាយការណ៍លម្អិតតាមមុខវិជ្ជា', 'Detailed Course Report')}
                    </h3>
                    <span className="rep-total-pill text-xs font-bold text-gray-500 bg-gray-200 px-3 py-1 rounded-lg border border-gray-300">
                      {attendanceData.course_breakdown?.length || 0} {t('មុខវិជ្ជា', 'Courses')}
                    </span>
                  </div>

                  {(!Array.isArray(attendanceData?.course_breakdown) || attendanceData.course_breakdown.length === 0) ? (
                    <div className="rep-surface-card bg-white p-12 rounded-2xl border border-dashed border-gray-300 text-center">
                      <DocumentChartBarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="rep-text-secondary text-gray-500 font-bold text-base">{t('មិនរកឃើញទិន្នន័យអវត្តមានទេ', 'No attendance records found')}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {attendanceData.course_breakdown.map((item, index) => {
                        const safeRate = Number(item.total || 0) > 0 ? Number(item.rate ?? 0) : 0;
                        const rateColors = getRateColor(safeRate);
                        
                        const teacherName = item.teacher_name 
                                       || item.teacher?.name 
                                       || (item.teacher?.first_name ? `${item.teacher.first_name} ${item.teacher.last_name || ''}`.trim() : null)
                                       || item.course?.teacher?.name
                                       || (item.course?.teacher?.first_name ? `${item.course.teacher.first_name} ${item.course.teacher.last_name || ''}`.trim() : null)
                                       || t('មិនស្គាល់គ្រូបង្រៀន', 'Unknown Teacher');

                        return (
                          <div key={item.course_id || index} className="rep-surface-card bg-white p-4 lg:p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row items-start md:items-center gap-5 lg:gap-6 group">
                            
                            <div className="flex items-center gap-3 min-w-[240px] w-full md:w-auto">
                              <div className="rep-icon-box-indigo w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 border border-indigo-100 shadow-inner group-hover:scale-105 transition-transform">
                                <BookOpenIcon className="w-6 h-6" />
                              </div>
                              <div className="flex-1">
                                <h4 className="rep-text-primary font-extrabold text-gray-900 text-sm leading-tight mb-1">{item.course_name || t('មិនមានឈ្មោះមុខវិជ្ជា', 'Unnamed Course')}</h4>
                                <div className="flex items-center flex-wrap gap-2 mt-1">
                                  <span className="rep-code-pill text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md">{item.course_code || 'N/A'}</span>
                                  <span className="rep-text-secondary text-[11px] font-bold text-gray-600 flex items-center gap-1">
                                    <UserGroupIcon className="w-3.5 h-3.5 text-gray-400" /> 
                                    {teacherName}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="rep-stats-box flex-1 grid grid-cols-5 gap-2 w-full md:w-auto bg-gray-50/50 rounded-xl p-2.5 border border-gray-100/50">
                              <div className="text-center md:border-r border-gray-200/60 last:border-0">
                                <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">{t('សរុប', 'Total')}</p>
                                <p className="rep-text-primary text-base font-black text-gray-700 mt-0.5">{item.total || 0}</p>
                              </div>
                              <div className="text-center md:border-r border-gray-200/60 last:border-0">
                                <p className="text-[10px] font-extrabold text-emerald-500 uppercase tracking-wider">{t('វត្តមាន', 'Present')}</p>
                                <p className="text-base font-black text-emerald-600 mt-0.5">{item.present || 0}</p>
                              </div>
                              <div className="text-center md:border-r border-gray-200/60 last:border-0">
                                <p className="text-[10px] font-extrabold text-rose-500 uppercase tracking-wider">{t('អវត្តមាន', 'Absent')}</p>
                                <p className="text-base font-black text-rose-600 mt-0.5">{item.absent || 0}</p>
                              </div>
                              <div className="text-center md:border-r border-gray-200/60 last:border-0">
                                <p className="text-[10px] font-extrabold text-blue-500 uppercase tracking-wider">{t('ច្បាប់', 'Perm')}</p>
                                <p className="text-base font-black text-blue-600 mt-0.5">{item.permission || 0}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-[10px] font-extrabold text-amber-500 uppercase tracking-wider">{t('យឺត', 'Late')}</p>
                                <p className="text-base font-black text-amber-600 mt-0.5">{item.late || 0}</p>
                              </div>
                            </div>

                            <div className="min-w-[120px] w-full md:w-auto">
                              <div className="flex justify-between items-end mb-1.5">
                                <span className="rep-text-muted text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">{t('អត្រា', 'Rate')}</span>
                                <span className={`text-sm font-black ${rateColors.text}`}>{safeRate}%</span>
                              </div>
                              <div className="rep-progress-track w-full bg-gray-100 h-2 rounded-full overflow-hidden shadow-inner border border-gray-200/60">
                                <div 
                                  className={`h-full rounded-full transition-all duration-1000 ${rateColors.bg}`} 
                                  style={{ width: `${safeRate}%` }}
                                ></div>
                              </div>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="only-print hidden space-y-6">
                <div>
                  <h3 className="print-muol text-[12px] text-slate-900 mb-2 leading-[1.8]">
                    {t('១. តារាងសង្ខេបស្ថិតិវត្តមានសិស្សសរុប', '1. Overall Attendance Summary')}
                  </h3>
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="text-center text-xs font-bold whitespace-nowrap">{t('កំណត់ត្រាសរុប', 'Total Records')}</th>
                        <th className="text-center text-xs font-bold whitespace-nowrap">{t('វត្តមាន (Present)', 'Present')}</th>
                        <th className="text-center text-xs font-bold whitespace-nowrap">{t('អវត្តមាន (Absent)', 'Absent')}</th>
                        <th className="text-center text-xs font-bold whitespace-nowrap">{t('ច្បាប់ (Permission)', 'Permission')}</th>
                        <th className="text-center text-xs font-bold whitespace-nowrap">{t('មកយឺត (Late)', 'Late')}</th>
                        <th className="text-center text-xs font-bold whitespace-nowrap">{t('អត្រាវត្តមានសរុប', 'Overall Rate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="text-center text-xs font-bold">{attendanceStatsComputed.total}</td>
                        <td className="text-center text-xs font-bold">{attendanceStatsComputed.present} ({attendanceStatsComputed.presentPct}%)</td>
                        <td className="text-center text-xs font-bold">{attendanceStatsComputed.absent} ({attendanceStatsComputed.absentPct}%)</td>
                        <td className="text-center text-xs font-bold">{attendanceStatsComputed.permission} ({attendanceStatsComputed.permissionPct}%)</td>
                        <td className="text-center text-xs font-bold">{attendanceStatsComputed.late} ({attendanceStatsComputed.latePct}%)</td>
                        <td className="text-center text-xs font-bold">{attendanceStatsComputed.overallRate}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="print-muol text-[12px] text-slate-900 leading-[1.8]">
                      {t('២. តារាងរបាយការណ៍វត្តមានលម្អិតតាមមុខវិជ្ជា', '2. Detailed Attendance Breakdown by Course')}
                    </h3>
                    <span className="print-siemreap text-xs font-bold text-slate-700">
                      {t('សរុប៖', 'Total:')} {attendanceData.course_breakdown?.length || 0} {t('មុខវិជ្ជា', 'Courses')}
                    </span>
                  </div>
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr>
                        <th style={{ width: '5%' }} className="text-center text-xs font-bold whitespace-nowrap">{t('ល.រ', 'No')}</th>
                        <th style={{ width: '11%' }} className="text-center text-xs font-bold whitespace-nowrap">{t('កូដមុខវិជ្ជា', 'Code')}</th>
                        <th style={{ width: '30%' }} className="text-left text-xs font-bold whitespace-nowrap">{t('ឈ្មោះមុខវិជ្ជា', 'Course Name')}</th>
                        <th style={{ width: '22%' }} className="text-left text-xs font-bold whitespace-nowrap">{t('គ្រូបង្រៀន', 'Teacher')}</th>
                        <th style={{ width: '5%' }} className="text-center text-xs font-bold whitespace-nowrap">{t('សរុប', 'Total')}</th>
                        <th style={{ width: '5.5%' }} className="text-center text-xs font-bold whitespace-nowrap">{t('វត្តមាន', 'Present')}</th>
                        <th style={{ width: '6%' }} className="text-center text-xs font-bold whitespace-nowrap">{t('អវត្តមាន', 'Absent')}</th>
                        <th style={{ width: '5%' }} className="text-center text-xs font-bold whitespace-nowrap">{t('ច្បាប់', 'Perm')}</th>
                        <th style={{ width: '4.5%' }} className="text-center text-xs font-bold whitespace-nowrap">{t('យឺត', 'Late')}</th>
                        <th style={{ width: '6%' }} className="text-center text-xs font-bold whitespace-nowrap">{t('អត្រា', 'Rate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!Array.isArray(attendanceData?.course_breakdown) || attendanceData.course_breakdown.length === 0) ? (
                        <tr>
                          <td colSpan="10" className="text-center py-6 text-xs font-bold text-slate-500">
                            {t('មិនរកឃើញទិន្នន័យវត្តមានទេ', 'No attendance records found')}
                          </td>
                        </tr>
                      ) : (
                        attendanceData.course_breakdown.map((item, idx) => {
                          const teacherName = item.teacher_name 
                            || item.teacher?.name 
                            || (item.teacher?.first_name ? `${item.teacher.first_name} ${item.teacher.last_name || ''}`.trim() : null)
                            || item.course?.teacher?.name
                            || (item.course?.teacher?.first_name ? `${item.course.teacher.first_name} ${item.course.teacher.last_name || ''}`.trim() : null)
                            || '—';
                          const totalRec = Number(item.total || 0);
                          const displayRate = totalRec > 0 ? `${item.rate ?? 0}%` : '0%';

                          return (
                            <tr key={item.course_id || idx}>
                              <td className="text-center text-xs font-bold whitespace-nowrap">{idx + 1}</td>
                              <td className="text-center text-xs font-bold whitespace-nowrap">{item.course_code || '—'}</td>
                              <td className="text-left text-xs font-bold">{item.course_name || '—'}</td>
                              <td className="text-left text-xs font-normal whitespace-nowrap">{teacherName}</td>
                              <td className="text-center text-xs font-bold whitespace-nowrap">{totalRec}</td>
                              <td className="text-center text-xs font-bold whitespace-nowrap">{item.present || 0}</td>
                              <td className="text-center text-xs font-bold whitespace-nowrap">{item.absent || 0}</td>
                              <td className="text-center text-xs font-bold whitespace-nowrap">{item.permission || 0}</td>
                              <td className="text-center text-xs font-bold whitespace-nowrap">{item.late || 0}</td>
                              <td className="text-center text-xs font-bold whitespace-nowrap">{displayRate}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* 📌 ផ្នែកទី ១០៖ ផ្ទាំងរបាយការណ៍ទី ៤ - លទ្ធផលសិក្សា និងពិន្ទុ (គិតលើ ជាប់/ធ្លាក់ មិនគិតនិទ្ទេស) */}
          {/* ================================================================= */}
          {activeTab === 'academic' && (
            <div className="space-y-6">
              {/* 10.1. កាតបង្ហាញលើអេក្រង់កុំព្យូទ័រ (លាក់ពេល Print) */}
              <div className="no-print grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rep-surface-card bg-white p-5 rounded-2xl border border-gray-100 shadow-sm text-center">
                  <p className="rep-text-muted text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t('ពិន្ទុកិច្ចការមធ្យម (20%)', 'Avg Assignment (20%)')}</p>
                  <h3 className="text-3xl font-black text-blue-600 mt-2">{academicSummaryComputed.assign20}</h3>
                </div>
                <div className="rep-surface-card bg-white p-5 rounded-2xl border border-gray-100 shadow-sm text-center">
                  <p className="rep-text-muted text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t('ពិន្ទុសំណួរខ្លីមធ្យម (20%)', 'Avg Quiz (20%)')}</p>
                  <h3 className="text-3xl font-black text-amber-600 mt-2">{academicSummaryComputed.quiz20}</h3>
                </div>
                <div className="rep-surface-card bg-white p-5 rounded-2xl border border-gray-100 shadow-sm text-center">
                  <p className="rep-text-muted text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t('ពិន្ទុសរុបមធ្យម', 'Avg Total Score')}</p>
                  <h3 className="text-3xl font-black text-emerald-600 mt-2">{academicSummaryComputed.final100} {t('ពិន្ទុ', 'pts')}</h3>
                </div>
                <div className="rep-stat-indigo bg-indigo-50 p-5 rounded-2xl border border-indigo-100 text-center">
                  <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">{t('សិស្សប្រឡងជាប់ (≥ 50)', 'Passed Students (≥ 50)')}</p>
                  <h3 className="text-3xl font-black text-indigo-900 mt-2">
                    {academicSummaryComputed.passedCount} / {academicSummaryComputed.totalCount}
                  </h3>
                </div>
              </div>

              {/* 10.2. តារាងសង្ខេបពិន្ទុសម្រាប់តែពេលបោះពុម្ព (Print-Only Academic Summary Table) */}
              <div className="only-print hidden mb-5">
                <h3 className="print-muol text-[12px] text-slate-900 mb-2 leading-[1.8]">
                  {t('១. តារាងសង្ខេបមធ្យមភាគពិន្ទុ និងលទ្ធផលសិក្សា', '1. Academic Performance Summary')}
                </h3>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('ពិន្ទុកិច្ចការមធ្យម (20%)', 'Avg Assignment (20%)')}</th>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('ពិន្ទុសំណួរខ្លីមធ្យម (20%)', 'Avg Quiz (20%)')}</th>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('ពិន្ទុសរុបមធ្យម', 'Avg Total Score')}</th>
                      <th className="text-center text-xs font-bold whitespace-nowrap">{t('ប្រឡងជាប់ / សរុប', 'Passed / Total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-center text-xs font-bold">{academicSummaryComputed.assign20}</td>
                      <td className="text-center text-xs font-bold">{academicSummaryComputed.quiz20}</td>
                      <td className="text-center text-xs font-bold">{academicSummaryComputed.final100} {t('ពិន្ទុ', 'pts')}</td>
                      <td className="text-center text-xs font-bold">
                        {academicSummaryComputed.passedCount} / {academicSummaryComputed.totalCount}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ✅ 10.3. ក្រាហ្វបង្គោលស្ថិតិលទ្ធផលប្រឡងជាប់ និងប្រឡងធ្លាក់ (ជំនួសនិទ្ទេស A-F) */}
              <div className="rep-surface-card bg-white p-6 rounded-3xl border border-gray-100 shadow-sm no-print">
                <h3 className="rep-text-primary text-[16px] font-extrabold text-gray-900 mb-6 flex items-center gap-2">
                  <div className="rep-icon-box-blue p-1.5 bg-blue-50 rounded-lg">
                    <ChartBarIcon className="w-5 h-5 text-blue-600" />
                  </div>
                  {t('ស្ថិតិលទ្ធផលសិក្សាសិស្ស (ប្រឡងជាប់ និងប្រឡងធ្លាក់)', 'Student Pass / Fail Distribution')}
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={passFailChartData}>
                      <CartesianGrid className="rep-chart-grid" strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                      <XAxis dataKey="name" stroke="#6B7280" fontSize={12} fontWeight="bold" />
                      <YAxis allowDecimals={false} stroke="#6B7280" fontSize={12} fontWeight="bold" />
                      <Tooltip contentStyle={{ backgroundColor: '#1E293B', color: '#FFF', borderRadius: '12px', fontWeight: 'bold' }} />
                      <Bar dataKey="count" name={t('ចំនួនសិស្ស', 'Students')} radius={[6, 6, 0, 0]} maxBarSize={65}>
                        {passFailChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ✅ 10.4. តារាងបញ្ជីពិន្ទុ និងលទ្ធផលសិក្សារបស់សិស្ស (បង្ហាញ ប្រឡងជាប់ / ប្រឡងធ្លាក់ / រង់ចាំពិន្ទុ) */}
              <div className="rep-surface-card bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="rep-table-bar px-6 py-5 border-b border-gray-100 bg-white print:px-0 print:py-2 print:border-0">
                  <h3 className="rep-text-primary print-muol text-[18px] print:text-[12px] font-extrabold text-gray-900">
                    <span className="only-print hidden mr-1">២.</span>
                    {t('បញ្ជីពិន្ទុ និងលទ្ធផលសិក្សាសិស្ស', 'Detailed Student Scores & Results')}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="rep-table-head bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('លេខកូដសិស្ស', 'Student Code')}</th>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('ឈ្មោះសិស្ស', 'Student Name')}</th>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('មុខវិជ្ជា', 'Course')}</th>
                        <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('កិច្ចការ (20%)', 'Assignment (20%)')}</th>
                        <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('សំណួរខ្លី (20%)', 'Quiz (20%)')}</th>
                        <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('ពិន្ទុសរុប', 'Total Score')}</th>
                        <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('លទ្ធផល', 'Result')}</th>
                      </tr>
                    </thead>
                    <tbody className="rep-table-body bg-white divide-y divide-gray-100">
                      {enrichedAcademicRows.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="px-6 py-16 text-center text-gray-400 font-bold">
                            {t('មិនរកឃើញទិន្នន័យពិន្ទុទេ', 'No grade records found')}
                          </td>
                        </tr>
                      ) : (
                        enrichedAcademicRows.map((g, idx) => {
                          const { assignPts20, quizPts20, totalPoints, status } = g.computed;

                          return (
                            <tr key={g.id || idx} className="rep-table-row hover:bg-blue-50/30 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">{g.student_code || '—'}</td>
                              <td className="rep-text-primary px-6 py-4 whitespace-nowrap text-sm font-extrabold text-gray-900">{g.student_name || '—'}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="rep-text-primary font-bold text-gray-800 text-sm">{g.course_name || '—'}</div>
                                <div className="rep-text-secondary text-xs font-medium text-gray-500">{g.course_code || ''}</div>
                              </td>
                              <td className="rep-score-cell px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-700 bg-gray-50/50">{assignPts20}</td>
                              <td className="rep-score-cell px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-700 bg-gray-50/50">{quizPts20}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-black text-blue-600">
                                {totalPoints} {t('ពិន្ទុ', 'pts')}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                {status === 'passed' ? (
                                  <span className="rep-badge-emerald inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                    <CheckCircleIcon className="w-4 h-4 mr-1.5 shrink-0 no-print" />
                                    {t('ប្រឡងជាប់', 'Passed')}
                                  </span>
                                ) : status === 'failed' ? (
                                  <span className="rep-badge-rose inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                                    <XCircleIcon className="w-4 h-4 mr-1.5 shrink-0 no-print" />
                                    {t('ប្រឡងធ្លាក់', 'Failed')}
                                  </span>
                                ) : (
                                  <span className="rep-code-pill inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                                    <ClockIcon className="w-3.5 h-3.5 mr-1.5 shrink-0 text-amber-500 no-print" />
                                    {t('រង់ចាំពិន្ទុ', 'Pending')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination meta={academicMeta} onPageChange={setAcademicPage} />
              </div>
            </div>
          )}

        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 10.5. កន្លែងចុះហត្ថលេខា និងត្រាខាងក្រោមពេលបោះពុម្ព (Official Print Footer) */}
        {/* ------------------------------------------------------------------ */}
        <div className="only-print hidden pt-4 mt-8">
          <div className="grid grid-cols-2 gap-8 text-center text-xs text-slate-900">
            <div>
              <p className="print-siemreap font-semibold">{t('បានឃើញ និងពិនិត្យត្រឹមត្រូវ', 'Reviewed and Approved')}</p>
              <p className="print-muol text-[12px] mt-1 leading-[1.9]">{t('នាយកវិទ្យាស្ថាន', 'Institute Director')}</p>
              <div className="h-24"></div>
            </div>
            <div>
              <p className="print-siemreap font-semibold">{t('ថ្ងៃ.................. ខែ.......... ឆ្នាំ...... ព.ស. ២៥៧...', '')}</p>
              <p className="print-siemreap font-semibold mt-0.5">{t('ស្វាយរៀង, ថ្ងៃទី....... ខែ.......... ឆ្នាំ២០២...', 'Svay Rieng, Date: ....../....../202...')}</p>
              <p className="print-muol text-[12px] mt-1 leading-[1.9]">{t('អ្នករៀបចំរបាយការណ៍', 'Prepared By')}</p>
              <div className="h-24"></div>
            </div>
          </div>
        </div>

      </div>

      {/* ==================================================================== */}
      {/* 📌 ផ្នែកទី ១១៖ CSS សម្រាប់កំណត់ទម្រង់យប់ (DARK MODE) និងទម្រង់បោះពុម្ព (PRINT) */}
      {/* ==================================================================== */}
      <style>{`
        html.dark .rep-page-bg {
          background-color: transparent !important;
        }
        html.dark .rep-surface-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .rep-att-card-emerald:hover {
          border-color: rgba(16, 185, 129, 0.5) !important;
        }
        html.dark .rep-att-card-rose:hover {
          border-color: rgba(244, 63, 94, 0.5) !important;
        }
        html.dark .rep-att-card-blue:hover {
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
        html.dark .rep-att-card-amber:hover {
          border-color: rgba(245, 158, 11, 0.5) !important;
        }

        html.dark .rep-att-icon-emerald,
        html.dark .rep-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
          color: #34d399 !important;
        }
        html.dark .rep-att-icon-rose,
        html.dark .rep-badge-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
          color: #fb7185 !important;
        }
        html.dark .rep-att-icon-blue,
        html.dark .rep-icon-box-blue,
        html.dark .rep-badge-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
          color: #60a5fa !important;
        }
        html.dark .rep-att-icon-amber,
        html.dark .rep-badge-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
          color: #fbbf24 !important;
        }
        html.dark .rep-icon-box-indigo,
        html.dark .rep-badge-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
          color: #818cf8 !important;
        }

        html.dark .rep-tab-container {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .rep-tab-inactive {
          color: #94a3b8 !important;
        }
        html.dark .rep-tab-inactive:hover {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
        }
        html.dark .rep-filter-header {
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        html.dark .rep-text-primary {
          color: #f8fafc !important;
        }
        html.dark .rep-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .rep-text-muted {
          color: #64748b !important;
        }
        html.dark .rep-label {
          color: #cbd5e1 !important;
        }
        html.dark .rep-chart-grid line {
          stroke: #334155 !important;
        }

        html.dark .rep-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
          color-scheme: dark;
        }
        html.dark .rep-input::placeholder {
          color: #64748b !important;
        }
        html.dark .rep-input:focus {
          border-color: #6366f1 !important;
          background-color: #0f172a !important;
        }
        html.dark input[type="date"].rep-input::-webkit-calendar-picker-indicator {
          filter: invert(1);
          opacity: 0.6;
        }

        .rep-table-head {
          background-color: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }
        html.dark .rep-table-bar,
        html.dark .rep-table-head {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .rep-table-head th {
          color: #94a3b8 !important;
        }
        html.dark .rep-table-body {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .rep-table-body > tr {
          border-color: #334155 !important;
        }
        html.dark .rep-table-row:hover {
          background-color: rgba(59, 130, 246, 0.1) !important;
        }

        html.dark .rep-stat-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
          color: #60a5fa !important;
        }
        html.dark .rep-stat-blue p,
        html.dark .rep-stat-blue h3 {
          color: #93c5fd !important;
        }
        html.dark .rep-stat-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
          color: #34d399 !important;
        }
        html.dark .rep-stat-emerald p,
        html.dark .rep-stat-emerald h3 {
          color: #6ee7b7 !important;
        }
        html.dark .rep-stat-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
          color: #818cf8 !important;
        }
        html.dark .rep-stat-indigo p,
        html.dark .rep-stat-indigo h3 {
          color: #a5b4fc !important;
        }
        html.dark .rep-stat-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
          color: #fb7185 !important;
        }
        html.dark .rep-stat-rose p,
        html.dark .rep-stat-rose h3 {
          color: #fda4af !important;
        }
        html.dark .rep-stats-box,
        html.dark .rep-score-cell {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
          color: #e2e8f0 !important;
        }
        html.dark .rep-code-pill,
        html.dark .rep-total-pill,
        html.dark .rep-progress-track {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }

        html.dark .rep-pagination-bar {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .rep-page-btn {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .rep-page-btn:hover:not(:disabled) {
          background-color: #334155 !important;
          color: #ffffff !important;
        }

        /* ✅ រចនាទម្រង់បោះពុម្ពផ្លូវការ៖ Khmer OS Muol Light (ចំណងជើង) និង Khmer OS Siemreap (អក្សរធម្មតា) */
        @media print {
          @page {
            size: A4 portrait;
            margin: 0mm;
          }
          html, body, #root, main, .rep-page-bg, html.dark body {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            min-height: auto !important;
            height: auto !important;
            box-shadow: none !important;
            border: none !important;
            font-family: 'Khmer OS Siemreap', 'Siemreap', sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body > div, #root > div, #root > div > div {
            background: #ffffff !important;
            background-color: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            min-height: auto !important;
            box-shadow: none !important;
            border: none !important;
          }
          nav, aside, footer, header, .no-print {
            display: none !important;
          }
          .only-print {
            display: block !important;
          }
          #admin-report-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 12mm 14mm !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
          }
          #admin-report-container *,
          .print-siemreap {
            font-family: 'Khmer OS Siemreap', 'Siemreap', sans-serif !important;
          }
          #admin-report-container .print-muol,
          #admin-report-container .print-muol * {
            font-family: 'Khmer OS Muol Light', 'Khmer OS Muol', 'Moul', serif !important;
            font-weight: normal !important;
          }
          .rep-surface-card,
          .rep-table-bar,
          .rep-table-head,
          .rep-table-body,
          .rep-score-cell {
            background: transparent !important;
            background-color: transparent !important;
            color: #000000 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .rep-text-primary,
          .rep-text-secondary,
          .rep-text-muted {
            color: #000000 !important;
          }
          table {
            border-collapse: collapse !important;
            width: 100% !important;
            border: 1px solid #000000 !important;
          }
          th, td {
            border: 1px solid #000000 !important;
            padding: 8px 10px !important;
            color: #000000 !important;
            font-family: 'Khmer OS Siemreap', 'Siemreap', sans-serif !important;
            line-height: 1.6 !important;
          }
          thead th {
            background-color: #f8fafc !important;
            color: #000000 !important;
            font-weight: 700 !important;
            white-space: nowrap !important;
          }
          tr {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminReports;
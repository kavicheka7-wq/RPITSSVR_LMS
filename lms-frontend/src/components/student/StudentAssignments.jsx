// src/components/student/StudentAssignments.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  DocumentCheckIcon,
  ArrowPathIcon,
  ClockIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon,
  ArrowDownTrayIcon,
  BookOpenIcon,
  AcademicCapIcon,
  CalendarDaysIcon,
  CheckBadgeIcon,
  BuildingLibraryIcon,
  SparklesIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  XMarkIcon,
  ChartBarIcon,
  ChatBubbleLeftEllipsisIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនីសិស្សម្នាក់ៗ (User-Scoped 0ms Cache)
// ============================================================================
const LAST_ACTIVE_STUDENT_UID_KEY = 'lms_last_active_student_uid';
const CACHE_KEY_SHARED_ASSIGNMENTS = 'cached_student_assignments_list_v15';
const CACHE_KEY_SHARED_ASSIGNMENTS_LEGACY = 'cached_student_assignments_list_v14';
const CACHE_KEY_SHARED_COURSES = 'cached_student_courses_list_v15';
const CACHE_KEY_SHARED_ENROLLMENTS = 'cached_student_dashboard_enrollments_v15';

const getAssignmentsCacheKey = (uid) => `cached_student_assignments_list_v15_${uid}`;
const getAssignmentsLegacyCacheKey = (uid) => `cached_student_assignments_list_v14_${uid}`;
const getAssignmentsMetaCacheKey = (uid) => `cached_student_assignments_meta_v15_${uid}`;
const getCoursesCacheKey = (uid) => `cached_student_courses_list_v15_${uid}`;
const getEnrollmentsCacheKey = (uid) => `cached_student_dashboard_enrollments_v15_${uid}`;
const getScoresCacheKey = (uid) => `cached_student_scores_list_v15_${uid}`;

const DEFAULT_META = {
  current_page: 1,
  last_page: 1,
  total: 0,
  per_page: 50,
};

// ✅ Global Memory Cache បែងចែកតាម uid របស់សិស្សម្នាក់ៗ
const STUDENT_ASG_MEM_CACHE = {
  uid: null,
  assignments: null,
  courses: null,
  meta: null,
  lastSyncedAt: 0,
  lastCoursesSyncedAt: 0,
};

// ✅ អនុគមន៍រត់ការងារធ្ងន់ៗនៅពេល Browser ទំនេរ ដើម្បីកុំឱ្យទាក់អេក្រង់
const runWhenIdle = (fn, fallbackDelay = 300) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, { timeout: 1500 });
  } else {
    setTimeout(fn, fallbackDelay);
  }
};

const readStorageJson = (key, fallback) => {
  try {
    const raw =
      sessionStorage.getItem(key) || localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const stripHeavyAssignmentDataDeep = (obj, depth = 0) => {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => stripHeavyAssignmentDataDeep(item, depth + 1));
  }

  const cleaned = {};
  Object.keys(obj).forEach((k) => {
    if (k === 'file_data') return;
    const val = obj[k];
    if (
      typeof val === 'string' &&
      val.startsWith('data:') &&
      val.length > 15000
    ) {
      cleaned[k] = null;
    } else if (val && typeof val === 'object') {
      cleaned[k] = stripHeavyAssignmentDataDeep(val, depth + 1);
    } else {
      cleaned[k] = val;
    }
  });
  return cleaned;
};

// ✅ រក្សាទុកបញ្ជីកិច្ចការ និង Meta នៅពេល Browser ទំនេរ (Stringify តែ ១ ដងគត់)
const persistStudentAssignmentsFast = (uid, slimList, metaData = null) => {
  runWhenIdle(() => {
    try {
      const listStr = JSON.stringify(slimList);
      try {
        sessionStorage.setItem(getAssignmentsCacheKey(uid), listStr);
      } catch {}
      localStorage.setItem(getAssignmentsCacheKey(uid), listStr);
      localStorage.setItem(getAssignmentsLegacyCacheKey(uid), listStr);
      localStorage.setItem(CACHE_KEY_SHARED_ASSIGNMENTS, listStr);

      if (metaData) {
        const metaStr = JSON.stringify(metaData);
        try {
          sessionStorage.setItem(getAssignmentsMetaCacheKey(uid), metaStr);
        } catch {}
        localStorage.setItem(getAssignmentsMetaCacheKey(uid), metaStr);
      }
    } catch {}
  });
};

const persistStudentCoursesCacheFast = (uid, slimCourses) => {
  runWhenIdle(() => {
    try {
      const str = JSON.stringify(slimCourses);
      try {
        sessionStorage.setItem(getCoursesCacheKey(uid), str);
      } catch {}
      localStorage.setItem(getCoursesCacheKey(uid), str);
      localStorage.setItem(CACHE_KEY_SHARED_COURSES, str);
    } catch {}
  });
};

const resolveStudentUid = (contextUser) => {
  if (contextUser) {
    const id =
      contextUser.id ||
      contextUser.user_id ||
      contextUser.student?.id ||
      contextUser.email;
    if (id) return String(id);
  }
  try {
    const raw =
      sessionStorage.getItem('user') ||
      sessionStorage.getItem('auth_user') ||
      localStorage.getItem('user') ||
      localStorage.getItem('auth_user') ||
      sessionStorage.getItem('student') ||
      localStorage.getItem('student');
    if (raw) {
      const parsed = JSON.parse(raw);
      const u = parsed?.user || parsed?.data || parsed;
      const id = u?.id || u?.user_id || u?.student?.id || u?.email;
      if (id) return String(id);
    }
  } catch {}
  return 'default_student';
};

const ensureCleanStudentSessionCache = (newUid) => {
  if (!newUid || newUid === 'default_student') return;
  try {
    const prevUid = localStorage.getItem(LAST_ACTIVE_STUDENT_UID_KEY);
    if (prevUid && prevUid !== String(newUid)) {
      const legacySharedKeys = [
        'cached_student_assignments_list_v5',
        'cached_student_assignments_list_v14',
        'cached_student_assignments_list_v15',
        'cached_student_courses_list_v3',
        'cached_student_courses_meta_v3',
        'cached_student_dashboard_stats_v8',
        'cached_student_dashboard_enrollments_v8',
        'cached_student_dashboard_activity_v8',
        'cached_student_scores_list_v5',
        'cached_student_attendance_list_v3',
      ];
      legacySharedKeys.forEach((k) => {
        try {
          sessionStorage.removeItem(k);
          localStorage.removeItem(k);
        } catch {}
      });
    }
    localStorage.setItem(LAST_ACTIVE_STUDENT_UID_KEY, String(newUid));
  } catch (e) {}
};

const normalizeShiftKey = (shiftVal) => {
  const s = (shiftVal || '').toString().trim().toLowerCase();
  if (
    s === 'saturday-sunday' ||
    s.includes('សៅរ៍') ||
    s.includes('សៅរី៍') ||
    s.includes('អាទិត្យ') ||
    s.includes('sat') ||
    s.includes('weekend')
  ) {
    return 'Saturday-Sunday';
  }
  return 'Monday-Friday';
};

const extractExactDateTimeParts = (rawVal) => {
  if (!rawVal) return null;

  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return {
      year: rawVal.getFullYear(),
      month: rawVal.getMonth() + 1,
      day: rawVal.getDate(),
      hour: rawVal.getHours(),
      minute: rawVal.getMinutes(),
    };
  }

  const str = String(rawVal).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (match) {
    return {
      year: parseInt(match[1], 10),
      month: parseInt(match[2], 10),
      day: parseInt(match[3], 10),
      hour: match[4] !== undefined ? parseInt(match[4], 10) : 23,
      minute: match[5] !== undefined ? parseInt(match[5], 10) : 59,
    };
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes(),
    };
  }

  return null;
};

const toComparableTimeMs = (val) => {
  const p = extractExactDateTimeParts(val);
  if (!p) return NaN;
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0).getTime();
};

const extractValidAssignmentsList = (resData) => {
  if (!resData) return [];
  if (Array.isArray(resData)) return resData;
  if (Array.isArray(resData.data)) return resData.data;
  if (Array.isArray(resData.assignments)) return resData.assignments;
  if (resData.data && Array.isArray(resData.data.data)) return resData.data.data;
  if (resData.data && Array.isArray(resData.data.assignments))
    return resData.data.assignments;
  return [];
};

const resolveStudentSubmission = (assign) => {
  if (!assign) return null;
  if (
    assign.submission &&
    typeof assign.submission === 'object' &&
    !Array.isArray(assign.submission)
  ) {
    return assign.submission;
  }
  if (
    assign.student_submission &&
    typeof assign.student_submission === 'object'
  ) {
    return assign.student_submission;
  }
  if (assign.my_submission && typeof assign.my_submission === 'object') {
    return assign.my_submission;
  }
  if (Array.isArray(assign.submissions) && assign.submissions.length > 0) {
    return assign.submissions[0];
  }
  if (Array.isArray(assign.submission) && assign.submission.length > 0) {
    return assign.submission[0];
  }
  return null;
};

const formatCleanScore = (val) => {
  if (val === null || val === undefined || val === '') return 20;
  const num = Number(val);
  return isNaN(num) ? val : Math.round(num * 100) / 100;
};

const pushLocalNotification = (notif) => {
  try {
    const userObjStr =
      sessionStorage.getItem('auth_user') ||
      sessionStorage.getItem('user') ||
      localStorage.getItem('auth_user') ||
      localStorage.getItem('user');
    let uid = 'default';
    let role = 'student';
    if (userObjStr) {
      const userObj = JSON.parse(userObjStr);
      const u = userObj?.user || userObj?.data || userObj;
      uid = u?.id || u?.user_id || u?.email || 'default';
      if (u?.role) {
        const rName =
          typeof u.role === 'string'
            ? u.role
            : u.role.role_name || u.role.name || 'student';
        role = rName.toString().toLowerCase();
      }
    }

    const keysToUpdate = Array.from(
      new Set([`lms_notifs_student_${uid}`, `lms_notifs_${role}_${uid}`])
    );

    const newNotif = {
      id: `local_std_asg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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

const StudentAssignments = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const abortControllerRef = useRef(null);

  const currentStudentId = useMemo(() => {
    const uid = resolveStudentUid(user);
    ensureCleanStudentSessionCache(uid);
    return uid;
  }, [user]);

  if (
    STUDENT_ASG_MEM_CACHE.uid &&
    STUDENT_ASG_MEM_CACHE.uid !== currentStudentId
  ) {
    STUDENT_ASG_MEM_CACHE.assignments = null;
    STUDENT_ASG_MEM_CACHE.courses = null;
    STUDENT_ASG_MEM_CACHE.meta = null;
    STUDENT_ASG_MEM_CACHE.lastSyncedAt = 0;
    STUDENT_ASG_MEM_CACHE.lastCoursesSyncedAt = 0;
  }
  STUDENT_ASG_MEM_CACHE.uid = currentStudentId;

  const initialRouteCourseId =
    searchParams.get('course_id') || location.state?.courseId || 'all';

  const [assignments, setAssignments] = useState(() => {
    if (Array.isArray(STUDENT_ASG_MEM_CACHE.assignments)) {
      return STUDENT_ASG_MEM_CACHE.assignments;
    }
    const cached =
      readStorageJson(getAssignmentsCacheKey(currentStudentId), null) ||
      readStorageJson(getAssignmentsLegacyCacheKey(currentStudentId), null) ||
      readStorageJson(`cached_student_assignments_list_v10_${currentStudentId}`, null) ||
      readStorageJson(CACHE_KEY_SHARED_ASSIGNMENTS, null) ||
      readStorageJson(CACHE_KEY_SHARED_ASSIGNMENTS_LEGACY, []);
    STUDENT_ASG_MEM_CACHE.assignments = Array.isArray(cached) ? cached : [];
    return STUDENT_ASG_MEM_CACHE.assignments;
  });

  const [coursesList, setCoursesList] = useState(() => {
    if (Array.isArray(STUDENT_ASG_MEM_CACHE.courses)) {
      return STUDENT_ASG_MEM_CACHE.courses;
    }
    const cached =
      readStorageJson(getCoursesCacheKey(currentStudentId), null) ||
      readStorageJson(getEnrollmentsCacheKey(currentStudentId), null) ||
      readStorageJson(`cached_student_courses_list_v10_${currentStudentId}`, null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES, null) ||
      readStorageJson(CACHE_KEY_SHARED_ENROLLMENTS, []);
    STUDENT_ASG_MEM_CACHE.courses = Array.isArray(cached) ? cached : [];
    return STUDENT_ASG_MEM_CACHE.courses;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState(
    String(initialRouteCourseId)
  );
  const [statusFilter, setStatusFilter] = useState('all');

  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [meta, setMeta] = useState(() => {
    if (STUDENT_ASG_MEM_CACHE.meta) {
      return STUDENT_ASG_MEM_CACHE.meta;
    }
    const cached = readStorageJson(
      getAssignmentsMetaCacheKey(currentStudentId),
      DEFAULT_META
    );
    STUDENT_ASG_MEM_CACHE.meta = cached;
    return cached;
  });

  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [submittingFile, setSubmittingFile] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (submitModalOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [submitModalOpen]);

  useEffect(() => {
    const routeCid = searchParams.get('course_id') || location.state?.courseId;
    if (routeCid) {
      setSelectedCourse(String(routeCid));
    }
  }, [searchParams, location.state]);

  const getStorageUrl = useCallback((pathOrSub, submissionId = null) => {
    const rawPath =
      typeof pathOrSub === 'object' && pathOrSub !== null
        ? pathOrSub.file_path || pathOrSub.file_url || ''
        : pathOrSub;
    const resolvedSubId =
      submissionId ||
      (typeof pathOrSub === 'object' && pathOrSub !== null
        ? pathOrSub.id
        : null);

    if (!rawPath || typeof rawPath !== 'string') return '#';
    const trimmed = rawPath.trim();
    if (!trimmed) return '#';
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:')
    ) {
      return trimmed;
    }
    const backendBase = (
      import.meta.env.VITE_API_URL ||
      api.defaults?.baseURL ||
      'http://localhost:8000/api'
    ).replace(/\/api\/?$/, '');
    const cleanPath = trimmed.replace(/^\/?storage\//, '').replace(/^\/+/, '');
    return `${backendBase}/api/download-file?path=${encodeURIComponent(
      cleanPath
    )}${resolvedSubId ? `&submission_id=${encodeURIComponent(resolvedSubId)}` : ''}`;
  }, []);

  const fetchStudentCourses = useCallback(async () => {
    const now = Date.now();
    if (
      STUDENT_ASG_MEM_CACHE.uid === currentStudentId &&
      Array.isArray(STUDENT_ASG_MEM_CACHE.courses) &&
      STUDENT_ASG_MEM_CACHE.courses.length > 0 &&
      now - STUDENT_ASG_MEM_CACHE.lastCoursesSyncedAt < 60000
    ) {
      return;
    }

    try {
      const response = await api.get('/student/courses?all=true');
      if (response.data?.error_debug) return;
      const raw = response.data?.data ?? response.data ?? [];
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
        ? raw.data
        : [];
      const slimCourses = stripHeavyAssignmentDataDeep(list);
      if (slimCourses.length > 0 || !STUDENT_ASG_MEM_CACHE.courses?.length) {
        setCoursesList(slimCourses);
        STUDENT_ASG_MEM_CACHE.courses = slimCourses;
        STUDENT_ASG_MEM_CACHE.lastCoursesSyncedAt = Date.now();
        persistStudentCoursesCacheFast(currentStudentId, slimCourses);
      }
    } catch (e) {
      console.error('Error fetching student courses', e);
    }
  }, [currentStudentId]);

  // ============================================================================
  // 📌 ផ្នែកទី២៖ ការទាញទិន្នន័យកិច្ចការ + Smart Cache (30s TTL)
  // ============================================================================
  const fetchAssignments = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh && page === 1 && selectedCourse === 'all') {
        const cachedAsg =
          readStorageJson(getAssignmentsCacheKey(currentStudentId), null) ||
          readStorageJson(getAssignmentsLegacyCacheKey(currentStudentId), null);
        const cachedMeta = readStorageJson(
          getAssignmentsMetaCacheKey(currentStudentId),
          null
        );
        if (Array.isArray(cachedAsg) && cachedAsg.length > 0) {
          setAssignments(cachedAsg);
          STUDENT_ASG_MEM_CACHE.assignments = cachedAsg;
        }
        if (cachedMeta) {
          setMeta(cachedMeta);
          STUDENT_ASG_MEM_CACHE.meta = cachedMeta;
        }
      }

      // ✅ ដំឡើង Cache TTL ពី 4s មក 30s ដើម្បីកាត់បន្ថយការបាញ់ API ជាន់គ្នាទៅ Server
      const now = Date.now();
      if (
        !forceRefresh &&
        page === 1 &&
        selectedCourse === 'all' &&
        STUDENT_ASG_MEM_CACHE.uid === currentStudentId &&
        Array.isArray(STUDENT_ASG_MEM_CACHE.assignments) &&
        STUDENT_ASG_MEM_CACHE.assignments.length > 0 &&
        now - STUDENT_ASG_MEM_CACHE.lastSyncedAt < 30000
      ) {
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const params = {
          page,
          per_page: perPage,
        };
        if (selectedCourse !== 'all') {
          params.course_id = selectedCourse;
        }

        const response = await api.get('/student/assignments', {
          params,
          signal: controller.signal,
        });

        if (response.data?.error_debug) {
          return;
        }

        const rawList = extractValidAssignmentsList(response.data);
        const list = stripHeavyAssignmentDataDeep(rawList);

        const metaData =
          response.data?.meta ||
          response.data?.data?.meta || {
            current_page: page,
            last_page: 1,
            total: list.length,
            per_page: perPage,
          };

        setAssignments(list);
        setMeta(metaData);

        if (page === 1 && selectedCourse === 'all') {
          STUDENT_ASG_MEM_CACHE.uid = currentStudentId;
          STUDENT_ASG_MEM_CACHE.assignments = list;
          STUDENT_ASG_MEM_CACHE.meta = metaData;
          if (list.length > 0) {
            STUDENT_ASG_MEM_CACHE.lastSyncedAt = Date.now();
          }
          persistStudentAssignmentsFast(currentStudentId, list, metaData);
        }
      } catch (error) {
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
          return;
        }
        console.error('Error fetching student assignments:', error);
      }
    },
    [page, perPage, selectedCourse, currentStudentId]
  );

  useEffect(() => {
    fetchStudentCourses();
  }, [fetchStudentCourses]);

  // ✅ Auto-Sync រៀងរាល់ 60 វិនាទី + ឆែក Cooldown 20s ពេលចុចលើអេក្រង់ (កាត់បន្ថយបន្ទុក Hosting ៥ ដង)
  useEffect(() => {
    fetchAssignments(false);

    const handleVisibilityOrFocus = () => {
      if (
        document.visibilityState === 'visible' &&
        !submitModalOpen &&
        Date.now() - STUDENT_ASG_MEM_CACHE.lastSyncedAt > 20000
      ) {
        fetchAssignments(true);
      }
    };

    const syncInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && !submitModalOpen) {
        fetchAssignments(true);
      }
    }, 60000);

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchAssignments, submitModalOpen]);

  const availableCourses = useMemo(() => {
    const map = new Map();
    if (Array.isArray(coursesList)) {
      coursesList.forEach((item) => {
        const c = item?.course || item;
        const cid = item?.course_id || c?.id || item?.id;
        if (cid && (c?.course_name || c?.name) && !map.has(String(cid))) {
          map.set(String(cid), {
            id: String(cid),
            course_name: c.course_name || c.name,
            course_code: c.course_code || c.code || '',
          });
        }
      });
    }
    if (Array.isArray(assignments)) {
      assignments.forEach((a) => {
        const c = a.course;
        const cid = c?.id || a.course_id;
        const cName = c?.course_name || a.course_name;
        const cCode = c?.course_code || a.course_code || '';
        if (cid && cName && !map.has(String(cid))) {
          map.set(String(cid), {
            id: String(cid),
            course_name: cName,
            course_code: cCode,
          });
        }
      });
    }
    return Array.from(map.values());
  }, [coursesList, assignments]);

  const enrichedAssignments = useMemo(() => {
    if (!Array.isArray(assignments)) return [];
    return assignments.map((assign) => {
      const cid = String(assign?.course?.id || assign?.course_id || '');
      const matchedCourse = availableCourses.find((c) => String(c.id) === cid);
      const resolvedSub = resolveStudentSubmission(assign);

      return {
        ...assign,
        course_id: cid || assign.course_id,
        course: {
          ...(assign.course || {}),
          id: cid || assign.course?.id,
          course_name:
            assign.course?.course_name ||
            assign.course_name ||
            matchedCourse?.course_name ||
            t('មុខវិជ្ជាសិក្សា', 'Course'),
          course_code:
            assign.course?.course_code ||
            assign.course_code ||
            matchedCourse?.course_code ||
            '',
        },
        resolvedSubmission: resolvedSub,
      };
    });
  }, [assignments, availableCourses, t]);

  const studentDeptName = useMemo(() => {
    const fromUser =
      user?.department?.department_name ||
      user?.department?.name ||
      user?.student?.department?.department_name ||
      user?.student?.department?.name;
    if (fromUser) return fromUser;

    const firstCourseDept =
      assignments[0]?.course?.department?.department_name ||
      assignments[0]?.course?.department?.name;
    return firstCourseDept || t('វិទ្យាសាស្ត្រកុំព្យូទ័រ', 'Computer Science');
  }, [user, assignments, t]);

  const studentStudyShiftKey = useMemo(() => {
    const rawShift =
      user?.study_shift || user?.student?.study_shift || 'Monday-Friday';
    return normalizeShiftKey(rawShift);
  }, [user]);

  const isWeekendShift = studentStudyShiftKey === 'Saturday-Sunday';

  const studentStudyShiftLabel = useMemo(() => {
    if (language === 'km') {
      return isWeekendShift ? 'វេនសិក្សា៖ សៅរ៍-អាទិត្យ' : 'វេនសិក្សា៖ ចន្ទ-សុក្រ';
    }
    return isWeekendShift ? 'Shift: Sat-Sun' : 'Shift: Mon-Fri';
  }, [isWeekendShift, language]);

  const formatDateTime = useCallback(
    (dateString, includeTime = true) => {
      const parts = extractExactDateTimeParts(dateString);
      if (!parts) return '—';

      const khMonths = [
        'មករា',
        'កុម្ភៈ',
        'មីនា',
        'មេសា',
        'ឧសភា',
        'មិថុនា',
        'កក្កដា',
        'សីហា',
        'កញ្ញា',
        'តុលា',
        'វិច្ឆិកា',
        'ធ្នូ',
      ];
      const enMonths = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];

      const day = String(parts.day).padStart(2, '0');
      const year = parts.year;
      let hours = parts.hour;
      const minutes = String(parts.minute).padStart(2, '0');

      if (language === 'km') {
        const month = khMonths[parts.month - 1] || '';
        if (!includeTime) {
          return `${day} ${month} ${year}`;
        }
        const period = hours >= 12 ? 'ល្ងាច' : 'ព្រឹក';
        hours = hours % 12 || 12;
        return `${day} ${month} ${year}, ${String(hours).padStart(2, '0')}:${minutes} ${period}`;
      }

      const month = enMonths[parts.month - 1] || '';
      if (!includeTime) {
        return `${month} ${day}, ${year}`;
      }
      const period = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${month} ${day}, ${year}, ${String(hours).padStart(2, '0')}:${minutes} ${period}`;
    },
    [language]
  );

  const handleOpenSubmitModal = (assignment) => {
    setSelectedAssignment(assignment);
    setUploadFile(null);
    setSubmitError('');
    setSubmitModalOpen(true);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
      if (submitError) setSubmitError('');
    }
  };

  const handleAssignmentSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile || !selectedAssignment || submittingFile) {
      return;
    }

    setSubmittingFile(true);
    setSubmitError('');
    const formData = new FormData();
    formData.append('assignment_id', selectedAssignment.id);
    formData.append('file', uploadFile);

    try {
      const res = await api.post('/student/assignments/submit', formData, {
        headers: { 'Content-Type': undefined },
      });

      const rawSub =
        res.data?.submission ||
        res.data?.data || {
          id: Date.now(),
          submitted_at: new Date().toISOString(),
          score: null,
          feedback: null,
          file_path: res.data?.file_path || URL.createObjectURL(uploadFile),
        };
      const newSub = stripHeavyAssignmentDataDeep(rawSub);

      setAssignments((prev) => {
        const updated = prev.map((a) =>
          a.id === selectedAssignment.id ? { ...a, submission: newSub } : a
        );
        STUDENT_ASG_MEM_CACHE.assignments = updated;
        persistStudentAssignmentsFast(currentStudentId, updated);
        try {
          sessionStorage.removeItem(getScoresCacheKey(currentStudentId));
          localStorage.removeItem(getScoresCacheKey(currentStudentId));
          localStorage.removeItem(
            `cached_student_scores_list_v14_${currentStudentId}`
          );
          localStorage.removeItem(
            `cached_student_scores_list_v10_${currentStudentId}`
          );
        } catch (err) {}
        return updated;
      });

      pushLocalNotification({
        titleKm: 'បានប្រគល់កិច្ចការសិក្សាជោគជ័យ',
        titleEn: 'Assignment Submitted',
        descKm: `អ្នកបានប្រគល់ឯកសារកិច្ចការ «${selectedAssignment.title}» រួចរាល់ហើយ។`,
        descEn: `You have submitted "${selectedAssignment.title}" successfully.`,
        category: 'assignment',
        link: '/assignments',
      });

      setSubmitModalOpen(false);
      setUploadFile(null);
      fetchAssignments(true);
    } catch (error) {
      console.error('Error submitting assignment:', error);
      const apiErrors = error.response?.data?.errors;
      const firstValidationMsg = apiErrors
        ? Object.values(apiErrors).flat()[0]
        : null;
      const errMsg =
        firstValidationMsg ||
        error.response?.data?.message ||
        t(
          'មិនអាចបង្ហោះឯកសារកិច្ចការបានទេ (សូមពិនិត្យទំហំ ឬប្រភេទឯកសារឡើងវិញ)!',
          'Could not submit assignment file (please check file size or format)!'
        );
      setSubmitError(String(errMsg));
    } finally {
      setSubmittingFile(false);
    }
  };

  const assignmentStats = useMemo(() => {
    let total = 0;
    let submitted = 0;
    let graded = 0;
    let pending = 0;
    let overdue = 0;
    let earnedPercentSum = 0;

    const targetList =
      selectedCourse !== 'all'
        ? enrichedAssignments.filter(
            (a) =>
              String(a.course?.id || a.course_id) === String(selectedCourse)
          )
        : enrichedAssignments;

    if (Array.isArray(targetList)) {
      total = targetList.length;
      const nowMs = Date.now();

      targetList.forEach((a) => {
        const sub = a.resolvedSubmission;
        const hasSub = Boolean(sub);
        const isGraded =
          hasSub &&
          sub?.score !== null &&
          sub?.score !== undefined &&
          sub?.score !== '';
        const dueMs = toComparableTimeMs(a.due_date);
        const isPastDue = !isNaN(dueMs) ? nowMs > dueMs : false;

        if (hasSub) {
          submitted += 1;
          if (isGraded) {
            graded += 1;
            const maxS =
              Number(
                a.total_score ||
                  a.total_marks ||
                  a.marks ||
                  a.total_mark ||
                  a.max_score ||
                  20
              ) || 20;
            earnedPercentSum += (Number(sub.score) / maxS) * 100;
          }
        } else if (isPastDue) {
          overdue += 1;
        } else {
          pending += 1;
        }
      });
    }

    const avgScorePercent =
      graded > 0 ? Math.round((earnedPercentSum / graded) * 10) / 10 : 0;

    return {
      total,
      submitted,
      graded,
      pending,
      overdue,
      avgScorePercent,
    };
  }, [enrichedAssignments, selectedCourse]);

  const filteredAssignments = useMemo(() => {
    if (!Array.isArray(enrichedAssignments)) return [];
    const q = searchQuery.toLowerCase().trim();
    const nowMs = Date.now();

    return enrichedAssignments.filter((assign) => {
      if (selectedCourse !== 'all') {
        const cid = assign.course?.id || assign.course_id;
        if (String(cid) !== String(selectedCourse)) return false;
      }

      const sub = assign.resolvedSubmission;
      const isSubmitted = Boolean(sub);
      const isGraded =
        isSubmitted &&
        sub?.score !== null &&
        sub?.score !== undefined &&
        sub?.score !== '';
      const dueMs = toComparableTimeMs(assign.due_date);
      const isOverdue = !isSubmitted && !isNaN(dueMs) && nowMs > dueMs;

      if (statusFilter === 'pending' && (isSubmitted || isOverdue)) return false;
      if (statusFilter === 'submitted' && !isSubmitted) return false;
      if (statusFilter === 'graded' && !isGraded) return false;
      if (statusFilter === 'overdue' && !isOverdue) return false;

      if (!q) return true;
      const titleMatch = (assign.title || '').toLowerCase().includes(q);
      const descMatch = (assign.description || '').toLowerCase().includes(q);
      const courseNameMatch = (assign.course?.course_name || '')
        .toLowerCase()
        .includes(q);
      const courseCodeMatch = (assign.course?.course_code || '')
        .toLowerCase()
        .includes(q);

      return titleMatch || descMatch || courseNameMatch || courseCodeMatch;
    });
  }, [enrichedAssignments, selectedCourse, statusFilter, searchQuery]);

  const getActiveStatusTitle = () => {
    if (statusFilter === 'pending') return t('កំពុងរង់ចាំប្រគល់', 'Pending Tasks');
    if (statusFilter === 'submitted') return t('បានប្រគល់រួច', 'Submitted Tasks');
    if (statusFilter === 'graded') return t('ដាក់ពិន្ទុរួច', 'Graded Tasks');
    if (statusFilter === 'overdue') return t('ហួសកាលកំណត់', 'Overdue Tasks');
    return t('គ្រប់ស្ថានភាព', 'All Homework');
  };

  const statusSelectorItems = [
    {
      id: 'pending',
      title: t('កំពុងរង់ចាំ', 'Pending'),
      count: assignmentStats.pending,
      icon: ClockIcon,
      iconStyle:
        'bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
      activeGradient:
        'from-amber-500 to-orange-500 border-amber-500 shadow-amber-500/25',
    },
    {
      id: 'submitted',
      title: t('ប្រគល់រួច', 'Submitted'),
      count: assignmentStats.submitted,
      icon: DocumentCheckIcon,
      iconStyle:
        'bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
      activeGradient:
        'from-emerald-600 to-teal-600 border-emerald-500 shadow-emerald-500/25',
    },
    {
      id: 'graded',
      title: t('ដាក់ពិន្ទុរួច', 'Graded'),
      count: assignmentStats.graded,
      icon: CheckBadgeIcon,
      iconStyle:
        'bg-indigo-100 text-indigo-600 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30',
      activeGradient:
        'from-indigo-600 to-blue-600 border-indigo-500 shadow-indigo-500/25',
    },
    {
      id: 'overdue',
      title: t('ហួសកំណត់', 'Overdue'),
      count: assignmentStats.overdue,
      icon: ExclamationCircleIcon,
      iconStyle:
        'bg-rose-100 text-rose-600 border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30',
      activeGradient:
        'from-rose-600 to-pink-600 border-rose-500 shadow-rose-500/25',
    },
  ];

  return (
    <div className="std-asg-page max-w-7xl mx-auto px-3 sm:px-5 lg:px-8 space-y-5 sm:space-y-6 lg:space-y-8 pb-28 md:pb-12 mt-2 md:mt-0 animate-fadeIn">
      
      {/* ================================================================== */}
      {/* 1. MODERN BENTO HERO SECTION (Adaptive Phone / iPad / Desktop)     */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 lg:gap-6 items-stretch">
        
        {/* ១.១. ប្រអប់ធំខាងឆ្វេង (7 Cols on lg, 8 Cols on xl) */}
        <div className="lg:col-span-7 xl:col-span-8 relative overflow-hidden rounded-2xl sm:rounded-[1.75rem] lg:rounded-[2rem] bg-gradient-to-br from-blue-950 via-indigo-900 to-violet-950 p-5 sm:p-7 lg:p-8 text-white shadow-xl border border-indigo-500/30 flex flex-col justify-between">
          <div className="std-asg-grid-pattern absolute inset-0 opacity-15 pointer-events-none"></div>
          {/* ✅ លាក់ Blur ធំៗលើទូរស័ព្ទដើម្បីកុំឱ្យធ្លាក់ FPS ពេលអូស */}
          <div className="hidden md:block absolute -top-24 -right-20 w-80 h-80 bg-blue-400/25 rounded-full blur-3xl pointer-events-none"></div>
          <div className="hidden md:block absolute -bottom-24 -left-20 w-72 h-72 bg-purple-500/25 rounded-full blur-3xl pointer-events-none"></div>

          <BuildingLibraryIcon className="absolute -right-6 -bottom-10 w-44 sm:w-60 h-44 sm:h-60 text-white/[0.04] -rotate-12 pointer-events-none" />

          <div className="relative z-10 space-y-3 sm:space-y-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-cyan-400/15 border border-cyan-300/30 text-[11px] sm:text-xs font-extrabold text-cyan-200 max-w-full">
                <AcademicCapIcon className="h-4 w-4 text-cyan-300 shrink-0" />
                <span className="truncate">{studentDeptName}</span>
              </span>

              <span
                className={`inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full md:backdrop-blur-md border text-[11px] sm:text-xs font-extrabold ${
                  isWeekendShift
                    ? 'bg-amber-400/20 border-amber-300/40 text-amber-200'
                    : 'bg-emerald-400/20 border-emerald-300/40 text-emerald-200'
                }`}
              >
                <CalendarDaysIcon
                  className={`h-4 w-4 shrink-0 ${
                    isWeekendShift ? 'text-amber-300' : 'text-emerald-300'
                  }`}
                />
                <span>{studentStudyShiftLabel}</span>
              </span>
            </div>

            <div className="space-y-1.5 sm:space-y-2 pt-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl xl:text-4xl font-extrabold text-white tracking-tight flex flex-wrap items-center gap-2 leading-snug">
                <span>{t('កិច្ចការ និងលំហាត់,', 'Assignments,')}</span>
                <span className="bg-gradient-to-r from-yellow-300 via-amber-200 to-white bg-clip-text text-transparent">
                  {getActiveStatusTitle()}
                </span>
                <CheckBadgeIcon className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-yellow-400 shrink-0" />
              </h1>

              <p className="text-xs sm:text-sm text-blue-100/80 max-w-2xl leading-relaxed font-medium">
                {t(
                  'គ្រប់គ្រង កត់ត្រា និងបញ្ជូនកិច្ចការសិក្សាទៅកាន់សាស្ត្រាចារ្យរបស់អ្នកឱ្យបានទាន់ពេលវេលា ព្រមទាំងពិនិត្យមើលពិន្ទុ និងមតិយោបល់។',
                  'Manage, track, and submit your course assignments to your instructors on time, and review your grades and feedback.'
                )}
              </p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-3 sm:gap-4 mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-white/15">
            <div className="bg-white/15 md:bg-white/[0.08] hover:bg-white/[0.14] md:backdrop-blur-md border border-white/15 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-3.5 transition-colors">
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-emerald-500/25 border border-emerald-300/30 flex items-center justify-center text-emerald-300 shrink-0">
                <DocumentCheckIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-base sm:text-xl font-black text-white leading-none">
                  {assignmentStats.submitted} / {assignmentStats.total}
                </span>
                <span className="block text-[11px] sm:text-xs font-bold text-blue-200/90 truncate mt-1">
                  {t('កិច្ចការបានប្រគល់រួច', 'Submitted Assignments')}
                </span>
              </div>
            </div>

            <div className="bg-white/15 md:bg-white/[0.08] hover:bg-white/[0.14] md:backdrop-blur-md border border-white/15 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-3.5 transition-colors">
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-yellow-300 shrink-0">
                <ChartBarIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-base sm:text-xl font-black text-white leading-none">
                  {assignmentStats.graded > 0
                    ? `${assignmentStats.avgScorePercent}%`
                    : '—'}
                </span>
                <span className="block text-[11px] sm:text-xs font-bold text-blue-200/90 truncate mt-1">
                  {t('ពិន្ទុមធ្យមភាគកិច្ចការ', 'Average Assignment Score')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ១.២. ប្រអប់ពណ៌សខាងស្ដាំ (5 Cols on lg, 4 Cols on xl) */}
        <div className="lg:col-span-5 xl:col-span-4 std-asg-surface bg-white rounded-2xl sm:rounded-[1.75rem] lg:rounded-[2rem] p-5 sm:p-6 border border-gray-200/80 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-3.5 sm:space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/30 flex items-center justify-center shrink-0">
                  <ClipboardDocumentListIcon className="h-5 w-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <h2 className="std-asg-text-primary text-base sm:text-lg font-extrabold text-gray-900 leading-tight truncate">
                    {t('តាមដានកិច្ចការតាមស្ថានភាព', 'Filter by Status')}
                  </h2>
                  <p className="std-asg-text-secondary text-[11px] font-medium text-gray-500 mt-0.5 truncate">
                    {t('ចុចជ្រើសរើសស្ថានភាពដើម្បីច្រោះមើល', 'Select a status to filter tasks')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 pt-1">
              {statusSelectorItems.map((item) => {
                const isSelected = statusFilter === item.id;
                const StatusIcon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setStatusFilter(isSelected ? 'all' : item.id)
                    }
                    className={`group p-3 sm:p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? `bg-gradient-to-br ${item.activeGradient} text-white shadow-md -translate-y-0.5`
                        : 'std-asg-subbox bg-gray-50/80 hover:bg-indigo-50/50 border-gray-200/80 hover:border-indigo-300 text-gray-800 hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                      <div
                        className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                          isSelected
                            ? 'bg-white/20 text-white border-white/30'
                            : item.iconStyle
                        }`}
                      >
                        <StatusIcon className="h-4 w-4 sm:h-5 sm:w-5 stroke-[2.2]" />
                      </div>
                      <span
                        className={`text-xs sm:text-sm font-black truncate ${
                          isSelected
                            ? 'text-white'
                            : 'std-asg-text-primary text-gray-900'
                        }`}
                      >
                        {item.title}
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-black shrink-0 ${
                        isSelected
                          ? 'bg-white/25 text-white'
                          : 'bg-white text-indigo-600 border border-gray-200/80 dark:bg-slate-800 dark:text-indigo-400 dark:border-slate-700'
                      }`}
                    >
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="std-asg-divider pt-3.5 sm:pt-4 mt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="std-asg-text-secondary font-bold text-gray-500">
              {t('សរុប៖', 'Total:')}{' '}
              <strong className="std-asg-text-primary text-gray-800">
                {assignmentStats.total}
              </strong>{' '}
              • {t('នៅសល់៖', 'Pending:')}{' '}
              <strong className="text-amber-600 dark:text-amber-400">
                {assignmentStats.pending}
              </strong>
            </span>

            {statusFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>{t('បង្ហាញទាំងអស់វិញ', 'Show All')}</span>
                <ChevronRightIcon className="h-3.5 w-3.5 stroke-[2.5]" />
              </button>
            ) : (
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
                <span>{t('បង្ហាញគ្រប់ស្ថានភាព', 'All Shown')}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 2. SEARCH & COURSE FILTER BAR                                      */}
      {/* ================================================================== */}
      <div className="std-asg-surface bg-white rounded-2xl border border-gray-200/80 shadow-xs p-3.5 sm:p-4 flex flex-col sm:flex-row gap-3 sm:gap-3.5 items-center justify-between">
        <div className="relative w-full sm:max-w-md flex-1">
          <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t(
              'ស្វែងរកតាមចំណងជើងកិច្ចការ ឬមុខវិជ្ជា...',
              'Search assignment title or course...'
            )}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="std-asg-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-gray-50/60 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {availableCourses.length > 0 && (
            <div className="relative w-full sm:w-64 lg:w-72 shrink-0">
              <BookOpenIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedCourse}
                onChange={(e) => {
                  setSelectedCourse(e.target.value);
                  setPage(1);
                }}
                className="std-asg-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white font-medium text-gray-700 appearance-none cursor-pointer transition-colors"
              >
                <option value="all">
                  {t('គ្រប់មុខវិជ្ជាទាំងអស់', 'All Courses')}
                </option>
                {availableCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.course_code ? `${course.course_code.toUpperCase()} - ` : ''}
                    {course.course_name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* 📌 3. ASSIGNMENT CARDS LIST                                        */}
      {/* ================================================================== */}
      {filteredAssignments.length === 0 ? (
        <div className="std-asg-surface bg-white rounded-2xl sm:rounded-3xl border border-gray-200/80 shadow-xs p-10 sm:p-14 text-center space-y-3">
          <ClipboardDocumentCheckIcon className="h-14 w-14 sm:h-16 sm:w-16 mx-auto text-indigo-300" />
          <h3 className="std-asg-text-primary text-base sm:text-lg font-extrabold text-gray-800">
            {searchQuery || selectedCourse !== 'all' || statusFilter !== 'all'
              ? t(
                  'មិនឃើញមានកិច្ចការតាមការស្វែងរកនេះទេ',
                  'No matching assignments found'
                )
              : t('មិនទាន់មានកិច្ចការនៅឡើយទេ', 'No assignments available yet')}
          </h3>
          <p className="std-asg-text-secondary text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
            {t(
              'សាកល្បងផ្លាស់ប្តូរតម្រងមុខវិជ្ជា ឬស្ថានភាពនៅប្រអប់ខាងលើ។',
              'Try changing the course or status filters above.'
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5 sm:space-y-4">
          {filteredAssignments.map((assign) => {
            const submission = assign.resolvedSubmission;
            const isSubmitted = Boolean(submission);
            const isGraded =
              isSubmitted &&
              submission?.score !== null &&
              submission?.score !== undefined &&
              submission?.score !== '';
            const dueMs = toComparableTimeMs(assign.due_date);
            const isOverdue =
              !isSubmitted && !isNaN(dueMs) && Date.now() > dueMs;

            const maxScore = formatCleanScore(
              assign.total_score ||
                assign.total_marks ||
                assign.marks ||
                assign.total_mark ||
                assign.max_score ||
                20
            );

            const teacherAttachmentPath =
              assign.file_path || assign.attachment || assign.document_url || '';

            return (
              <div
                key={assign.id}
                className="std-asg-card bg-white border border-gray-200/80 hover:border-indigo-400 rounded-2xl sm:rounded-[1.5rem] p-4 sm:p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 shadow-2xs hover:shadow-lg transition-all duration-200"
              >
                <div className="space-y-2.5 sm:space-y-3 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {assign.course?.course_code && (
                      <span className="std-asg-code-pill text-[11px] sm:text-xs font-extrabold text-indigo-700 bg-indigo-50 px-2.5 sm:px-3 py-1 rounded-lg border border-indigo-100 uppercase">
                        {assign.course.course_code}
                      </span>
                    )}

                    <span className="std-asg-text-secondary text-xs font-extrabold text-gray-600 flex items-center gap-1 min-w-0">
                      <BookOpenIcon className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      <span className="truncate">
                        {assign.course?.course_name || t('មុខវិជ្ជាសិក្សា', 'Course')}
                      </span>
                    </span>

                    <span
                      className={`text-[11px] sm:text-xs font-extrabold inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg border ml-auto sm:ml-0 ${
                        isGraded
                          ? 'std-asg-badge-indigo bg-indigo-50 text-indigo-700 border-indigo-200'
                          : isSubmitted
                          ? 'std-asg-badge-emerald bg-emerald-50 text-emerald-700 border-emerald-200'
                          : isOverdue
                          ? 'std-asg-badge-rose bg-rose-50 text-rose-700 border-rose-200'
                          : 'std-asg-badge-amber bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {isGraded ? (
                        <>
                          <CheckBadgeIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                          <span>{t('ដាក់ពិន្ទុរួច', 'Graded')}</span>
                        </>
                      ) : isSubmitted ? (
                        <>
                          <CheckCircleIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                          <span>{t('ប្រគល់រួច', 'Submitted')}</span>
                        </>
                      ) : isOverdue ? (
                        <>
                          <ExclamationCircleIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                          <span>{t('ហួសកំណត់', 'Overdue')}</span>
                        </>
                      ) : (
                        <>
                          <ClockIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                          <span>{t('កំពុងរង់ចាំ', 'Pending')}</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div>
                    <h3 className="std-asg-text-primary text-base sm:text-lg lg:text-xl font-black text-gray-900 leading-snug">
                      {assign.title}
                    </h3>
                    {assign.description && (
                      <p className="std-asg-text-secondary text-xs sm:text-sm text-gray-500 leading-relaxed max-w-3xl mt-1 font-medium">
                        {assign.description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-1 text-xs">
                    <span
                      className={`std-asg-subbox inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold ${
                        isOverdue
                          ? 'text-rose-600 border-rose-200 bg-rose-50/50 dark:text-rose-400'
                          : 'std-asg-text-secondary text-gray-600 border-gray-200/80 bg-gray-50'
                      }`}
                    >
                      <ClockIcon className="h-4 w-4 text-amber-500 shrink-0" />
                      <span>{t('ថ្ងៃកំណត់៖', 'Due:')}</span>
                      <strong className="std-asg-text-primary text-gray-800">
                        {formatDateTime(assign.due_date, true)}
                      </strong>
                    </span>

                    <span className="std-asg-badge-indigo inline-flex items-center gap-1 text-indigo-700 font-extrabold bg-indigo-50 border border-indigo-200/80 px-3 py-1.5 rounded-xl">
                      <span>{t('ពិន្ទុសរុប៖', 'Max Score:')}</span>
                      <strong>
                        {maxScore} {t('ពិន្ទុ', 'pts')}
                      </strong>
                    </span>

                    {teacherAttachmentPath && (
                      <a
                        href={getStorageUrl(teacherAttachmentPath)}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="std-asg-badge-blue inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-extrabold transition-colors"
                      >
                        <DocumentTextIcon className="h-4 w-4 shrink-0" />
                        <span>{t('ឯកសារលំហាត់គ្រូ', 'Assignment File')}</span>
                      </a>
                    )}
                  </div>
                </div>

                <div className="std-asg-divider lg:w-72 xl:w-80 shrink-0 flex flex-col items-stretch lg:items-end justify-center border-t lg:border-t-0 pt-3.5 lg:pt-0 border-gray-100">
                  {isSubmitted ? (
                    <div className="std-asg-subbox bg-gray-50/90 border border-gray-200/80 p-3.5 sm:p-4 rounded-2xl w-full space-y-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="std-asg-text-secondary text-gray-400 font-extrabold uppercase tracking-wider text-[10px]">
                          {t('លទ្ធផលកិច្ចការ', 'Submission Result')}
                        </span>
                        <span className="std-asg-text-secondary text-[11px] text-gray-500 font-bold">
                          {formatDateTime(
                            submission.submitted_at || submission.created_at,
                            false
                          )}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-0.5">
                        <span className="std-asg-text-secondary font-bold text-gray-600">
                          {t('ពិន្ទុទទួលបាន៖', 'Score Earned:')}
                        </span>
                        {isGraded ? (
                          <span className="std-asg-badge-emerald px-2.5 py-1 rounded-lg font-black text-emerald-700 bg-emerald-50 border border-emerald-200 text-sm">
                            {formatCleanScore(submission.score)} / {maxScore}
                          </span>
                        ) : (
                          <span className="std-asg-badge-amber px-2.5 py-1 rounded-lg font-extrabold text-amber-700 bg-amber-50 border border-amber-200 text-xs">
                            {t('រង់ចាំគ្រូកែ', 'Pending Grading')}
                          </span>
                        )}
                      </div>

                      {submission.feedback && (
                        <div className="std-asg-badge-amber text-xs text-amber-800 bg-amber-50/80 p-2.5 rounded-xl border border-amber-200/70 flex items-start gap-1.5 font-medium">
                          <ChatBubbleLeftEllipsisIcon className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            <strong>{t('មតិយោបល់៖', 'Feedback:')}</strong>{' '}
                            {submission.feedback}
                          </span>
                        </div>
                      )}

                      {submission.file_path &&
                        (String(submission.file_path).includes('/') ||
                          String(submission.file_path).startsWith('http') ||
                          String(submission.file_path).startsWith('data:') ||
                          String(submission.file_path).startsWith('blob:')) && (
                          <div className="std-asg-divider pt-2 border-t border-gray-200/70 flex items-center justify-between gap-2">
                            <a
                              href={getStorageUrl(submission, submission.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                              className="inline-flex items-center gap-1.5 text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4 stroke-[2.2]" />
                              <span>
                                {t(
                                  'ទាញយកឯកសារដែលបានផ្ញើ',
                                  'Download Submitted File'
                                )}
                              </span>
                            </a>
                          </div>
                        )}
                    </div>
                  ) : isOverdue ? (
                    <div className="std-asg-badge-rose w-full lg:w-auto px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-extrabold text-rose-600 flex items-center justify-center gap-2">
                      <ExclamationCircleIcon className="h-4 w-4 shrink-0" />
                      <span>{t('ផុតកំណត់ទទួលកិច្ចការ', 'Submissions Closed')}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenSubmitModal(assign)}
                      className="w-full lg:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs sm:text-sm font-extrabold px-6 py-3 sm:py-3.5 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
                    >
                      <CloudArrowUpIcon className="h-5 w-5 stroke-[2.2]" />
                      <span>{t('ប្រគល់កិច្ចការ', 'Submit Assignment')}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================================== */}
      {/* 📌 4. PAGINATION CONTROLS                                          */}
      {/* ================================================================== */}
      {meta.last_page > 1 && (
        <div className="std-asg-surface bg-white rounded-2xl border border-gray-200/80 shadow-xs px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="std-asg-text-secondary text-xs font-bold text-gray-600">
            {t('ទំព័រ', 'Page')} {meta.current_page} / {meta.last_page} ({meta.total}{' '}
            {t('កិច្ចការ', 'assignments')})
          </p>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={meta.current_page === 1}
              className="std-asg-code-pill px-3.5 sm:px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {t('មុន', 'Previous')}
            </button>
            {(() => {
              const totalPages = meta.last_page || 1;
              const current = meta.current_page || 1;
              let start = Math.max(1, current - 2);
              let end = Math.min(totalPages, start + 4);
              if (end - start < 4) {
                start = Math.max(1, end - 4);
              }
              const pages = [];
              for (let i = start; i <= end; i++) {
                pages.push(i);
              }
              return pages.map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setPage(pageNum)}
                  className={`px-3 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                    meta.current_page === pageNum
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'std-asg-code-pill bg-white border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              ));
            })()}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
              disabled={meta.current_page === meta.last_page}
              className="std-asg-code-pill px-3.5 sm:px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {t('បន្ទាប់', 'Next')}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 📌 5. SUBMISSION MODAL (Bottom Sheet on Phone, Centered on iPad/Desktop) */}
      {/* ================================================================== */}
      {submitModalOpen &&
        selectedAssignment &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 m-0 z-[9999] w-screen h-screen flex items-end sm:items-center justify-center bg-slate-950/75 md:backdrop-blur-md p-0 sm:p-4 overflow-y-auto animate-fadeIn"
            onClick={() => {
              setSubmitModalOpen(false);
              setSubmitError('');
            }}
          >
            <div
              className="std-asg-surface bg-white rounded-t-3xl sm:rounded-[1.75rem] shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-slate-700"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="std-asg-modal-bar px-5 sm:px-6 py-4 sm:py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/60">
                <h2 className="std-asg-text-primary text-base sm:text-xl font-extrabold text-gray-900 flex items-center gap-2.5">
                  <span className="std-asg-badge-indigo p-2 sm:p-2.5 rounded-xl bg-indigo-100 text-indigo-600 border border-indigo-200">
                    <CloudArrowUpIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </span>
                  <span>{t('ប្រគល់កិច្ចការសិក្សា', 'Submit Assignment')}</span>
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitModalOpen(false);
                    setSubmitError('');
                  }}
                  className="std-asg-code-pill p-2 hover:bg-gray-200 rounded-xl transition text-gray-500 hover:text-gray-800 border border-gray-200 cursor-pointer"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="p-5 sm:p-7 space-y-4 sm:space-y-5">
                {submitError && (
                  <div className="std-asg-badge-rose p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-600">
                    <ExclamationCircleIcon className="h-5 w-5 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold leading-relaxed">
                      {submitError}
                    </p>
                  </div>
                )}

                <div className="std-asg-subbox bg-gray-50 p-4 rounded-2xl border border-gray-200/80 text-xs space-y-1.5">
                  <p className="std-asg-text-primary font-extrabold text-gray-900 text-sm">
                    {selectedAssignment.title}
                  </p>
                  <p className="std-asg-text-secondary text-gray-500 font-semibold flex items-center gap-1.5">
                    <ClockIcon className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>{t('ថ្ងៃកំណត់៖', 'Due Date:')}</span>
                    <strong className="std-asg-text-primary text-gray-700">
                      {formatDateTime(selectedAssignment.due_date, true)}
                    </strong>
                  </p>
                </div>

                <form onSubmit={handleAssignmentSubmit} className="space-y-4 sm:space-y-5">
                  <div className="std-asg-subbox border-2 border-dashed border-indigo-300 dark:border-slate-600 hover:border-indigo-500 transition bg-indigo-50/30 hover:bg-indigo-50/60 rounded-2xl p-6 sm:p-7 text-center cursor-pointer relative">
                    <input
                      type="file"
                      required
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.zip,.rar,.png,.jpg,.jpeg"
                    />
                    <CloudArrowUpIcon className="h-10 w-10 sm:h-11 sm:w-11 text-indigo-500 mx-auto mb-2.5" />
                    <span className="std-asg-text-primary block text-xs sm:text-sm font-extrabold text-gray-800 break-all">
                      {uploadFile
                        ? uploadFile.name
                        : t(
                            'ចុចទីនេះដើម្បីជ្រើសរើស ឬអូសឯកសារដាក់ទីនេះ',
                            'Click to select or drag your file here'
                          )}
                    </span>
                    <span className="std-asg-text-secondary block text-[11px] sm:text-xs text-gray-400 mt-1.5 font-medium">
                      {t(
                        'គាំទ្រឯកសារ PDF, Word, PowerPoint, Excel, រូបភាព ឬ ZIP (រហូតដល់ 10MB)',
                        'Supports PDF, Word, PowerPoint, Excel, Images, or ZIP (up to 10MB)'
                      )}
                    </span>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitModalOpen(false);
                        setSubmitError('');
                      }}
                      className="std-asg-code-pill px-5 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm font-extrabold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                    >
                      {t('បោះបង់', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={submittingFile || !uploadFile}
                      className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-md transition cursor-pointer flex items-center gap-2"
                    >
                      {submittingFile ? (
                        <>
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          <span>{t('កំពុងផ្ទុកឡើង...', 'Uploading...')}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircleIcon className="h-4 w-4 stroke-[2.2]" />
                          <span>{t('ផ្ញើកិច្ចការឥឡូវនេះ', 'Submit Now')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ================================================================== */}
      {/* 6. CSS សម្រាប់កំណត់ពណ៌ក្នុងទម្រង់យប់ (DARK MODE STYLING)            */}
      {/* ================================================================== */}
      <style>{`
        .std-asg-grid-pattern {
          background-image: radial-gradient(rgba(255, 255, 255, 0.25) 1px, transparent 1px);
          background-size: 20px 20px;
        }

        html.dark .std-asg-page {
          background-color: transparent !important;
        }
        html.dark .std-asg-surface,
        html.dark .std-asg-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .std-asg-card:hover {
          border-color: #6366f1 !important;
        }
        html.dark .std-asg-modal-bar,
        html.dark .std-asg-subbox {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .std-asg-divider {
          border-color: #334155 !important;
        }
        html.dark .std-asg-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        html.dark .std-asg-input::placeholder {
          color: #64748b !important;
        }
        html.dark .std-asg-text-primary {
          color: #f8fafc !important;
        }
        html.dark .std-asg-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .std-asg-code-pill {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .std-asg-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .std-asg-badge-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .std-asg-badge-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .std-asg-badge-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          color: #818cf8 !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .std-asg-badge-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
      `}</style>
    </div>
  );
};

export default StudentAssignments;
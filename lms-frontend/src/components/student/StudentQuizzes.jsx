// src/components/student/StudentQuizzes.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  AcademicCapIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  BookOpenIcon,
  PencilSquareIcon,
  CalendarDaysIcon,
  CheckBadgeIcon,
  BuildingLibraryIcon,
  SparklesIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  XMarkIcon,
  ChartBarIcon,
  PlayCircleIcon,
  EyeIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនីសិស្សម្នាក់ៗ (User-Scoped 0ms Cache)
// ============================================================================
const LAST_ACTIVE_STUDENT_UID_KEY = 'lms_last_active_student_uid';
const CACHE_KEY_SHARED_QUIZZES = 'cached_student_quizzes_list_v5';
const CACHE_KEY_SHARED_COURSES = 'cached_student_courses_list_v3';
const CACHE_KEY_SHARED_ENROLLMENTS = 'cached_student_dashboard_enrollments_v8';

const getQuizzesCacheKey = (uid) => `cached_student_quizzes_list_v8_${uid}`;
const getQuizzesMetaCacheKey = (uid) => `cached_student_quizzes_meta_v8_${uid}`;
const getCoursesCacheKey = (uid) => `cached_student_courses_list_v10_${uid}`;
const getEnrollmentsCacheKey = (uid) => `cached_student_dashboard_enrollments_v10_${uid}`;
const getQuizReviewsCacheKey = (uid) => `cached_student_quiz_reviews_v8_${uid}`;
const getScoresCacheKey = (uid) => `cached_student_scores_list_v10_${uid}`;

const DEFAULT_META = {
  current_page: 1,
  last_page: 1,
  total: 0,
  per_page: 15,
};

// ✅ Global Memory Cache បែងចែកតាម uid របស់សិស្សម្នាក់ៗ (មិនឱ្យលាយទិន្នន័យគ្នាដាច់ខាត)
const STUDENT_QUIZ_MEM_CACHE = {
  uid: null,
  quizzes: null,
  courses: null,
  reviews: null,
  meta: null,
  lastSyncedAt: 0,
  lastCoursesSyncedAt: 0,
};

const readStorageJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// ✅ អនុគមន៍ចាប់យកអត្តសញ្ញាណសិស្សឱ្យជាក់លាក់តាំងពីវិនាទីដំបូង
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
      localStorage.getItem('user') || localStorage.getItem('auth_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      const u = parsed?.user || parsed?.data || parsed;
      const id = u?.id || u?.user_id || u?.student?.id || u?.email;
      if (id) return String(id);
    }
  } catch {}
  return 'default_student';
};

// ✅ អនុគមន៍សម្អាត Cache ចាស់របស់សិស្សមុន នៅពេលមានសិស្សថ្មី Login ចូលលើ Browser តែមួយ
const ensureCleanStudentSessionCache = (newUid) => {
  if (!newUid || newUid === 'default_student') return;
  try {
    const prevUid = localStorage.getItem(LAST_ACTIVE_STUDENT_UID_KEY);
    if (prevUid && prevUid !== String(newUid)) {
      const legacySharedKeys = [
        'cached_student_quizzes_list_v5',
        'cached_student_courses_list_v3',
        'cached_student_courses_meta_v3',
        'cached_student_dashboard_stats_v8',
        'cached_student_dashboard_enrollments_v8',
        'cached_student_dashboard_activity_v8',
        'cached_student_assignments_list_v5',
        'cached_student_scores_list_v5',
        'cached_student_attendance_list_v3',
      ];
      legacySharedKeys.forEach((k) => localStorage.removeItem(k));
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

// ✅ អនុគមន៍ស្រង់យកថ្ងៃខែ និងម៉ោងពិតប្រាកដ ១០០%
const extractExactDateTimeParts = (rawVal, isEndBoundary = false) => {
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
      hour:
        match[4] !== undefined
          ? parseInt(match[4], 10)
          : isEndBoundary
          ? 23
          : 0,
      minute:
        match[5] !== undefined
          ? parseInt(match[5], 10)
          : isEndBoundary
          ? 59
          : 0,
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

const toComparableTimeMs = (val, isEndBoundary = false) => {
  const p = extractExactDateTimeParts(val, isEndBoundary);
  if (!p) return NaN;
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0).getTime();
};

// ✅ ១. អនុគមន៍ស្រង់យកបញ្ជីកម្រងសំណួរពី API Response គ្រប់ទម្រង់ទាំងអស់
const extractValidQuizzesList = (resData) => {
  if (!resData) return [];
  if (Array.isArray(resData)) return resData;
  if (Array.isArray(resData.data)) return resData.data;
  if (Array.isArray(resData.quizzes)) return resData.quizzes;
  if (resData.data && Array.isArray(resData.data.data)) return resData.data.data;
  if (resData.data && Array.isArray(resData.data.quizzes))
    return resData.data.quizzes;
  return [];
};

// ✅ ២. អនុគមន៍ស្រង់យកទិន្នន័យការប្រឡងរបស់សិស្ស (Attempt)
const resolveStudentAttempt = (quiz) => {
  if (!quiz) return null;
  if (
    quiz.attempt &&
    typeof quiz.attempt === 'object' &&
    !Array.isArray(quiz.attempt)
  ) {
    return quiz.attempt;
  }
  if (quiz.student_attempt && typeof quiz.student_attempt === 'object') {
    return quiz.student_attempt;
  }
  if (Array.isArray(quiz.attempts) && quiz.attempts.length > 0) {
    return quiz.attempts[0];
  }
  if (Array.isArray(quiz.attempt) && quiz.attempt.length > 0) {
    return quiz.attempt[0];
  }
  return null;
};

// ✅ ៣. អនុគមន៍កាត់ .00 ចេញពីពិន្ទុ
const formatCleanScore = (val, fallback = 0) => {
  if (val === null || val === undefined || val === '') return fallback;
  const num = Number(val);
  return isNaN(num) ? val : Math.round(num * 100) / 100;
};

// ✅ ៤. អនុគមន៍ពិនិត្យថាតើជម្រើសនោះជាចម្លើយត្រឹមត្រូវឬអត់
const isOptionMarkedCorrect = (opt) => {
  if (!opt) return false;
  return (
    opt.is_correct === true ||
    opt.is_correct === 1 ||
    opt.is_correct === '1' ||
    String(opt.is_correct).toLowerCase() === 'true'
  );
};

// ✅ ៥. អនុគមន៍បង្កើតបញ្ជីត្រួតពិនិត្យសំណួរ និងចម្លើយដែលសិស្សបានធីក (Review Items)
const buildQuizReviewItems = (questions = [], selectedAnswersMap = {}) => {
  if (!Array.isArray(questions)) return [];

  return questions.map((q, idx) => {
    const selectedOptId = selectedAnswersMap[q.id];
    const options = Array.isArray(q.options) ? q.options : [];

    const selectedOption = options.find(
      (opt) => String(opt.id) === String(selectedOptId)
    );
    const correctOption = options.find((opt) => isOptionMarkedCorrect(opt));

    const isAnswered = selectedOption !== undefined && selectedOption !== null;
    const isCorrect = Boolean(
      isAnswered &&
        ((correctOption &&
          String(selectedOption.id) === String(correctOption.id)) ||
          isOptionMarkedCorrect(selectedOption))
    );

    const mark = formatCleanScore(q.mark ?? 1, 1);

    return {
      questionId: q.id || idx + 1,
      index: idx + 1,
      questionText: q.question_text || '',
      mark,
      earnedMark: isCorrect ? mark : 0,
      isAnswered,
      isCorrect,
      selectedOptionId: selectedOption?.id ?? null,
      selectedOptionText: selectedOption?.option_text ?? null,
      correctOptionId: correctOption?.id ?? null,
      correctOptionText: correctOption?.option_text ?? null,
      options,
    };
  });
};

// ✅ ៦. អនុគមន៍បញ្ជូនសារជូនដំណឹងទៅកាន់រូបកណ្ដឹង (NotificationBell) លើ Navbar
const pushLocalNotification = (notif) => {
  try {
    const userObjStr =
      localStorage.getItem('auth_user') || localStorage.getItem('user');
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
      id: `local_std_quiz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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

const StudentQuizzes = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const abortControllerRef = useRef(null);

  // ✅ កំណត់អត្តសញ្ញាណសិស្សបច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentStudentId = useMemo(() => {
    const uid = resolveStudentUid(user);
    ensureCleanStudentSessionCache(uid);
    return uid;
  }, [user]);

  // បើប្ដូរគណនីសិស្ស ឱ្យសម្អាត RAM Cache ចាស់ចោលភ្លាមៗក្នុង 0ms
  if (
    STUDENT_QUIZ_MEM_CACHE.uid &&
    STUDENT_QUIZ_MEM_CACHE.uid !== currentStudentId
  ) {
    STUDENT_QUIZ_MEM_CACHE.quizzes = null;
    STUDENT_QUIZ_MEM_CACHE.courses = null;
    STUDENT_QUIZ_MEM_CACHE.reviews = null;
    STUDENT_QUIZ_MEM_CACHE.meta = null;
    STUDENT_QUIZ_MEM_CACHE.lastSyncedAt = 0;
    STUDENT_QUIZ_MEM_CACHE.lastCoursesSyncedAt = 0;
  }
  STUDENT_QUIZ_MEM_CACHE.uid = currentStudentId;

  const initialRouteCourseId =
    searchParams.get('course_id') || location.state?.courseId || 'all';

  // ✅ ១. អានពី Cache តាមគណនីសិស្សម្នាក់ៗភ្លាមៗក្នុង 0 វិនាទី (គ្មាន Skeleton Loading)
  const [quizzes, setQuizzes] = useState(() => {
    if (Array.isArray(STUDENT_QUIZ_MEM_CACHE.quizzes)) {
      return STUDENT_QUIZ_MEM_CACHE.quizzes;
    }
    const cached =
      readStorageJson(getQuizzesCacheKey(currentStudentId), null) ||
      readStorageJson(CACHE_KEY_SHARED_QUIZZES, []);
    STUDENT_QUIZ_MEM_CACHE.quizzes = cached;
    return cached;
  });

  const [coursesList, setCoursesList] = useState(() => {
    if (Array.isArray(STUDENT_QUIZ_MEM_CACHE.courses)) {
      return STUDENT_QUIZ_MEM_CACHE.courses;
    }
    const cached =
      readStorageJson(getCoursesCacheKey(currentStudentId), null) ||
      readStorageJson(getEnrollmentsCacheKey(currentStudentId), null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES, null) ||
      readStorageJson(CACHE_KEY_SHARED_ENROLLMENTS, []);
    STUDENT_QUIZ_MEM_CACHE.courses = cached;
    return cached;
  });

  const [savedReviewsMap, setSavedReviewsMap] = useState(() => {
    if (STUDENT_QUIZ_MEM_CACHE.reviews) {
      return STUDENT_QUIZ_MEM_CACHE.reviews;
    }
    const cached =
      readStorageJson(getQuizReviewsCacheKey(currentStudentId), null) ||
      readStorageJson('cached_student_quiz_reviews_v1', {});
    STUDENT_QUIZ_MEM_CACHE.reviews = cached;
    return cached;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState(
    String(initialRouteCourseId)
  );
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'available' | 'completed' | 'upcoming' | 'expired'

  // Pagination states
  const [page, setPage] = useState(1);
  const [perPage] = useState(15);
  const [meta, setMeta] = useState(() => {
    if (STUDENT_QUIZ_MEM_CACHE.meta) {
      return STUDENT_QUIZ_MEM_CACHE.meta;
    }
    const cached = readStorageJson(
      getQuizzesMetaCacheKey(currentStudentId),
      DEFAULT_META
    );
    STUDENT_QUIZ_MEM_CACHE.meta = cached;
    return cached;
  });

  // Attempt Quiz State
  const [activeQuizAttempt, setActiveQuizAttempt] = useState(null);
  const [attemptAnswers, setAttemptAnswers] = useState({});
  const [loadingQuizId, setLoadingQuizId] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [unansweredCountPrompt, setUnansweredCountPrompt] = useState(0);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const timerRef = useRef(null);
  const endTimeRef = useRef(null);

  // Result & Question Review dialog state
  const [quizResult, setQuizResult] = useState(null);

  // ✅ States សម្រាប់ចុចពង្រីកពេញអេក្រង់ (Expand / Fullscreen Toggle)
  const [isAttemptExpanded, setIsAttemptExpanded] = useState(false);
  const [isResultExpanded, setIsResultExpanded] = useState(false);

  // ✅ ចាក់សោរការអូសទំព័រខាងក្រោយ (Lock Body Scroll) នៅពេលបើកផ្ទាំងប្រឡង ឬផ្ទាំងលទ្ធផល
  useEffect(() => {
    if (activeQuizAttempt || quizResult) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [activeQuizAttempt, quizResult]);

  useEffect(() => {
    const routeCid = searchParams.get('course_id') || location.state?.courseId;
    if (routeCid) {
      setSelectedCourse(String(routeCid));
    }
  }, [searchParams, location.state]);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  // ============================================================================
  // 📌 ផ្នែកទី២៖ ការទាញទិន្នន័យពី Backend API ដោយមិនរាំងស្ទះ UI (Non-Blocking 0ms Sync)
  // ============================================================================
  const fetchStudentCourses = useCallback(async () => {
    const now = Date.now();
    if (
      STUDENT_QUIZ_MEM_CACHE.uid === currentStudentId &&
      Array.isArray(STUDENT_QUIZ_MEM_CACHE.courses) &&
      STUDENT_QUIZ_MEM_CACHE.courses.length > 0 &&
      now - STUDENT_QUIZ_MEM_CACHE.lastCoursesSyncedAt < 30000
    ) {
      return;
    }

    try {
      const response = await api.get('/student/courses?all=true');
      const raw = response.data?.data ?? response.data ?? [];
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
        ? raw.data
        : [];
      setCoursesList(list);
      STUDENT_QUIZ_MEM_CACHE.courses = list;
      STUDENT_QUIZ_MEM_CACHE.lastCoursesSyncedAt = Date.now();
      try {
        localStorage.setItem(
          getCoursesCacheKey(currentStudentId),
          JSON.stringify(list)
        );
        localStorage.setItem(CACHE_KEY_SHARED_COURSES, JSON.stringify(list));
      } catch (e) {}
    } catch (e) {
      console.error('Error fetching student courses', e);
    }
  }, [currentStudentId]);

  const fetchQuizzes = useCallback(
    async (forceRefresh = false) => {
      if (page === 1 && selectedCourse === 'all') {
        const cachedQuz = readStorageJson(
          getQuizzesCacheKey(currentStudentId),
          null
        );
        const cachedMeta = readStorageJson(
          getQuizzesMetaCacheKey(currentStudentId),
          null
        );
        if (Array.isArray(cachedQuz)) {
          setQuizzes(cachedQuz);
          STUDENT_QUIZ_MEM_CACHE.quizzes = cachedQuz;
        }
        if (cachedMeta) {
          setMeta(cachedMeta);
          STUDENT_QUIZ_MEM_CACHE.meta = cachedMeta;
        }
      }

      const now = Date.now();
      if (
        !forceRefresh &&
        page === 1 &&
        selectedCourse === 'all' &&
        STUDENT_QUIZ_MEM_CACHE.uid === currentStudentId &&
        Array.isArray(STUDENT_QUIZ_MEM_CACHE.quizzes) &&
        STUDENT_QUIZ_MEM_CACHE.quizzes.length > 0 &&
        now - STUDENT_QUIZ_MEM_CACHE.lastSyncedAt < 25000
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

        const response = await api.get('/student/quizzes', {
          params,
          signal: controller.signal,
        });
        const list = extractValidQuizzesList(response.data);

        const metaData =
          response.data?.meta ||
          response.data?.data?.meta || {
            current_page: page,
            last_page: 1,
            total: list.length,
            per_page: perPage,
          };

        setQuizzes(list);
        setMeta(metaData);

        if (page === 1 && selectedCourse === 'all') {
          STUDENT_QUIZ_MEM_CACHE.uid = currentStudentId;
          STUDENT_QUIZ_MEM_CACHE.quizzes = list;
          STUDENT_QUIZ_MEM_CACHE.meta = metaData;
          STUDENT_QUIZ_MEM_CACHE.lastSyncedAt = Date.now();
          try {
            localStorage.setItem(
              getQuizzesCacheKey(currentStudentId),
              JSON.stringify(list)
            );
            localStorage.setItem(
              getQuizzesMetaCacheKey(currentStudentId),
              JSON.stringify(metaData)
            );
            localStorage.setItem(
              CACHE_KEY_SHARED_QUIZZES,
              JSON.stringify(list)
            );
          } catch (e) {}
        }
      } catch (error) {
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
          return;
        }
        console.error('Error fetching student quizzes:', error);
      }
    },
    [page, perPage, selectedCourse, currentStudentId]
  );

  useEffect(() => {
    fetchStudentCourses();
  }, [fetchStudentCourses]);

  useEffect(() => {
    fetchQuizzes(false);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchQuizzes]);

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ អនុគមន៍ជំនួយសម្រាប់ព័ត៌មានសិស្ស កាលបរិច្ឆេទខ្មែរសុទ្ធ និងការធ្វើតេស្ត
  // ============================================================================
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
    if (Array.isArray(quizzes)) {
      quizzes.forEach((q) => {
        const c = q.course;
        const cid = c?.id || q.course_id;
        const cName = c?.course_name || q.course_name;
        const cCode = c?.course_code || q.course_code || '';
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
  }, [coursesList, quizzes]);

  const enrichedQuizzes = useMemo(() => {
    if (!Array.isArray(quizzes)) return [];
    const nowMs = Date.now();

    return quizzes.map((quiz) => {
      const cid = String(quiz?.course?.id || quiz?.course_id || '');
      const matchedCourse = availableCourses.find((c) => String(c.id) === cid);
      const resolvedAtt = resolveStudentAttempt(quiz);

      const isCompleted = Boolean(resolvedAtt && resolvedAtt.submitted_at);
      const hasActiveAttempt = Boolean(resolvedAtt && !resolvedAtt.submitted_at);
      const startMs = toComparableTimeMs(quiz.start_date, false);
      const endMs = toComparableTimeMs(quiz.end_date, true);

      const isUpcoming =
        !isCompleted && !hasActiveAttempt && !isNaN(startMs) && nowMs < startMs;
      const isExpired =
        !isCompleted && !hasActiveAttempt && !isNaN(endMs) && nowMs > endMs;
      const isAvailable =
        !isCompleted && (hasActiveAttempt || (!isUpcoming && !isExpired));

      let statusKey = 'available';
      if (isCompleted) statusKey = 'completed';
      else if (isUpcoming) statusKey = 'upcoming';
      else if (isExpired) statusKey = 'expired';

      return {
        ...quiz,
        course_id: cid || quiz.course_id,
        course: {
          ...(quiz.course || {}),
          id: cid || quiz.course?.id,
          course_name:
            quiz.course?.course_name ||
            quiz.course_name ||
            matchedCourse?.course_name ||
            t('មុខវិជ្ជាសិក្សា', 'Course'),
          course_code:
            quiz.course?.course_code ||
            quiz.course_code ||
            matchedCourse?.course_code ||
            '',
        },
        resolvedAttempt: resolvedAtt,
        isCompleted,
        hasActiveAttempt,
        isUpcoming,
        isExpired,
        isAvailable,
        statusKey,
      };
    });
  }, [quizzes, availableCourses, t]);

  const studentDeptName = useMemo(() => {
    const fromUser =
      user?.department?.department_name ||
      user?.department?.name ||
      user?.student?.department?.department_name ||
      user?.student?.department?.name;
    if (fromUser) return fromUser;

    const firstCourseDept =
      quizzes[0]?.course?.department?.department_name ||
      quizzes[0]?.course?.department?.name;
    return firstCourseDept || t('វិទ្យាសាស្ត្រកុំព្យូទ័រ', 'Computer Science');
  }, [user, quizzes, t]);

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

  // ✅ បម្លែងថ្ងៃខែ និងម៉ោងជាភាសាខ្មែរសុទ្ធ ១០០% ដោយមិនឱ្យលោតខុសម៉ោង UTC
  const formatDateTime = useCallback(
    (dateString, includeTime = false) => {
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

  useEffect(() => {
    if (activeQuizAttempt && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        if (!endTimeRef.current) return;
        const remaining = Math.max(
          0,
          Math.round((endTimeRef.current - Date.now()) / 1000)
        );
        setTimeLeft(remaining);
        if (remaining <= 0) {
          clearInterval(timerRef.current);
          handleQuizSubmit(null, true);
        }
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [activeQuizAttempt, timeLeft]);

  const handleStartAttempt = async (quiz) => {
    setLoadingQuizId(quiz.id);
    setIsAttemptExpanded(false);
    setSubmitError('');
    setUnansweredCountPrompt(0);
    setShowExitConfirmModal(false);
    try {
      const response = await api.get(`/student/quizzes/${quiz.id}`);
      const loadedQuiz = response.data?.quiz || quiz;
      setActiveQuizAttempt(loadedQuiz);
      setAttemptAnswers({});

      const rawTimeLeft = response.data?.time_left;
      const duration = loadedQuiz?.duration ?? quiz.duration;
      let secondsLeft = 30 * 60;

      if (rawTimeLeft !== undefined && rawTimeLeft !== null) {
        secondsLeft = parseInt(rawTimeLeft, 10);
      } else if (duration !== undefined && duration !== null) {
        secondsLeft = parseInt(duration, 10) * 60;
      }

      if (isNaN(secondsLeft) || secondsLeft < 0) {
        secondsLeft = 0;
      }

      setTimeLeft(secondsLeft);
      endTimeRef.current = Date.now() + secondsLeft * 1000;
    } catch (error) {
      console.error('Cannot start quiz:', error);
    } finally {
      setLoadingQuizId(null);
    }
  };

  const handleSelectOption = (questionId, optionId) => {
    if (unansweredCountPrompt > 0) setUnansweredCountPrompt(0);
    if (submitError) setSubmitError('');
    setAttemptAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
  };

  // ✅ មុខងារបញ្ជូនចម្លើយប្រឡង និងបង្កើតទិន្នន័យពិនិត្យសំណួរ (Review Items)
  const handleQuizSubmit = async (e, isAuto = false, forceSubmit = false) => {
    if (e) e.preventDefault();
    if (isSubmitting || !activeQuizAttempt) return;

    if (!isAuto && !forceSubmit && Array.isArray(activeQuizAttempt?.questions)) {
      const unanswered = activeQuizAttempt.questions.filter(
        (q) => !attemptAnswers[q.id]
      );
      if (unanswered.length > 0) {
        setUnansweredCountPrompt(unanswered.length);
        return;
      }
    }

    setUnansweredCountPrompt(0);
    setSubmitError('');
    setIsSubmitting(true);
    clearInterval(timerRef.current);
    endTimeRef.current = null;

    const formattedAnswers = Object.entries(attemptAnswers).map(
      ([qId, optId]) => ({
        question_id: Number(qId),
        selected_option: optId,
      })
    );

    const reviewItems = buildQuizReviewItems(
      activeQuizAttempt.questions || [],
      attemptAnswers
    );

    try {
      const response = await api.post(
        `/student/quizzes/${activeQuizAttempt.id}/submit`,
        {
          answers: formattedAnswers,
        }
      );

      const resData = response.data || {};
      const earnedScore = resData.score ?? resData.attempt?.score ?? 0;
      const totalMarks =
        resData.total_marks ?? activeQuizAttempt.total_mark ?? 20;

      const finalResultPayload = {
        ...resData,
        quizId: activeQuizAttempt.id,
        quizTitle: activeQuizAttempt.title,
        courseName: activeQuizAttempt.course?.course_name || '',
        courseCode: activeQuizAttempt.course?.course_code || '',
        score: earnedScore,
        total_marks: totalMarks,
        reviewItems,
      };

      setIsResultExpanded(false);
      setQuizResult(finalResultPayload);

      const reviewKey = `${currentStudentId}_${activeQuizAttempt.id}`;
      setSavedReviewsMap((prev) => {
        const nextMap = { ...prev, [reviewKey]: finalResultPayload };
        STUDENT_QUIZ_MEM_CACHE.reviews = nextMap;
        try {
          localStorage.setItem(
            getQuizReviewsCacheKey(currentStudentId),
            JSON.stringify(nextMap)
          );
        } catch (err) {}
        return nextMap;
      });

      const updatedAttemptObj = resData.attempt || {
        id: Date.now(),
        score: earnedScore,
        submitted_at: new Date().toISOString(),
      };

      setQuizzes((prev) => {
        const updated = prev.map((q) =>
          q.id === activeQuizAttempt.id ? { ...q, attempt: updatedAttemptObj } : q
        );
        STUDENT_QUIZ_MEM_CACHE.quizzes = updated;
        try {
          localStorage.setItem(
            getQuizzesCacheKey(currentStudentId),
            JSON.stringify(updated)
          );
          localStorage.setItem(
            CACHE_KEY_SHARED_QUIZZES,
            JSON.stringify(updated)
          );
          localStorage.removeItem(getScoresCacheKey(currentStudentId));
        } catch (err) {}
        return updated;
      });

      // ✅ បញ្ជូនសារជូនដំណឹងចូលតែក្នុងរូបកណ្ដឹងលើ Navbar (Clean URL '/quizzes')
      pushLocalNotification({
        titleKm: 'បានបញ្ចប់ការប្រឡងកម្រងសំណួរ',
        titleEn: 'Quiz Completed',
        descKm: `អ្នកទទួលបានពិន្ទុ ${formatCleanScore(earnedScore)} / ${formatCleanScore(totalMarks, 20)} លើកម្រងសំណួរ «${activeQuizAttempt.title}»។`,
        descEn: `You scored ${formatCleanScore(earnedScore)} / ${formatCleanScore(totalMarks, 20)} on "${activeQuizAttempt.title}".`,
        category: 'quiz',
        link: '/quizzes',
      });

      setActiveQuizAttempt(null);
      fetchQuizzes(true);
    } catch (error) {
      console.error('Failed to submit quiz:', error);
      const errMsg =
        error.response?.data?.message ||
        t(
          'មានបញ្ហាក្នុងការបញ្ជូនចម្លើយ សូមសាកល្បងម្ដងទៀត!',
          'Failed to submit quiz answers. Please try again!'
        );
      setSubmitError(String(errMsg));
    } finally {
      setIsSubmitting(false);
    }
  };

  // បើកមើលលទ្ធផល និងចម្លើយឡើងវិញសម្រាប់កម្រងសំណួរដែលបានធ្វើរួច
  const handleOpenSavedResult = (quiz) => {
    setIsResultExpanded(false);
    const reviewKey = `${currentStudentId}_${quiz.id}`;
    const saved = savedReviewsMap[reviewKey];
    const attempt = quiz.resolvedAttempt;
    const totalMarks = formatCleanScore(
      quiz.total_mark || quiz.total_marks || 20,
      20
    );
    const earnedScore = formatCleanScore(attempt?.score, 0);

    if (saved) {
      setQuizResult({
        ...saved,
        score: earnedScore,
        total_marks: totalMarks,
      });
    } else {
      setQuizResult({
        quizId: quiz.id,
        quizTitle: quiz.title,
        courseName: quiz.course?.course_name || '',
        courseCode: quiz.course?.course_code || '',
        score: earnedScore,
        total_marks: totalMarks,
        reviewItems: [],
      });
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  // ============================================================================
  // 📌 ផ្នែកទី៤៖ គណនាស្ថិតិកម្រងសំណួរ និងការច្រោះទិន្នន័យ
  // ============================================================================
  const quizStats = useMemo(() => {
    let total = enrichedQuizzes.length;
    let completed = 0;
    let available = 0;
    let upcoming = 0;
    let expired = 0;
    let percentSum = 0;

    enrichedQuizzes.forEach((q) => {
      if (q.isCompleted) {
        completed += 1;
        const maxM = Number(q.total_mark || q.total_marks || 20) || 20;
        const sc = Number(q.resolvedAttempt?.score || 0);
        percentSum += (sc / maxM) * 100;
      } else if (q.isAvailable) {
        available += 1;
      } else if (q.isUpcoming) {
        upcoming += 1;
      } else if (q.isExpired) {
        expired += 1;
      }
    });

    const avgScorePercent =
      completed > 0 ? Math.round((percentSum / completed) * 10) / 10 : 0;

    return {
      total,
      completed,
      available,
      upcoming,
      expired,
      avgScorePercent,
    };
  }, [enrichedQuizzes]);

  const filteredQuizzes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return enrichedQuizzes.filter((quiz) => {
      if (selectedCourse !== 'all') {
        const cid = quiz.course?.id || quiz.course_id;
        if (String(cid) !== String(selectedCourse)) return false;
      }

      if (statusFilter !== 'all' && quiz.statusKey !== statusFilter) {
        return false;
      }

      if (!q) return true;
      const titleMatch = (quiz.title || '').toLowerCase().includes(q);
      const descMatch = (quiz.description || '').toLowerCase().includes(q);
      const courseNameMatch = (quiz.course?.course_name || '')
        .toLowerCase()
        .includes(q);
      const courseCodeMatch = (quiz.course?.course_code || '')
        .toLowerCase()
        .includes(q);

      return titleMatch || descMatch || courseNameMatch || courseCodeMatch;
    });
  }, [enrichedQuizzes, selectedCourse, statusFilter, searchQuery]);

  const getActiveStatusTitle = () => {
    if (statusFilter === 'available') return t('អាចធ្វើតេស្តបាន', 'Available Quizzes');
    if (statusFilter === 'completed') return t('ធ្វើតេស្តរួចរាល់', 'Completed Quizzes');
    if (statusFilter === 'upcoming') return t('មិនទាន់បើកប្រឡង', 'Upcoming Quizzes');
    if (statusFilter === 'expired') return t('ហួសពេលកំណត់', 'Expired Quizzes');
    return t('គ្រប់កម្រងសំណួរ', 'All Assessments');
  };

  const statusSelectorItems = [
    {
      id: 'available',
      title: t('អាចធ្វើបាន', 'Available'),
      count: quizStats.available,
      icon: PencilSquareIcon,
      iconStyle:
        'bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
      activeGradient:
        'from-amber-500 to-orange-500 border-amber-500 shadow-amber-500/25',
    },
    {
      id: 'completed',
      title: t('ធ្វើរួចរាល់', 'Completed'),
      count: quizStats.completed,
      icon: CheckCircleIcon,
      iconStyle:
        'bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
      activeGradient:
        'from-emerald-600 to-teal-600 border-emerald-500 shadow-emerald-500/25',
    },
    {
      id: 'upcoming',
      title: t('មិនទាន់បើក', 'Upcoming'),
      count: quizStats.upcoming,
      icon: ClockIcon,
      iconStyle:
        'bg-indigo-100 text-indigo-600 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30',
      activeGradient:
        'from-indigo-600 to-blue-600 border-indigo-500 shadow-indigo-500/25',
    },
    {
      id: 'expired',
      title: t('ហួសកំណត់', 'Expired'),
      count: quizStats.expired,
      icon: ExclamationCircleIcon,
      iconStyle:
        'bg-rose-100 text-rose-600 border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30',
      activeGradient:
        'from-rose-600 to-pink-600 border-rose-500 shadow-rose-500/25',
    },
  ];

  const totalAttemptQuestions = activeQuizAttempt?.questions?.length || 0;
  const answeredCount = Object.keys(attemptAnswers).length;
  const progressPercent =
    totalAttemptQuestions > 0
      ? Math.round((answeredCount / totalAttemptQuestions) * 100)
      : 0;

  // ✅ គណនាចំនួនសំណួរក្នុងផ្ទាំងលទ្ធផល ដើម្បីកំណត់ទទឹង Modal ដោយស្វ័យប្រវត្តិ (Smart Adaptive Width)
  const resultQuestionCount = Array.isArray(quizResult?.reviewItems)
    ? quizResult.reviewItems.length
    : 0;
  const isManyResultQuestions = resultQuestionCount >= 5;
  const isManyAttemptQuestions = totalAttemptQuestions >= 5;

  return (
    <div className="std-qz-page max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 pb-28 lg:pb-12 mt-2 md:mt-0 animate-fadeIn">
      
      {/* ================================================================== */}
      {/* 📌 1. MODERN BENTO HERO SECTION                                    */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
        
        {/* ១.១. ប្រអប់ធំខាងឆ្វេង (8 Columns) */}
        <div className="lg:col-span-8 relative overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] bg-gradient-to-br from-blue-950 via-indigo-900 to-violet-950 p-6 sm:p-8 text-white shadow-xl border border-indigo-500/30 flex flex-col justify-between">
          <div className="std-qz-grid-pattern absolute inset-0 opacity-15 pointer-events-none"></div>
          <div className="absolute -top-24 -right-20 w-80 h-80 bg-blue-400/25 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-24 -left-20 w-72 h-72 bg-purple-500/25 rounded-full blur-3xl pointer-events-none"></div>

          <BuildingLibraryIcon className="absolute -right-6 -bottom-10 w-44 sm:w-60 h-44 sm:h-60 text-white/[0.04] -rotate-12 pointer-events-none" />

          <div className="relative z-10 space-y-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-cyan-400/15 border border-cyan-300/30 text-xs font-extrabold text-cyan-200">
                <AcademicCapIcon className="h-4 w-4 text-cyan-300 shrink-0" />
                <span>{studentDeptName}</span>
              </span>

              <span
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full backdrop-blur-md border text-xs font-extrabold ${
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

            <div className="space-y-2 pt-1">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight flex flex-wrap items-center gap-2.5 leading-snug">
                <span>{t('កម្រងសំណួរប្រឡង,', 'Quizzes,')}</span>
                <span className="bg-gradient-to-r from-yellow-300 via-amber-200 to-white bg-clip-text text-transparent">
                  {getActiveStatusTitle()}
                </span>
                <CheckBadgeIcon className="h-6 w-6 sm:h-7 sm:w-7 text-yellow-400 shrink-0" />
              </h1>

              <p className="text-xs sm:text-sm text-blue-100/80 max-w-2xl leading-relaxed font-medium">
                {t(
                  'ចូលរួមធ្វើតេស្ត កម្រងសំណួរវាយតម្លៃសមត្ថភាព និងពិនិត្យមើលលទ្ធផលពិន្ទុប្រឡងរបស់អ្នកតាមមុខវិជ្ជានីមួយៗ។',
                  'Take online quizzes, evaluate your learning mastery, and review your assessment scores across all courses.'
                )}
              </p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-3 sm:gap-4 mt-6 pt-5 border-t border-white/15">
            <div className="bg-white/[0.08] hover:bg-white/[0.12] backdrop-blur-md border border-white/15 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5 transition-all">
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-emerald-500/25 border border-emerald-300/30 flex items-center justify-center text-emerald-300 shrink-0">
                <CheckCircleIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl font-black text-white leading-none">
                  {quizStats.completed} / {quizStats.total}
                </span>
                <span className="block text-[11px] sm:text-xs font-bold text-blue-200/90 truncate mt-1">
                  {t('ធ្វើតេស្តរួចរាល់', 'Completed Quizzes')}
                </span>
              </div>
            </div>

            <div className="bg-white/[0.08] hover:bg-white/[0.12] backdrop-blur-md border border-white/15 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5 transition-all">
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-yellow-300 shrink-0">
                <ChartBarIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl font-black text-white leading-none">
                  {quizStats.completed > 0 ? `${quizStats.avgScorePercent}%` : '—'}
                </span>
                <span className="block text-[11px] sm:text-xs font-bold text-blue-200/90 truncate mt-1">
                  {t('ពិន្ទុមធ្យមភាគប្រឡងតេស្ត', 'Average Quiz Score')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ១.២. ប្រអប់ពណ៌សខាងស្ដាំ (4 Columns - សង្ខេបតេស្តតាមស្ថានភាពទាំង ៤) */}
        <div className="lg:col-span-4 std-qz-surface bg-white rounded-[1.75rem] sm:rounded-[2rem] p-5 sm:p-6 border border-gray-200/80 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/30 flex items-center justify-center shrink-0">
                  <AcademicCapIcon className="h-5 w-5 stroke-[2.2]" />
                </div>
                <div>
                  <h2 className="std-qz-text-primary text-base sm:text-lg font-extrabold text-gray-900 leading-tight">
                    {t('តាមដានតេស្តតាមស្ថានភាព', 'Filter by Status')}
                  </h2>
                  <p className="std-qz-text-secondary text-[11px] font-medium text-gray-500 mt-0.5">
                    {t('ចុចជ្រើសរើសស្ថានភាពដើម្បីច្រោះមើល', 'Select a status to filter quizzes')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
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
                    className={`group px-3 py-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-center justify-between gap-1.5 ${
                      isSelected
                        ? `bg-gradient-to-br ${item.activeGradient} text-white shadow-md -translate-y-0.5`
                        : 'std-qz-subbox bg-gray-50/80 hover:bg-indigo-50/50 border-gray-200/80 hover:border-indigo-300 text-gray-800 hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
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
                        className={`text-xs sm:text-[13px] font-black whitespace-nowrap ${
                          isSelected
                            ? 'text-white'
                            : 'std-qz-text-primary text-gray-900'
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

          <div className="std-qz-divider pt-4 mt-4 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="std-qz-text-secondary font-bold text-gray-500">
              {t('សរុប៖', 'Total:')}{' '}
              <strong className="std-qz-text-primary text-gray-800">
                {quizStats.total}
              </strong>{' '}
              • {t('អាចធ្វើបាន៖', 'Active:')}{' '}
              <strong className="text-amber-600 dark:text-amber-400">
                {quizStats.available}
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
                <SparklesIcon className="h-3.5 w-3.5" />
                <span>{t('បង្ហាញគ្រប់ស្ថានភាព', 'All Shown')}</span>
              </span>
            )}
          </div>
        </div>

      </div>

      {/* ================================================================== */}
      {/* 📌 2. SEARCH & COURSE FILTER BAR                                   */}
      {/* ================================================================== */}
      <div className="std-qz-surface bg-white rounded-2xl border border-gray-200/80 shadow-xs p-4 flex flex-col sm:flex-row gap-3.5 items-center justify-between">
        <div className="relative w-full sm:max-w-md flex-1">
          <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t(
              'ស្វែងរកតាមឈ្មោះសំណួរ ឬមុខវិជ្ជា...',
              'Search quizzes or course...'
            )}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="std-qz-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-gray-50/60 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {availableCourses.length > 0 && (
            <div className="relative w-full sm:w-72 shrink-0">
              <BookOpenIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedCourse}
                onChange={(e) => {
                  setSelectedCourse(e.target.value);
                  setPage(1);
                }}
                className="std-qz-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white font-medium text-gray-700 appearance-none cursor-pointer transition-all"
              >
                <option value="all">
                  {t('គ្រប់មុខវិជ្ជាទាំងអស់', 'All Courses')}
                </option>
                {availableCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.course_code
                      ? `${course.course_code.toUpperCase()} - `
                      : ''}
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
      {/* 📌 3. QUIZ CARDS GRID (គ្មាន Skeleton Loading)                      */}
      {/* ================================================================== */}
      {filteredQuizzes.length === 0 ? (
        <div className="std-qz-surface bg-white rounded-3xl border border-gray-200/80 shadow-xs p-14 text-center space-y-3">
          <PencilSquareIcon className="h-16 w-16 mx-auto text-indigo-300" />
          <h3 className="std-qz-text-primary text-lg font-extrabold text-gray-800">
            {searchQuery || selectedCourse !== 'all' || statusFilter !== 'all'
              ? t(
                  'មិនឃើញមានកម្រងសំណួរតាមការស្វែងរកនេះទេ',
                  'No matching quizzes found'
                )
              : t('មិនទាន់មានកម្រងសំណួរនៅឡើយទេ', 'No quizzes available yet')}
          </h3>
          <p className="std-qz-text-secondary text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
            {t(
              'សាកល្បងផ្លាស់ប្តូរតម្រងមុខវិជ្ជា ឬស្ថានភាពនៅប្រអប់ខាងលើ។',
              'Try changing the course or status filters above.'
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
          {filteredQuizzes.map((quiz) => {
            const attempt = quiz.resolvedAttempt;
            const totalMark = formatCleanScore(
              quiz.total_mark || quiz.total_marks || 20,
              20
            );
            const earnedScore = formatCleanScore(attempt?.score, 0);
            const isStartingThis = loadingQuizId === quiz.id;

            return (
              <div
                key={quiz.id}
                className="std-qz-card group bg-white border border-gray-200/80 hover:border-indigo-400 rounded-[1.75rem] p-6 shadow-2xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between h-full"
              >
                <div className="space-y-4">
                  {/* ផ្លាកកូដមុខវិជ្ជា និងស្ថានភាព */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="std-qz-code-pill text-xs font-extrabold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100 uppercase truncate max-w-[140px]">
                      {quiz.course?.course_code || 'COURSE'}
                    </span>

                    <span
                      className={`text-xs font-extrabold inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border shrink-0 ${
                        quiz.isCompleted
                          ? 'std-qz-badge-emerald bg-emerald-50 text-emerald-700 border-emerald-200'
                          : quiz.hasActiveAttempt
                          ? 'std-qz-badge-amber bg-amber-50 text-amber-700 border-amber-200'
                          : quiz.isExpired
                          ? 'std-qz-badge-rose bg-rose-50 text-rose-700 border-rose-200'
                          : quiz.isUpcoming
                          ? 'std-qz-code-pill bg-gray-100 text-gray-600 border-gray-200'
                          : 'std-qz-badge-amber bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {quiz.isCompleted ? (
                        <>
                          <CheckCircleIcon className="h-4 w-4" />
                          <span>{t('ធ្វើរួចរាល់', 'Completed')}</span>
                        </>
                      ) : quiz.hasActiveAttempt ? (
                        <>
                          <PencilSquareIcon className="h-4 w-4" />
                          <span>{t('កំពុងធ្វើ', 'In Progress')}</span>
                        </>
                      ) : quiz.isExpired ? (
                        <>
                          <XCircleIcon className="h-4 w-4" />
                          <span>{t('ហួសពេលកំណត់', 'Expired')}</span>
                        </>
                      ) : quiz.isUpcoming ? (
                        <>
                          <ClockIcon className="h-4 w-4" />
                          <span>{t('មិនទាន់បើក', 'Upcoming')}</span>
                        </>
                      ) : (
                        <>
                          <PencilSquareIcon className="h-4 w-4" />
                          <span>{t('អាចធ្វើបាន', 'Available')}</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* ចំណងជើងកម្រងសំណួរ និងឈ្មោះមុខវិជ្ជា */}
                  <div className="space-y-1.5">
                    <div className="std-qz-text-secondary text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 truncate">
                      <BookOpenIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{quiz.course?.course_name}</span>
                    </div>
                    <h3
                      className="std-qz-text-primary text-base sm:text-lg font-black text-gray-900 leading-snug line-clamp-2 min-h-[46px] group-hover:text-indigo-600 transition-colors"
                      title={quiz.title}
                    >
                      {quiz.title}
                    </h3>
                    {quiz.description && (
                      <p className="std-qz-text-secondary text-xs text-gray-500 line-clamp-2 leading-relaxed font-medium">
                        {quiz.description}
                      </p>
                    )}
                  </div>

                  {/* ប្រអប់ព័ត៌មានរយៈពេល ពិន្ទុ និងថ្ងៃខែ */}
                  <div className="std-qz-subbox bg-gray-50/80 border border-gray-100 rounded-2xl p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="std-qz-text-secondary font-semibold text-gray-500 flex items-center gap-1.5">
                        <ClockIcon className="h-4 w-4 text-amber-500" />
                        <span>{t('រយៈពេលប្រឡង៖', 'Duration:')}</span>
                      </span>
                      <span className="std-qz-text-primary font-extrabold text-gray-800">
                        {quiz.duration || 30} {t('នាទី', 'mins')} • {totalMark}{' '}
                        {t('ពិន្ទុ', 'pts')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="std-qz-text-secondary font-semibold text-gray-500 flex items-center gap-1.5">
                        <CalendarDaysIcon className="h-4 w-4 text-indigo-500" />
                        <span>{t('ចាប់ផ្តើម៖', 'Starts:')}</span>
                      </span>
                      <span className="std-qz-text-primary font-bold text-gray-700">
                        {formatDateTime(quiz.start_date, false)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="std-qz-text-secondary font-semibold text-gray-500 flex items-center gap-1.5">
                        <CalendarDaysIcon className="h-4 w-4 text-rose-500" />
                        <span>{t('ផុតកំណត់៖', 'Ends:')}</span>
                      </span>
                      <span className="std-qz-text-primary font-bold text-gray-700">
                        {formatDateTime(quiz.end_date, false)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ✅ ប៊ូតុងសកម្មភាពខាងក្រោមកាត */}
                <div className="std-qz-divider mt-5 pt-4 border-t border-gray-100">
                  {quiz.isCompleted ? (
                    <button
                      type="button"
                      onClick={() => handleOpenSavedResult(quiz)}
                      className="std-qz-badge-emerald w-full bg-emerald-50 hover:bg-emerald-100/90 border border-emerald-200 text-emerald-700 px-3.5 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-between gap-2 transition-all cursor-pointer shadow-2xs"
                      title={t(
                        'ចុចដើម្បីមើលលទ្ធផល និងចម្លើយ',
                        'Click to view result & answers'
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5 pl-0.5">
                        <EyeIcon className="h-4 w-4 stroke-[2.2] shrink-0" />
                        <span>{t('មើលលទ្ធផល', 'View Result')}</span>
                      </span>

                      <span className="std-qz-score-pill inline-flex items-baseline gap-1 px-3 py-1 rounded-lg bg-white/90 dark:bg-slate-900/75 border border-emerald-200/80 dark:border-emerald-500/30 shadow-2xs">
                        <span className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                          {earnedScore}
                        </span>
                        <span className="text-xs font-bold text-emerald-500/80">
                          /
                        </span>
                        <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                          {totalMark}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-600/85 dark:text-emerald-400/80 ml-0.5">
                          {t('ពិន្ទុ', 'pts')}
                        </span>
                      </span>
                    </button>
                  ) : quiz.isUpcoming ? (
                    <button
                      type="button"
                      disabled
                      className="std-qz-code-pill w-full bg-gray-100 border border-gray-200 text-gray-400 text-xs font-extrabold py-3 rounded-xl cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      <ClockIcon className="h-4 w-4" />
                      <span>{t('មិនទាន់ដល់ថ្ងៃបើកប្រឡង', 'Not Started Yet')}</span>
                    </button>
                  ) : quiz.isExpired && !quiz.hasActiveAttempt ? (
                    <button
                      type="button"
                      disabled
                      className="std-qz-badge-rose w-full bg-rose-50 border border-rose-200 text-rose-500 text-xs font-extrabold py-3 rounded-xl cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      <XCircleIcon className="h-4 w-4" />
                      <span>{t('ផុតកំណត់ពេលប្រឡងហើយ', 'Quiz Expired')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStartAttempt(quiz)}
                      disabled={Boolean(loadingQuizId)}
                      className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer"
                    >
                      {isStartingThis ? (
                        <>
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          <span>{t('កំពុងបើកសំណួរ...', 'Loading Quiz...')}</span>
                        </>
                      ) : (
                        <>
                          <PlayCircleIcon className="h-5 w-5 stroke-[2.2]" />
                          <span>
                            {quiz.hasActiveAttempt
                              ? t('បន្តការធ្វើតេស្ត', 'Resume Quiz')
                              : t('ចាប់ផ្តើមធ្វើតេស្ត', 'Start Quiz Now')}
                          </span>
                        </>
                      )}
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
        <div className="std-qz-surface bg-white rounded-2xl border border-gray-200/80 shadow-xs px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <p className="std-qz-text-secondary text-xs font-bold text-gray-600">
            {t('ទំព័រ', 'Page')} {meta.current_page} / {meta.last_page} (
            {meta.total} {t('កម្រងសំណួរ', 'quizzes')})
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={meta.current_page === 1}
              className="std-qz-code-pill px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
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
                  className={`px-3 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    meta.current_page === pageNum
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'std-qz-code-pill bg-white border border-gray-200 hover:bg-gray-50'
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
              className="std-qz-code-pill px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {t('បន្ទាប់', 'Next')}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 📌 5. INTERACTIVE QUIZ ATTEMPT STUDIO MODAL (Smart Adaptive Width) */}
      {/* ================================================================== */}
      {activeQuizAttempt &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`fixed inset-0 m-0 z-[9999] w-screen h-screen flex items-center justify-center bg-slate-950/80 backdrop-blur-md transition-all duration-300 ${
              isAttemptExpanded ? 'p-0 sm:p-2' : 'p-2 sm:p-4'
            }`}
          >
            <div
              className={`std-qz-surface bg-white shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-slate-700 transition-all duration-300 ${
                isAttemptExpanded
                  ? 'w-full h-full max-w-none max-h-none rounded-none sm:rounded-2xl'
                  : isManyAttemptQuestions
                  ? 'w-full max-w-4xl max-h-[90vh] rounded-[1.75rem]'
                  : 'w-full max-w-xl max-h-[88vh] rounded-[1.75rem]'
              }`}
            >
              <div className="px-5 sm:px-7 py-5 bg-gradient-to-r from-blue-950 via-indigo-900 to-violet-950 text-white shrink-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-yellow-300 bg-white/15 border border-white/20 px-2.5 py-0.5 rounded-md uppercase">
                        {activeQuizAttempt.course?.course_code || 'QUIZ'}
                      </span>
                      <span className="text-xs font-bold text-blue-200 truncate">
                        {activeQuizAttempt.course?.course_name}
                      </span>
                    </div>
                    <h2 className="text-base sm:text-xl font-extrabold text-white truncate mt-1">
                      {activeQuizAttempt.title}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs sm:text-sm font-extrabold shadow-inner shrink-0 ${
                        timeLeft < 60
                          ? 'bg-rose-500/30 border-rose-400 text-rose-200 animate-pulse'
                          : 'bg-white/10 border-white/20 text-white'
                      }`}
                    >
                      <ClockIcon className="h-5 w-5 text-yellow-400" />
                      <span className="hidden sm:inline">
                        {t('ម៉ោងនៅសល់៖', 'Time Left:')}
                      </span>
                      <span className="text-base sm:text-lg font-black text-yellow-300 tracking-wider">
                        {formatTime(timeLeft)}
                      </span>
                    </div>

                    {/* ✅ ប៊ូតុងពង្រីកពេញអេក្រង់ / បង្រួមវិញ */}
                    <button
                      type="button"
                      onClick={() => setIsAttemptExpanded((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold transition-colors cursor-pointer"
                      title={
                        isAttemptExpanded
                          ? t('បង្រួមផ្ទាំងវិញ', 'Restore Size')
                          : t('ពង្រីកពេញអេក្រង់', 'Expand Fullscreen')
                      }
                    >
                      {isAttemptExpanded ? (
                        <>
                          <ArrowsPointingInIcon className="h-4 w-4 stroke-[2.2]" />
                          <span className="hidden md:inline">
                            {t('បង្រួមវិញ', 'Collapse')}
                          </span>
                        </>
                      ) : (
                        <>
                          <ArrowsPointingOutIcon className="h-4 w-4 stroke-[2.2]" />
                          <span className="hidden md:inline">
                            {t('ពង្រីកធំ', 'Expand')}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-blue-200">
                    <span>
                      {t('សំណួរបានឆ្លើយ៖', 'Answered:')} {answeredCount} /{' '}
                      {totalAttemptQuestions}
                    </span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                {submitError && (
                  <div className="std-qz-badge-rose p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-600">
                    <ExclamationCircleIcon className="h-5 w-5 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold leading-relaxed">
                      {submitError}
                    </p>
                  </div>
                )}

                {unansweredCountPrompt > 0 && (
                  <div className="std-qz-badge-amber p-4 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-800 animate-fadeIn">
                    <div className="flex items-start gap-2.5">
                      <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs sm:text-sm font-extrabold leading-relaxed">
                        {t(
                          `អ្នកនៅសល់សំណួរចំនួន ${unansweredCountPrompt} ទៀតមិនទាន់ឆ្លើយ។ តើអ្នកពិតជាចង់បញ្ជូនចម្លើយឥឡូវនេះមែនទេ?`,
                          `You have ${unansweredCountPrompt} unanswered questions. Submit anyway?`
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => setUnansweredCountPrompt(0)}
                        className="px-3.5 py-1.5 rounded-xl bg-white text-gray-700 border border-gray-200 text-xs font-bold hover:bg-gray-50 cursor-pointer"
                      >
                        {t('ត្រឡប់ទៅឆ្លើយបន្ត', 'Keep Answering')}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleQuizSubmit(e, false, true)}
                        className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-xs cursor-pointer"
                      >
                        {t('បញ្ជូនឥឡូវនេះ', 'Submit Anyway')}
                      </button>
                    </div>
                  </div>
                )}

                {showExitConfirmModal && (
                  <div className="std-qz-badge-rose p-4 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-800 animate-fadeIn">
                    <div className="flex items-start gap-2.5">
                      <ExclamationTriangleIcon className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                      <p className="text-xs sm:text-sm font-extrabold leading-relaxed">
                        {t(
                          'តើអ្នកចង់ចាកចេញពីផ្ទាំងប្រឡងសិនមែនទេ? (ម៉ោងប្រឡងនឹងនៅតែបន្តរាប់)',
                          'Do you want to close the quiz window? (The timer will continue running)'
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => setShowExitConfirmModal(false)}
                        className="px-3.5 py-1.5 rounded-xl bg-white text-gray-700 border border-gray-200 text-xs font-bold hover:bg-gray-50 cursor-pointer"
                      >
                        {t('បន្តប្រឡង', 'Stay')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveQuizAttempt(null);
                          setAttemptAnswers({});
                          endTimeRef.current = null;
                          setIsAttemptExpanded(false);
                          setShowExitConfirmModal(false);
                        }}
                        className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-xs cursor-pointer"
                      >
                        {t('ចាកចេញ', 'Leave Quiz')}
                      </button>
                    </div>
                  </div>
                )}

                {Array.isArray(activeQuizAttempt.questions) &&
                activeQuizAttempt.questions.length > 0 ? (
                  <div
                    className={
                      isAttemptExpanded || isManyAttemptQuestions
                        ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 items-start'
                        : 'space-y-4'
                    }
                  >
                    {activeQuizAttempt.questions.map((q, idx) => {
                      const isAnswered = attemptAnswers[q.id] !== undefined;
                      return (
                        <div
                          key={q.id || idx}
                          className={`std-qz-subbox p-4 sm:p-5 rounded-2xl border transition-all ${
                            isAnswered
                              ? 'border-indigo-300 bg-indigo-50/20 dark:border-indigo-500/40'
                              : 'border-gray-200/80 bg-gray-50/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3.5">
                            <div className="flex items-start gap-2.5">
                              <span
                                className={`h-6 w-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                                  isAnswered
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-200'
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <h3 className="std-qz-text-primary text-sm sm:text-[15px] font-extrabold text-gray-900 leading-relaxed">
                                {q.question_text}
                              </h3>
                            </div>

                            {q.mark && (
                              <span className="std-qz-code-pill px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold bg-white text-indigo-600 border border-gray-200 shrink-0">
                                {q.mark} {t('ពិន្ទុ', 'pts')}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:pl-8">
                            {q.options?.map((opt) => {
                              const isSelected = attemptAnswers[q.id] === opt.id;
                              return (
                                <label
                                  key={opt.id}
                                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-bold cursor-pointer transition-all duration-150 select-none ${
                                    isSelected
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                      : 'std-qz-option bg-white border-gray-200/90 text-gray-700 hover:border-indigo-400'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`question-${q.id}`}
                                    checked={isSelected}
                                    onChange={() =>
                                      handleSelectOption(q.id, opt.id)
                                    }
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 shrink-0"
                                  />
                                  <span className="leading-snug">
                                    {opt.option_text}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400 font-bold text-sm">
                    {t(
                      'កម្រងសំណួរនេះមិនទាន់មានសំណួរនៅឡើយទេ។',
                      'No questions found in this quiz.'
                    )}
                  </div>
                )}
              </div>

              <div className="std-qz-modal-bar px-5 sm:px-7 py-4 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setShowExitConfirmModal(true)}
                  className="std-qz-code-pill bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 text-xs sm:text-sm font-extrabold px-5 py-2.5 rounded-xl transition cursor-pointer"
                >
                  {t('ចាកចេញសិន', 'Close')}
                </button>

                <button
                  type="button"
                  onClick={(e) => handleQuizSubmit(e)}
                  disabled={isSubmitting}
                  className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold px-6 py-2.5 rounded-xl shadow-md transition cursor-pointer flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      <span>{t('កំពុងផ្ញើចម្លើយ...', 'Submitting...')}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="h-5 w-5 stroke-[2.2]" />
                      <span>{t('បញ្ជូនចម្លើយប្រឡង', 'Submit Quiz')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ================================================================== */}
      {/* 📌 6. QUIZ RESULT & ANSWER REVIEW DIALOG (រៀបចំថ្មីស្អាត មិនជាន់គ្នា) */}
      {/* ================================================================== */}
      {quizResult &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`fixed inset-0 m-0 z-[9999] w-screen h-screen flex items-center justify-center bg-slate-950/80 backdrop-blur-md transition-all duration-300 ${
              isResultExpanded ? 'p-0 sm:p-2' : 'p-2 sm:p-4'
            }`}
            onClick={() => {
              setQuizResult(null);
              setIsResultExpanded(false);
            }}
          >
            <div
              className={`std-qz-surface bg-white shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-slate-700 transition-all duration-300 ${
                isResultExpanded
                  ? 'w-full h-full max-w-none max-h-none rounded-none sm:rounded-2xl'
                  : isManyResultQuestions
                  ? 'w-full max-w-3xl max-h-[90vh] rounded-[1.75rem]'
                  : 'w-full max-w-xl max-h-[88vh] rounded-[1.75rem]'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ✅ ក្បាលផ្ទាំងលទ្ធផល (រៀបជួរទន្ទឹមគ្នាស្អាត៖ ចំណងជើងខាងឆ្វេង | ពិន្ទុ + ប៊ូតុងពង្រីក + ប៊ូតុង X ខាងស្ដាំ ដោយមិនជាន់គ្នាដាច់ខាត) */}
              <div className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-indigo-900 to-violet-950 text-white px-5 py-4 sm:px-6 sm:py-5 shrink-0">
                <div className="std-qz-grid-pattern absolute inset-0 opacity-15 pointer-events-none"></div>

                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* ខាងឆ្វេង៖ រូបធីក + ចំណងជើងលទ្ធផល */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-400/20 border border-emerald-300/30 flex items-center justify-center shrink-0 shadow-lg">
                      <CheckBadgeIcon className="h-7 w-7 text-emerald-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase bg-emerald-400/20 text-emerald-200 border border-emerald-300/30">
                        {t('លទ្ធផលការប្រឡងតេស្ត', 'Quiz Assessment Result')}
                      </span>
                      <h2 className="text-base sm:text-lg font-black text-white truncate mt-0.5">
                        {t('បញ្ជូនចម្លើយប្រឡងជោគជ័យ!', 'Quiz Submitted Successfully!')}
                      </h2>
                      <p className="text-xs font-bold text-blue-200 truncate">
                        {quizResult.quizTitle}
                      </p>
                    </div>
                  </div>

                  {/* ខាងស្ដាំ៖ ប្រអប់ពិន្ទុទទួលបាន + ប៊ូតុងពង្រីក/បង្រួម + ប៊ូតុងខ្វែង X បិទ (រៀបជួរទន្ទឹមគ្នាស្អាត មិនជាន់គ្នា) */}
                  <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0 border-t border-white/10 sm:border-0">
                    {/* ប្រអប់ពិន្ទុទទួលបាន */}
                    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-3.5 py-2 text-center shadow-inner">
                      <span className="block text-[9px] font-extrabold uppercase tracking-wider text-blue-200 leading-none">
                        {t('ពិន្ទុទទួលបាន', 'Score Earned')}
                      </span>
                      <div className="flex items-baseline justify-center gap-1 mt-1 leading-none">
                        <span className="text-base sm:text-lg font-black text-yellow-300">
                          {formatCleanScore(quizResult.score)}
                        </span>
                        <span className="text-xs font-bold text-blue-200/80">/</span>
                        <span className="text-xs sm:text-sm font-extrabold text-white">
                          {formatCleanScore(quizResult.total_marks, 20)}
                        </span>
                        <span className="text-[10px] font-bold text-blue-200 ml-0.5">
                          {t('ពិន្ទុ', 'pts')}
                        </span>
                      </div>
                    </div>

                    {/* ប៊ូតុងពង្រីកធំ / បង្រួមវិញ និងប៊ូតុងបិទ X */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsResultExpanded((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold transition-colors cursor-pointer"
                        title={
                          isResultExpanded
                            ? t('បង្រួមផ្ទាំងវិញ', 'Restore Size')
                            : t('ពង្រីកពេញអេក្រង់', 'Expand Fullscreen')
                        }
                      >
                        {isResultExpanded ? (
                          <ArrowsPointingInIcon className="h-4 w-4 stroke-[2.2]" />
                        ) : (
                          <ArrowsPointingOutIcon className="h-4 w-4 stroke-[2.2]" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setQuizResult(null);
                          setIsResultExpanded(false);
                        }}
                        className="p-2.5 rounded-xl bg-white/10 hover:bg-rose-600 border border-white/15 hover:border-rose-500 text-white transition-colors cursor-pointer"
                        title={t('បិទ', 'Close')}
                      >
                        <XMarkIcon className="h-4 w-4 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ✅ តួផ្ទាំងពិនិត្យចម្លើយ */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-5 pt-4 pb-6 space-y-3.5">
                {Array.isArray(quizResult.reviewItems) &&
                quizResult.reviewItems.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                      <h3 className="std-qz-text-primary text-xs font-extrabold text-gray-800 flex items-center gap-1.5">
                        <PencilSquareIcon className="h-4 w-4 text-indigo-500" />
                        <span>
                          {t(
                            'ពិនិត្យមើលសំណួរ និងចម្លើយដែលអ្នកបានជ្រើសរើស',
                            'Review Your Selected Answers'
                          )}
                        </span>
                      </h3>
                      <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30">
                        {t('ឆ្លើយត្រូវ៖', 'Correct:')}{' '}
                        {quizResult.reviewItems.filter((i) => i.isCorrect).length} /{' '}
                        {quizResult.reviewItems.length}
                      </span>
                    </div>

                    <div
                      className={
                        isResultExpanded || isManyResultQuestions
                          ? 'grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start'
                          : 'space-y-3'
                      }
                    >
                      {quizResult.reviewItems.map((item) => {
                        const showWrongSideBySide =
                          !item.isCorrect && Boolean(item.correctOptionText);

                        return (
                          <div
                            key={item.questionId}
                            className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                              item.isCorrect
                                ? 'std-qz-review-correct bg-emerald-50/40 border-emerald-200/90'
                                : 'std-qz-review-wrong bg-rose-50/40 border-rose-200/90'
                            }`}
                          >
                            {/* ជួរទី១៖ លេខរៀងសំណួរ + អត្ថបទសំណួរ + ផ្លាកពិន្ទុ */}
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <span
                                  className={`h-6 w-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                                    item.isCorrect
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-rose-600 text-white'
                                  }`}
                                >
                                  {item.index}
                                </span>
                                <h4 className="std-qz-text-primary text-xs sm:text-sm font-extrabold text-gray-900 leading-snug pt-0.5">
                                  {item.questionText}
                                </h4>
                              </div>

                              <span
                                className={`px-2 py-0.5 rounded-lg text-[11px] font-extrabold border inline-flex items-center gap-1 shrink-0 ${
                                  item.isCorrect
                                    ? 'std-qz-badge-emerald bg-emerald-100/80 text-emerald-800 border-emerald-300'
                                    : 'std-qz-badge-rose bg-rose-100/80 text-rose-800 border-rose-300'
                                }`}
                              >
                                {item.isCorrect ? (
                                  <>
                                    <CheckCircleIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                                    <span>
                                      +{item.mark} / {item.mark}{' '}
                                      {t('ពិន្ទុ', 'pts')}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <XCircleIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                                    <span>
                                      0 / {item.mark} {t('ពិន្ទុ', 'pts')}
                                    </span>
                                  </>
                                )}
                              </span>
                            </div>

                            {/* ជួរទី២៖ ប្រអប់ចម្លើយ (បើឆ្លើយខុស ដាក់ទន្ទឹមគ្នា ឆ្វេង-ស្ដាំ ស្អាតហាប់ណែន) */}
                            <div
                              className={`mt-2.5 sm:pl-8 ${
                                showWrongSideBySide
                                  ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5'
                                  : ''
                              }`}
                            >
                              <div
                                className={`px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2.5 ${
                                  item.isCorrect
                                    ? 'std-qz-ans-box-correct bg-white border-emerald-300 text-emerald-900'
                                    : 'std-qz-ans-box-wrong bg-white border-rose-300 text-rose-900'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="radio"
                                    checked
                                    readOnly
                                    className={`h-3.5 w-3.5 shrink-0 ${
                                      item.isCorrect
                                        ? 'accent-emerald-600'
                                        : 'accent-rose-600'
                                    }`}
                                  />
                                  <div className="min-w-0">
                                    <span className="std-qz-text-secondary block text-[10px] font-extrabold text-gray-400 leading-tight">
                                      {t(
                                        'ចម្លើយដែលអ្នកបានធីក៖',
                                        'Your Selected Answer:'
                                      )}
                                    </span>
                                    <span className="std-qz-text-primary block text-xs sm:text-sm font-black mt-0.5 break-words">
                                      {item.isAnswered
                                        ? item.selectedOptionText
                                        : t(
                                            'មិនបានជ្រើសរើសចម្លើយ',
                                            'No option selected'
                                          )}
                                    </span>
                                  </div>
                                </div>

                                {item.isCorrect ? (
                                  <CheckCircleIcon className="h-5 w-5 text-emerald-500 shrink-0" />
                                ) : (
                                  <XCircleIcon className="h-5 w-5 text-rose-500 shrink-0" />
                                )}
                              </div>

                              {showWrongSideBySide && (
                                <div className="std-qz-correct-hint px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2.5">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <CheckBadgeIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    <div className="min-w-0">
                                      <span className="block text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 leading-tight">
                                        {t(
                                          'ចម្លើយដែលត្រឹមត្រូវគឺ៖',
                                          'Correct Answer:'
                                        )}
                                      </span>
                                      <span className="block text-xs sm:text-sm font-black text-emerald-900 dark:text-emerald-100 mt-0.5 break-words">
                                        {item.correctOptionText}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="std-qz-subbox bg-gray-50 border border-gray-200/80 p-6 rounded-2xl text-center space-y-2">
                    <p className="std-qz-text-primary text-sm font-extrabold text-gray-800">
                      {t(
                        'ចម្លើយរបស់អ្នកត្រូវបានកត់ត្រា និងដាក់ពិន្ទុរួចរាល់ហើយ។',
                        'Your answers have been recorded and graded.'
                      )}
                    </p>
                    <p className="std-qz-text-secondary text-xs text-gray-500">
                      {t('ពិន្ទុសរុបរបស់អ្នក៖', 'Your Total Score:')}{' '}
                      <strong className="text-indigo-600 dark:text-indigo-400">
                        {formatCleanScore(quizResult.score)} /{' '}
                        {formatCleanScore(quizResult.total_marks, 20)}{' '}
                        {t('ពិន្ទុ', 'pts')}
                      </strong>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ================================================================== */}
      {/* 📌 7. CSS សម្រាប់កំណត់ពណ៌ក្នុងទម្រង់យប់ (DARK MODE STYLING)            */}
      {/* ================================================================== */}
      <style>{`
        .std-qz-grid-pattern {
          background-image: radial-gradient(rgba(255, 255, 255, 0.25) 1px, transparent 1px);
          background-size: 20px 20px;
        }

        html.dark .std-qz-page {
          background-color: transparent !important;
        }
        html.dark .std-qz-surface,
        html.dark .std-qz-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .std-qz-card:hover {
          border-color: #6366f1 !important;
        }
        html.dark .std-qz-modal-bar,
        html.dark .std-qz-subbox {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .std-qz-option {
          background-color: #1e293b !important;
          border-color: #334155 !important;
          color: #e2e8f0 !important;
        }
        html.dark .std-qz-option:hover {
          border-color: #6366f1 !important;
        }
        html.dark .std-qz-review-correct {
          background-color: rgba(16, 185, 129, 0.07) !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .std-qz-review-wrong {
          background-color: rgba(244, 63, 94, 0.07) !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .std-qz-ans-box-correct {
          background-color: #0f172a !important;
          border-color: rgba(16, 185, 129, 0.45) !important;
        }
        html.dark .std-qz-ans-box-wrong {
          background-color: #0f172a !important;
          border-color: rgba(244, 63, 94, 0.45) !important;
        }
        html.dark .std-qz-correct-hint {
          background-color: rgba(16, 185, 129, 0.14) !important;
          border-color: rgba(16, 185, 129, 0.35) !important;
        }
        html.dark .std-qz-divider {
          border-color: #334155 !important;
        }
        html.dark .std-qz-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        html.dark .std-qz-input::placeholder {
          color: #64748b !important;
        }
        html.dark .std-qz-text-primary {
          color: #f8fafc !important;
        }
        html.dark .std-qz-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .std-qz-code-pill {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .std-qz-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .std-qz-badge-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .std-qz-badge-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
      `}</style>
    </div>
  );
};

export default StudentQuizzes;
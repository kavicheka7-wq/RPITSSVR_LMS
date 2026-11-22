// src/components/student/StudentDashboard.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  BookOpenIcon,
  AcademicCapIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  CalendarDaysIcon,
  ClockIcon,
  CheckCircleIcon,
  PlayCircleIcon,
  CheckBadgeIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  PencilSquareIcon,
  ExclamationCircleIcon,
  BuildingLibraryIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យល្បឿនលឿន (0ms Cache & Smart Staggered Prefetcher)
// ============================================================================
const LAST_ACTIVE_STUDENT_UID_KEY = 'lms_last_active_student_uid';

const CACHE_KEY_SHARED_ENROLLMENTS = 'cached_student_dashboard_enrollments_v15';
const CACHE_KEY_SHARED_COURSES = 'cached_student_courses_list_v15';
const CACHE_KEY_SHARED_ASSIGNMENTS = 'cached_student_assignments_list_v15';
const CACHE_KEY_SHARED_QUIZZES = 'cached_student_quizzes_list_v15';
const CACHE_KEY_SHARED_SCORES = 'cached_student_scores_list_v15';
const CACHE_KEY_SHARED_ATTENDANCE = 'cached_student_attendance_list_v15';
const CACHE_KEY_SHARED_LESSONS = 'cached_student_dept_lessons_v15';
const CACHE_KEY_SHARED_DEPT_COURSES = 'cached_student_dept_courses_all_years_v15';

const getStatsCacheKey = (uid) => `cached_student_dashboard_stats_v15_${uid}`;
const getEnrollmentsCacheKey = (uid) => `cached_student_dashboard_enrollments_v15_${uid}`;
const getCoursesCacheKey = (uid) => `cached_student_courses_list_v15_${uid}`;
const getAssignmentsCacheKey = (uid) => `cached_student_assignments_list_v15_${uid}`;
const getQuizzesCacheKey = (uid) => `cached_student_quizzes_list_v15_${uid}`;
const getScoresCacheKey = (uid) => `cached_student_scores_list_v15_${uid}`;
const getAttendanceCacheKey = (uid) => `cached_student_attendance_list_v15_${uid}`;
const getLessonsCacheKey = (uid) => `cached_student_dept_lessons_v15_${uid}`;
const getDeptCoursesCacheKey = (uid) => `cached_student_dept_courses_v15_${uid}`;
const getStudentYearCacheKey = (uid) => `cached_student_current_year_v15_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់សិស្សម្នាក់ៗ
const STUDENT_DASH_MEM_CACHE = {
  uid: null,
  stats: null,
  enrollments: null,
  assignments: null,
  quizzes: null,
  scores: null,
  lastSyncedAt: 0,
  prefetchedUid: null,
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
      localStorage.getItem(key) || sessionStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// ✅ កាត់តែ Base64 ធំៗ (> 25KB) ចេញមុន Save ចូល localStorage ការពារ QuotaExceededError (រក្សា URL ពី R2 ទុកដដែល)
const stripHeavyBase64FromCourses = (coursesArr) => {
  if (!Array.isArray(coursesArr)) return [];

  const cleanPerson = (p) => {
    if (!p || typeof p !== 'object') return p;
    const copy = { ...p };
    if (
      typeof copy.profile_image === 'string' &&
      copy.profile_image.startsWith('data:') &&
      copy.profile_image.length > 25000
    ) {
      delete copy.profile_image;
    }
    if (
      typeof copy.profile_image_url === 'string' &&
      copy.profile_image_url.startsWith('data:') &&
      copy.profile_image_url.length > 25000
    ) {
      delete copy.profile_image_url;
    }
    if (copy.user && typeof copy.user === 'object') {
      const uCopy = { ...copy.user };
      if (
        typeof uCopy.profile_image === 'string' &&
        uCopy.profile_image.startsWith('data:') &&
        uCopy.profile_image.length > 25000
      ) {
        delete uCopy.profile_image;
        delete uCopy.profile_image_url;
      }
      copy.user = uCopy;
    }
    return copy;
  };

  return coursesArr.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const copy = { ...item };
    if (copy.teacher) copy.teacher = cleanPerson(copy.teacher);
    if (copy.teacher_profile) copy.teacher_profile = cleanPerson(copy.teacher_profile);
    if (copy.course && typeof copy.course === 'object') {
      const cCopy = { ...copy.course };
      if (cCopy.teacher) cCopy.teacher = cleanPerson(cCopy.teacher);
      if (cCopy.teacher_profile) cCopy.teacher_profile = cleanPerson(cCopy.teacher_profile);
      copy.course = cCopy;
    }
    return copy;
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
      const sharedLocalKeys = [
        CACHE_KEY_SHARED_ENROLLMENTS,
        CACHE_KEY_SHARED_COURSES,
        CACHE_KEY_SHARED_ASSIGNMENTS,
        CACHE_KEY_SHARED_QUIZZES,
        CACHE_KEY_SHARED_SCORES,
        CACHE_KEY_SHARED_ATTENDANCE,
        CACHE_KEY_SHARED_LESSONS,
        CACHE_KEY_SHARED_DEPT_COURSES,
        'cached_student_teacher_avatars_v16',
        'cached_student_teacher_avatars_v15',
        'cached_student_teacher_avatars_v2',
      ];
      sharedLocalKeys.forEach((k) => {
        try {
          sessionStorage.removeItem(k);
          localStorage.removeItem(k);
        } catch {}
      });
    }
    localStorage.setItem(LAST_ACTIVE_STUDENT_UID_KEY, String(newUid));
  } catch (e) {}
};

const extractArrayFromRes = (resData) => {
  if (!resData) return [];
  if (Array.isArray(resData)) return resData;
  if (Array.isArray(resData.data)) return resData.data;
  if (resData.data && Array.isArray(resData.data.data)) return resData.data.data;
  if (Array.isArray(resData.courses)) return resData.courses;
  if (Array.isArray(resData.enrollments)) return resData.enrollments;
  if (Array.isArray(resData.assignments)) return resData.assignments;
  if (Array.isArray(resData.quizzes)) return resData.quizzes;
  if (Array.isArray(resData.attendance)) return resData.attendance;
  return [];
};

// ✅ ទាញទិន្នន័យកិច្ចការ, កម្រងសំណួរ និងពិន្ទុព្រមគ្នា ដើម្បីឱ្យរង្វង់មូលទឹក និងស្ថានភាពពិន្ទុលោតលឿនភ្លាមៗ
const syncDashboardTasksAndPrefetch = (
  uid,
  forceRefresh,
  onAssignmentsSynced,
  onQuizzesSynced,
  onCoursesSynced,
  onScoresSynced
) => {
  const effectiveUid = uid || 'default_student';

  // ១. ទាញកិច្ចការ កម្រងសំណួរ និងពិន្ទុព្រមគ្នាភ្លាមៗ
  Promise.allSettled([
    api.get('/student/assignments', { params: { per_page: 50 } }).then((res) => {
      if (res.data?.error_debug) return;
      const data = extractArrayFromRes(res.data);
      STUDENT_DASH_MEM_CACHE.assignments = data;
      if (typeof onAssignmentsSynced === 'function') onAssignmentsSynced(data);
      runWhenIdle(() => {
        try {
          const str = JSON.stringify(data);
          localStorage.setItem(getAssignmentsCacheKey(effectiveUid), str);
          localStorage.setItem(CACHE_KEY_SHARED_ASSIGNMENTS, str);
        } catch {}
      });
    }),
    api.get('/student/quizzes', { params: { per_page: 50 } }).then((res) => {
      if (res.data?.error_debug) return;
      const data = extractArrayFromRes(res.data);
      STUDENT_DASH_MEM_CACHE.quizzes = data;
      if (typeof onQuizzesSynced === 'function') onQuizzesSynced(data);
      runWhenIdle(() => {
        try {
          const str = JSON.stringify(data);
          localStorage.setItem(getQuizzesCacheKey(effectiveUid), str);
          localStorage.setItem(CACHE_KEY_SHARED_QUIZZES, str);
        } catch {}
      });
    }),
    api.get('/student/scores').then((res) => {
      if (res.data?.error_debug) return;
      const data = extractArrayFromRes(res.data);
      const slim = stripHeavyBase64FromCourses(data);
      STUDENT_DASH_MEM_CACHE.scores = slim;
      if (typeof onScoresSynced === 'function') onScoresSynced(slim);
      runWhenIdle(() => {
        try {
          const str = JSON.stringify(slim);
          localStorage.setItem(getScoresCacheKey(effectiveUid), str);
          localStorage.setItem(CACHE_KEY_SHARED_SCORES, str);
        } catch {}
      });
    }),
  ]);

  // ២. Background Prefetch សម្រាប់ទំព័រមេរៀន (ពន្យារពេល 2.5s ដើម្បីកុំឱ្យដណ្ដើម Network ពេលបើកទំព័រដំបូង)
  if (!forceRefresh && STUDENT_DASH_MEM_CACHE.prefetchedUid !== effectiveUid) {
    STUDENT_DASH_MEM_CACHE.prefetchedUid = effectiveUid;

    setTimeout(() => {
      runWhenIdle(() => {
        const existingLessons = readStorageJson(
          getLessonsCacheKey(effectiveUid),
          null
        );
        if (!Array.isArray(existingLessons) || existingLessons.length === 0) {
          api
            .get('/student/lessons')
            .then((res) => {
              if (res.data?.error_debug) return;
              const lessonsData = Array.isArray(res.data?.data)
                ? res.data.data
                : Array.isArray(res.data)
                ? res.data
                : [];
              const deptCoursesData = Array.isArray(res.data?.department_courses)
                ? res.data.department_courses
                : [];

              if (deptCoursesData.length > 0) {
                const slimDept = stripHeavyBase64FromCourses(deptCoursesData);
                if (typeof onCoursesSynced === 'function') {
                  onCoursesSynced(slimDept);
                }
                try {
                  const deptStr = JSON.stringify(slimDept);
                  localStorage.setItem(
                    getDeptCoursesCacheKey(effectiveUid),
                    deptStr
                  );
                  localStorage.setItem(CACHE_KEY_SHARED_DEPT_COURSES, deptStr);
                } catch {}
              }
              if (lessonsData.length > 0) {
                try {
                  const lsnStr = JSON.stringify(lessonsData);
                  localStorage.setItem(getLessonsCacheKey(effectiveUid), lsnStr);
                  localStorage.setItem(CACHE_KEY_SHARED_LESSONS, lsnStr);
                } catch {}
              }
              if (res.data?.student_current_year) {
                try {
                  localStorage.setItem(
                    getStudentYearCacheKey(effectiveUid),
                    String(res.data.student_current_year)
                  );
                } catch {}
              }
            })
            .catch(() => {});
        }
      });
    }, 2500);
  }
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

const COURSE_COVER_THEMES = [
  { iconGradient: 'from-amber-400 to-orange-500 text-slate-950' },
  { iconGradient: 'from-emerald-400 to-teal-500 text-slate-950' },
  { iconGradient: 'from-fuchsia-400 to-pink-500 text-white' },
  { iconGradient: 'from-sky-400 to-blue-500 text-white' },
];

const formatCleanScore = (val, fallback = 0) => {
  if (val === null || val === undefined || val === '') return fallback;
  const num = Number(val);
  return isNaN(num) ? val : Math.round(num * 100) / 100;
};

const toWeightedPoints = (rawPercent100, maxWeightPts) => {
  if (rawPercent100 === null || rawPercent100 === undefined || rawPercent100 === '') {
    return null;
  }
  const num = Number(rawPercent100);
  if (isNaN(num)) return null;
  const pts = (num * maxWeightPts) / 100;
  return Math.min(maxWeightPts, Math.max(0, Math.round(pts * 100) / 100));
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
  if (assign.student_submission && typeof assign.student_submission === 'object') {
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

const StudentDashboard = () => {
  const { t, language } = useLanguage();
  const { getFullName, user } = useAuth();
  const abortControllerRef = useRef(null);

  const currentStudentId = useMemo(() => {
    const uid = resolveStudentUid(user);
    ensureCleanStudentSessionCache(uid);
    return uid;
  }, [user]);

  if (
    STUDENT_DASH_MEM_CACHE.uid &&
    STUDENT_DASH_MEM_CACHE.uid !== currentStudentId
  ) {
    STUDENT_DASH_MEM_CACHE.stats = null;
    STUDENT_DASH_MEM_CACHE.enrollments = null;
    STUDENT_DASH_MEM_CACHE.assignments = null;
    STUDENT_DASH_MEM_CACHE.quizzes = null;
    STUDENT_DASH_MEM_CACHE.scores = null;
    STUDENT_DASH_MEM_CACHE.lastSyncedAt = 0;
    STUDENT_DASH_MEM_CACHE.prefetchedUid = null;
  }
  STUDENT_DASH_MEM_CACHE.uid = currentStudentId;

  const [stats, setStats] = useState(() => {
    if (STUDENT_DASH_MEM_CACHE.stats) return STUDENT_DASH_MEM_CACHE.stats;
    const cached = readStorageJson(getStatsCacheKey(currentStudentId), null);
    if (cached) STUDENT_DASH_MEM_CACHE.stats = cached;
    return cached || {};
  });

  const [enrollments, setEnrollments] = useState(() => {
    if (
      Array.isArray(STUDENT_DASH_MEM_CACHE.enrollments) &&
      STUDENT_DASH_MEM_CACHE.enrollments.length > 0
    ) {
      return STUDENT_DASH_MEM_CACHE.enrollments;
    }
    const cached =
      readStorageJson(getEnrollmentsCacheKey(currentStudentId), null) ||
      readStorageJson(getCoursesCacheKey(currentStudentId), null) ||
      readStorageJson(CACHE_KEY_SHARED_ENROLLMENTS, []);
    if (Array.isArray(cached) && cached.length > 0) {
      STUDENT_DASH_MEM_CACHE.enrollments = cached;
      return cached;
    }
    return [];
  });

  const [assignments, setAssignments] = useState(() => {
    if (
      Array.isArray(STUDENT_DASH_MEM_CACHE.assignments) &&
      STUDENT_DASH_MEM_CACHE.assignments.length > 0
    ) {
      return STUDENT_DASH_MEM_CACHE.assignments;
    }
    const cached =
      readStorageJson(getAssignmentsCacheKey(currentStudentId), null) ||
      readStorageJson(CACHE_KEY_SHARED_ASSIGNMENTS, []);
    if (Array.isArray(cached) && cached.length > 0) {
      STUDENT_DASH_MEM_CACHE.assignments = cached;
      return cached;
    }
    return [];
  });

  const [quizzes, setQuizzes] = useState(() => {
    if (
      Array.isArray(STUDENT_DASH_MEM_CACHE.quizzes) &&
      STUDENT_DASH_MEM_CACHE.quizzes.length > 0
    ) {
      return STUDENT_DASH_MEM_CACHE.quizzes;
    }
    const cached =
      readStorageJson(getQuizzesCacheKey(currentStudentId), null) ||
      readStorageJson(CACHE_KEY_SHARED_QUIZZES, []);
    if (Array.isArray(cached) && cached.length > 0) {
      STUDENT_DASH_MEM_CACHE.quizzes = cached;
      return cached;
    }
    return [];
  });

  const [scoresList, setScoresList] = useState(() => {
    if (
      Array.isArray(STUDENT_DASH_MEM_CACHE.scores) &&
      STUDENT_DASH_MEM_CACHE.scores.length > 0
    ) {
      return STUDENT_DASH_MEM_CACHE.scores;
    }
    const cached =
      readStorageJson(getScoresCacheKey(currentStudentId), null) ||
      readStorageJson(CACHE_KEY_SHARED_SCORES, []);
    if (Array.isArray(cached) && cached.length > 0) {
      STUDENT_DASH_MEM_CACHE.scores = cached;
      return cached;
    }
    return [];
  });

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return t('អរុណសួស្តី', 'Good Morning');
    if (hr < 17) return t('ទិវាសួស្តី', 'Good Afternoon');
    return t('សាយ័ណ្ហសួស្តី', 'Good Evening');
  };

  const getStudentDisplayName = () => {
    if (user?.first_name || user?.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    if (user?.student?.first_name || user?.student?.last_name) {
      return `${user.student.first_name || ''} ${user.student.last_name || ''}`.trim();
    }
    const fromHelper = typeof getFullName === 'function' ? getFullName() : '';
    return fromHelper || user?.name || t('និស្សិត', 'Student');
  };

  const studentDeptName = useMemo(() => {
    const firstCourse = enrollments[0]?.course || enrollments[0];
    return (
      user?.department?.department_name ||
      user?.department?.name ||
      user?.student?.department?.department_name ||
      user?.student?.department?.name ||
      firstCourse?.department?.department_name ||
      firstCourse?.department?.name ||
      t('វិទ្យាសាស្ត្រកុំព្យូទ័រ', 'Computer Science')
    );
  }, [user, enrollments, t]);

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

  const getStudentBatchYear = () => {
    return (
      user?.batch_year ||
      user?.student?.batch_year ||
      t('ឆ្នាំសិក្សា ២០២៥-២០២៦', 'Academic Year 2025-2026')
    );
  };

  const getTeacherDisplayName = useCallback(
    (courseInfo) => {
      if (!courseInfo) return t('គ្រូបង្រៀន', 'Instructor');
      const tch = courseInfo.teacher;
      const tchProfile = courseInfo.teacher_profile || courseInfo.teacherProfile;

      if (tch) {
        if (tch.full_name && tch.full_name !== 'គ្រូបង្រៀន') return tch.full_name;
        if (tch.first_name || tch.last_name) {
          return `${tch.first_name || ''} ${tch.last_name || ''}`.trim();
        }
        if (tch.user?.first_name || tch.user?.last_name) {
          return `${tch.user.first_name || ''} ${tch.user.last_name || ''}`.trim();
        }
        if (tch.name && tch.name !== 'គ្រូបង្រៀន') return tch.name;
        if (tch.user?.name) return tch.user.name;
      }

      if (tchProfile) {
        if (tchProfile.full_name && tchProfile.full_name !== 'គ្រូបង្រៀន') {
          return tchProfile.full_name;
        }
        if (tchProfile.first_name || tchProfile.last_name) {
          return `${tchProfile.first_name || ''} ${tchProfile.last_name || ''}`.trim();
        }
        if (tchProfile.name && tchProfile.name !== 'គ្រូបង្រៀន') {
          return tchProfile.name;
        }
      }

      return courseInfo.teacher_name || t('គ្រូបង្រៀន', 'Instructor');
    },
    [t]
  );

  const formatSafeDate = useCallback(
    (dateVal) => {
      if (!dateVal) return '—';
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return String(dateVal).split('T')[0];

      if (language === 'km') {
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
        const day = String(d.getDate()).padStart(2, '0');
        const month = khMonths[d.getMonth()];
        const year = d.getFullYear();
        return `${day} ${month} ${year}`;
      }

      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    },
    [language]
  );

  const enrichedEnrollments = useMemo(() => {
    if (!Array.isArray(enrollments)) return [];
    return enrollments.map((item, idx) => ({
      ...item,
      themeIndex: idx,
    }));
  }, [enrollments]);

  const teacherAssignedHomework = useMemo(() => {
    if (!Array.isArray(assignments)) return [];
    const now = new Date();
    const uniqueMap = new Map();

    assignments.forEach((assign) => {
      if (!assign || !assign.id) return;
      const sub = resolveStudentSubmission(assign);
      const isDone = Boolean(sub);
      const isGraded =
        isDone &&
        sub?.score !== null &&
        sub?.score !== undefined &&
        sub?.score !== '';
      const isOverdue =
        !isDone && assign.due_date && now > new Date(assign.due_date);

      uniqueMap.set(String(assign.id), {
        ...assign,
        resolvedSubmission: sub,
        isDone,
        isGraded,
        isOverdue,
      });
    });

    return Array.from(uniqueMap.values()).sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      return new Date(b.due_date || 0) - new Date(a.due_date || 0);
    });
  }, [assignments]);

  const teacherAssignedQuizzes = useMemo(() => {
    if (!Array.isArray(quizzes)) return [];
    const now = new Date();
    const uniqueMap = new Map();

    quizzes.forEach((quiz) => {
      if (!quiz || !quiz.id) return;
      const att = resolveStudentAttempt(quiz);
      const isDone = Boolean(
        att && (att.submitted_at || (att.score !== null && att.score !== undefined))
      );
      const isExpired =
        !isDone && quiz.end_date && now > new Date(quiz.end_date);

      uniqueMap.set(String(quiz.id), {
        ...quiz,
        resolvedAttempt: att,
        isDone,
        isExpired,
      });
    });

    return Array.from(uniqueMap.values()).sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      return new Date(b.start_date || 0) - new Date(a.start_date || 0);
    });
  }, [quizzes]);

  // ============================================================================
  // 📌 គណនាបូកពិន្ទុសរុបតាមផ្នែកដែលគ្រូបានដាក់ និងចុចរក្សាទុក
  // ============================================================================
  const scoreSummary = useMemo(() => {
    const assignByCourse = new Map();
    teacherAssignedHomework.forEach((a) => {
      if (a.isGraded && a.resolvedSubmission) {
        const cid = String(a.course_id || a.course?.id || 'default');
        const sc = Number(a.resolvedSubmission.score);
        const mx =
          Number(
            a.total_score ||
              a.total_marks ||
              a.marks ||
              a.total_mark ||
              a.max_score ||
              20
          ) || 20;
        if (!isNaN(sc) && mx > 0) {
          const cur = assignByCourse.get(cid) || { earned: 0, max: 0 };
          cur.earned += sc;
          cur.max += mx;
          assignByCourse.set(cid, cur);
        }
      }
    });

    const quizByCourse = new Map();
    teacherAssignedQuizzes.forEach((q) => {
      if (
        q.isDone &&
        q.resolvedAttempt?.score !== null &&
        q.resolvedAttempt?.score !== undefined &&
        q.resolvedAttempt?.score !== ''
      ) {
        const cid = String(q.course_id || q.course?.id || 'default');
        const sc = Number(q.resolvedAttempt.score);
        const mx = Number(q.total_mark || q.total_marks || 20) || 20;
        if (!isNaN(sc) && mx > 0) {
          const cur = quizByCourse.get(cid) || { earned: 0, max: 0 };
          cur.earned += sc;
          cur.max += mx;
          quizByCourse.set(cid, cur);
        }
      }
    });

    const courseIdsSet = new Set();
    if (Array.isArray(scoresList)) {
      scoresList.forEach((r) => {
        const cid = String(r?.course_id || r?.course?.id || '');
        if (cid) courseIdsSet.add(cid);
      });
    }
    assignByCourse.forEach((_, cid) => courseIdsSet.add(cid));
    quizByCourse.forEach((_, cid) => courseIdsSet.add(cid));

    const accumulatedCourses = [];
    let hasFullExamCount = 0;

    courseIdsSet.forEach((cid) => {
      const scoreRow = Array.isArray(scoresList)
        ? scoresList.find(
            (r) => String(r?.course_id || r?.course?.id || '') === cid
          )
        : null;

      const liveAssign = assignByCourse.get(cid);
      const liveAssign100 =
        liveAssign && liveAssign.max > 0
          ? (liveAssign.earned / liveAssign.max) * 100
          : null;

      const liveQuiz = quizByCourse.get(cid);
      const liveQuiz100 =
        liveQuiz && liveQuiz.max > 0
          ? (liveQuiz.earned / liveQuiz.max) * 100
          : null;

      const assignRaw100 =
        scoreRow?.assignment_score ??
        scoreRow?.auto_assignment_score ??
        liveAssign100;
      const quizRaw100 =
        scoreRow?.quiz_score ?? scoreRow?.auto_quiz_score ?? liveQuiz100;
      const midtermRaw100 = scoreRow?.midterm_score ?? null;
      const examRaw100 = scoreRow?.exam_score ?? null;

      const assignPts20 = toWeightedPoints(assignRaw100, 20);
      const quizPts20 = toWeightedPoints(quizRaw100, 20);
      const midtermPts25 = toWeightedPoints(midtermRaw100, 25);
      const examPts35 = toWeightedPoints(examRaw100, 35);

      const gradedParts = [
        assignPts20,
        quizPts20,
        midtermPts25,
        examPts35,
      ].filter((v) => v !== null);

      if (gradedParts.length > 0) {
        const totalPts =
          Math.round(gradedParts.reduce((a, b) => a + b, 0) * 100) / 100;
        accumulatedCourses.push(totalPts);
        if (midtermPts25 !== null && examPts35 !== null) {
          hasFullExamCount += 1;
        }
      } else if (
        scoreRow?.final_score !== null &&
        scoreRow?.final_score !== undefined &&
        scoreRow?.final_score !== ''
      ) {
        const fNum = Number(scoreRow.final_score);
        if (!isNaN(fNum)) {
          accumulatedCourses.push(Math.round(fNum * 100) / 100);
          hasFullExamCount += 1;
        }
      }
    });

    if (accumulatedCourses.length > 0) {
      const avgPts =
        Math.round(
          (accumulatedCourses.reduce((a, b) => a + b, 0) /
            accumulatedCourses.length) *
            10
        ) / 10;
      return {
        hasAnyGradedScore: true,
        isAllExamsComplete: hasFullExamCount === accumulatedCourses.length,
        totalPoints: Math.min(100, Math.max(0, avgPts)),
        percentInt: Math.min(100, Math.max(0, Math.round(avgPts))),
      };
    }

    const fallbackBackendAvg = Number(stats?.average_score || 0);
    if (fallbackBackendAvg > 0) {
      return {
        hasAnyGradedScore: true,
        isAllExamsComplete: false,
        totalPoints: Math.min(
          100,
          Math.max(0, Math.round(fallbackBackendAvg * 10) / 10)
        ),
        percentInt: Math.min(100, Math.max(0, Math.round(fallbackBackendAvg))),
      };
    }

    return {
      hasAnyGradedScore: false,
      isAllExamsComplete: false,
      totalPoints: 0,
      percentInt: 0,
    };
  }, [teacherAssignedHomework, teacherAssignedQuizzes, scoresList, stats]);

  const averageScoreNum = scoreSummary.percentInt;
  const exactTotalPoints = scoreSummary.totalPoints;

  const masteryInfo = useMemo(() => {
    if (!scoreSummary.hasAnyGradedScore) {
      return {
        label: t('និស្សិតកំពុងសិក្សា', 'Active Student'),
        statusText: t('រង់ចាំពិន្ទុ', 'Pending'),
        desc: t(
          'រង់ចាំគ្រូដាក់ពិន្ទុកិច្ចការ និងរក្សាទុកពិន្ទុ',
          'Waiting for instructor to grade & save scores'
        ),
        badgeClass:
          'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
        statusTextColor: 'text-indigo-600 dark:text-indigo-400',
        ringColor: '#6366f1',
        waveFrontColor: 'rgba(99, 102, 241, 0.72)',
        waveBackColor: 'rgba(129, 140, 248, 0.42)',
      };
    }

    if (exactTotalPoints >= 50) {
      return {
        label:
          exactTotalPoints >= 85
            ? t('និស្សិតឆ្នើម', 'Excellent')
            : t('និស្សិតសកម្ម', 'Good Standing'),
        statusText: `${t('ប្រឡងជាប់', 'Passed')} (${exactTotalPoints} ${t(
          'ពិន្ទុ',
          'pts'
        )})`,
        desc:
          exactTotalPoints >= 85
            ? t('លទ្ធផលសិក្សាល្អប្រសើរណាស់', 'Outstanding Performance')
            : t('កំពុងដំណើរការសិក្សាបានល្អ', 'Good Academic Progress'),
        badgeClass:
          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
        statusTextColor: 'text-emerald-600 dark:text-emerald-400',
        ringColor: '#10b981',
        waveFrontColor: 'rgba(16, 185, 129, 0.78)',
        waveBackColor: 'rgba(52, 211, 153, 0.45)',
      };
    }

    if (!scoreSummary.isAllExamsComplete) {
      return {
        label: t('កំពុងសន្សំពិន្ទុ', 'In Progress'),
        statusText: `${exactTotalPoints} / 100 ${t('ពិន្ទុ', 'pts')}`,
        desc: t(
          'ពិន្ទុបច្ចុប្បន្ន (រង់ចាំបូកបន្ថែមពិន្ទុប្រឡងពាក់កណ្ដាលឆមាស និងឆមាស)',
          'Current points (awaiting midterm & final exam scores)'
        ),
        badgeClass:
          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
        statusTextColor: 'text-blue-600 dark:text-blue-400',
        ringColor: '#3b82f6',
        waveFrontColor: 'rgba(59, 130, 246, 0.76)',
        waveBackColor: 'rgba(96, 165, 250, 0.45)',
      };
    }

    return {
      label: t('ត្រូវប្រឹងប្រែងបន្ថែម', 'Needs Improvement'),
      statusText: `${t('ប្រឡងធ្លាក់', 'Failed')} (${exactTotalPoints} ${t(
        'ពិន្ទុ',
        'pts'
      )})`,
      desc: t(
        'សូមព្យាយាមធ្វើកិច្ចការ និងសំណួរខ្លីបន្ថែម',
        'Keep practicing assignments & quizzes'
      ),
      badgeClass:
        'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
      statusTextColor: 'text-rose-600 dark:text-rose-400',
      ringColor: '#f43f5e',
      waveFrontColor: 'rgba(244, 63, 94, 0.78)',
      waveBackColor: 'rgba(251, 113, 133, 0.45)',
    };
  }, [scoreSummary, exactTotalPoints, t]);

  const doneHomeworkCount = useMemo(
    () => teacherAssignedHomework.filter((a) => a.isDone).length,
    [teacherAssignedHomework]
  );

  const pendingHomeworkCount = useMemo(
    () => Math.max(0, teacherAssignedHomework.length - doneHomeworkCount),
    [teacherAssignedHomework.length, doneHomeworkCount]
  );

  const doneQuizzesCount = useMemo(
    () => teacherAssignedQuizzes.filter((q) => q.isDone).length,
    [teacherAssignedQuizzes]
  );

  const pendingQuizzesCount = useMemo(
    () => Math.max(0, teacherAssignedQuizzes.length - doneQuizzesCount),
    [teacherAssignedQuizzes.length, doneQuizzesCount]
  );

  const spotlightSlides = useMemo(() => {
    const slides = [];

    if (Array.isArray(enrichedEnrollments) && enrichedEnrollments.length > 0) {
      enrichedEnrollments.forEach((item, idx) => {
        const courseInfo = item.course || item;
        const courseId = item.course_id || courseInfo.id || item.id;
        const theme = COURSE_COVER_THEMES[idx % COURSE_COVER_THEMES.length];
        const credit = Number(courseInfo.credit ?? item.credit ?? 3) || 3;

        slides.push({
          id: `course-${courseId || idx}`,
          badge: `${t('មុខវិជ្ជាសិក្សា', 'Course')} • ${credit} ${t('ក្រេឌីត', 'Cr')}`,
          badgeStyle: 'bg-yellow-400/20 text-yellow-300 border-yellow-300/30',
          meta: `${courseInfo.course_code || 'COURSE'} • ${getTeacherDisplayName(
            courseInfo
          )}`,
          title: courseInfo.course_name || t('មុខវិជ្ជាសិក្សា', 'Course'),
          statusPill: t('កំពុងសិក្សា', 'Enrolled'),
          icon: PlayCircleIcon,
          iconBoxStyle: theme.iconGradient,
          link: courseId ? `/lessons?course_id=${courseId}` : '/lessons',
        });
      });
    }

    const totalAsg =
      teacherAssignedHomework.length || stats?.total_assignments || 0;
    slides.push({
      id: 'slide-assignments',
      badge: t('កិច្ចការសិស្ស', 'Homework'),
      badgeStyle: 'bg-purple-400/20 text-purple-200 border-purple-300/30',
      meta: t('កិច្ចការអនុវត្តន៍ប្រចាំមុខវិជ្ជា', 'Course Practical Assignments'),
      title: t(
        'ពិនិត្យមើល និងប្រគល់កិច្ចការសិស្សឱ្យទាន់ពេលវេលា',
        'Check & submit your course assignments on time'
      ),
      statusPill: `${doneHomeworkCount}/${totalAsg} ${t('ធ្វើរួច', 'Done')}`,
      icon: ClipboardDocumentListIcon,
      iconBoxStyle: 'from-purple-400 to-indigo-500 text-white',
      link: '/assignments',
    });

    const totalQz = teacherAssignedQuizzes.length || stats?.total_quizzes || 0;
    slides.push({
      id: 'slide-quizzes',
      badge: t('កម្រងសំណួរប្រឡង', 'Quizzes'),
      badgeStyle: 'bg-emerald-400/20 text-emerald-200 border-emerald-300/30',
      meta: t('វាយតម្លៃសមត្ថភាពសិក្សា', 'Academic Skill Assessment'),
      title: t(
        'ធ្វើតេស្តសាកល្បងចំណេះដឹង ដើម្បីពង្រឹងសមត្ថភាពសិក្សា',
        'Take practice quizzes to test your knowledge'
      ),
      statusPill: `${doneQuizzesCount}/${totalQz} ${t('ធ្វើរួច', 'Done')}`,
      icon: AcademicCapIcon,
      iconBoxStyle: 'from-emerald-400 to-teal-500 text-slate-950',
      link: '/quizzes',
    });

    slides.push({
      id: 'slide-grades',
      badge: t('លទ្ធផលការសិក្សា', 'My Grades'),
      badgeStyle: 'bg-cyan-400/20 text-cyan-200 border-cyan-300/30',
      meta: t('តាមដានវឌ្ឍនភាពសិក្សាប្រចាំឆមាស', 'Track Semester Academic Progress'),
      title: t(
        '«TVET ជំនាញពិត ជីវិតប្រសើរ! រៀនឱ្យចប់ ឱ្យចេះ ឱ្យមានការងារ»',
        '“TVET Real Skills, Better Life! Study to Finish, to Know, to Get a Job”'
      ),
      statusPill: `${exactTotalPoints} / 100 ${t('ពិន្ទុ', 'pts')}`,
      icon: ChartBarIcon,
      iconBoxStyle: 'from-cyan-400 to-blue-500 text-slate-950',
      link: '/grades',
    });

    return slides;
  }, [
    enrichedEnrollments,
    stats,
    teacherAssignedHomework.length,
    teacherAssignedQuizzes.length,
    doneHomeworkCount,
    doneQuizzesCount,
    exactTotalPoints,
    getTeacherDisplayName,
    t,
  ]);

  useEffect(() => {
    if (spotlightSlides.length <= 1 || isCarouselPaused) return;
    const timer = setInterval(() => {
      setActiveSlideIndex((prev) => (prev + 1) % spotlightSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [spotlightSlides.length, isCarouselPaused]);

  useEffect(() => {
    if (activeSlideIndex >= spotlightSlides.length) {
      setActiveSlideIndex(0);
    }
  }, [spotlightSlides.length, activeSlideIndex]);

  const currentSlide = spotlightSlides[activeSlideIndex] || spotlightSlides[0];

  const handlePrevSlide = () => {
    setActiveSlideIndex(
      (prev) => (prev - 1 + spotlightSlides.length) % spotlightSlides.length
    );
  };

  const handleNextSlide = () => {
    setActiveSlideIndex((prev) => (prev + 1) % spotlightSlides.length);
  };

  // ============================================================================
  // 📌 ផ្នែកទី៥៖ ទាញយក /student/dashboard និង Tasks/Scores ព្រមគ្នា ដើម្បីលោតពិន្ទុលឿនភ្លាមៗ
  // ============================================================================
  const fetchDashboardData = useCallback(
    async (forceRefresh = false) => {
      const now = Date.now();
      const cachedSt =
        STUDENT_DASH_MEM_CACHE.stats ||
        readStorageJson(getStatsCacheKey(currentStudentId), null);
      const cachedEnr =
        STUDENT_DASH_MEM_CACHE.enrollments ||
        readStorageJson(getEnrollmentsCacheKey(currentStudentId), null);
      const cachedAsg =
        STUDENT_DASH_MEM_CACHE.assignments ||
        readStorageJson(getAssignmentsCacheKey(currentStudentId), null);
      const cachedQz =
        STUDENT_DASH_MEM_CACHE.quizzes ||
        readStorageJson(getQuizzesCacheKey(currentStudentId), null);

      if (!forceRefresh) {
        if (cachedSt && Object.keys(cachedSt).length > 0) {
          setStats(cachedSt);
        }
        if (Array.isArray(cachedEnr) && cachedEnr.length > 0) {
          setEnrollments(cachedEnr);
        }
        if (Array.isArray(cachedAsg) && cachedAsg.length > 0) {
          setAssignments(cachedAsg);
        }
        if (Array.isArray(cachedQz) && cachedQz.length > 0) {
          setQuizzes(cachedQz);
        }
      }

      if (
        !forceRefresh &&
        STUDENT_DASH_MEM_CACHE.uid === currentStudentId &&
        cachedSt &&
        Number(cachedSt.total_courses) > 0 &&
        Array.isArray(cachedEnr) &&
        cachedEnr.length > 0 &&
        now - STUDENT_DASH_MEM_CACHE.lastSyncedAt < 25000
      ) {
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // ✅ ទាញ Assignments / Quizzes / Scores ព្រមគ្នាជាមួយ Dashboard (លែងរង់ចាំតង់ច្រើន)
        syncDashboardTasksAndPrefetch(
          currentStudentId,
          forceRefresh,
          (asgData) => setAssignments(asgData),
          (qzData) => setQuizzes(qzData),
          (crsData) => setEnrollments((prev) => (prev.length === 0 ? crsData : prev)),
          (scrData) => setScoresList(scrData)
        );

        const dashRes = await api.get('/student/dashboard', {
          signal: controller.signal,
        });
        const resData = dashRes?.data?.data || dashRes?.data || {};

        if (!resData?.error_debug) {
          const newStats = resData?.stats || {
            total_courses: 0,
            average_score: 0,
            total_assignments: 0,
            total_quizzes: 0,
          };

          const rawCourses =
            resData?.enrollments ||
            resData?.active_courses ||
            resData?.courses ||
            resData?.recent_courses ||
            [];
          const validEnrollments = Array.isArray(rawCourses) ? rawCourses : [];

          setStats(newStats);
          if (
            validEnrollments.length > 0 ||
            !STUDENT_DASH_MEM_CACHE.enrollments?.length
          ) {
            setEnrollments(validEnrollments);
            STUDENT_DASH_MEM_CACHE.enrollments = validEnrollments;
          }

          STUDENT_DASH_MEM_CACHE.uid = currentStudentId;
          STUDENT_DASH_MEM_CACHE.stats = newStats;
          STUDENT_DASH_MEM_CACHE.lastSyncedAt = Date.now();

          if (
            (!STUDENT_DASH_MEM_CACHE.assignments ||
              STUDENT_DASH_MEM_CACHE.assignments.length === 0) &&
            Array.isArray(resData?.recent_activity?.submissions) &&
            resData.recent_activity.submissions.length > 0
          ) {
            const fallbackAsg = resData.recent_activity.submissions.map((sub) => ({
              ...(sub.assignment || {}),
              id: sub.assignment_id || sub.assignment?.id || sub.id,
              title: sub.assignment?.title || 'កិច្ចការសិស្ស',
              due_date: sub.assignment?.due_date || sub.submitted_at,
              total_score: sub.assignment?.total_score ?? 20,
              submission: sub,
            }));
            setAssignments((prev) => (prev.length === 0 ? fallbackAsg : prev));
          }

          if (
            (!STUDENT_DASH_MEM_CACHE.quizzes ||
              STUDENT_DASH_MEM_CACHE.quizzes.length === 0) &&
            Array.isArray(resData?.recent_activity?.quiz_attempts) &&
            resData.recent_activity.quiz_attempts.length > 0
          ) {
            const fallbackQz = resData.recent_activity.quiz_attempts.map((att) => ({
              ...(att.quiz || {}),
              id: att.quiz_id || att.quiz?.id || att.id,
              title: att.quiz?.title || 'កម្រងសំណួរប្រឡង',
              end_date: att.quiz?.end_date || att.submitted_at,
              total_mark: att.quiz?.total_mark ?? 20,
              attempt: att,
            }));
            setQuizzes((prev) => (prev.length === 0 ? fallbackQz : prev));
          }

          runWhenIdle(() => {
            const slimEnrollments = stripHeavyBase64FromCourses(validEnrollments);
            try {
              localStorage.setItem(
                getStatsCacheKey(currentStudentId),
                JSON.stringify(newStats)
              );
              if (slimEnrollments.length > 0) {
                localStorage.setItem(
                  getEnrollmentsCacheKey(currentStudentId),
                  JSON.stringify(slimEnrollments)
                );
                localStorage.setItem(
                  CACHE_KEY_SHARED_ENROLLMENTS,
                  JSON.stringify(slimEnrollments)
                );
              }
            } catch (e) {}
          });
        }
      } catch (error) {
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
          return;
        }
        console.error('Error fetching student dashboard data:', error);
      }
    },
    [currentStudentId]
  );

  useEffect(() => {
    fetchDashboardData(false);

    const handleVisibilityOrFocus = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - STUDENT_DASH_MEM_CACHE.lastSyncedAt > 5000
      ) {
        fetchDashboardData(true);
      }
    };

    const syncInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData(true);
      }
    }, 30000);

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
  }, [fetchDashboardData]);

  const ringRadius = 46;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference - (averageScoreNum / 100) * ringCircumference;

  const totalHomeworkCount =
    teacherAssignedHomework.length || stats?.total_assignments || 0;
  const totalQuizzesCount =
    teacherAssignedQuizzes.length || stats?.total_quizzes || 0;
  const totalActivitiesCount = totalHomeworkCount + totalQuizzesCount;
  const totalCompletedActivities = doneHomeworkCount + doneQuizzesCount;
  const activityCompletionPercent =
    totalActivitiesCount > 0
      ? Math.round((totalCompletedActivities / totalActivitiesCount) * 100)
      : 0;

  const liquidLevelPercent = averageScoreNum;
  const isLiquidDarkText = liquidLevelPercent < 55;

  const statCards = [
    {
      title: t('មុខវិជ្ជាកំពុងរៀន', 'Enrolled Courses'),
      value: stats?.total_courses || enrollments.length || 0,
      icon: BookOpenIcon,
      link: '/courses',
      cardStyle:
        'from-blue-500/10 via-indigo-500/5 to-transparent border-blue-200/70 hover:border-blue-300',
      iconBox:
        'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-blue-500/25',
    },
    {
      title: t('ពិន្ទុមធ្យមភាគ', 'Average Score'),
      value: `${averageScoreNum}%`,
      icon: ChartBarIcon,
      link: '/grades',
      cardStyle:
        'from-emerald-500/10 via-teal-500/5 to-transparent border-emerald-200/70 hover:border-emerald-300',
      iconBox:
        'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/25',
    },
    {
      title: t('កិច្ចការសិស្ស', 'Assignments'),
      value: totalHomeworkCount,
      icon: ClipboardDocumentListIcon,
      link: '/assignments',
      cardStyle:
        'from-purple-500/10 via-fuchsia-500/5 to-transparent border-purple-200/70 hover:border-purple-300',
      iconBox:
        'bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-purple-500/25',
    },
    {
      title: t('កម្រងសំណួរប្រឡង', 'Quizzes'),
      value: totalQuizzesCount,
      icon: AcademicCapIcon,
      link: '/quizzes',
      cardStyle:
        'from-amber-500/10 via-orange-500/5 to-transparent border-amber-200/70 hover:border-amber-300',
      iconBox:
        'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-amber-500/25',
    },
  ];

  const SlideIcon = currentSlide?.icon || PlayCircleIcon;

  return (
    <div className="std-bento-page max-w-7xl mx-auto px-3 sm:px-5 lg:px-8 space-y-5 sm:space-y-6 lg:space-y-8 pb-28 md:pb-12 mt-2 md:mt-0 animate-fadeIn select-none">
      
      {/* ================================================================== */}
      {/* 📌 1. MODERN BENTO HERO SECTION (Adaptive Phone / iPad / Desktop)  */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 lg:gap-6 items-stretch">
        
        {/* ១.១. ផ្ទាំងស្វាគមន៍សិស្សបែបឌីជីថល និងប្រអប់រំកិលស្វ័យប្រវត្តិ */}
        <div className="lg:col-span-7 xl:col-span-8 relative overflow-hidden rounded-2xl sm:rounded-[1.75rem] lg:rounded-[2rem] bg-gradient-to-br from-blue-950 via-indigo-900 to-violet-950 p-5 sm:p-7 lg:p-8 text-white shadow-xl border border-indigo-500/30 flex flex-col justify-between">
          <div className="std-hero-grid-pattern absolute inset-0 opacity-15 pointer-events-none"></div>
          {/* ✅ លាក់ Blur ធំៗលើទូរស័ព្ទដើម្បីកុំឱ្យធ្លាក់ FPS ពេលអូស */}
          <div className="hidden md:block absolute -top-24 -right-20 w-80 h-80 bg-blue-400/25 rounded-full blur-3xl pointer-events-none"></div>
          <div className="hidden md:block absolute -bottom-24 -left-20 w-72 h-72 bg-purple-500/25 rounded-full blur-3xl pointer-events-none"></div>

          <BuildingLibraryIcon className="absolute -right-6 -bottom-10 w-44 sm:w-60 h-44 sm:h-60 text-white/[0.04] -rotate-12 pointer-events-none" />

          <div className="relative z-10 space-y-3 sm:space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-cyan-400/15 border border-cyan-300/30 text-[11px] sm:text-xs font-extrabold text-cyan-200 max-w-full">
                  <AcademicCapIcon className="h-4 w-4 text-cyan-300 shrink-0" />
                  <span className="truncate">{studentDeptName}</span>
                </span>

                <span
                  className={`inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full border text-[11px] sm:text-xs font-extrabold ${
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

              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-bold text-blue-100">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                <span>{getGreeting()}</span>
                <span className="text-white/40">•</span>
                <span className="text-yellow-300">{getStudentBatchYear()}</span>
              </span>
            </div>

            <div className="space-y-1.5 sm:space-y-2 pt-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl xl:text-4xl font-extrabold text-white tracking-tight flex flex-wrap items-center gap-2 leading-snug">
                <span>{t('សូមស្វាគមន៍,', 'Welcome back,')}</span>
                <span className="bg-gradient-to-r from-yellow-300 via-amber-200 to-white bg-clip-text text-transparent">
                  {getStudentDisplayName()}
                </span>
                <CheckBadgeIcon className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-yellow-400 shrink-0" />
              </h1>

              <p className="text-xs sm:text-sm text-blue-100/80 max-w-xl leading-relaxed font-medium">
                {t(
                  'ថ្ងៃនេះជាថ្ងៃដ៏ល្អសម្រាប់ការពង្រឹងចំណេះដឹង និងជំនាញរបស់អ្នក។ ចូលមើលមេរៀន និងបំពេញកិច្ចការសិក្សារបស់អ្នកដោយរីករាយ។',
                  'Today is a great day to sharpen your technical skills. Dive into your lessons and stay ahead of your goals.'
                )}
              </p>
            </div>
          </div>

          <div
            className="relative z-10 mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-white/15"
            onMouseEnter={() => setIsCarouselPaused(true)}
            onMouseLeave={() => setIsCarouselPaused(false)}
          >
            {currentSlide && (
              <div className="space-y-2.5">
                <Link
                  to={currentSlide.link || '/courses'}
                  className="block relative overflow-hidden bg-white/15 md:bg-white/10 hover:bg-white/[0.16] md:backdrop-blur-md border border-white/20 rounded-2xl p-3.5 sm:p-4 transition-colors duration-200"
                >
                  <div
                    key={currentSlide.id}
                    className="std-carousel-slide flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                  >
                    <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                      <div
                        className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br ${currentSlide.iconBoxStyle} flex items-center justify-center shrink-0 shadow-md`}
                      >
                        <SlideIcon className="h-5 w-5 sm:h-7 sm:w-7 stroke-[2]" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span
                            className={`text-[10px] font-extrabold uppercase tracking-wider px-2 sm:px-2.5 py-0.5 rounded border ${currentSlide.badgeStyle}`}
                          >
                            {currentSlide.badge}
                          </span>
                          <span className="text-[11px] sm:text-xs font-bold text-blue-200 truncate">
                            {currentSlide.meta}
                          </span>
                        </div>
                        <h3 className="text-xs sm:text-base font-extrabold text-white line-clamp-1 mt-1">
                          {currentSlide.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-slate-900/80 text-cyan-200 border border-white/15 font-extrabold text-xs shadow-sm">
                        <SparklesIcon className="h-4 w-4 text-yellow-300 shrink-0" />
                        <span>{currentSlide.statusPill}</span>
                      </span>
                    </div>
                  </div>
                </Link>

                {spotlightSlides.length > 1 && (
                  <div className="flex items-center justify-between px-1 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      {spotlightSlides.map((s, idx) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setActiveSlideIndex(idx)}
                          className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                            idx === activeSlideIndex
                              ? 'w-6 bg-yellow-400'
                              : 'w-1.5 bg-white/30 hover:bg-white/60'
                          }`}
                          title={s.title}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-200/80">
                      <span>
                        {activeSlideIndex + 1} / {spotlightSlides.length}
                      </span>
                      <button
                        type="button"
                        onClick={handlePrevSlide}
                        className="p-1.5 sm:p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                        title={t('មុន', 'Previous')}
                      >
                        <ChevronLeftIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                      </button>
                      <button
                        type="button"
                        onClick={handleNextSlide}
                        className="p-1.5 sm:p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                        title={t('បន្ទាប់', 'Next')}
                      >
                        <ChevronRightIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ១.២. កាតលទ្ធផលការសិក្សារួម + កងមូលមានទឹករលក */}
        <div className="lg:col-span-5 xl:col-span-4 std-surface-card bg-white rounded-2xl sm:rounded-[1.75rem] lg:rounded-[2rem] p-5 sm:p-6 border border-gray-200/80 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="std-text-primary text-base sm:text-lg font-extrabold text-gray-900 mt-0.5">
                {t('លទ្ធផលការសិក្សារួម', 'Academic Standing')}
              </h2>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-[11px] sm:text-xs font-extrabold border shrink-0 ${masteryInfo.badgeClass}`}
            >
              {masteryInfo.label}
            </span>
          </div>

          <div className="my-4 sm:my-5 flex items-center justify-center gap-4 sm:gap-5">
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center shrink-0">
              <div className="std-liquid-inner absolute inset-[8px] sm:inset-[9px] rounded-full overflow-hidden bg-slate-100/90 dark:bg-slate-900/90 z-0 shadow-inner">
                {liquidLevelPercent > 0 && (
                  <div
                    className="absolute bottom-0 left-0 right-0 transition-all duration-700 ease-out"
                    style={{ height: `${liquidLevelPercent}%` }}
                  >
                    <div
                      className="std-liquid-wave-back absolute left-1/2 w-[220%] pb-[220%] rounded-[43%]"
                      style={{ backgroundColor: masteryInfo.waveBackColor }}
                    />
                    <div
                      className="std-liquid-wave-front absolute left-1/2 w-[220%] pb-[220%] rounded-[40%]"
                      style={{ backgroundColor: masteryInfo.waveFrontColor }}
                    />
                  </div>
                )}
              </div>

              <svg
                className="relative z-10 w-full h-full -rotate-90 transform pointer-events-none"
                viewBox="0 0 108 108"
              >
                <circle
                  cx="54"
                  cy="54"
                  r={ringRadius}
                  className="std-ring-track"
                  stroke="#e2e8f0"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="54"
                  cy="54"
                  r={ringRadius}
                  stroke={masteryInfo.ringColor}
                  strokeWidth="8"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-700 ease-out"
                />
              </svg>

              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <span
                  className={`text-xl sm:text-2xl font-black tracking-tight transition-colors duration-300 ${
                    isLiquidDarkText
                      ? 'std-text-primary text-slate-900'
                      : 'text-white drop-shadow-xs'
                  }`}
                >
                  {averageScoreNum}%
                </span>
              </div>
            </div>

            <div className="space-y-2 min-w-0 flex-1">
              <div className="std-subbox bg-gray-50 border border-gray-100 rounded-2xl px-3 sm:px-3.5 py-2 sm:py-2.5">
                <span className="std-text-secondary block text-[10px] font-bold uppercase text-gray-400">
                  {t('ស្ថានភាពលទ្ធផល', 'Result Status')}
                </span>
                <span
                  className={`block text-sm sm:text-base xl:text-lg font-black mt-0.5 truncate ${masteryInfo.statusTextColor}`}
                >
                  {masteryInfo.statusText}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] font-extrabold px-1">
                <span className="std-text-secondary text-gray-500">
                  {t('ការងារធ្វើរួច៖', 'Completed:')}
                </span>
                <span className="text-indigo-600 dark:text-indigo-400">
                  {totalCompletedActivities} / {totalActivitiesCount} (
                  {activityCompletionPercent}%)
                </span>
              </div>

              <p className="std-text-secondary text-[11px] font-semibold text-gray-500 leading-snug px-1 line-clamp-2">
                {masteryInfo.desc}
              </p>
            </div>
          </div>

          <div className="std-card-divider pt-3.5 sm:pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="std-text-secondary font-bold text-gray-500">
              {t('ពិន្ទុជាប់កំណត់៖', 'Passing Score:')}{' '}
              <strong className="std-text-primary text-emerald-600 dark:text-emerald-400">
                50 {t('ពិន្ទុ', 'pts')}
              </strong>
            </span>
            <Link
              to="/grades"
              className="font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              <CheckBadgeIcon className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>{getStudentBatchYear()}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 📌 2. METRIC TILES (2 Cols on Phone/Tablet, 4 on Laptop/Desktop)   */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Link
              key={index}
              to={stat.link}
              className={`std-metric-tile group relative overflow-hidden rounded-2xl sm:rounded-3xl bg-white bg-gradient-to-br ${stat.cardStyle} p-4 sm:p-5 border shadow-2xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between`}
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl ${stat.iconBox} flex items-center justify-center shadow-lg shrink-0 group-hover:scale-105 transition-transform`}
                >
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.2]" />
                </div>
                <ChevronRightIcon className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
              </div>

              <div className="mt-3.5 sm:mt-4">
                <p className="std-text-primary text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                  {stat.value}
                </p>
                <p className="std-text-primary text-xs sm:text-sm font-extrabold text-gray-800 mt-0.5 sm:mt-1 truncate">
                  {stat.title}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ================================================================== */}
      {/* 📌 3. ២ កាតទន្ទឹមគ្នា៖ កិច្ចការថ្មីៗ និង កម្រងសំណួរថ្មីៗ                   */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 lg:gap-8 items-stretch">
        
        {/* ៣.១. កាតកិច្ចការថ្មីៗ */}
        <div className="std-surface-card bg-white rounded-2xl sm:rounded-[1.75rem] border border-gray-200/80 shadow-sm p-4 sm:p-6 lg:p-7 flex flex-col justify-between h-full">
          <div className="space-y-4 sm:space-y-5">
            <div className="flex items-center justify-between gap-3 pb-3.5 sm:pb-4 border-b border-gray-100 std-card-divider">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20 shrink-0">
                  <ClipboardDocumentListIcon className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2]" />
                </div>
                <div className="min-w-0">
                  <h3 className="std-text-primary text-base sm:text-xl font-black text-gray-900 truncate">
                    {t('កិច្ចការថ្មីៗ', 'Recent Assignments')}
                  </h3>
                </div>
              </div>

              <Link
                to="/assignments"
                className="inline-flex items-center gap-1 text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
              >
                <span>{t('មើលទាំងអស់', 'View All')}</span>
                <ChevronRightIcon className="h-3.5 w-3.5 stroke-[2.5]" />
              </Link>
            </div>

            <div className="space-y-2.5 sm:space-y-3">
              {teacherAssignedHomework.length === 0 ? (
                <div className="std-empty-box py-10 sm:py-12 px-4 text-center bg-gray-50/70 rounded-2xl border border-dashed border-gray-200 space-y-2.5">
                  <div className="h-12 w-12 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto">
                    <ClipboardDocumentListIcon className="h-6 w-6" />
                  </div>
                  <p className="std-text-primary text-sm font-extrabold text-gray-700">
                    {t('មិនទាន់មានកិច្ចការគ្រូដាក់ឱ្យនៅឡើយទេ', 'No assignments posted yet')}
                  </p>
                  <p className="std-text-secondary text-xs text-gray-400 font-medium max-w-xs mx-auto">
                    {t(
                      'កិច្ចការសិក្សាដែលលោកគ្រូ/អ្នកគ្រូដាក់ឱ្យ នឹងបង្ហាញនៅក្នុងប្រអប់នេះ។',
                      'Course assignments posted by your instructors will appear here.'
                    )}
                  </p>
                </div>
              ) : (
                teacherAssignedHomework.slice(0, 4).map((assign, idx) => {
                  const sub = assign.resolvedSubmission;
                  const maxScore = formatCleanScore(
                    assign.total_score || assign.marks || 20,
                    20
                  );
                  const courseName =
                    assign.course?.course_name ||
                    assign.course_name ||
                    t('មុខវិជ្ជាសិក្សា', 'Course');

                  return (
                    <Link
                      key={assign.id || idx}
                      to="/assignments"
                      className="std-activity-item flex items-center justify-between gap-2.5 sm:gap-3.5 p-3 sm:p-4 rounded-2xl border border-gray-100 hover:border-indigo-300 bg-gray-50/60 transition-colors"
                    >
                      <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                        <div
                          className={`h-10 w-10 sm:h-11 sm:w-11 rounded-xl border flex items-center justify-center shrink-0 ${
                            assign.isDone
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                              : assign.isOverdue
                              ? 'bg-rose-50 text-rose-600 border-rose-200/80 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30'
                              : 'bg-amber-50 text-amber-600 border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
                          }`}
                        >
                          {assign.isDone ? (
                            <CheckCircleIcon className="h-5 w-5 stroke-[2.2]" />
                          ) : assign.isOverdue ? (
                            <ExclamationCircleIcon className="h-5 w-5 stroke-[2.2]" />
                          ) : (
                            <ClockIcon className="h-5 w-5 stroke-[2.2]" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="std-text-primary text-xs sm:text-sm font-extrabold text-gray-900 truncate">
                            {assign.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] font-semibold">
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold truncate max-w-[130px] sm:max-w-[160px]">
                              {courseName}
                            </span>
                            <span className="text-gray-300 dark:text-slate-600">•</span>
                            <span className="std-text-secondary text-gray-500 flex items-center gap-1">
                              <CalendarDaysIcon className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                              <span className="truncate">
                                {assign.isDone
                                  ? formatSafeDate(sub?.submitted_at || assign.due_date)
                                  : `${t('ផុតកំណត់៖', 'Due:')} ${formatSafeDate(
                                      assign.due_date
                                    )}`}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {assign.isDone ? (
                          <>
                            <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                              <CheckCircleIcon className="h-3.5 w-3.5 stroke-[2.5] shrink-0" />
                              <span>{t('ធ្វើរួចហើយ', 'Completed')}</span>
                            </span>
                            {assign.isGraded && (
                              <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">
                                {formatCleanScore(sub.score)} / {maxScore}{' '}
                                {t('ពិន្ទុ', 'pts')}
                              </span>
                            )}
                          </>
                        ) : assign.isOverdue ? (
                          <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30">
                            <ExclamationCircleIcon className="h-3.5 w-3.5 stroke-[2.5] shrink-0" />
                            <span>{t('ហួសកំណត់', 'Overdue')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                            <ClockIcon className="h-3.5 w-3.5 stroke-[2.5] shrink-0" />
                            <span>{t('មិនទាន់ធ្វើ', 'Not Done Yet')}</span>
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          <div className="std-card-divider pt-3.5 sm:pt-4 mt-4 sm:mt-5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="std-text-secondary font-bold text-gray-500">
              {t('កិច្ចការសរុប៖', 'Total Tasks:')}{' '}
              <strong className="std-text-primary text-gray-800">
                {teacherAssignedHomework.length}
              </strong>{' '}
              • {t('នៅសល់៖', 'Pending:')}{' '}
              <strong className="text-amber-600 dark:text-amber-400">
                {pendingHomeworkCount}
              </strong>
            </span>
            <span className="font-extrabold text-purple-600 dark:text-purple-400 flex items-center gap-1">
              <CheckCircleIcon className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>
                {doneHomeworkCount} {t('ប្រគល់រួច', 'Submitted')}
              </span>
            </span>
          </div>
        </div>

        {/* ៣.២. កាតកម្រងសំណួរថ្មីៗ */}
        <div className="std-surface-card bg-white rounded-2xl sm:rounded-[1.75rem] border border-gray-200/80 shadow-sm p-4 sm:p-6 lg:p-7 flex flex-col justify-between h-full">
          <div className="space-y-4 sm:space-y-5">
            <div className="flex items-center justify-between gap-3 pb-3.5 sm:pb-4 border-b border-gray-100 std-card-divider">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                  <PencilSquareIcon className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2]" />
                </div>
                <div className="min-w-0">
                  <h3 className="std-text-primary text-base sm:text-xl font-black text-gray-900 truncate">
                    {t('កម្រងសំណួរថ្មីៗ', 'Recent Quizzes')}
                  </h3>
                </div>
              </div>

              <Link
                to="/quizzes"
                className="inline-flex items-center gap-1 text-xs font-extrabold text-amber-600 dark:text-amber-400 hover:underline shrink-0"
              >
                <span>{t('មើលទាំងអស់', 'View All')}</span>
                <ChevronRightIcon className="h-3.5 w-3.5 stroke-[2.5]" />
              </Link>
            </div>

            <div className="space-y-2.5 sm:space-y-3">
              {teacherAssignedQuizzes.length === 0 ? (
                <div className="std-empty-box py-10 sm:py-12 px-4 text-center bg-gray-50/70 rounded-2xl border border-dashed border-gray-200 space-y-2.5">
                  <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
                    <AcademicCapIcon className="h-6 w-6" />
                  </div>
                  <p className="std-text-primary text-sm font-extrabold text-gray-700">
                    {t('មិនទាន់មានកម្រងសំណួរគ្រូដាក់ឱ្យនៅឡើយទេ', 'No quizzes posted yet')}
                  </p>
                  <p className="std-text-secondary text-xs text-gray-400 font-medium max-w-xs mx-auto">
                    {t(
                      'កម្រងសំណួរប្រឡងដែលលោកគ្រូ/អ្នកគ្រូដាក់ឱ្យ នឹងបង្ហាញនៅក្នុងប្រអប់នេះ។',
                      'Quizzes posted by your instructors will appear here.'
                    )}
                  </p>
                </div>
              ) : (
                teacherAssignedQuizzes.slice(0, 4).map((quiz, idx) => {
                  const att = quiz.resolvedAttempt;
                  const totalMark = formatCleanScore(
                    quiz.total_mark || quiz.total_marks || 20,
                    20
                  );
                  const courseName =
                    quiz.course?.course_name ||
                    quiz.course_name ||
                    t('មុខវិជ្ជាសិក្សា', 'Course');

                  return (
                    <Link
                      key={quiz.id || idx}
                      to="/quizzes"
                      className="std-activity-item flex items-center justify-between gap-2.5 sm:gap-3.5 p-3 sm:p-4 rounded-2xl border border-gray-100 hover:border-amber-300 bg-gray-50/60 transition-colors"
                    >
                      <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                        <div
                          className={`h-10 w-10 sm:h-11 sm:w-11 rounded-xl border flex items-center justify-center shrink-0 ${
                            quiz.isDone
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                              : quiz.isExpired
                              ? 'bg-rose-50 text-rose-600 border-rose-200/80 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30'
                              : 'bg-amber-50 text-amber-600 border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
                          }`}
                        >
                          {quiz.isDone ? (
                            <CheckCircleIcon className="h-5 w-5 stroke-[2.2]" />
                          ) : (
                            <AcademicCapIcon className="h-5 w-5 stroke-[2.2]" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="std-text-primary text-xs sm:text-sm font-extrabold text-gray-900 truncate">
                            {quiz.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] font-semibold">
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold truncate max-w-[130px] sm:max-w-[160px]">
                              {courseName}
                            </span>
                            <span className="text-gray-300 dark:text-slate-600">•</span>
                            <span className="std-text-secondary text-gray-500 flex items-center gap-1">
                              <ClockIcon className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              <span className="truncate">
                                {quiz.isDone
                                  ? formatSafeDate(att?.submitted_at || quiz.end_date)
                                  : `${quiz.duration || 30} ${t('នាទី', 'mins')}`}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {quiz.isDone ? (
                          <>
                            <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                              <CheckCircleIcon className="h-3.5 w-3.5 stroke-[2.5] shrink-0" />
                              <span>{t('ធ្វើរួចហើយ', 'Completed')}</span>
                            </span>
                            <span className="text-[11px] font-black text-amber-600 dark:text-amber-400">
                              {formatCleanScore(att?.score)} / {totalMark}{' '}
                              {t('ពិន្ទុ', 'pts')}
                            </span>
                          </>
                        ) : quiz.isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30">
                            <ExclamationCircleIcon className="h-3.5 w-3.5 stroke-[2.5] shrink-0" />
                            <span>{t('ហួសកំណត់', 'Expired')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                            <ClockIcon className="h-3.5 w-3.5 stroke-[2.5] shrink-0" />
                            <span>{t('មិនទាន់ធ្វើ', 'Not Done Yet')}</span>
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          <div className="std-card-divider pt-3.5 sm:pt-4 mt-4 sm:mt-5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="std-text-secondary font-bold text-gray-500">
              {t('កម្រងសំណួរសរុប៖', 'Total Quizzes:')}{' '}
              <strong className="std-text-primary text-gray-800">
                {teacherAssignedQuizzes.length}
              </strong>{' '}
              • {t('នៅសល់៖', 'Pending:')}{' '}
              <strong className="text-amber-600 dark:text-amber-400">
                {pendingQuizzesCount}
              </strong>
            </span>
            <span className="font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <CheckCircleIcon className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>
                {doneQuizzesCount} {t('ប្រឡងរួច', 'Completed')}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 📌 4. CSS សម្រាប់ចលនាទឹករលក (GPU Accelerated) និង DARK MODE          */}
      {/* ================================================================== */}
      <style>{`
        .std-hero-grid-pattern {
          background-image: radial-gradient(rgba(255, 255, 255, 0.25) 1px, transparent 1px);
          background-size: 20px 20px;
        }

        @keyframes carouselSlideFade {
          0% {
            opacity: 0;
            transform: translate3d(0, 8px, 0);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }
        .std-carousel-slide {
          animation: carouselSlideFade 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: transform, opacity;
        }

        @keyframes stdLiquidSpin {
          0% {
            transform: translate3d(-50%, 0, 0) rotate(0deg);
          }
          100% {
            transform: translate3d(-50%, 0, 0) rotate(360deg);
          }
        }
        .std-liquid-wave-front {
          top: -8px;
          animation: stdLiquidSpin 6s linear infinite;
          will-change: transform;
        }
        .std-liquid-wave-back {
          top: -12px;
          animation: stdLiquidSpin 9s linear infinite reverse;
          will-change: transform;
        }

        @media (prefers-reduced-motion: reduce) {
          .std-liquid-wave-front,
          .std-liquid-wave-back,
          .std-carousel-slide {
            animation: none !important;
          }
        }

        html.dark .std-surface-card,
        html.dark .std-metric-tile {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .std-subbox,
        html.dark .std-activity-item,
        html.dark .std-empty-box {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .std-liquid-inner {
          background-color: #0f172a !important;
        }
        html.dark .std-ring-track {
          stroke: #0f172a !important;
        }
        html.dark .std-text-primary {
          color: #f8fafc !important;
        }
        html.dark .std-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .std-card-divider {
          border-color: #334155 !important;
        }
        html.dark .std-code-pill {
          background-color: #0f172a !important;
          color: #cbd5e1 !important;
          border-color: #334155 !important;
        }
      `}</style>
    </div>
  );
};

export default StudentDashboard;
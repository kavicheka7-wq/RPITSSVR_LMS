// src/components/student/StudentDashboard.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យល្បឿនលឿន (0ms Cache & Instant Background Prefetcher)
// ============================================================================
const LAST_ACTIVE_STUDENT_UID_KEY = 'lms_last_active_student_uid';

const CACHE_KEY_SHARED_ENROLLMENTS = 'cached_student_dashboard_enrollments_v8';
const CACHE_KEY_SHARED_COURSES = 'cached_student_courses_list_v3';
const CACHE_KEY_SHARED_ASSIGNMENTS = 'cached_student_assignments_list_v5';
const CACHE_KEY_SHARED_QUIZZES = 'cached_student_quizzes_list_v5';
const CACHE_KEY_SHARED_SCORES = 'cached_student_scores_list_v5';
const CACHE_KEY_SHARED_ATTENDANCE = 'cached_student_attendance_list_v3';
const CACHE_KEY_SHARED_LESSONS = 'cached_student_dept_lessons_v12';
const CACHE_KEY_SHARED_DEPT_COURSES = 'cached_student_dept_courses_all_years_v12';
const CACHE_KEY_TEACHER_AVATARS = 'cached_student_teacher_avatars_v1';

const getStatsCacheKey = (uid) => `cached_student_dashboard_stats_v10_${uid}`;
const getEnrollmentsCacheKey = (uid) => `cached_student_dashboard_enrollments_v10_${uid}`;
const getCoursesCacheKey = (uid) => `cached_student_courses_list_v10_${uid}`;
const getAssignmentsCacheKey = (uid) => `cached_student_assignments_list_v10_${uid}`;
const getQuizzesCacheKey = (uid) => `cached_student_quizzes_list_v8_${uid}`;
const getScoresCacheKey = (uid) => `cached_student_scores_list_v10_${uid}`;
const getAttendanceCacheKey = (uid) => `cached_student_attendance_list_v8_${uid}`;
const getLessonsCacheKey = (uid) => `cached_student_dept_lessons_v12_${uid}`;
const getDeptCoursesCacheKey = (uid) => `cached_student_dept_courses_v12_${uid}`;
const getStudentYearCacheKey = (uid) => `cached_student_current_year_v12_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់សិស្សម្នាក់ៗ
const STUDENT_DASH_MEM_CACHE = {
  uid: null,
  stats: null,
  enrollments: null,
  assignments: null,
  quizzes: null,
  lastSyncedAt: 0,
  prefetchedUid: null,
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

// ✅ ញែករូបថតគ្រូទុកក្នុង CACHE_KEY_TEACHER_AVATARS រួមតែមួយ ហើយរក្សាទុកបញ្ជីមុខវិជ្ជា/មេរៀនយ៉ាងស្រាលបំផុត (គ្មាន Canvas)
const saveCoursesAndAvatarsFast = (coursesArr) => {
  if (!Array.isArray(coursesArr)) return [];
  const avatarMap = readStorageJson(CACHE_KEY_TEACHER_AVATARS, {});
  let mapUpdated = false;

  const slimList = coursesArr.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const courseObj = item.course || item;
    const cid = String(item.course_id || courseObj.id || item.id || '');
    const tch = courseObj.teacher_profile || courseObj.teacher || item.teacher_profile || item.teacher;
    const tchId = String(tch?.id || tch?.user_id || courseObj.teacher_id || '');
    const rawImg =
      tch?.profile_image_url ||
      tch?.profile_image ||
      tch?.user?.profile_image ||
      null;

    if (rawImg && typeof rawImg === 'string') {
      if (cid && avatarMap[`crs_${cid}`] !== rawImg) {
        avatarMap[`crs_${cid}`] = rawImg;
        mapUpdated = true;
      }
      if (tchId && avatarMap[`tch_${tchId}`] !== rawImg) {
        avatarMap[`tch_${tchId}`] = rawImg;
        mapUpdated = true;
      }
    }

    const isHeavy =
      typeof rawImg === 'string' &&
      rawImg.startsWith('data:') &&
      rawImg.length > 2000;

    if (!isHeavy) return item;

    const cleanPerson = (p) => {
      if (!p || typeof p !== 'object') return p;
      const c = { ...p };
      delete c.profile_image;
      delete c.profile_image_url;
      return c;
    };

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

  if (mapUpdated) {
    try {
      localStorage.setItem(CACHE_KEY_TEACHER_AVATARS, JSON.stringify(avatarMap));
    } catch {}
  }

  return slimList;
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
        'cached_student_dashboard_stats_v8',
        'cached_student_dashboard_enrollments_v8',
        'cached_student_dashboard_activity_v8',
        'cached_student_courses_list_v3',
        'cached_student_courses_meta_v3',
        'cached_student_assignments_list_v5',
        'cached_student_quizzes_list_v5',
        'cached_student_scores_list_v5',
        'cached_student_attendance_list_v3',
        CACHE_KEY_SHARED_LESSONS,
        CACHE_KEY_SHARED_DEPT_COURSES,
        CACHE_KEY_TEACHER_AVATARS,
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

// ✅ ទាញទិន្នន័យគ្រប់ទំព័រទាំងអស់របស់សិស្សទុកមុនភ្លាមៗ (រួមទាំង មេរៀន /student/lessons ដើម្បីចុចលើ Sidebar ភ្លាមចេញភ្លាមក្នុង 0ms)
const prefetchAllStudentPagesData = (
  uid,
  onAssignmentsSynced,
  onQuizzesSynced,
  onCoursesSynced
) => {
  if (!uid || uid === 'default_student') return;
  if (STUDENT_DASH_MEM_CACHE.prefetchedUid === uid) return;
  STUDENT_DASH_MEM_CACHE.prefetchedUid = uid;

  // ១. ទាញបញ្ជីកិច្ចការសិស្សភ្លាមៗ
  api
    .get('/student/assignments', { params: { per_page: 20 } })
    .then((res) => {
      const data = extractArrayFromRes(res.data);
      STUDENT_DASH_MEM_CACHE.assignments = data;
      if (typeof onAssignmentsSynced === 'function') {
        onAssignmentsSynced(data);
      }
      try {
        localStorage.setItem(getAssignmentsCacheKey(uid), JSON.stringify(data));
        localStorage.setItem(CACHE_KEY_SHARED_ASSIGNMENTS, JSON.stringify(data));
      } catch {}
    })
    .catch(() => {});

  // ២. ទាញបញ្ជីកម្រងសំណួរប្រឡងភ្លាមៗ
  api
    .get('/student/quizzes', { params: { per_page: 20 } })
    .then((res) => {
      const data = extractArrayFromRes(res.data);
      STUDENT_DASH_MEM_CACHE.quizzes = data;
      if (typeof onQuizzesSynced === 'function') {
        onQuizzesSynced(data);
      }
      try {
        localStorage.setItem(getQuizzesCacheKey(uid), JSON.stringify(data));
        localStorage.setItem(CACHE_KEY_SHARED_QUIZZES, JSON.stringify(data));
      } catch {}
    })
    .catch(() => {});

  // ៣. ទាញបញ្ជីមុខវិជ្ជា និងមេរៀនទុកមុនសម្រាប់ទំព័រ StudentCourses និង StudentLessons (0ms)
  setTimeout(() => {
    api
      .get('/student/courses', { params: { per_page: 12 } })
      .then((res) => {
        const data = extractArrayFromRes(res.data);
        if (Array.isArray(data) && data.length > 0) {
          if (typeof onCoursesSynced === 'function') {
            onCoursesSynced(data);
          }
          const slim = saveCoursesAndAvatarsFast(data);
          try {
            localStorage.setItem(getCoursesCacheKey(uid), JSON.stringify(slim));
            localStorage.setItem(CACHE_KEY_SHARED_COURSES, JSON.stringify(slim));
          } catch {}
        }
      })
      .catch(() => {});

    api
      .get('/student/lessons')
      .then((res) => {
        const lessonsData = Array.isArray(res.data?.data)
          ? res.data.data
          : Array.isArray(res.data)
          ? res.data
          : [];
        const deptCoursesData = Array.isArray(res.data?.department_courses)
          ? res.data.department_courses
          : [];

        if (deptCoursesData.length > 0) {
          const slimDept = saveCoursesAndAvatarsFast(deptCoursesData);
          try {
            localStorage.setItem(
              getDeptCoursesCacheKey(uid),
              JSON.stringify(slimDept)
            );
            localStorage.setItem(
              CACHE_KEY_SHARED_DEPT_COURSES,
              JSON.stringify(slimDept)
            );
          } catch {}
        }
        if (lessonsData.length > 0) {
          try {
            localStorage.setItem(
              getLessonsCacheKey(uid),
              JSON.stringify(lessonsData)
            );
            localStorage.setItem(
              CACHE_KEY_SHARED_LESSONS,
              JSON.stringify(lessonsData)
            );
          } catch {}
        }
        if (res.data?.student_current_year) {
          try {
            localStorage.setItem(
              getStudentYearCacheKey(uid),
              String(res.data.student_current_year)
            );
          } catch {}
        }
      })
      .catch(() => {});

    api
      .get('/student/scores')
      .then((res) => {
        const data = extractArrayFromRes(res.data);
        const slim = saveCoursesAndAvatarsFast(data);
        try {
          localStorage.setItem(getScoresCacheKey(uid), JSON.stringify(slim));
          localStorage.setItem(CACHE_KEY_SHARED_SCORES, JSON.stringify(slim));
        } catch {}
      })
      .catch(() => {});

    api
      .get('/student/attendance', { params: { per_page: 20 } })
      .then((res) => {
        const data = extractArrayFromRes(res.data);
        const slim = saveCoursesAndAvatarsFast(data);
        try {
          localStorage.setItem(getAttendanceCacheKey(uid), JSON.stringify(slim));
          localStorage.setItem(
            CACHE_KEY_SHARED_ATTENDANCE,
            JSON.stringify(slim)
          );
        } catch {}
      })
      .catch(() => {});
  }, 150);
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
    if (Array.isArray(STUDENT_DASH_MEM_CACHE.enrollments)) {
      return STUDENT_DASH_MEM_CACHE.enrollments;
    }
    const cached =
      readStorageJson(getEnrollmentsCacheKey(currentStudentId), null) ||
      readStorageJson(getCoursesCacheKey(currentStudentId), null) ||
      readStorageJson(CACHE_KEY_SHARED_ENROLLMENTS, []);
    if (Array.isArray(cached)) {
      STUDENT_DASH_MEM_CACHE.enrollments = cached;
      return cached;
    }
    return [];
  });

  const [assignments, setAssignments] = useState(() => {
    if (Array.isArray(STUDENT_DASH_MEM_CACHE.assignments)) {
      return STUDENT_DASH_MEM_CACHE.assignments;
    }
    const cached =
      readStorageJson(getAssignmentsCacheKey(currentStudentId), null) ||
      readStorageJson(CACHE_KEY_SHARED_ASSIGNMENTS, []);
    if (Array.isArray(cached)) {
      STUDENT_DASH_MEM_CACHE.assignments = cached;
      return cached;
    }
    return [];
  });

  const [quizzes, setQuizzes] = useState(() => {
    if (Array.isArray(STUDENT_DASH_MEM_CACHE.quizzes)) {
      return STUDENT_DASH_MEM_CACHE.quizzes;
    }
    const cached =
      readStorageJson(getQuizzesCacheKey(currentStudentId), null) ||
      readStorageJson(CACHE_KEY_SHARED_QUIZZES, []);
    if (Array.isArray(cached)) {
      STUDENT_DASH_MEM_CACHE.quizzes = cached;
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
        if (tch.full_name) return tch.full_name;
        if (tch.first_name || tch.last_name) {
          return `${tch.first_name || ''} ${tch.last_name || ''}`.trim();
        }
        if (tch.user?.first_name || tch.user?.last_name) {
          return `${tch.user.first_name || ''} ${tch.user.last_name || ''}`.trim();
        }
        if (tch.name) return tch.name;
        if (tch.user?.name) return tch.user.name;
      }

      if (tchProfile) {
        if (tchProfile.full_name) return tchProfile.full_name;
        if (tchProfile.first_name || tchProfile.last_name) {
          return `${tchProfile.first_name || ''} ${tchProfile.last_name || ''}`.trim();
        }
        if (tchProfile.name) return tchProfile.name;
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

  const averageScoreNum = useMemo(() => {
    const raw = Number(stats?.average_score || 0);
    return Math.min(100, Math.max(0, Math.round(raw)));
  }, [stats]);

  const masteryInfo = useMemo(() => {
    if (averageScoreNum >= 50) {
      return {
        label: averageScoreNum >= 85 ? t('និស្សិតឆ្នើម', 'Excellent') : t('និស្សិតសកម្ម', 'Good Standing'),
        statusText: t('ប្រឡងជាប់', 'Passed'),
        desc:
          averageScoreNum >= 85
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
    if (averageScoreNum > 0) {
      return {
        label: t('ត្រូវប្រឹងប្រែងបន្ថែម', 'Needs Improvement'),
        statusText: t('ប្រឡងធ្លាក់', 'Failed'),
        desc: t('សូមព្យាយាមធ្វើកិច្ចការ និងសំណួរខ្លីបន្ថែម', 'Keep practicing assignments & quizzes'),
        badgeClass:
          'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
        statusTextColor: 'text-rose-600 dark:text-rose-400',
        ringColor: '#f43f5e',
        waveFrontColor: 'rgba(244, 63, 94, 0.78)',
        waveBackColor: 'rgba(251, 113, 133, 0.45)',
      };
    }
    return {
      label: t('និស្សិតកំពុងសិក្សា', 'Active Student'),
      statusText: t('រង់ចាំពិន្ទុ', 'Pending'),
      desc: t('បន្តចូលរៀន និងធ្វើលំហាត់បន្ថែម', 'Keep studying & practicing'),
      badgeClass:
        'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
      statusTextColor: 'text-indigo-600 dark:text-indigo-400',
      ringColor: '#6366f1',
      waveFrontColor: 'rgba(99, 102, 241, 0.72)',
      waveBackColor: 'rgba(129, 140, 248, 0.42)',
    };
  }, [averageScoreNum, t]);

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

  // ✅ ប្រអប់រំកិលបង្ហាញព័ត៌មានសង្ខេប (ដកអក្សរ «ធ្វើរួច» ដែលស្ទួននៅខាងឆ្វេងចេញ ទុកតែនៅផ្លាកខាងចុងស្ដាំមួយកន្លែងគត់)
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
          meta: `${courseInfo.course_code || 'COURSE'} • ${getTeacherDisplayName(courseInfo)}`,
          title: courseInfo.course_name || t('មុខវិជ្ជាសិក្សា', 'Course'),
          statusPill: t('កំពុងសិក្សា', 'Enrolled'),
          icon: PlayCircleIcon,
          iconBoxStyle: theme.iconGradient,
        });
      });
    }

    const totalAsg = teacherAssignedHomework.length || stats?.total_assignments || 0;
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
      statusPill: `${averageScoreNum} / 100 ${t('ពិន្ទុ', 'pts')}`,
      icon: ChartBarIcon,
      iconBoxStyle: 'from-cyan-400 to-blue-500 text-slate-950',
    });

    return slides;
  }, [
    enrichedEnrollments,
    stats,
    teacherAssignedHomework.length,
    teacherAssignedQuizzes.length,
    doneHomeworkCount,
    doneQuizzesCount,
    averageScoreNum,
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
  // 📌 ផ្នែកទី៥៖ ទាញយកទិន្នន័យដោយឯករាជ្យមិនរង់ចាំគ្នា (Non-Blocking 0ms Sync + Prefetch)
  // ============================================================================
  const fetchDashboardData = useCallback(async () => {
    prefetchAllStudentPagesData(
      currentStudentId,
      (asgData) => {
        setAssignments(asgData);
      },
      (qzData) => {
        setQuizzes(qzData);
      },
      (crsData) => {
        setEnrollments((prev) => (prev.length === 0 ? crsData : prev));
      }
    );

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

    if (cachedSt && Object.keys(cachedSt).length > 0) {
      setStats(cachedSt);
    }
    if (Array.isArray(cachedEnr)) {
      setEnrollments(cachedEnr);
    }
    if (Array.isArray(cachedAsg)) {
      setAssignments(cachedAsg);
    }
    if (Array.isArray(cachedQz)) {
      setQuizzes(cachedQz);
    }

    if (
      STUDENT_DASH_MEM_CACHE.uid === currentStudentId &&
      cachedSt &&
      Object.keys(cachedSt).length > 0 &&
      now - STUDENT_DASH_MEM_CACHE.lastSyncedAt < 25000
    ) {
      return;
    }

    try {
      const dashRes = await api.get('/student/dashboard');
      const resData = dashRes?.data?.data || dashRes?.data || {};

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
      setEnrollments(validEnrollments);

      STUDENT_DASH_MEM_CACHE.uid = currentStudentId;
      STUDENT_DASH_MEM_CACHE.stats = newStats;
      STUDENT_DASH_MEM_CACHE.enrollments = validEnrollments;
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
          attempt: att,
        }));
        setQuizzes((prev) => (prev.length === 0 ? fallbackQz : prev));
      }

      const slimEnrollments = saveCoursesAndAvatarsFast(validEnrollments);
      try {
        localStorage.setItem(
          getStatsCacheKey(currentStudentId),
          JSON.stringify(newStats)
        );
        localStorage.setItem(
          getEnrollmentsCacheKey(currentStudentId),
          JSON.stringify(slimEnrollments)
        );
        localStorage.setItem(
          CACHE_KEY_SHARED_ENROLLMENTS,
          JSON.stringify(slimEnrollments)
        );
      } catch (e) {}
    } catch (error) {
      console.error('Error fetching student dashboard data:', error);
    }
  }, [currentStudentId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const ringRadius = 46;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference - (averageScoreNum / 100) * ringCircumference;

  // គណនាផលបូកការងារដែលសិស្សបានធ្វើរួច (កិច្ចការ + កម្រងសំណួរ) សម្រាប់បង្ហាញបន្ថែមឱ្យច្បាស់លាស់
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

  // ✅ កម្ពស់ទឹកក្នុងកងមូល (Liquid Level):
  // - បើសិស្សមានពិន្ទុមធ្យមភាគ (> 0) ទឹកនឹងឡើងតាមភាគរយពិន្ទុ (បើបាន 100 ពិន្ទុ ទឹកពេញ 100%)
  // - បើមិនទាន់មានពិន្ទុ (0%) តែសិស្សបានធ្វើកិច្ចការ/សំណួរខ្លះហើយ ទឹកនឹងឡើងតាមភាគរយការងារដែលធ្វើរួច ឬដាក់កម្ពស់រលកអប្បបរមា 14% ដើម្បីឱ្យឃើញទឹករលកស្អាត!
  const liquidLevelPercent = useMemo(() => {
    if (averageScoreNum > 0) return Math.min(100, Math.max(12, averageScoreNum));
    if (activityCompletionPercent > 0) {
      return Math.min(100, Math.max(14, activityCompletionPercent));
    }
    return 14;
  }, [averageScoreNum, activityCompletionPercent]);

  const isLiquidDarkText = liquidLevelPercent < 58;

  // ✅ កាតស្ថិតិទាំង ៤ (រក្សាទុកទម្រង់រូបទី ២ ឱ្យនៅដដែល ១០០%)
  const statCards = [
    {
      title: t('មុខវិជ្ជាកំពុងរៀន', 'Enrolled Courses'),
      value: stats?.total_courses ?? enrollments.length ?? 0,
      subtitle: t('មុខវិជ្ជាបានចុះឈ្មោះ', 'Active courses'),
      badge: t('សកម្ម', 'Active'),
      icon: BookOpenIcon,
      cardStyle:
        'from-blue-500/10 via-indigo-500/5 to-transparent border-blue-200/70',
      iconBox:
        'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-blue-500/25',
      textAccent: 'text-blue-600 dark:text-blue-400',
      badgeClass:
        'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
    },
    {
      title: t('ពិន្ទុមធ្យមភាគ', 'Average Score'),
      value: `${averageScoreNum}%`,
      subtitle: t('លទ្ធផលសិក្សាសរុប', 'Overall academic score'),
      badge: masteryInfo.statusText,
      icon: ChartBarIcon,
      cardStyle:
        'from-emerald-500/10 via-teal-500/5 to-transparent border-emerald-200/70',
      iconBox:
        'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/25',
      textAccent: 'text-emerald-600 dark:text-emerald-400',
      badgeClass:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    },
    {
      title: t('កិច្ចការសិស្ស', 'Assignments'),
      value: totalHomeworkCount,
      subtitle: `${doneHomeworkCount} / ${totalHomeworkCount} ${t('ធ្វើរួចហើយ', 'Completed')}`,
      badge: `${doneHomeworkCount}/${totalHomeworkCount}`,
      icon: ClipboardDocumentListIcon,
      cardStyle:
        'from-purple-500/10 via-fuchsia-500/5 to-transparent border-purple-200/70',
      iconBox:
        'bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-purple-500/25',
      textAccent: 'text-purple-600 dark:text-purple-400',
      badgeClass:
        'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30',
    },
    {
      title: t('កម្រងសំណួរប្រឡង', 'Quizzes'),
      value: totalQuizzesCount,
      subtitle: `${doneQuizzesCount} / ${totalQuizzesCount} ${t('ធ្វើរួចហើយ', 'Completed')}`,
      badge: `${doneQuizzesCount}/${totalQuizzesCount}`,
      icon: AcademicCapIcon,
      cardStyle:
        'from-amber-500/10 via-orange-500/5 to-transparent border-amber-200/70',
      iconBox:
        'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-amber-500/25',
      textAccent: 'text-amber-600 dark:text-amber-400',
      badgeClass:
        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    },
  ];

  const SlideIcon = currentSlide?.icon || PlayCircleIcon;

  return (
    <div className="std-bento-page max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 pb-28 lg:pb-12 mt-2 md:mt-0 animate-fadeIn select-none">
      
      {/* ================================================================== */}
      {/* 📌 1. MODERN BENTO HERO SECTION                                    */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
        
        {/* ១.១. ផ្ទាំងស្វាគមន៍សិស្សបែបឌីជីថល និងប្រអប់រំកិលស្វ័យប្រវត្តិ (8 Columns) */}
        <div className="lg:col-span-8 relative overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] bg-gradient-to-br from-blue-950 via-indigo-900 to-violet-950 p-6 sm:p-8 text-white shadow-xl border border-indigo-500/30 flex flex-col justify-between">
          <div className="std-hero-grid-pattern absolute inset-0 opacity-15 pointer-events-none"></div>
          <div className="absolute -top-24 -right-20 w-80 h-80 bg-blue-400/25 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-24 -left-20 w-72 h-72 bg-purple-500/25 rounded-full blur-3xl pointer-events-none"></div>

          <BuildingLibraryIcon className="absolute -right-6 -bottom-10 w-44 sm:w-60 h-44 sm:h-60 text-white/[0.04] -rotate-12 pointer-events-none" />

          <div className="relative z-10 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
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

              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-bold text-blue-100">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>{getGreeting()}</span>
                <span className="text-white/40">•</span>
                <span className="text-yellow-300">{getStudentBatchYear()}</span>
              </span>
            </div>

            <div className="space-y-2 pt-1">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight flex flex-wrap items-center gap-2.5 leading-snug">
                <span>{t('សូមស្វាគមន៍,', 'Welcome back,')}</span>
                <span className="bg-gradient-to-r from-yellow-300 via-amber-200 to-white bg-clip-text text-transparent">
                  {getStudentDisplayName()}
                </span>
                <CheckBadgeIcon className="h-6 w-6 sm:h-7 sm:w-7 text-yellow-400 shrink-0" />
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
            className="relative z-10 mt-6 pt-5 border-t border-white/15"
            onMouseEnter={() => setIsCarouselPaused(true)}
            onMouseLeave={() => setIsCarouselPaused(false)}
          >
            {currentSlide && (
              <div className="space-y-2.5">
                <div className="relative overflow-hidden bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 sm:p-4 transition-all duration-300">
                  <div
                    key={currentSlide.id}
                    className="std-carousel-slide flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div
                        className={`h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br ${currentSlide.iconBoxStyle} flex items-center justify-center shrink-0 shadow-md`}
                      >
                        <SlideIcon className="h-6 w-6 sm:h-7 sm:w-7 stroke-[2]" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded border ${currentSlide.badgeStyle}`}
                          >
                            {currentSlide.badge}
                          </span>
                          <span className="text-xs font-bold text-blue-200 truncate">
                            {currentSlide.meta}
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-extrabold text-white truncate mt-1">
                          {currentSlide.title}
                        </h3>
                      </div>
                    </div>

                    {/* ✅ ផ្លាកបង្ហាញចំនួនធ្វើរួច ដាក់តែនៅខាងចុងស្ដាំនេះមួយកន្លែងគត់ (មិនស្ទួនជាមួយខាងឆ្វេងទេ) */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900/80 text-cyan-200 border border-white/15 font-extrabold text-xs shadow-sm">
                        <SparklesIcon className="h-4 w-4 text-yellow-300 shrink-0" />
                        <span>{currentSlide.statusPill}</span>
                      </span>
                    </div>
                  </div>
                </div>

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
                        className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                        title={t('មុន', 'Previous')}
                      >
                        <ChevronLeftIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                      </button>
                      <button
                        type="button"
                        onClick={handleNextSlide}
                        className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
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

        {/* ================================================================ */}
        {/* 📌 ១.២. កាតលទ្ធផលការសិក្សារួម + កងមូលមានទឹករលក (Liquid Wave Ring) */}
        {/* ================================================================ */}
        <div className="lg:col-span-4 std-surface-card bg-white rounded-[1.75rem] sm:rounded-[2rem] p-6 border border-gray-200/80 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                {t('សន្ទស្សន៍ការសិក្សា', 'Performance Index')}
              </span>
              <h2 className="std-text-primary text-lg font-extrabold text-gray-900 mt-0.5">
                {t('លទ្ធផលការសិក្សារួម', 'Academic Standing')}
              </h2>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold border ${masteryInfo.badgeClass}`}
            >
              {masteryInfo.label}
            </span>
          </div>

          <div className="my-5 flex items-center justify-center gap-5 sm:gap-6">
            {/* ✅ កងមូលមានទឹករលកខាងក្នុង (Liquid Wave Gauge) ពេលពិន្ទុពេញ ទឹកឡើងពេញកងមូល */}
            <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
              {/* ផ្ទៃទឹករលកខាងក្នុងកងមូល */}
              <div className="std-liquid-inner absolute inset-[9px] rounded-full overflow-hidden bg-slate-100/90 dark:bg-slate-900/90 z-0 shadow-inner">
                <div
                  className="absolute bottom-0 left-0 right-0 transition-all duration-1000 ease-out"
                  style={{ height: `${liquidLevelPercent}%` }}
                >
                  {/* រលកខាងក្រោយ */}
                  <div
                    className="std-liquid-wave-back absolute left-1/2 w-[220%] pb-[220%] rounded-[43%]"
                    style={{ backgroundColor: masteryInfo.waveBackColor }}
                  />
                  {/* រលកខាងមុខ */}
                  <div
                    className="std-liquid-wave-front absolute left-1/2 w-[220%] pb-[220%] rounded-[40%]"
                    style={{ backgroundColor: masteryInfo.waveFrontColor }}
                  />
                </div>
              </div>

              {/* រង្វង់ SVG ព័ទ្ធជុំវិញខាងក្រៅ */}
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
                  className="transition-all duration-1000 ease-out"
                />
              </svg>

              {/* អក្សរពិន្ទុនៅចំកណ្ដាលកងទឹក (បង្ហាញជា ពិន្ទុ / 100 ដើម្បីកុំឱ្យស្ទួនពាក្យមធ្យមភាគជាមួយរូបទី ២) */}
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center pointer-events-none px-1">
                <div className="flex items-baseline justify-center gap-0.5 leading-none">
                  <span
                    className={`text-xl font-black tracking-tight transition-colors duration-500 ${
                      isLiquidDarkText
                        ? 'std-text-primary text-slate-900'
                        : 'text-white drop-shadow-xs'
                    }`}
                  >
                    {averageScoreNum}
                  </span>
                  <span
                    className={`text-[11px] font-extrabold transition-colors duration-500 ${
                      isLiquidDarkText
                        ? 'std-text-secondary text-slate-500'
                        : 'text-white/90'
                    }`}
                  >
                    /100
                  </span>
                </div>
                <span
                  className={`text-[9.5px] font-extrabold uppercase tracking-wider mt-1 transition-colors duration-500 ${
                    isLiquidDarkText
                      ? 'text-indigo-600 dark:text-indigo-300'
                      : 'text-white/95 drop-shadow-2xs'
                  }`}
                >
                  {t('ពិន្ទុសរុប', 'Score Pts')}
                </span>
              </div>
            </div>

            {/* ប្រអប់ស្ថានភាពលទ្ធផល និងការរាប់ចំនួនការងារធ្វើរួច */}
            <div className="space-y-2 min-w-0 flex-1">
              <div className="std-subbox bg-gray-50 border border-gray-100 rounded-2xl px-3.5 py-2.5">
                <span className="std-text-secondary block text-[10px] font-bold uppercase text-gray-400">
                  {t('ស្ថានភាពលទ្ធផល', 'Result Status')}
                </span>
                <span
                  className={`block text-base sm:text-lg font-black mt-0.5 truncate ${masteryInfo.statusTextColor}`}
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

              <p className="std-text-secondary text-[11px] font-semibold text-gray-500 leading-snug px-1">
                {masteryInfo.desc}
              </p>
            </div>
          </div>

          <div className="std-card-divider pt-4 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="std-text-secondary font-bold text-gray-500">
              {t('មុខវិជ្ជាកំពុងសិក្សា៖', 'Enrolled Courses:')}{' '}
              <strong className="std-text-primary text-gray-800">
                {stats?.total_courses ?? enrollments.length ?? 0}
              </strong>
            </span>
            <span className="font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              <CheckBadgeIcon className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>{getStudentBatchYear()}</span>
            </span>
          </div>
        </div>

      </div>

      {/* ================================================================== */}
      {/* 📌 2. STATIC METRIC TILES (រូបទី ២ រក្សាទុកដដែល ១០០%)               */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className={`std-metric-tile relative overflow-hidden rounded-2xl sm:rounded-3xl bg-white bg-gradient-to-br ${stat.cardStyle} p-4 sm:p-5 border shadow-2xs flex flex-col justify-between`}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`h-11 w-11 sm:h-12 sm:w-12 rounded-2xl ${stat.iconBox} flex items-center justify-center shadow-lg shrink-0`}
                >
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.2]" />
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${stat.badgeClass}`}
                >
                  {stat.badge}
                </span>
              </div>

              <div className="mt-4">
                <p className="std-text-primary text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                  {stat.value}
                </p>
                <p className="std-text-primary text-xs sm:text-sm font-extrabold text-gray-800 mt-0.5 truncate">
                  {stat.title}
                </p>
                <p className={`text-[11px] font-bold mt-0.5 truncate ${stat.textAccent}`}>
                  {stat.subtitle}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ================================================================== */}
      {/* 📌 3. ២ កាតទន្ទឹមគ្នា៖ កិច្ចការសិក្សា និង កម្រងសំណួរ (Static Display)    */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-stretch">
        
        {/* ៣.១. កាតកិច្ចការថ្មីៗ */}
        <div className="std-surface-card bg-white rounded-[1.75rem] border border-gray-200/80 shadow-sm p-5 sm:p-7 flex flex-col justify-between h-full">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-gray-100 std-card-divider">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20 shrink-0">
                  <ClipboardDocumentListIcon className="h-6 w-6 stroke-[2]" />
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                    {t('កិច្ចការសាលា', 'Course Homework')}
                  </span>
                  <h3 className="std-text-primary text-lg sm:text-xl font-black text-gray-900 truncate mt-0.5">
                    {t('កិច្ចការថ្មីៗ', 'Recent Assignments')}
                  </h3>
                </div>
              </div>

              <span className="px-3.5 py-1.5 rounded-full text-xs font-black bg-purple-50 text-purple-700 border border-purple-200/80 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30 shrink-0">
                {doneHomeworkCount} / {teacherAssignedHomework.length}{' '}
                {t('ធ្វើរួច', 'Done')}
              </span>
            </div>

            <div className="space-y-3">
              {teacherAssignedHomework.length === 0 ? (
                <div className="std-empty-box py-12 px-4 text-center bg-gray-50/70 rounded-2xl border border-dashed border-gray-200 space-y-2.5">
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
                    assign.total_score || assign.marks || 100,
                    100
                  );
                  const courseName =
                    assign.course?.course_name ||
                    assign.course_name ||
                    t('មុខវិជ្ជាសិក្សា', 'Course');

                  return (
                    <div
                      key={assign.id || idx}
                      className="std-activity-item flex items-center justify-between gap-3.5 p-3.5 sm:p-4 rounded-2xl border border-gray-100 bg-gray-50/60 transition-all"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div
                          className={`h-11 w-11 rounded-xl border flex items-center justify-center shrink-0 ${
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
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-semibold">
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold truncate max-w-[140px]">
                              {courseName}
                            </span>
                            <span className="text-gray-300 dark:text-slate-600">•</span>
                            <span className="std-text-secondary text-gray-500 flex items-center gap-1">
                              <CalendarDaysIcon className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                              <span>
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
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                              <CheckCircleIcon className="h-3.5 w-3.5 stroke-[2.5]" />
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
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30">
                            <ExclamationCircleIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                            <span>{t('ហួសកំណត់', 'Overdue')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                            <ClockIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                            <span>{t('មិនទាន់ធ្វើ', 'Not Done Yet')}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="std-card-divider pt-4 mt-5 border-t border-gray-100 flex items-center justify-between text-xs">
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
        <div className="std-surface-card bg-white rounded-[1.75rem] border border-gray-200/80 shadow-sm p-5 sm:p-7 flex flex-col justify-between h-full">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-gray-100 std-card-divider">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                  <PencilSquareIcon className="h-6 w-6 stroke-[2]" />
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    {t('តេស្តវាយតម្លៃសមត្ថភាព', 'Course Assessments')}
                  </span>
                  <h3 className="std-text-primary text-lg sm:text-xl font-black text-gray-900 truncate mt-0.5">
                    {t('កម្រងសំណួរថ្មីៗ', 'Recent Quizzes')}
                  </h3>
                </div>
              </div>

              <span className="px-3.5 py-1.5 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 shrink-0">
                {doneQuizzesCount} / {teacherAssignedQuizzes.length}{' '}
                {t('ធ្វើរួច', 'Done')}
              </span>
            </div>

            <div className="space-y-3">
              {teacherAssignedQuizzes.length === 0 ? (
                <div className="std-empty-box py-12 px-4 text-center bg-gray-50/70 rounded-2xl border border-dashed border-gray-200 space-y-2.5">
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
                    quiz.total_mark || quiz.total_marks || 100,
                    100
                  );
                  const courseName =
                    quiz.course?.course_name ||
                    quiz.course_name ||
                    t('មុខវិជ្ជាសិក្សា', 'Course');

                  return (
                    <div
                      key={quiz.id || idx}
                      className="std-activity-item flex items-center justify-between gap-3.5 p-3.5 sm:p-4 rounded-2xl border border-gray-100 bg-gray-50/60 transition-all"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div
                          className={`h-11 w-11 rounded-xl border flex items-center justify-center shrink-0 ${
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
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-semibold">
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold truncate max-w-[140px]">
                              {courseName}
                            </span>
                            <span className="text-gray-300 dark:text-slate-600">•</span>
                            <span className="std-text-secondary text-gray-500 flex items-center gap-1">
                              <ClockIcon className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              <span>
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
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                              <CheckCircleIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                              <span>{t('ធ្វើរួចហើយ', 'Completed')}</span>
                            </span>
                            <span className="text-[11px] font-black text-amber-600 dark:text-amber-400">
                              {formatCleanScore(att?.score)} / {totalMark}{' '}
                              {t('ពិន្ទុ', 'pts')}
                            </span>
                          </>
                        ) : quiz.isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30">
                            <ExclamationCircleIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                            <span>{t('ហួសកំណត់', 'Expired')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                            <ClockIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                            <span>{t('មិនទាន់ធ្វើ', 'Not Done Yet')}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="std-card-divider pt-4 mt-5 border-t border-gray-100 flex items-center justify-between text-xs">
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
      {/* 📌 4. CSS សម្រាប់ចលនាទឹករលកក្នុងកងមូល (LIQUID WAVE) និង DARK MODE      */}
      {/* ================================================================== */}
      <style>{`
        .std-hero-grid-pattern {
          background-image: radial-gradient(rgba(255, 255, 255, 0.25) 1px, transparent 1px);
          background-size: 20px 20px;
        }

        @keyframes carouselSlideFade {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .std-carousel-slide {
          animation: carouselSlideFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes stdLiquidSpin {
          0% {
            transform: translate(-50%, 0) rotate(0deg);
          }
          100% {
            transform: translate(-50%, 0) rotate(360deg);
          }
        }
        .std-liquid-wave-front {
          top: -8px;
          animation: stdLiquidSpin 6s linear infinite;
        }
        .std-liquid-wave-back {
          top: -12px;
          animation: stdLiquidSpin 9s linear infinite reverse;
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
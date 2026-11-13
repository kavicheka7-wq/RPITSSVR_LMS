// src/components/student/StudentLessons.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  BookOpenIcon,
  ArrowDownTrayIcon,
  PlayIcon,
  FolderOpenIcon,
  DocumentIcon,
  VideoCameraIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  AcademicCapIcon,
  SparklesIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckBadgeIcon,
  ArrowTopRightOnSquareIcon,
  BuildingLibraryIcon,
  DocumentTextIcon,
  PlayCircleIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនីសិស្សម្នាក់ៗ (User-Scoped 0ms Cache v12)
// ============================================================================
const LAST_ACTIVE_STUDENT_UID_KEY = 'lms_last_active_student_uid';

const CACHE_KEY_SHARED_LESSONS = 'cached_student_dept_lessons_v12';
const CACHE_KEY_SHARED_DEPT_COURSES = 'cached_student_dept_courses_all_years_v12';
const CACHE_KEY_SHARED_ENROLLMENTS = 'cached_student_dashboard_enrollments_v8';
const CACHE_KEY_SHARED_COURSES = 'cached_student_courses_list_v3';
const CACHE_KEY_TEACHER_AVATARS = 'cached_student_teacher_avatars_v1';

const getLessonsCacheKey = (uid) => `cached_student_dept_lessons_v12_${uid}`;
const getDeptCoursesCacheKey = (uid) => `cached_student_dept_courses_v12_${uid}`;
const getEnrollmentsCacheKey = (uid) => `cached_student_dashboard_enrollments_v10_${uid}`;
const getCoursesCacheKey = (uid) => `cached_student_courses_list_v10_${uid}`;
const getScoresCacheKey = (uid) => `cached_student_scores_list_v10_${uid}`;
const getStudentYearCacheKey = (uid) => `cached_student_current_year_v12_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់សិស្សម្នាក់ៗ + រក្សារូបថតគ្រូក្នុង RAM (0ms)
const STUDENT_LESSONS_MEM_CACHE = {
  uid: null,
  lessons: null,
  deptCourses: null,
  studentYear: null,
  teacherAvatarMap: null,
  fileCacheByPath: {},
  lastSyncedAt: 0,
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

// ✅ អានតារាងរូបថតគ្រូបង្រៀន (Teacher Avatar Dictionary) ពី RAM ឬ Storage ភ្លាមៗក្នុង 0ms
const getTeacherAvatarMapSync = () => {
  if (
    STUDENT_LESSONS_MEM_CACHE.teacherAvatarMap &&
    typeof STUDENT_LESSONS_MEM_CACHE.teacherAvatarMap === 'object'
  ) {
    return STUDENT_LESSONS_MEM_CACHE.teacherAvatarMap;
  }
  const stored = readStorageJson(CACHE_KEY_TEACHER_AVATARS, {});
  STUDENT_LESSONS_MEM_CACHE.teacherAvatarMap =
    stored && typeof stored === 'object' ? stored : {};
  return STUDENT_LESSONS_MEM_CACHE.teacherAvatarMap;
};

// ✅ បង្រួមរូបថតគ្រូបង្រៀនមកត្រឹម 80x80px (~2KB) ទុកក្នុង Dictionary សម្រាប់បង្ហាញក្នុង 0ms
const compressTeacherAvatarAsync = (keyId, rawDataUrl, onDone) => {
  if (!keyId || !rawDataUrl || typeof rawDataUrl !== 'string') return;
  const map = getTeacherAvatarMapSync();

  if (!rawDataUrl.startsWith('data:image') || rawDataUrl.length < 12000) {
    map[keyId] = rawDataUrl;
    if (typeof onDone === 'function') onDone(keyId, rawDataUrl);
    return;
  }

  if (!map[keyId]) {
    map[keyId] = rawDataUrl;
  }

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const maxSize = 80;
        let w = img.width || maxSize;
        let h = img.height || maxSize;
        if (w > h) {
          if (w > maxSize) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          }
        } else {
          if (h > maxSize) {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const tinyWebp = canvas.toDataURL('image/webp', 0.8);
        const bestImg =
          tinyWebp.length < rawDataUrl.length ? tinyWebp : rawDataUrl;
        map[keyId] = bestImg;
        if (typeof onDone === 'function') onDone(keyId, bestImg);
      } catch {}
    };
    img.src = rawDataUrl;
  } catch {}
};

// ✅ សម្អាតជួរឈរ file_data (Base64 ឯកសារមេរៀនធំៗ) និងរូបភាពធំៗមុនពេល Save ចូល localStorage ការពារ QuotaExceededError 100%
const persistStudentLessonsSafely = (uid, lessonsList, deptCoursesList) => {
  const avatarMap = getTeacherAvatarMapSync();
  let pendingCount = 0;

  const saveAvatarMap = () => {
    try {
      const str = JSON.stringify(avatarMap);
      sessionStorage.setItem(CACHE_KEY_TEACHER_AVATARS, str);
      localStorage.setItem(CACHE_KEY_TEACHER_AVATARS, str);
    } catch {}
  };

  const stripPersonAvatar = (person) => {
    if (!person || typeof person !== 'object') return person;
    const copy = { ...person };
    if (
      typeof copy.profile_image === 'string' &&
      copy.profile_image.startsWith('data:') &&
      copy.profile_image.length > 12000
    ) {
      copy.profile_image = null;
    }
    if (copy.user && typeof copy.user === 'object') {
      const uCopy = { ...copy.user };
      if (
        typeof uCopy.profile_image === 'string' &&
        uCopy.profile_image.startsWith('data:') &&
        uCopy.profile_image.length > 12000
      ) {
        uCopy.profile_image = null;
      }
      copy.user = uCopy;
    }
    return copy;
  };

  const slimCourseObj = (crs) => {
    if (!crs || typeof crs !== 'object') return crs;
    const cid = String(crs.id || crs.course_id || '');
    const tchId = String(crs.teacher?.id || crs.teacher_id || '');
    const rawImg =
      crs.teacher?.profile_image_url ||
      crs.teacher?.profile_image ||
      crs.teacher?.user?.profile_image ||
      crs.teacher_profile?.profile_image ||
      null;

    if (rawImg && cid) {
      pendingCount++;
      compressTeacherAvatarAsync(`crs_${cid}`, rawImg, (_, best) => {
        if (tchId) avatarMap[`tch_${tchId}`] = best;
        pendingCount--;
        if (pendingCount <= 0) saveAvatarMap();
      });
    }

    const copy = { ...crs };
    if (copy.teacher) copy.teacher = stripPersonAvatar(copy.teacher);
    if (copy.teacher_profile) {
      copy.teacher_profile = stripPersonAvatar(copy.teacher_profile);
    }
    return copy;
  };

  if (Array.isArray(deptCoursesList) && deptCoursesList.length > 0) {
    const slimDept = deptCoursesList.map(slimCourseObj);
    try {
      const deptStr = JSON.stringify(slimDept);
      sessionStorage.setItem(getDeptCoursesCacheKey(uid), deptStr);
      localStorage.setItem(getDeptCoursesCacheKey(uid), deptStr);
      localStorage.setItem(CACHE_KEY_SHARED_DEPT_COURSES, deptStr);
    } catch {}
  }

  if (Array.isArray(lessonsList)) {
    const slimLessons = lessonsList.map((lsn) => {
      if (!lsn || typeof lsn !== 'object') return lsn;
      const copy = { ...lsn };
      if (copy.course) copy.course = slimCourseObj(copy.course);
      if (copy.teacher) copy.teacher = stripPersonAvatar(copy.teacher);
      if (Array.isArray(copy.files)) {
        copy.files = copy.files.map((f) => {
          if (!f || typeof f !== 'object') return f;
          const { file_data, ...restFile } = f;
          return restFile;
        });
      }
      return copy;
    });

    try {
      const lsnStr = JSON.stringify(slimLessons);
      sessionStorage.setItem(getLessonsCacheKey(uid), lsnStr);
      localStorage.setItem(getLessonsCacheKey(uid), lsnStr);
      localStorage.setItem(CACHE_KEY_SHARED_LESSONS, lsnStr);
    } catch {}
  }

  if (pendingCount === 0) {
    saveAvatarMap();
  } else {
    setTimeout(saveAvatarMap, 300);
  }
};

// ✅ អនុគមន៍ចាប់យកអត្តសញ្ញាណសិស្សឱ្យជាក់លាក់តាំងពីវិនាទីដំបូង (គាំទ្រទាំង sessionStorage និង localStorage)
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

// ✅ អនុគមន៍សម្អាត Cache ចាស់របស់សិស្សមុន នៅពេលមានសិស្សថ្មី Login ចូលលើ Browser តែមួយ
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
        'cached_student_dept_lessons_v8',
        'cached_student_dept_lessons_v12',
        'cached_student_dept_courses_all_years_v10',
        'cached_student_dept_courses_all_years_v12',
        'cached_student_assignments_list_v5',
        'cached_student_quizzes_list_v5',
        'cached_student_scores_list_v5',
        'cached_student_attendance_list_v3',
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

const FOLDER_THEMES = [
  {
    topBar: 'from-blue-600 to-indigo-600',
    iconBg: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
    avatarBg: 'from-blue-500 to-indigo-600',
  },
  {
    topBar: 'from-emerald-500 to-teal-600',
    iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    avatarBg: 'from-emerald-500 to-teal-600',
  },
  {
    topBar: 'from-purple-600 to-violet-600',
    iconBg: 'bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30',
    avatarBg: 'from-purple-500 to-fuchsia-600',
  },
  {
    topBar: 'from-amber-500 to-orange-500',
    iconBg: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    avatarBg: 'from-amber-500 to-orange-600',
  },
];

// ============================================================================
// 📌 ផ្នែកទី២៖ អនុគមន៍ជំនួយសម្រាប់កំណត់ឆ្នាំសិក្សា (១-៤), វេនសិក្សា, ប្រភេទឯកសារ និង YouTube
// ============================================================================
const detectCurrentStudentYear = (contextUser) => {
  let u = contextUser;
  if (!u) {
    try {
      const raw =
        sessionStorage.getItem('user') ||
        sessionStorage.getItem('auth_user') ||
        localStorage.getItem('user') ||
        localStorage.getItem('auth_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        u = parsed?.user || parsed?.data || parsed;
      }
    } catch {}
  }

  const combinedText = `${u?.batch_year ?? ''} ${u?.student?.batch_year ?? ''} ${u?.year ?? ''} ${u?.student?.year ?? ''} ${u?.academic_year ?? ''} ${u?.student?.academic_year ?? ''} ${u?.student_code ?? ''} ${u?.student?.student_code ?? ''} ${u?.email ?? ''} ${u?.student?.email ?? ''} ${u?.name ?? ''}`.toLowerCase();

  if (
    /ឆ្នាំទី\s*[៤4]|year\s*[-_]?\s*[4៤]|(?:^|[^0-9a-z])y(?:ear)?[-_]?4(?:[^0-9a-z]|$)/i.test(
      combinedText
    ) ||
    String(u?.batch_year || '').trim() === '4' ||
    String(u?.batch_year || '').trim() === '៤'
  ) {
    return '4';
  }
  if (
    /ឆ្នាំទី\s*[៣3]|year\s*[-_]?\s*[3៣]|(?:^|[^0-9a-z])y(?:ear)?[-_]?3(?:[^0-9a-z]|$)/i.test(
      combinedText
    ) ||
    String(u?.batch_year || '').trim() === '3' ||
    String(u?.batch_year || '').trim() === '៣'
  ) {
    return '3';
  }
  if (
    /ឆ្នាំទី\s*[២2]|year\s*[-_]?\s*[2២]|(?:^|[^0-9a-z])y(?:ear)?[-_]?2(?:[^0-9a-z]|$)/i.test(
      combinedText
    ) ||
    String(u?.batch_year || '').trim() === '2' ||
    String(u?.batch_year || '').trim() === '២'
  ) {
    return '2';
  }
  if (
    /ឆ្នាំទី\s*[១1]|year\s*[-_]?\s*[1១]|(?:^|[^0-9a-z])y(?:ear)?[-_]?1(?:[^0-9a-z]|$)/i.test(
      combinedText
    ) ||
    String(u?.batch_year || '').trim() === '1' ||
    String(u?.batch_year || '').trim() === '១'
  ) {
    return '1';
  }

  const startYearMatch = combinedText.match(/\b(202[0-9])\b/);
  if (startYearMatch) {
    const startYear = Number(startYearMatch[1]);
    const currentYear = new Date().getFullYear();
    const diff = currentYear - startYear + 1;
    if (diff >= 1 && diff <= 4) return String(diff);
  }

  return '1';
};

const detectExplicitYearFromObj = (lessonObj) => {
  if (!lessonObj) return null;
  const course = lessonObj.course || lessonObj;

  const directYear =
    lessonObj?.year ??
    course?.year ??
    course?.academic_year ??
    course?.year_level ??
    '';
  const dyStr = String(directYear).trim().toLowerCase();
  if (dyStr === '4' || dyStr === '៤' || /ឆ្នាំទី\s*[៤4]|year\s*4|\by4\b/.test(dyStr)) return '4';
  if (dyStr === '3' || dyStr === '៣' || /ឆ្នាំទី\s*[៣3]|year\s*3|\by3\b/.test(dyStr)) return '3';
  if (dyStr === '2' || dyStr === '២' || /ឆ្នាំទី\s*[២2]|year\s*2|\by2\b/.test(dyStr)) return '2';
  if (dyStr === '1' || dyStr === '១' || /ឆ្នាំទី\s*[១1]|year\s*1|\by1\b/.test(dyStr)) return '1';

  const combinedText = `${course?.course_name || ''} ${course?.description || ''} ${lessonObj?.title || ''}`.toLowerCase();
  if (/ឆ្នាំទី\s*[៤4]|year\s*4|\by4\b/.test(combinedText)) return '4';
  if (/ឆ្នាំទី\s*[៣3]|year\s*3|\by3\b/.test(combinedText)) return '3';
  if (/ឆ្នាំទី\s*[២2]|year\s*2|\by2\b/.test(combinedText)) return '2';
  if (/ឆ្នាំទី\s*[១1]|year\s*1|\by1\b/.test(combinedText)) return '1';

  const code = String(course?.course_code || '').trim();
  const threeDigitMatch = code.match(/[A-Za-z]+[-_\s]*([1-4])\d{2}\b/);
  if (threeDigitMatch) return threeDigitMatch[1];

  const yCodeMatch = code.match(/y([1-4])/i);
  if (yCodeMatch) return yCodeMatch[1];

  return null;
};

const extractApplicableYears = (
  obj,
  isEnrolledCourse = false,
  studentYearFallback = '1'
) => {
  const course = obj?.course || obj || {};
  const rawList =
    (Array.isArray(obj?.years_list) && obj.years_list.length > 0
      ? obj.years_list
      : null) ||
    (Array.isArray(course?.years_list) && course.years_list.length > 0
      ? course.years_list
      : null);

  if (rawList) {
    return Array.from(new Set(rawList.map((y) => String(y).trim())));
  }

  const explicitY = detectExplicitYearFromObj(obj);
  if (explicitY) return [explicitY];

  if (isEnrolledCourse && studentYearFallback) {
    return [String(studentYearFallback)];
  }

  return ['1'];
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

const getFileTypeMeta = (fileName) => {
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') {
    return {
      ext,
      extLabel: 'PDF',
      iconEmoji: '📕',
      badgeClass:
        'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
      iconBoxClass:
        'from-rose-500/15 to-red-500/10 border-rose-200/70 text-rose-600 dark:border-rose-500/30',
      bannerGradient:
        'from-rose-50 via-red-50/70 to-orange-50/50 dark:from-rose-950/50 dark:via-slate-900 dark:to-slate-900',
    };
  }
  if (ext === 'doc' || ext === 'docx') {
    return {
      ext,
      extLabel: 'WORD',
      iconEmoji: '📘',
      badgeClass:
        'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
      iconBoxClass:
        'from-blue-500/15 to-indigo-500/10 border-blue-200/70 text-blue-600 dark:border-blue-500/30',
      bannerGradient:
        'from-blue-50 via-indigo-50/70 to-cyan-50/50 dark:from-blue-950/50 dark:via-slate-900 dark:to-slate-900',
    };
  }
  if (ext === 'ppt' || ext === 'pptx') {
    return {
      ext,
      extLabel: 'SLIDE',
      iconEmoji: '📙',
      badgeClass:
        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
      iconBoxClass:
        'from-amber-500/15 to-orange-500/10 border-amber-200/70 text-amber-600 dark:border-amber-500/30',
      bannerGradient:
        'from-amber-50 via-orange-50/70 to-yellow-50/50 dark:from-amber-950/50 dark:via-slate-900 dark:to-slate-900',
    };
  }
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
    return {
      ext,
      extLabel: 'EXCEL',
      iconEmoji: '📗',
      badgeClass:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
      iconBoxClass:
        'from-emerald-500/15 to-teal-500/10 border-emerald-200/70 text-emerald-600 dark:border-emerald-500/30',
      bannerGradient:
        'from-emerald-50 via-teal-50/70 to-green-50/50 dark:from-emerald-950/50 dark:via-slate-900 dark:to-slate-900',
    };
  }
  return {
    ext,
    extLabel: ext ? ext.toUpperCase() : 'FILE',
    iconEmoji: '📄',
    badgeClass:
      'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
    iconBoxClass:
      'from-indigo-500/15 to-violet-500/10 border-indigo-200/70 text-indigo-600 dark:border-indigo-500/30',
    bannerGradient:
      'from-indigo-50 via-violet-50/70 to-blue-50/50 dark:from-indigo-950/50 dark:via-slate-900 dark:to-slate-900',
  };
};

const extractYouTubeId = (url) => {
  if (!url) return null;
  const regExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
  const match = String(url).match(regExp);
  return match && match[2] && match[2].length === 11 ? match[2] : null;
};

const getTeacherInitials = (nameStr) => {
  if (!nameStr) return 'T';
  const parts = nameStr.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }
  return (parts[0]?.[0] || 'T').toUpperCase();
};

const StudentLessons = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [failedAvatars, setFailedAvatars] = useState({});

  const currentStudentId = useMemo(() => {
    const uid = resolveStudentUid(user);
    ensureCleanStudentSessionCache(uid);
    return uid;
  }, [user]);

  if (
    STUDENT_LESSONS_MEM_CACHE.uid &&
    STUDENT_LESSONS_MEM_CACHE.uid !== currentStudentId
  ) {
    STUDENT_LESSONS_MEM_CACHE.lessons = null;
    STUDENT_LESSONS_MEM_CACHE.deptCourses = null;
    STUDENT_LESSONS_MEM_CACHE.studentYear = null;
    STUDENT_LESSONS_MEM_CACHE.lastSyncedAt = 0;
  }
  STUDENT_LESSONS_MEM_CACHE.uid = currentStudentId;

  const initialCourseIdFromRoute =
    searchParams.get('course_id') || location.state?.courseId || 'all';

  const [lessons, setLessons] = useState(() => {
    if (Array.isArray(STUDENT_LESSONS_MEM_CACHE.lessons)) {
      return STUDENT_LESSONS_MEM_CACHE.lessons;
    }
    const fromUserKey = readStorageJson(
      getLessonsCacheKey(currentStudentId),
      null
    );
    if (Array.isArray(fromUserKey)) {
      STUDENT_LESSONS_MEM_CACHE.lessons = fromUserKey;
      return fromUserKey;
    }
    const fromShared = readStorageJson(CACHE_KEY_SHARED_LESSONS, []);
    STUDENT_LESSONS_MEM_CACHE.lessons = fromShared;
    return fromShared;
  });

  const [deptCourses, setDeptCourses] = useState(() => {
    if (Array.isArray(STUDENT_LESSONS_MEM_CACHE.deptCourses)) {
      return STUDENT_LESSONS_MEM_CACHE.deptCourses;
    }
    const fromUserKey = readStorageJson(
      getDeptCoursesCacheKey(currentStudentId),
      null
    );
    if (Array.isArray(fromUserKey)) {
      STUDENT_LESSONS_MEM_CACHE.deptCourses = fromUserKey;
      return fromUserKey;
    }
    return readStorageJson(CACHE_KEY_SHARED_DEPT_COURSES, []);
  });

  // ✅ រក្សាទុកឆ្នាំសិក្សាបច្ចុប្បន្នរបស់សិស្សដែលបញ្ជូនមកពី Backend (StudentController)
  const [apiStudentYear, setApiStudentYear] = useState(() => {
    if (STUDENT_LESSONS_MEM_CACHE.studentYear) {
      return STUDENT_LESSONS_MEM_CACHE.studentYear;
    }
    try {
      return (
        sessionStorage.getItem(getStudentYearCacheKey(currentStudentId)) ||
        localStorage.getItem(getStudentYearCacheKey(currentStudentId)) ||
        null
      );
    } catch {
      return null;
    }
  });

  const studentCurrentYear = useMemo(() => {
    if (
      apiStudentYear &&
      ['1', '2', '3', '4'].includes(String(apiStudentYear))
    ) {
      return String(apiStudentYear);
    }
    const fromLesson = lessons[0]?.student_current_year;
    if (fromLesson && ['1', '2', '3', '4'].includes(String(fromLesson))) {
      return String(fromLesson);
    }
    return detectCurrentStudentYear(user);
  }, [apiStudentYear, lessons, user]);

  // State សម្រាប់ Expandable Search និង Scroll ឈ្មោះគ្រូ
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);
  const teacherScrollRef = useRef(null);

  const [activeTab, setActiveTab] = useState('documents');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedTeacherKey, setSelectedTeacherKey] = useState('all');
  const [selectedCourseId, setSelectedCourseId] = useState(
    String(initialCourseIdFromRoute)
  );

  const [downloadingFileId, setDownloadingFileId] = useState(null);
  const [playingVideo, setPlayingVideo] = useState(null);

  // ✅ ចាក់សោរការអូសទំព័រខាងក្រោយ (Lock Body Scroll) នៅពេលបើកផ្ទាំងចាក់វីដេអូ
  useEffect(() => {
    if (playingVideo) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [playingVideo]);

  // ✅ អនុគមន៍រំកិលបញ្ជីឈ្មោះគ្រូទៅឆ្វេង-ស្ដាំ នៅពេលមានឈ្មោះគ្រូច្រើននាក់
  const handleScrollTeacherBar = (direction) => {
    if (!teacherScrollRef.current) return;
    const scrollAmount = direction === 'left' ? -240 : 240;
    teacherScrollRef.current.scrollBy({
      left: scrollAmount,
      behavior: 'smooth',
    });
  };

  const studentDeptName = useMemo(() => {
    const fromUser =
      user?.department?.department_name ||
      user?.department?.name ||
      user?.student?.department?.department_name ||
      user?.student?.department?.name;
    if (fromUser) return fromUser;

    const firstCourseDept =
      lessons[0]?.course?.department?.department_name ||
      lessons[0]?.course?.department?.name ||
      deptCourses[0]?.department?.department_name ||
      deptCourses[0]?.department?.name;
    return firstCourseDept || t('វិទ្យាសាស្ត្រកុំព្យូទ័រ', 'Computer Science');
  }, [user, lessons, deptCourses, t]);

  const studentStudyShiftKey = useMemo(() => {
    const rawShift =
      user?.study_shift ||
      user?.student?.study_shift ||
      lessons[0]?.student_study_shift ||
      'Monday-Friday';
    return normalizeShiftKey(rawShift);
  }, [user, lessons]);

  const isWeekendShift = studentStudyShiftKey === 'Saturday-Sunday';

  const studentStudyShiftLabel = useMemo(() => {
    if (language === 'km') {
      return isWeekendShift ? 'វេនសិក្សា៖ សៅរ៍-អាទិត្យ' : 'វេនសិក្សា៖ ចន្ទ-សុក្រ';
    }
    return isWeekendShift ? 'Shift: Sat-Sun' : 'Shift: Mon-Fri';
  }, [isWeekendShift, language]);

  const enrolledCourseIdsSet = useMemo(() => {
    const set = new Set();
    const cachedEnr =
      readStorageJson(getEnrollmentsCacheKey(currentStudentId), null) ||
      readStorageJson(getCoursesCacheKey(currentStudentId), null) ||
      readStorageJson(CACHE_KEY_SHARED_ENROLLMENTS, []);
    if (Array.isArray(cachedEnr)) {
      cachedEnr.forEach((item) => {
        const cid = item?.course_id || item?.course?.id || item?.id;
        if (cid) set.add(String(cid));
      });
    }
    lessons.forEach((l) => {
      if (l.is_enrolled === true && (l.course?.id || l.course_id)) {
        set.add(String(l.course?.id || l.course_id));
      }
    });
    deptCourses.forEach((c) => {
      if (c.is_enrolled === true && (c.id || c.course_id)) {
        set.add(String(c.id || c.course_id));
      }
    });
    return set;
  }, [lessons, deptCourses, currentStudentId]);

  useEffect(() => {
    const routeCid = searchParams.get('course_id') || location.state?.courseId;
    if (routeCid) {
      setSelectedCourseId(String(routeCid));
    }
  }, [searchParams, location.state]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target) &&
        !searchQuery.trim()
      ) {
        setIsSearchExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchQuery]);

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ អនុគមន៍ជំនួយសម្រាប់ទាញឈ្មោះ និងរូបថតគ្រូបង្រៀនប្រចាំមុខវិជ្ជានីមួយៗ
  // ============================================================================
  const getViewUrl = useCallback((path) => {
    if (!path || typeof path !== 'string') return '#';
    const trimmed = path.trim();
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
    return `${backendBase}/storage/${cleanPath}`;
  }, []);

  // ✅ គាំទ្រទាំងរូបភាព Base64 Data URI ក្នុង Database លើ Railway និង URL ធម្មតា
  const getImageUrl = useCallback((path) => {
    if (!path || typeof path !== 'string') return null;
    const trimmed = path.trim();
    if (!trimmed) return null;
    if (
      trimmed.startsWith('data:') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('blob:')
    ) {
      return trimmed;
    }
    const baseUrl = (
      import.meta.env.VITE_API_URL ||
      api.defaults?.baseURL ||
      'http://localhost:8000/api'
    ).replace(/\/api\/?$/, '');
    const cleanPath = trimmed.replace(/^\/?storage\//, '').replace(/^\/+/, '');
    return `${baseUrl}/storage/${cleanPath}`;
  }, []);

  const resolveCourseTeacherMeta = useCallback(
    (courseObj, fallbackCourseId = '') => {
      const cid = String(
        courseObj?.id || courseObj?.course_id || fallbackCourseId || ''
      );
      let tch = courseObj?.teacher;
      let tchProfile = courseObj?.teacher_profile || courseObj?.teacherProfile;

      if (cid) {
        const fromDeptCourses = (deptCourses || []).find(
          (item) => String(item?.id || item?.course_id) === cid
        );
        if (fromDeptCourses) {
          if (!tch || !tch.name || tch.name === 'គ្រូបង្រៀន') {
            tch = fromDeptCourses.teacher || tch;
          }
          if (
            !tchProfile ||
            !tchProfile.name ||
            tchProfile.name === 'គ្រូបង្រៀន'
          ) {
            tchProfile =
              fromDeptCourses.teacher_profile ||
              fromDeptCourses.teacherProfile ||
              tchProfile;
          }
        }
      }

      if (!tch && !tchProfile && cid) {
        const cachedCourses =
          readStorageJson(getCoursesCacheKey(currentStudentId), null) ||
          readStorageJson(getEnrollmentsCacheKey(currentStudentId), null) ||
          readStorageJson(CACHE_KEY_SHARED_COURSES, []);
        if (Array.isArray(cachedCourses)) {
          const matchedCrs = cachedCourses.find(
            (item) =>
              String(item?.course_id || item?.course?.id || item?.id) === cid
          );
          const cInfo = matchedCrs?.course || matchedCrs;
          if (cInfo) {
            tch = cInfo.teacher;
            tchProfile = cInfo.teacher_profile || cInfo.teacherProfile;
          }
        }
      }

      let teacherName = '';
      if (tchProfile) {
        if (tchProfile.full_name && tchProfile.full_name !== 'គ្រូបង្រៀន') {
          teacherName = tchProfile.full_name;
        } else if (tchProfile.first_name || tchProfile.last_name) {
          teacherName =
            `${tchProfile.first_name || ''} ${tchProfile.last_name || ''}`.trim();
        } else if (tchProfile.name && tchProfile.name !== 'គ្រូបង្រៀន') {
          teacherName = tchProfile.name;
        }
      }

      if (!teacherName && tch) {
        if (tch.full_name && tch.full_name !== 'គ្រូបង្រៀន') {
          teacherName = tch.full_name;
        } else if (tch.first_name || tch.last_name) {
          teacherName = `${tch.first_name || ''} ${tch.last_name || ''}`.trim();
        } else if (tch.user?.first_name || tch.user?.last_name) {
          teacherName =
            `${tch.user.first_name || ''} ${tch.user.last_name || ''}`.trim();
        } else if (tch.name && tch.name !== 'គ្រូបង្រៀន') {
          teacherName = tch.name;
        } else if (tch.user?.name) {
          teacherName = tch.user.name;
        }
      }

      if (!teacherName) {
        teacherName = courseObj?.teacher_name || t('គ្រូបង្រៀន', 'Instructor');
      }

      const avatarMap = getTeacherAvatarMapSync();
      const tchId = String(
        courseObj?.teacher_id || tch?.id || tchProfile?.id || ''
      );

      let rawImg =
        (cid && avatarMap[`crs_${cid}`]) ||
        (tchId && avatarMap[`tch_${tchId}`]) ||
        tchProfile?.profile_image_url ||
        tchProfile?.profile_image ||
        tchProfile?.user?.profile_image ||
        tch?.profile_image_url ||
        tch?.profile_image ||
        tch?.user?.profile_image_url ||
        tch?.user?.profile_image ||
        courseObj?.teacher_image ||
        null;

      if (!rawImg && cid) {
        const cachedScores =
          readStorageJson(getScoresCacheKey(currentStudentId), null) ||
          readStorageJson('cached_student_scores_list_v5', []);
        if (Array.isArray(cachedScores)) {
          const matchScore = cachedScores.find(
            (s) => String(s?.course_id || s?.course?.id) === cid
          );
          rawImg =
            matchScore?.course?.teacher?.profile_image_url ||
            matchScore?.course?.teacher?.profile_image ||
            matchScore?.course?.teacher?.user?.profile_image ||
            matchScore?.course?.teacher_profile?.profile_image_url ||
            matchScore?.course?.teacher_profile?.profile_image ||
            null;
        }
      }

      const rawKey =
        tchProfile?.teacher_key ||
        tch?.teacher_key ||
        (teacherName &&
        teacherName !== 'គ្រូបង្រៀន' &&
        teacherName !== 'Instructor'
          ? `name_${teacherName.toLowerCase().trim()}`
          : courseObj?.teacher_id ||
            tch?.id ||
            tchProfile?.id ||
            'default_teacher');

      return {
        key: String(rawKey),
        name: teacherName,
        initials: getTeacherInitials(teacherName),
        imageUrl: getImageUrl(rawImg),
        specialization:
          tchProfile?.specialization || tch?.specialization || null,
      };
    },
    [currentStudentId, deptCourses, getImageUrl, t]
  );

  // ============================================================================
  // 📌 ផ្នែកទី៤៖ ទាញយកមេរៀនគ្រប់ឆ្នាំសិក្សាពី Backend ដោយមិនរាំងស្ទះ UI
  // ============================================================================
  const fetchLessons = useCallback(
    async (forceRefresh = false) => {
      const now = Date.now();
      const cachedForUser =
        STUDENT_LESSONS_MEM_CACHE.lessons !== null
          ? STUDENT_LESSONS_MEM_CACHE.lessons
          : readStorageJson(getLessonsCacheKey(currentStudentId), null);

      const cachedDeptCrs =
        STUDENT_LESSONS_MEM_CACHE.deptCourses !== null
          ? STUDENT_LESSONS_MEM_CACHE.deptCourses
          : readStorageJson(getDeptCoursesCacheKey(currentStudentId), null);

      if (Array.isArray(cachedForUser) && cachedForUser.length > 0) {
        setLessons(cachedForUser);
        STUDENT_LESSONS_MEM_CACHE.lessons = cachedForUser;
      }
      if (Array.isArray(cachedDeptCrs) && cachedDeptCrs.length > 0) {
        setDeptCourses(cachedDeptCrs);
        STUDENT_LESSONS_MEM_CACHE.deptCourses = cachedDeptCrs;
      }

      if (
        !forceRefresh &&
        STUDENT_LESSONS_MEM_CACHE.uid === currentStudentId &&
        Array.isArray(cachedForUser) &&
        cachedForUser.length > 0 &&
        now - STUDENT_LESSONS_MEM_CACHE.lastSyncedAt < 25000
      ) {
        return;
      }

      try {
        let validLessons = [];
        let validDeptCourses = [];

        try {
          const response = await api.get('/student/lessons');
          const rawData = response.data?.data ?? response.data ?? [];
          validLessons = Array.isArray(rawData) ? rawData : [];
          if (Array.isArray(response.data?.department_courses)) {
            validDeptCourses = response.data.department_courses;
          }
          // ✅ ចាប់យកឆ្នាំសិក្សាបច្ចុប្បន្នរបស់សិស្សពី StudentController
          if (response.data?.student_current_year) {
            const sy = String(response.data.student_current_year);
            setApiStudentYear(sy);
            STUDENT_LESSONS_MEM_CACHE.studentYear = sy;
            try {
              sessionStorage.setItem(
                getStudentYearCacheKey(currentStudentId),
                sy
              );
              localStorage.setItem(
                getStudentYearCacheKey(currentStudentId),
                sy
              );
            } catch {}
          }
        } catch (primaryErr) {
          const [scoresRes, coursesRes] = await Promise.all([
            api.get('/student/scores').catch(() => null),
            api.get('/student/courses?all=true').catch(() => null),
          ]);

          const courseMapById = new Map();
          const scoreItems = Array.isArray(scoresRes?.data)
            ? scoresRes.data
            : Array.isArray(scoresRes?.data?.data)
            ? scoresRes.data.data
            : [];
          scoreItems.forEach((sc) => {
            const c = sc?.course || sc;
            const cid = sc?.course_id || c?.id;
            if (cid && !courseMapById.has(String(cid))) {
              courseMapById.set(String(cid), c);
            }
          });

          const courseItems = Array.isArray(coursesRes?.data?.data)
            ? coursesRes.data.data
            : Array.isArray(coursesRes?.data)
            ? coursesRes.data
            : [];
          courseItems.forEach((item) => {
            const c = item?.course || item;
            const cid = item?.course_id || c?.id || item?.id;
            if (cid && !courseMapById.has(String(cid))) {
              courseMapById.set(String(cid), c);
            }
          });

          validDeptCourses = Array.from(courseMapById.values());

          const lessonPromises = validDeptCourses.map(async (courseObj) => {
            const cid = courseObj?.id || courseObj?.course_id;
            if (!cid) return [];
            try {
              const lRes = await api.get(`/student/courses/${cid}/lessons`);
              const lArr = Array.isArray(lRes.data?.data)
                ? lRes.data.data
                : Array.isArray(lRes.data)
                ? lRes.data
                : [];
              return lArr.map((lsn) => ({
                ...lsn,
                course_id: lsn.course_id || cid,
                course: {
                  ...courseObj,
                  ...(lsn.course || {}),
                },
              }));
            } catch {
              return [];
            }
          });

          const nestedLessons = await Promise.all(lessonPromises);
          validLessons = nestedLessons.flat();
        }

        // ✅ សម្អាតជួរឈរ file_data (Base64) និងរក្សាទុករូបថតគ្រូក្នុង Avatar Dictionary មុនពេល Save ចូល Storage
        persistStudentLessonsSafely(
          currentStudentId,
          validLessons,
          validDeptCourses
        );

        setLessons(validLessons);
        STUDENT_LESSONS_MEM_CACHE.uid = currentStudentId;
        STUDENT_LESSONS_MEM_CACHE.lessons = validLessons;
        STUDENT_LESSONS_MEM_CACHE.lastSyncedAt = Date.now();

        if (validDeptCourses.length > 0) {
          setDeptCourses(validDeptCourses);
          STUDENT_LESSONS_MEM_CACHE.deptCourses = validDeptCourses;
        }
      } catch (error) {
        console.error('Error fetching lessons:', error);
      }
    },
    [currentStudentId]
  );

  useEffect(() => {
    fetchLessons(false);
  }, [fetchLessons]);

  // ============================================================================
  // 📌 ផ្នែកទី៥៖ មុខងារទាញយកឯកសារមេរៀន (Download File - គាំទ្រ Railway & Base64)
  // ============================================================================
  const handleDownloadFile = async (filePath, fileName, fileId) => {
    if (!filePath || typeof filePath !== 'string') return;
    const trimmed = filePath.trim();

    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
      const link = document.createElement('a');
      link.href = trimmed;
      link.setAttribute('download', fileName || 'lesson-file');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      return;
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      window.open(trimmed, '_blank');
      return;
    }

    const cleanPath = trimmed.replace(/^\/?storage\//, '').replace(/^\/+/, '');

    setDownloadingFileId(fileId || filePath);
    try {
      const cached = STUDENT_LESSONS_MEM_CACHE.fileCacheByPath[cleanPath];
      if (cached?.base64) {
        const binaryString = window.atob(cached.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], {
          type: cached.mime || 'application/octet-stream',
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName || 'lesson-file');
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);
        return;
      }

      const res = await api.get('/student/lessons/read-file', {
        params: { path: cleanPath },
      });
      if (res.data?.base64) {
        STUDENT_LESSONS_MEM_CACHE.fileCacheByPath[cleanPath] = {
          base64: res.data.base64,
          mime: res.data.mime_type || 'application/octet-stream',
        };
        const binaryString = window.atob(res.data.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], {
          type: res.data.mime_type || 'application/octet-stream',
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName || res.data.file_name || 'lesson-file');
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      const backendBase = (
        import.meta.env.VITE_API_URL ||
        api.defaults?.baseURL ||
        'http://localhost:8000/api'
      ).replace(/\/api\/?$/, '');
      const fallbackUrl = `${backendBase}/api/download-file?path=${encodeURIComponent(cleanPath)}`;
      window.open(fallbackUrl, '_blank');
    } finally {
      setDownloadingFileId(null);
    }
  };

  const getYouTubeThumbnail = (url) => {
    const ytId = extractYouTubeId(url);
    return ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
  };

  // ============================================================================
  // 📌 ផ្នែកទី៦៖ គណនាទិន្នន័យមេរៀន និងតម្រៀបឆ្នាំបច្ចុប្បន្ននៅខាងលើគេជានិច្ច
  // ============================================================================
  const deptCoursesById = useMemo(() => {
    const map = new Map();
    if (Array.isArray(deptCourses)) {
      deptCourses.forEach((c) => {
        const cid = c?.id || c?.course_id;
        if (cid) map.set(String(cid), c);
      });
    }
    return map;
  }, [deptCourses]);

  const enrichedLessons = useMemo(() => {
    if (!Array.isArray(lessons)) return [];
    return lessons.map((l) => {
      const cid = String(l.course?.id || l.course_id || '');
      const deptCrs = deptCoursesById.get(cid);
      const rawLsnCourse = l.course || {};
      const isEnrolled =
        l.is_enrolled === true ||
        deptCrs?.is_enrolled === true ||
        enrolledCourseIdsSet.has(cid);

      const mergedCourse = {
        ...(deptCrs || {}),
        ...rawLsnCourse,
        year: rawLsnCourse.year ?? deptCrs?.year ?? l.year,
        years_list:
          (Array.isArray(rawLsnCourse.years_list) &&
          rawLsnCourse.years_list.length > 0
            ? rawLsnCourse.years_list
            : null) ||
          (Array.isArray(deptCrs?.years_list) && deptCrs.years_list.length > 0
            ? deptCrs.years_list
            : null) ||
          (Array.isArray(l.years_list) && l.years_list.length > 0
            ? l.years_list
            : null),
        teacher: rawLsnCourse.teacher || deptCrs?.teacher || l.teacher,
        teacher_profile:
          rawLsnCourse.teacher_profile ||
          deptCrs?.teacher_profile ||
          l.teacher,
      };

      const yearsList = extractApplicableYears(
        {
          ...l,
          years_list: mergedCourse.years_list,
          course: mergedCourse,
        },
        isEnrolled,
        studentCurrentYear
      );
      const primaryYear =
        mergedCourse.year ||
        yearsList[0] ||
        (isEnrolled ? studentCurrentYear : '1');
      const teacherMeta = resolveCourseTeacherMeta(mergedCourse, cid);

      return {
        ...l,
        course: mergedCourse,
        detectedYear: String(primaryYear),
        yearsList,
        teacherMeta,
      };
    });
  }, [
    lessons,
    deptCoursesById,
    enrolledCourseIdsSet,
    studentCurrentYear,
    resolveCourseTeacherMeta,
  ]);

  const getYearBadgeLabel = useCallback(
    (yearNum) => {
      if (String(yearNum) === '1') return t('ឆ្នាំទី ១', 'Year 1');
      if (String(yearNum) === '2') return t('ឆ្នាំទី ២', 'Year 2');
      if (String(yearNum) === '3') return t('ឆ្នាំទី ៣', 'Year 3');
      if (String(yearNum) === '4') return t('ឆ្នាំទី ៤', 'Year 4');
      return t('ឆ្នាំទី ១', 'Year 1');
    },
    [t]
  );

  // ✅ ចំណងជើងមុខវិជ្ជាតាមឆ្នាំសិក្សា
  const getYearCourseTitle = useCallback(
    (yearNum) => {
      if (String(yearNum) === '1') return t('មុខវិជ្ជាឆ្នាំទី ១', 'Year 1 Courses');
      if (String(yearNum) === '2') return t('មុខវិជ្ជាឆ្នាំទី ២', 'Year 2 Courses');
      if (String(yearNum) === '3') return t('មុខវិជ្ជាឆ្នាំទី ៣', 'Year 3 Courses');
      if (String(yearNum) === '4') return t('មុខវិជ្ជាឆ្នាំទី ៤', 'Year 4 Courses');
      return t('មុខវិជ្ជាសិក្សា', 'Courses');
    },
    [t]
  );

  const doesItemMatchYear = useCallback(
    (itemYearsList, itemPrimaryYear, targetYear) => {
      if (!targetYear || targetYear === 'all') return true;
      const ty = String(targetYear);
      if (Array.isArray(itemYearsList) && itemYearsList.includes(ty)) {
        return true;
      }
      return String(itemPrimaryYear) === ty;
    },
    []
  );

  // ✅ បញ្ជីកាតមុខវិជ្ជាទាំងអស់ (Course Folders) សម្រាប់បង្ហាញក្នុងជំហានទី ១
  const allCourseFolders = useMemo(() => {
    const map = new Map();

    if (Array.isArray(deptCourses)) {
      deptCourses.forEach((crs) => {
        const cid = String(crs?.id || crs?.course_id || '');
        if (!cid) return;
        const isEnrolled =
          crs.is_enrolled === true || enrolledCourseIdsSet.has(cid);
        const yrsList = extractApplicableYears(
          crs,
          isEnrolled,
          studentCurrentYear
        );
        const primaryY =
          yrsList[0] || (isEnrolled ? studentCurrentYear : '1');
        const tMeta = resolveCourseTeacherMeta(crs, cid);

        map.set(cid, {
          courseId: cid,
          courseName: crs.course_name || t('មុខវិជ្ជាសិក្សា', 'Course'),
          courseCode: crs.course_code || '',
          description: crs.description || '',
          yearNum: String(primaryY),
          yearsList: yrsList,
          teacherMeta: tMeta,
          isEnrolled,
          docsItems: [],
          vidsItems: [],
        });
      });
    }

    enrichedLessons.forEach((l) => {
      const c = l.course || {};
      const cid = String(c.id || l.course_id || 'other');
      const isEnrolled =
        l.is_enrolled === true || enrolledCourseIdsSet.has(cid);

      if (!map.has(cid)) {
        map.set(cid, {
          courseId: cid,
          courseName: c.course_name || t('មុខវិជ្ជាសិក្សា', 'Course'),
          courseCode: c.course_code || '',
          description: c.description || '',
          yearNum: String(l.detectedYear || studentCurrentYear || '1'),
          yearsList:
            l.yearsList || [String(l.detectedYear || studentCurrentYear || '1')],
          teacherMeta: l.teacherMeta,
          isEnrolled,
          docsItems: [],
          vidsItems: [],
        });
      }

      const folder = map.get(cid);
      if (Array.isArray(l.files)) {
        l.files.forEach((f) => folder.docsItems.push({ ...f, lesson: l }));
      }
      if (Array.isArray(l.videos)) {
        l.videos.forEach((v) => folder.vidsItems.push({ ...v, lesson: l }));
      }
    });

    return Array.from(map.values());
  }, [
    deptCourses,
    enrichedLessons,
    enrolledCourseIdsSet,
    studentCurrentYear,
    resolveCourseTeacherMeta,
    t,
  ]);

  const yearStats = useMemo(() => {
    const counts = { all: 0, '1': 0, '2': 0, '3': 0, '4': 0 };

    if (enrichedLessons.length > 0) {
      enrichedLessons.forEach((l) => {
        const itemCount =
          (Array.isArray(l.files) ? l.files.length : 0) +
          (Array.isArray(l.videos) ? l.videos.length : 0);
        const weight = itemCount > 0 ? itemCount : 1;
        counts.all += weight;

        const yrs =
          Array.isArray(l.yearsList) && l.yearsList.length > 0
            ? l.yearsList
            : [l.detectedYear || studentCurrentYear || '1'];
        yrs.forEach((y) => {
          if (counts[y] !== undefined) {
            counts[y] += weight;
          }
        });
      });
    } else if (allCourseFolders.length > 0) {
      allCourseFolders.forEach((f) => {
        counts.all += 1;
        const yrs =
          Array.isArray(f.yearsList) && f.yearsList.length > 0
            ? f.yearsList
            : [f.yearNum];
        yrs.forEach((y) => {
          if (counts[y] !== undefined) {
            counts[y] += 1;
          }
        });
      });
    }

    return counts;
  }, [enrichedLessons, allCourseFolders, studentCurrentYear]);

  // ✅ ជំហានទី ២៖ បញ្ជីឈ្មោះគ្រូបង្រៀនទាំងអស់ក្នុងឆ្នាំសិក្សាដែលបានជ្រើសរើស
  const availableTeachersForYear = useMemo(() => {
    const map = new Map();

    allCourseFolders.forEach((folder) => {
      if (!doesItemMatchYear(folder.yearsList, folder.yearNum, selectedYear)) {
        return;
      }
      const tMeta = folder.teacherMeta;
      if (!tMeta || !tMeta.key) return;

      if (!map.has(tMeta.key)) {
        map.set(tMeta.key, {
          key: tMeta.key,
          name: tMeta.name,
        });
      }
    });

    return Array.from(map.values());
  }, [allCourseFolders, selectedYear, doesItemMatchYear]);

  const totalDeptSummary = useMemo(() => {
    let docs = 0;
    let vids = 0;
    allCourseFolders.forEach((f) => {
      docs += f.docsItems.length;
      vids += f.vidsItems.length;
    });
    return {
      coursesCount: allCourseFolders.length,
      teachersCount: availableTeachersForYear.length,
      docsCount: docs,
      vidsCount: vids,
    };
  }, [allCourseFolders, availableTeachersForYear.length]);

  // កាតមុខវិជ្ជាដែលត្រូវបង្ហាញក្នុងជំហានទី ១
  const visibleCourseFolders = useMemo(() => {
    return allCourseFolders.filter((f) => {
      if (!doesItemMatchYear(f.yearsList, f.yearNum, selectedYear)) return false;
      if (
        selectedTeacherKey !== 'all' &&
        String(f.teacherMeta?.key) !== String(selectedTeacherKey)
      ) {
        return false;
      }
      return true;
    });
  }, [allCourseFolders, selectedYear, selectedTeacherKey, doesItemMatchYear]);

  // ✅ រៀបចំបណ្ដុំមុខវិជ្ជាតាមឆ្នាំសិក្សា៖
  // ដាក់ «មុខវិជ្ជាឆ្នាំដែលសិស្សកំពុងរៀនបច្ចុប្បន្ន» នៅខាងលើគេជានិច្ច ហើយមុខវិជ្ជាឆ្នាំមុនៗ (សម្រាប់រំលឹកមេរៀន) ធ្លាក់មកខាងក្រោមតាមលំដាប់!
  const prioritizedYearSections = useMemo(() => {
    const curY = Number(studentCurrentYear) || 1;

    if (selectedYear !== 'all') {
      const targetY = Number(selectedYear);
      const isCurrent = targetY === curY;
      const isPast = targetY < curY;

      return [
        {
          yearKey: String(selectedYear),
          title: getYearCourseTitle(selectedYear),
          badgeText: isCurrent
            ? t('មុខវិជ្ជាកំពុងសិក្សាបច្ចុប្បន្ន', 'Current Active Year')
            : isPast
            ? t('មុខវិជ្ជាឆ្នាំចាស់សម្រាប់រំលឹកមេរៀនឡើងវិញ', 'Past Year Review')
            : t('មុខវិជ្ជាសម្រាប់ស្រាវជ្រាវរៀនទុកមុន', 'Advance Study'),
          badgeStyle: isCurrent
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
            : isPast
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30'
            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
          isCurrent,
          isPast,
          folders: visibleCourseFolders,
        },
      ];
    }

    const orderedYears = [String(curY)];
    for (let y = curY - 1; y >= 1; y--) {
      orderedYears.push(String(y));
    }
    for (let y = curY + 1; y <= 4; y++) {
      orderedYears.push(String(y));
    }

    const sections = [];
    orderedYears.forEach((yKey) => {
      const foldersForYear = visibleCourseFolders.filter((f) =>
        doesItemMatchYear(f.yearsList, f.yearNum, yKey)
      );
      if (foldersForYear.length === 0) return;

      const yNum = Number(yKey);
      const isCurrent = yNum === curY;
      const isPast = yNum < curY;

      sections.push({
        yearKey: yKey,
        title: getYearCourseTitle(yKey),
        badgeText: isCurrent
          ? t('មុខវិជ្ជាកំពុងសិក្សាបច្ចុប្បន្ន', 'Current Active Year')
          : isPast
          ? t('មុខវិជ្ជាឆ្នាំចាស់សម្រាប់រំលឹកមេរៀនឡើងវិញ', 'Past Year Review')
          : t('មុខវិជ្ជាសម្រាប់ស្រាវជ្រាវរៀនទុកមុន', 'Advance Study'),
        badgeStyle: isCurrent
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
          : isPast
          ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30'
          : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
        isCurrent,
        isPast,
        folders: foldersForYear,
      });
    });

    return sections;
  }, [
    studentCurrentYear,
    selectedYear,
    visibleCourseFolders,
    doesItemMatchYear,
    getYearCourseTitle,
    t,
  ]);

  // មុខវិជ្ជាដែលសិស្សបានចុចបើកមើលក្នុងជំហានទី ២
  const activeSelectedFolder = useMemo(() => {
    if (selectedCourseId === 'all') return null;
    return (
      allCourseFolders.find(
        (f) => String(f.courseId) === String(selectedCourseId)
      ) || null
    );
  }, [allCourseFolders, selectedCourseId]);

  const handleSelectCourseFolder = (folder) => {
    setSelectedCourseId(String(folder.courseId));
    if (folder.docsItems.length === 0 && folder.vidsItems.length > 0) {
      setActiveTab('videos');
    } else {
      setActiveTab('documents');
    }
  };

  const handleBackToAllCourses = () => {
    setSelectedCourseId('all');
    if (searchParams.get('course_id')) {
      setSearchParams({});
    }
  };

  const { activeDocsList, activeVidsList } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const docs = [];
    const vids = [];

    const targetFolders = activeSelectedFolder
      ? [activeSelectedFolder]
      : visibleCourseFolders;

    targetFolders.forEach((folder) => {
      folder.docsItems.forEach((doc) => {
        if (!q) {
          docs.push({ ...doc, folder });
          return;
        }
        const match =
          (doc.file_name || '').toLowerCase().includes(q) ||
          (doc.lesson?.title || '').toLowerCase().includes(q) ||
          (folder.courseName || '').toLowerCase().includes(q) ||
          (folder.courseCode || '').toLowerCase().includes(q) ||
          (folder.teacherMeta?.name || '').toLowerCase().includes(q);
        if (match) docs.push({ ...doc, folder });
      });

      folder.vidsItems.forEach((vid) => {
        if (!q) {
          vids.push({ ...vid, folder });
          return;
        }
        const match =
          (vid.title || '').toLowerCase().includes(q) ||
          (vid.lesson?.title || '').toLowerCase().includes(q) ||
          (folder.courseName || '').toLowerCase().includes(q) ||
          (folder.courseCode || '').toLowerCase().includes(q) ||
          (folder.teacherMeta?.name || '').toLowerCase().includes(q);
        if (match) vids.push({ ...vid, folder });
      });
    });

    return { activeDocsList: docs, activeVidsList: vids };
  }, [activeSelectedFolder, visibleCourseFolders, searchQuery]);

  // កំណត់ថាតើសិស្សបានចុចចូលមុខវិជ្ជាណាមួយ ឬកំពុងវាយ Search
  const isShowingCourseFilesView =
    selectedCourseId !== 'all' || searchQuery.trim() !== '';

  const yearSelectorItems = [
    {
      id: '1',
      title: t('ឆ្នាំទី ១', 'Year 1'),
      count: yearStats['1'],
      icon: BookOpenIcon,
      iconStyle:
        'bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
      activeGradient:
        'from-emerald-600 to-teal-600 border-emerald-500 shadow-emerald-500/25',
    },
    {
      id: '2',
      title: t('ឆ្នាំទី ២', 'Year 2'),
      count: yearStats['2'],
      icon: AcademicCapIcon,
      iconStyle:
        'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
      activeGradient:
        'from-blue-600 to-indigo-600 border-blue-500 shadow-blue-500/25',
    },
    {
      id: '3',
      title: t('ឆ្នាំទី ៣', 'Year 3'),
      count: yearStats['3'],
      icon: FolderOpenIcon,
      iconStyle:
        'bg-purple-100 text-purple-600 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30',
      activeGradient:
        'from-purple-600 to-violet-600 border-purple-500 shadow-purple-500/25',
    },
    {
      id: '4',
      title: t('ឆ្នាំទី ៤', 'Year 4'),
      count: yearStats['4'],
      icon: SparklesIcon,
      iconStyle:
        'bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
      activeGradient:
        'from-amber-500 to-orange-500 border-amber-500 shadow-amber-500/25',
    },
  ];

  return (
    <div className="std-lsn-page max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 pb-28 lg:pb-12 mt-2 md:mt-0 animate-fadeIn">
      
      {/* ================================================================== */}
      {/* 📌 1. MODERN BENTO HERO SECTION                                    */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
        
        {/* ១.១. ប្រអប់ធំខាងឆ្វេង (8 Columns) */}
        <div className="lg:col-span-8 relative overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] bg-gradient-to-br from-blue-950 via-indigo-900 to-violet-950 p-6 sm:p-8 text-white shadow-xl border border-indigo-500/30 flex flex-col justify-between">
          <div className="std-lsn-grid-pattern absolute inset-0 opacity-15 pointer-events-none"></div>
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
                <span>{t('មេរៀន និងឯកសារ,', 'Study Hub,')}</span>
                <span className="bg-gradient-to-r from-yellow-300 via-amber-200 to-white bg-clip-text text-transparent">
                  {activeSelectedFolder
                    ? activeSelectedFolder.courseName
                    : selectedYear === 'all'
                    ? `${getYearCourseTitle(studentCurrentYear)} ${t('(កំពុងសិក្សា)', '(Current)')}`
                    : getYearCourseTitle(selectedYear)}
                </span>
                <CheckBadgeIcon className="h-6 w-6 sm:h-7 sm:w-7 text-yellow-400 shrink-0" />
              </h1>

              <p className="text-xs sm:text-sm text-blue-100/80 max-w-2xl leading-relaxed font-medium">
                {t(
                  'មុខវិជ្ជាក្នុងឆ្នាំសិក្សាបច្ចុប្បន្នរបស់អ្នកត្រូវបានដាក់បង្ហាញនៅខាងលើគេ ហើយមុខវិជ្ជាឆ្នាំមុនៗត្រូវបានរក្សាទុកនៅខាងក្រោមសម្រាប់រំលឹកមេរៀនឡើងវិញ។',
                  'Your current academic year courses are prioritized at the top, while previous years are archived below for easy review.'
                )}
              </p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-2.5 sm:gap-3.5 mt-6 pt-5 border-t border-white/15 select-none">
            <div className="bg-white/[0.08] backdrop-blur-md border border-white/15 rounded-2xl p-3 sm:p-3.5 flex items-center gap-3">
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-blue-500/25 border border-blue-300/30 flex items-center justify-center text-cyan-300 shrink-0">
                <BookOpenIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-base sm:text-lg font-black text-white leading-none">
                  {totalDeptSummary.coursesCount}
                </span>
                <span className="block text-[10px] sm:text-xs font-bold text-blue-200/90 truncate mt-1">
                  {t('មុខវិជ្ជាសិក្សា', 'Courses')}
                </span>
              </div>
            </div>

            <div className="bg-white/[0.08] backdrop-blur-md border border-white/15 rounded-2xl p-3 sm:p-3.5 flex items-center gap-3">
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-yellow-300 shrink-0">
                <DocumentTextIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-base sm:text-lg font-black text-white leading-none">
                  {totalDeptSummary.docsCount}
                </span>
                <span className="block text-[10px] sm:text-xs font-bold text-blue-200/90 truncate mt-1">
                  {t('ឯកសារមេរៀន', 'Documents')}
                </span>
              </div>
            </div>

            <div className="bg-white/[0.08] backdrop-blur-md border border-white/15 rounded-2xl p-3 sm:p-3.5 flex items-center gap-3">
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-purple-500/25 border border-purple-300/30 flex items-center justify-center text-purple-200 shrink-0">
                <PlayCircleIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-base sm:text-lg font-black text-white leading-none">
                  {totalDeptSummary.vidsCount}
                </span>
                <span className="block text-[10px] sm:text-xs font-bold text-blue-200/90 truncate mt-1">
                  {t('វីដេអូបង្រៀន', 'Videos')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ១.២. ប្រអប់ខាងស្ដាំ (4 Columns - ជ្រើសរើសឆ្នាំសិក្សា ១-៤) */}
        <div className="lg:col-span-4 std-lsn-surface bg-white rounded-[1.75rem] sm:rounded-[2rem] p-6 border border-gray-200/80 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/30 flex items-center justify-center shrink-0">
                  <AcademicCapIcon className="h-5 w-5 stroke-[2.2]" />
                </div>
                <div>
                  <h2 className="std-lsn-text-primary text-base sm:text-lg font-extrabold text-gray-900 leading-tight">
                    {t('ឆ្នាំសិក្សា', 'Academic Year')}
                  </h2>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              {yearSelectorItems.map((yr) => {
                const isSelected = String(selectedYear) === String(yr.id);
                const isMyCurrentYear =
                  String(studentCurrentYear) === String(yr.id);
                const YearIcon = yr.icon;
                return (
                  <button
                    key={yr.id}
                    type="button"
                    onClick={() => {
                      setSelectedYear(isSelected ? 'all' : yr.id);
                      setSelectedTeacherKey('all');
                      setSelectedCourseId('all');
                    }}
                    className={`group p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? `bg-gradient-to-br ${yr.activeGradient} text-white shadow-md -translate-y-0.5`
                        : isMyCurrentYear
                        ? 'std-lsn-subbox bg-indigo-50/50 hover:bg-indigo-50 border-indigo-300 text-gray-900 hover:-translate-y-0.5'
                        : 'std-lsn-subbox bg-gray-50/80 hover:bg-indigo-50/50 border-gray-200/80 hover:border-indigo-300 text-gray-800 hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                          isSelected
                            ? 'bg-white/20 text-white border-white/30'
                            : yr.iconStyle
                        }`}
                      >
                        <YearIcon className="h-5 w-5 stroke-[2.2]" />
                      </div>
                      <div className="min-w-0">
                        <span
                          className={`block text-xs sm:text-sm font-black truncate ${
                            isSelected
                              ? 'text-white'
                              : 'std-lsn-text-primary text-gray-900'
                          }`}
                        >
                          {yr.title}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-black shrink-0 ${
                        isSelected
                          ? 'bg-white/25 text-white'
                          : 'bg-white text-indigo-600 border border-gray-200/80 dark:bg-slate-800 dark:text-indigo-400 dark:border-slate-700'
                      }`}
                    >
                      {yr.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="std-lsn-divider pt-4 mt-4 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="std-lsn-text-secondary font-bold text-gray-500">
              {t('គ្រូបង្រៀន៖', 'Teachers:')}{' '}
              <strong className="std-lsn-text-primary text-gray-800">
                {availableTeachersForYear.length} {t('នាក់', '')}
              </strong>{' '}
              • {t('មុខវិជ្ជា៖', 'Courses:')}{' '}
              <strong className="std-lsn-text-primary text-gray-800">
                {visibleCourseFolders.length}
              </strong>
            </span>

            {selectedYear !== 'all' ||
            selectedTeacherKey !== 'all' ||
            selectedCourseId !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedYear('all');
                  setSelectedTeacherKey('all');
                  setSelectedCourseId('all');
                }}
                className="font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>{t('បង្ហាញទាំងអស់វិញ', 'Reset All')}</span>
                <ChevronRightIcon className="h-3.5 w-3.5 stroke-[2.5]" />
              </button>
            ) : (
              <span className="std-lsn-text-secondary inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-gray-500 shrink-0 mr-1">
                <UserGroupIcon className="h-4 w-4 text-indigo-500 shrink-0" />
                <p className="std-lsn-text-secondary text-[11px] font-medium text-gray-500 mt-0.5">
                  {t('អ្នកជាសិស្ស', 'You are in')}{' '}
                  <strong className="text-indigo-600 dark:text-indigo-400">
                    {getYearBadgeLabel(studentCurrentYear)}
                  </strong>
                </p>
              </span>
            )}
          </div>
        </div>

      </div>

      {/* ================================================================== */}
      {/* 📌 2. UNIFIED SINGLE-ROW TOOLBAR                                   */}
      {/* (លាក់ប៊ូតុង ឯកសារ/វីដេអូ សិន ➔ បង្ហាញតែពេលសិស្សចុចចូលមុខវិជ្ជាណាមួយ) */}
      {/* ================================================================== */}
      <div className="std-lsn-surface bg-white rounded-3xl border border-gray-200/80 shadow-xs px-4 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        
        {/* ✅ បង្ហាញប៊ូតុង «ឯកសារមេរៀន / វីដេអូបង្រៀន» តែពេលចុចចូលមុខវិជ្ជាណាមួយប៉ុណ្ណោះ */}
        {isShowingCourseFilesView && (
          <div className="std-lsn-subbox inline-flex bg-gray-100 p-1 rounded-full border border-gray-200/70 shrink-0 w-full sm:w-auto justify-center animate-fadeIn">
            <button
              type="button"
              onClick={() => setActiveTab('documents')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-full text-xs font-extrabold transition-all duration-300 cursor-pointer ${
                activeTab === 'documents'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'std-lsn-tab-inactive text-gray-600 hover:text-indigo-600'
              }`}
            >
              <DocumentIcon className="w-4 h-4" />
              <span>{t('ឯកសារមេរៀន', 'Documents')}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'documents'
                    ? 'bg-white/20 text-white'
                    : 'bg-white text-gray-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {activeDocsList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('videos')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-full text-xs font-extrabold transition-all duration-300 cursor-pointer ${
                activeTab === 'videos'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'std-lsn-tab-inactive text-gray-600 hover:text-purple-600'
              }`}
            >
              <VideoCameraIcon className="w-4 h-4" />
              <span>{t('វីដេអូបង្រៀន', 'Videos')}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'videos'
                    ? 'bg-white/20 text-white'
                    : 'bg-white text-gray-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {activeVidsList.length}
              </span>
            </button>
          </div>
        )}

        {/* ជួរឈ្មោះគ្រូបង្រៀន អាចអូសរមូរឆ្វេង-ស្ដាំបានយ៉ាងស្អាត */}
        {availableTeachersForYear.length > 0 && (
          <div
            className={`flex items-center gap-2 min-w-0 flex-1 ${
              isShowingCourseFilesView
                ? 'lg:border-l lg:border-r border-gray-100 std-lsn-divider lg:px-3.5'
                : 'lg:border-r border-gray-100 std-lsn-divider lg:pr-3.5'
            }`}
          >
            {availableTeachersForYear.length > 3 && (
              <button
                type="button"
                onClick={() => handleScrollTeacherBar('left')}
                className="std-lsn-subbox hidden sm:flex h-8 w-8 rounded-full bg-gray-50 hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 border border-gray-200/80 items-center justify-center shrink-0 transition-colors cursor-pointer"
                title={t('រមូរទៅឆ្វេង', 'Scroll Left')}
              >
                <ChevronLeftIcon className="h-4 w-4 stroke-[2.5]" />
              </button>
            )}

            <div
              ref={teacherScrollRef}
              className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-0.5 min-w-0 flex-1"
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedTeacherKey('all');
                  setSelectedCourseId('all');
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-extrabold transition-all duration-200 shrink-0 cursor-pointer ${
                  selectedTeacherKey === 'all'
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white border-indigo-600 shadow-xs'
                    : 'std-lsn-course-pill bg-gray-50/90 hover:bg-indigo-50/60 text-gray-700 border-gray-200/80 hover:border-indigo-300'
                }`}
              >
                <span>{t('គ្រប់គ្រូបង្រៀន', 'All Teachers')}</span>
              </button>

              {availableTeachersForYear.map((inst) => {
                const isSelected =
                  String(selectedTeacherKey) === String(inst.key);
                return (
                  <button
                    key={inst.key}
                    type="button"
                    onClick={() => {
                      setSelectedTeacherKey(isSelected ? 'all' : inst.key);
                      setSelectedCourseId('all');
                    }}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-extrabold transition-all duration-200 shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-600 shadow-sm'
                        : 'std-lsn-course-pill bg-gray-50/90 hover:bg-indigo-50/60 text-gray-800 border-gray-200/80 hover:border-indigo-300'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        isSelected ? 'bg-yellow-300' : 'bg-indigo-500'
                      }`}
                    />
                    <span className="truncate max-w-[160px]">{inst.name}</span>
                  </button>
                );
              })}
            </div>

            {availableTeachersForYear.length > 3 && (
              <button
                type="button"
                onClick={() => handleScrollTeacherBar('right')}
                className="std-lsn-subbox hidden sm:flex h-8 w-8 rounded-full bg-gray-50 hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 border border-gray-200/80 items-center justify-center shrink-0 transition-colors cursor-pointer"
                title={t('រមូរទៅស្ដាំ', 'Scroll Right')}
              >
                <ChevronRightIcon className="h-4 w-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        )}

        {/* ប្រអប់ស្វែងរក (Expandable Search Bar) */}
        <div className="flex items-center justify-end shrink-0 ml-auto">
          <div
            ref={searchRef}
            className={`std-lsn-subbox relative flex items-center bg-gray-50 border border-gray-200/80 rounded-full shadow-2xs transition-all duration-300 ease-in-out overflow-hidden ${
              isSearchExpanded || searchQuery
                ? 'w-full sm:w-[240px] px-3.5 py-2 ring-2 ring-indigo-500/20 border-indigo-400 bg-white'
                : 'w-10 h-10 p-0 justify-center hover:border-indigo-300'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setIsSearchExpanded(true);
                setTimeout(() => searchInputRef.current?.focus(), 80);
              }}
              className="text-gray-500 hover:text-indigo-600 transition-colors shrink-0 outline-none flex items-center justify-center cursor-pointer"
              title={t('ស្វែងរកមេរៀន ឬឈ្មោះគ្រូ', 'Search')}
            >
              <MagnifyingGlassIcon className="h-4 w-4 stroke-[2.5]" />
            </button>

            <input
              ref={searchInputRef}
              type="text"
              placeholder={t(
                'ស្វែងរកមេរៀន ឬឈ្មោះគ្រូ...',
                'Search lesson or teacher...'
              )}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`std-lsn-search-input bg-transparent text-gray-800 placeholder-gray-400 text-xs font-semibold focus:outline-none transition-all duration-300 ${
                isSearchExpanded || searchQuery
                  ? 'w-full pl-2.5 pr-6 opacity-100'
                  : 'w-0 opacity-0 pointer-events-none'
              }`}
            />

            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-gray-400 hover:text-rose-500 cursor-pointer"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

      </div>

      {/* ================================================================== */}
      {/* 📌 3. MAIN CONTENT AREA (តម្រៀបឆ្នាំបច្ចុប្បន្ននៅលើ + ឆ្នាំចាស់នៅក្រោម) */}
      {/* ================================================================== */}
      {!isShowingCourseFilesView ? (
        /* ------------------------------------------------------------------
           🌟 ជំហានទី ១៖ បង្ហាញកាតមុខវិជ្ជាតាមផ្នែកឆ្នាំសិក្សា
        ------------------------------------------------------------------- */
        <div className="space-y-8 animate-fadeIn">
          {prioritizedYearSections.length === 0 ? (
            <div className="std-lsn-surface bg-white rounded-3xl border border-gray-200/80 p-14 text-center space-y-3 shadow-2xs">
              <FolderOpenIcon className="h-14 w-14 mx-auto text-indigo-300" />
              <h3 className="std-lsn-text-primary text-base sm:text-lg font-extrabold text-gray-900">
                {t(
                  'មិនទាន់មានមុខវិជ្ជាសម្រាប់ការច្រោះនេះនៅឡើយទេ',
                  'No courses found for this filter'
                )}
              </h3>
              <p className="std-lsn-text-secondary text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
                {t(
                  'សូមសាកល្បងជ្រើសរើសគ្រូបង្រៀន ឬឆ្នាំសិក្សាផ្សេងទៀតនៅប្រអប់ខាងលើ។',
                  'Try selecting another instructor or academic year above.'
                )}
              </p>
            </div>
          ) : (
            prioritizedYearSections.map((section) => (
              <div key={`year-sec-${section.yearKey}`} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <FolderOpenIcon
                      className={`h-5 w-5 ${
                        section.isCurrent
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-indigo-600 dark:text-indigo-400'
                      }`}
                    />
                    <h2 className="std-lsn-text-primary text-base sm:text-lg font-extrabold text-gray-900">
                      {section.title}
                    </h2>

                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold border ${section.badgeStyle}`}
                    >
                      {section.isCurrent ? (
                        <CheckBadgeIcon className="h-3.5 w-3.5" />
                      ) : section.isPast ? (
                        <ClockIcon className="h-3.5 w-3.5" />
                      ) : (
                        <SparklesIcon className="h-3.5 w-3.5" />
                      )}
                      <span>{section.badgeText}</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 items-stretch">
                  {section.folders.map((folder, idx) => {
                    const theme = FOLDER_THEMES[idx % FOLDER_THEMES.length];
                    const tMeta = folder.teacherMeta;
                    const avatarKey = `lsn_t_${folder.courseId}`;
                    const hasTeacherAvatar = Boolean(
                      tMeta?.imageUrl && !failedAvatars[avatarKey]
                    );

                    return (
                      <div
                        key={`${section.yearKey}-${folder.courseId}`}
                        onClick={() => handleSelectCourseFolder(folder)}
                        className="std-lsn-card group bg-white rounded-[1.5rem] border border-gray-200/80 hover:border-indigo-400 shadow-2xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between overflow-hidden cursor-pointer"
                      >
                        <div>
                          <div
                            className={`h-1.5 w-full bg-gradient-to-r ${theme.topBar}`}
                          />

                          <div className="p-5">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div
                                className={`h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform ${theme.iconBg}`}
                              >
                                <FolderOpenIcon className="h-5 w-5 stroke-[2.2]" />
                              </div>

                              <div className="flex items-center gap-1.5">
                                {folder.courseCode && (
                                  <span className="std-lsn-subbox px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-gray-50 text-gray-600 border border-gray-200/80 uppercase">
                                    {folder.courseCode}
                                  </span>
                                )}
                                <span
                                  className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border ${
                                    section.isCurrent
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                                      : 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30'
                                  }`}
                                >
                                  {getYearBadgeLabel(section.yearKey)}
                                </span>
                              </div>
                            </div>

                            <h3 className="std-lsn-text-primary text-base sm:text-[17px] font-black text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                              {folder.courseName}
                            </h3>

                            <p className="std-lsn-text-secondary text-xs text-gray-500 line-clamp-1 mt-1 leading-relaxed font-medium">
                              {folder.description ||
                                t(
                                  'ចុចដើម្បីបើកមើលឯកសារមេរៀន និងវីដេអូបង្រៀនទាំងអស់ក្នុងមុខវិជ្ជានេះ។',
                                  'Click to open all lesson documents and video lectures in this course.'
                                )}
                            </p>

                            <div className="flex items-center gap-3 mt-3.5 pt-3 border-t border-gray-100 std-lsn-divider text-xs font-bold">
                              <span className="std-lsn-text-secondary flex items-center gap-1.5 text-gray-600">
                                <DocumentTextIcon className="h-4 w-4 text-indigo-500" />
                                <span>
                                  {folder.docsItems.length}{' '}
                                  {t('ឯកសារមេរៀន', 'Documents')}
                                </span>
                              </span>
                              <span className="text-gray-300 dark:text-slate-600">
                                •
                              </span>
                              <span className="std-lsn-text-secondary flex items-center gap-1.5 text-gray-600">
                                <PlayCircleIcon className="h-4 w-4 text-purple-500" />
                                <span>
                                  {folder.vidsItems.length}{' '}
                                  {t('វីដេអូ', 'Videos')}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="std-lsn-subbox px-5 py-3 bg-gray-50/70 border-t border-gray-100 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`h-7 w-7 rounded-full bg-gradient-to-br ${theme.avatarBg} text-white font-black text-[10px] flex items-center justify-center shrink-0 overflow-hidden relative shadow-2xs`}
                            >
                              {hasTeacherAvatar ? (
                                <img
                                  src={tMeta.imageUrl}
                                  alt={tMeta.name}
                                  loading={idx < 9 ? 'eager' : 'lazy'}
                                  decoding="async"
                                  className="h-full w-full object-cover rounded-full"
                                  onError={() =>
                                    setFailedAvatars((prev) => ({
                                      ...prev,
                                      [avatarKey]: true,
                                    }))
                                  }
                                />
                              ) : (
                                <span>{tMeta?.initials || 'T'}</span>
                              )}
                            </div>
                            <span className="std-lsn-text-primary text-xs font-extrabold text-gray-800 truncate">
                              {tMeta?.name || t('គ្រូបង្រៀន', 'Instructor')}
                            </span>
                          </div>

                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0">
                            <span>{t('បើកមេរៀន', 'Open')}</span>
                            <ArrowRightIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* ------------------------------------------------------------------
           🌟 ជំហានទី ២៖ បង្ហាញឯកសារ និងវីដេអូនៃមុខវិជ្ជាដែលបានចុចជ្រើសរើស
        ------------------------------------------------------------------- */
        <div className="space-y-5 animate-fadeIn">
          
          <div className="flex flex-wrap items-center justify-between gap-4 px-1 pt-1">
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              {activeSelectedFolder ? (
                <>
                  <span className="w-1.5 h-6 bg-gradient-to-b from-indigo-500 to-blue-600 rounded-full shrink-0"></span>
                  <h2 className="std-lsn-text-primary text-lg sm:text-xl font-black text-gray-900 tracking-tight">
                    {activeSelectedFolder.courseName}
                  </h2>
                  {activeSelectedFolder.teacherMeta && (
                    <span className="std-lsn-subbox inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-white border border-gray-200/90 text-xs font-extrabold text-gray-700 shadow-2xs">
                      <div className="h-5 w-5 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white text-[9px] font-black flex items-center justify-center shrink-0 overflow-hidden relative">
                        {activeSelectedFolder.teacherMeta.imageUrl &&
                        !failedAvatars[`lsn_t_${activeSelectedFolder.courseId}`] ? (
                          <img
                            src={activeSelectedFolder.teacherMeta.imageUrl}
                            alt={activeSelectedFolder.teacherMeta.name}
                            className="h-full w-full object-cover rounded-full"
                            onError={() =>
                              setFailedAvatars((prev) => ({
                                ...prev,
                                [`lsn_t_${activeSelectedFolder.courseId}`]: true,
                              }))
                            }
                          />
                        ) : (
                          <span>
                            {activeSelectedFolder.teacherMeta.initials}
                          </span>
                        )}
                      </div>
                      <span>
                        {t('គ្រូ៖', 'Teacher:')}{' '}
                        {activeSelectedFolder.teacherMeta.name}
                      </span>
                    </span>
                  )}
                </>
              ) : (
                <h2 className="std-lsn-text-primary text-base sm:text-lg font-extrabold text-gray-900">
                  {t('លទ្ធផលស្វែងរកមេរៀន៖', 'Search Results:')} «{searchQuery}»
                </h2>
              )}
            </div>

            {selectedCourseId !== 'all' && (
              <button
                type="button"
                onClick={handleBackToAllCourses}
                className="group ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50/90 hover:bg-indigo-600 text-indigo-600 hover:text-white dark:bg-indigo-500/15 dark:hover:bg-indigo-600 dark:text-indigo-300 dark:hover:text-white border border-indigo-200/80 dark:border-indigo-500/30 text-xs font-extrabold transition-all duration-200 cursor-pointer shrink-0 shadow-2xs"
              >
                <ArrowLeftIcon className="h-4 w-4 stroke-[2.5] group-hover:-translate-x-0.5 transition-transform" />
                <span>{t('ត្រឡប់ទៅមុខវិជ្ជាទាំងអស់', 'Back to All Courses')}</span>
              </button>
            )}
          </div>

          {/* -------------------------------------------------------------- */}
          {/* ✅ បញ្ជីឯកសារមេរៀន (ទំហំ និងទម្រង់ប៉ុនគ្នាជាមួយកាតវីដេអូ ១០០%)    */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'documents' && (
            <div>
              {activeDocsList.length === 0 ? (
                <div className="std-lsn-surface bg-white rounded-3xl border border-gray-200/80 p-14 text-center space-y-3">
                  <DocumentTextIcon className="h-14 w-14 mx-auto text-indigo-300" />
                  <h3 className="std-lsn-text-primary text-base font-extrabold text-gray-900">
                    {t(
                      'មិនទាន់មានឯកសារមេរៀននៅក្នុងមុខវិជ្ជានេះទេ',
                      'No lesson documents available in this course'
                    )}
                  </h3>
                  {activeVidsList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('videos')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-extrabold cursor-pointer"
                    >
                      <VideoCameraIcon className="h-4 w-4" />
                      <span>
                        {t('ចុចមើលវីដេអូបង្រៀនវិញ', 'Switch to Videos')} (
                        {activeVidsList.length})
                      </span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                  {activeDocsList.map((doc, idx) => {
                    const fileMeta = getFileTypeMeta(doc.file_name);
                    const isDownloading =
                      downloadingFileId === (doc.id || doc.file_path);

                    return (
                      <div
                        key={doc.id || idx}
                        className="std-lsn-card bg-white p-4 rounded-2xl border border-slate-200/80 hover:border-indigo-400 shadow-2xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group overflow-hidden"
                      >
                        <div>
                          {/* ✅ ផ្ទាំងប្រអប់ខាងលើ aspect-video ប៉ុនគ្នាជាមួយកាតវីដេអូ */}
                          <div
                            onClick={() =>
                              !isDownloading &&
                              handleDownloadFile(
                                doc.file_path,
                                doc.file_name,
                                doc.id
                              )
                            }
                            className={`relative aspect-video rounded-xl overflow-hidden mb-3.5 flex items-center justify-center cursor-pointer group/doc shadow-inner bg-gradient-to-br ${fileMeta.bannerGradient} border border-slate-200/60 dark:border-slate-700/60`}
                          >
                            <span className="absolute top-2 left-2 bg-slate-900/75 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-bold text-white z-10 border border-white/15">
                              {t('មេរៀនទី', 'Lesson')}{' '}
                              {doc.lesson?.lesson_order || 1}
                            </span>

                            <span
                              className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-extrabold border z-10 ${fileMeta.badgeClass}`}
                            >
                              {fileMeta.extLabel}
                            </span>

                            <div
                              className={`w-14 h-14 bg-gradient-to-br ${fileMeta.iconBoxClass} bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-2xl flex items-center justify-center z-10 transition-all duration-300 group-hover/doc:scale-110 shadow-md border text-3xl`}
                            >
                              {fileMeta.iconEmoji}
                            </div>
                          </div>

                          <div className="px-0.5">
                            <h3
                              className="std-lsn-text-primary font-extrabold text-slate-900 text-sm line-clamp-2 mb-1.5 min-h-[38px] leading-snug group-hover:text-indigo-600 transition-colors"
                              title={doc.file_name}
                            >
                              {doc.file_name}
                            </h3>

                            <p
                              className="std-lsn-text-secondary text-xs font-semibold text-slate-500 line-clamp-1 mb-3.5"
                              title={doc.lesson?.title}
                            >
                              {doc.lesson?.title || doc.folder?.courseName}
                            </p>
                          </div>
                        </div>

                        <div className="std-lsn-divider mt-auto pt-3 border-t border-gray-100">
                          <button
                            type="button"
                            disabled={isDownloading}
                            onClick={() =>
                              handleDownloadFile(
                                doc.file_path,
                                doc.file_name,
                                doc.id
                              )
                            }
                            className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-2xs disabled:opacity-60"
                          >
                            <ArrowDownTrayIcon className="w-4 h-4 stroke-[2.2]" />
                            <span>
                              {isDownloading
                                ? t('កំពុងទាញ...', 'Saving...')
                                : t('ទាញយក', 'Download')}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* បញ្ជីវីដេអូបង្រៀន                                                */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'videos' && (
            <div>
              {activeVidsList.length === 0 ? (
                <div className="std-lsn-surface bg-white rounded-3xl border border-gray-200/80 p-14 text-center space-y-3">
                  <VideoCameraIcon className="h-14 w-14 mx-auto text-purple-300" />
                  <h3 className="std-lsn-text-primary text-base font-extrabold text-gray-900">
                    {t(
                      'មិនទាន់មានវីដេអូបង្រៀននៅក្នុងមុខវិជ្ជានេះទេ',
                      'No video lectures available in this course'
                    )}
                  </h3>
                  {activeDocsList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('documents')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-extrabold cursor-pointer"
                    >
                      <DocumentIcon className="h-4 w-4" />
                      <span>
                        {t('ចុចមើលឯកសារមេរៀនវិញ', 'Switch to Documents')} (
                        {activeDocsList.length})
                      </span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                  {activeVidsList.map((video, idx) => {
                    const thumbnailUrl = getYouTubeThumbnail(video.video_url);

                    return (
                      <div
                        key={video.id || idx}
                        className="std-lsn-card bg-white p-4 rounded-2xl border border-slate-200/80 hover:border-purple-400 shadow-2xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group overflow-hidden"
                      >
                        <div>
                          <div
                            onClick={() => setPlayingVideo(video)}
                            className="relative aspect-video rounded-xl overflow-hidden mb-3.5 flex items-center justify-center cursor-pointer group/vid shadow-inner bg-slate-900"
                          >
                            {thumbnailUrl ? (
                              <div
                                className="absolute inset-0 bg-cover bg-center group-hover/vid:scale-105 transition-transform duration-700 ease-in-out z-0"
                                style={{
                                  backgroundImage: `url(${thumbnailUrl})`,
                                }}
                              >
                                <div className="absolute inset-0 bg-black/25 group-hover/vid:bg-black/40 transition-colors duration-500"></div>
                              </div>
                            ) : (
                              <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-950 z-0">
                                <div className="std-lsn-grid-pattern absolute inset-0 opacity-20"></div>
                              </div>
                            )}

                            <span className="absolute top-2 left-2 bg-slate-900/75 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-bold text-white z-10 border border-white/15">
                              {t('មេរៀនទី', 'Lesson')}{' '}
                              {video.lesson?.lesson_order || 1}
                            </span>

                            <div className="w-11 h-11 bg-white/30 group-hover/vid:bg-purple-600 backdrop-blur-md rounded-full flex items-center justify-center z-10 transition-all duration-300 group-hover/vid:scale-110 shadow-lg border border-white/40">
                              <PlayIcon className="w-5 h-5 text-white ml-0.5 stroke-[2.5]" />
                            </div>
                          </div>

                          <div className="px-0.5">
                            <h3
                              className="std-lsn-text-primary font-extrabold text-slate-900 text-sm line-clamp-2 mb-1.5 min-h-[38px] leading-snug group-hover:text-purple-600 transition-colors"
                              title={video.title}
                            >
                              {video.title}
                            </h3>

                            <p
                              className="std-lsn-text-secondary text-xs font-semibold text-slate-500 line-clamp-1 mb-3.5"
                              title={video.lesson?.title}
                            >
                              {video.lesson?.title || video.folder?.courseName}
                            </p>
                          </div>
                        </div>

                        <div className="std-lsn-divider mt-auto pt-3 border-t border-gray-100">
                          <button
                            type="button"
                            onClick={() => setPlayingVideo(video)}
                            className="w-full flex items-center justify-center gap-2 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-2xs"
                          >
                            <PlayIcon className="w-4 h-4 stroke-[2.5]" />
                            <span>{t('ចាក់វីដេអូមេរៀន', 'Watch Video')}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ================================================================== */}
      {/* 📌 4. BUILT-IN CINEMA VIDEO PLAYER MODAL (Portal ពេញអេក្រង់ 100%)   */}
      {/* ================================================================== */}
      {playingVideo &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 m-0 z-[9999] w-screen h-screen flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-fadeIn"
            onClick={() => setPlayingVideo(null)}
          >
            <div
              className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 sm:px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {t('មេរៀនទី', 'Lesson')}{' '}
                      {playingVideo.lesson?.lesson_order || 1}
                    </span>
                    <span className="text-xs font-bold text-slate-400 truncate">
                      {playingVideo.lesson?.course?.course_name ||
                        playingVideo.lesson?.title}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white truncate mt-1">
                    {playingVideo.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={getViewUrl(playingVideo.video_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {t('បើកផ្ទាំងថ្មី', 'Open Tab')}
                    </span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setPlayingVideo(null)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="relative aspect-video w-full bg-black">
                {extractYouTubeId(playingVideo.video_url) ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${extractYouTubeId(
                      playingVideo.video_url
                    )}?autoplay=1&rel=0`}
                    title={playingVideo.title}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                ) : (
                  <video
                    src={getViewUrl(playingVideo.video_url)}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  >
                    {t(
                      'កម្មវិធីរុករករបស់អ្នកមិនគាំទ្រការចាក់វីដេអូនេះទេ។',
                      'Your browser does not support the video tag.'
                    )}
                  </video>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ================================================================== */}
      {/* 📌 5. CSS សម្រាប់ទម្រង់យប់ (DARK MODE) ដោយមិនប៉ះពាល់ Scrollbar ទូទៅ */}
      {/* ================================================================== */}
      <style>{`
        .std-lsn-grid-pattern {
          background-image: radial-gradient(rgba(255, 255, 255, 0.25) 1px, transparent 1px);
          background-size: 20px 20px;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        html.dark .std-lsn-surface,
        html.dark .std-lsn-card,
        html.dark .std-lsn-year-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .std-lsn-card:hover,
        html.dark .std-lsn-year-card:hover {
          border-color: #6366f1 !important;
        }
        html.dark .std-lsn-subbox,
        html.dark .std-lsn-tag {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .std-lsn-course-pill {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #e2e8f0 !important;
        }
        html.dark .std-lsn-course-pill:hover {
          border-color: #6366f1 !important;
          color: #818cf8 !important;
        }
        html.dark .std-lsn-search-input {
          color: #f8fafc !important;
        }
        html.dark .std-lsn-search-input::placeholder {
          color: #64748b !important;
        }
        html.dark .std-lsn-tab-inactive {
          color: #94a3b8 !important;
        }
        html.dark .std-lsn-tab-inactive:hover {
          color: #e2e8f0 !important;
        }
        html.dark .std-lsn-pill-btn {
          background-color: rgba(99, 102, 241, 0.15) !important;
          border-color: rgba(99, 102, 241, 0.35) !important;
          color: #818cf8 !important;
        }
        html.dark .std-lsn-pill-btn:hover {
          background-color: #4f46e5 !important;
          color: #ffffff !important;
        }
        html.dark .std-lsn-text-primary {
          color: #f8fafc !important;
        }
        html.dark .std-lsn-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .std-lsn-divider {
          border-color: #334155 !important;
        }
      `}</style>
    </div>
  );
};

export default StudentLessons;
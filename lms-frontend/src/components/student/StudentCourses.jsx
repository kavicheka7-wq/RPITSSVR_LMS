// src/components/student/StudentCourses.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  BookOpenIcon,
  ExclamationCircleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  BuildingLibraryIcon,
  FolderIcon,
  ClipboardDocumentListIcon,
  AcademicCapIcon,
  CalendarDaysIcon,
  SparklesIcon,
  CheckBadgeIcon,
  UserIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនីសិស្សម្នាក់ៗ (User-Scoped 0ms Instant Cache)
// ============================================================================
const LAST_ACTIVE_STUDENT_UID_KEY = 'lms_last_active_student_uid';

const CACHE_KEY_SHARED_COURSES = 'cached_student_courses_list_v3';
const CACHE_KEY_SHARED_COURSES_META = 'cached_student_courses_meta_v3';
const CACHE_KEY_SHARED_ENROLLMENTS = 'cached_student_dashboard_enrollments_v8';
const CACHE_KEY_TEACHER_AVATARS = 'cached_student_teacher_avatars_v1';

const getCoursesCacheKey = (uid) => `cached_student_courses_list_v10_${uid}`;
const getCoursesMetaCacheKey = (uid) => `cached_student_courses_meta_v10_${uid}`;
const getEnrollmentsCacheKey = (uid) => `cached_student_dashboard_enrollments_v10_${uid}`;
const getAssignmentsCacheKey = (uid) => `cached_student_assignments_list_v10_${uid}`;
const getScoresCacheKey = (uid) => `cached_student_scores_list_v10_${uid}`;
const getAttendanceCacheKey = (uid) => `cached_student_attendance_list_v10_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់សិស្សម្នាក់ៗ (អានក្នុង 0ms គ្មានការគាំងទាក់)
const STUDENT_COURSES_MEM_CACHE = {
  uid: null,
  courses: null,
  meta: null,
  teacherAvatarMap: null,
  lastSyncedAt: 0,
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

// ✅ អានតារាងរូបថតគ្រូបង្រៀនពី RAM ភ្លាមៗក្នុង 0ms
const getTeacherAvatarMapSync = () => {
  if (
    STUDENT_COURSES_MEM_CACHE.teacherAvatarMap &&
    typeof STUDENT_COURSES_MEM_CACHE.teacherAvatarMap === 'object'
  ) {
    return STUDENT_COURSES_MEM_CACHE.teacherAvatarMap;
  }
  const stored = readStorageJson(CACHE_KEY_TEACHER_AVATARS, {});
  STUDENT_COURSES_MEM_CACHE.teacherAvatarMap =
    stored && typeof stored === 'object' ? stored : {};
  return STUDENT_COURSES_MEM_CACHE.teacherAvatarMap;
};

// ✅ រក្សាទុកបញ្ជីមុខវិជ្ជា និងរូបថតគ្រូដោយលឿនបំផុត (0ms Synchronous Slim Save គ្មាន Canvas)
const persistStudentCoursesFast = (uid, coursesList, metaObj) => {
  if (!Array.isArray(coursesList)) return;
  const avatarMap = getTeacherAvatarMapSync();
  let avatarMapUpdated = false;

  const extractAndSlimTeacher = (person, courseIdFallback = '') => {
    if (!person || typeof person !== 'object') return person;
    const rawImg =
      person.profile_image_url ||
      person.profile_image ||
      person.user?.profile_image_url ||
      person.user?.profile_image ||
      null;

    const tchId = String(person.id || person.user_id || '');
    const cid = String(courseIdFallback || '');

    if (rawImg && typeof rawImg === 'string') {
      if (cid && avatarMap[`crs_${cid}`] !== rawImg) {
        avatarMap[`crs_${cid}`] = rawImg;
        avatarMapUpdated = true;
      }
      if (tchId && avatarMap[`tch_${tchId}`] !== rawImg) {
        avatarMap[`tch_${tchId}`] = rawImg;
        avatarMapUpdated = true;
      }
    }

    const isHeavyBase64 =
      typeof rawImg === 'string' &&
      rawImg.startsWith('data:') &&
      rawImg.length > 2000;

    const copy = { ...person };
    if (isHeavyBase64) {
      delete copy.profile_image;
      delete copy.profile_image_url;
    }
    if (copy.user && typeof copy.user === 'object') {
      const uCopy = { ...copy.user };
      if (
        typeof uCopy.profile_image === 'string' &&
        uCopy.profile_image.startsWith('data:')
      ) {
        delete uCopy.profile_image;
        delete uCopy.profile_image_url;
      }
      copy.user = uCopy;
    }
    return copy;
  };

  const slimCourses = coursesList.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const courseInfo = item.course || item;
    const cid = String(item.course_id || courseInfo.id || item.id || '');

    const copy = { ...item };
    if (copy.teacher) {
      copy.teacher = extractAndSlimTeacher(copy.teacher, cid);
    }
    if (copy.teacher_profile) {
      copy.teacher_profile = extractAndSlimTeacher(copy.teacher_profile, cid);
    }
    if (copy.course && typeof copy.course === 'object') {
      const cCopy = { ...copy.course };
      if (cCopy.teacher) {
        cCopy.teacher = extractAndSlimTeacher(cCopy.teacher, cid);
      }
      if (cCopy.teacher_profile) {
        cCopy.teacher_profile = extractAndSlimTeacher(cCopy.teacher_profile, cid);
      }
      copy.course = cCopy;
    }
    return copy;
  });

  if (avatarMapUpdated) {
    try {
      localStorage.setItem(CACHE_KEY_TEACHER_AVATARS, JSON.stringify(avatarMap));
    } catch {}
  }

  try {
    const crsStr = JSON.stringify(slimCourses);
    localStorage.setItem(getCoursesCacheKey(uid), crsStr);
    localStorage.setItem(CACHE_KEY_SHARED_COURSES, crsStr);

    if (metaObj) {
      const metaStr = JSON.stringify(metaObj);
      localStorage.setItem(getCoursesMetaCacheKey(uid), metaStr);
      localStorage.setItem(CACHE_KEY_SHARED_COURSES_META, metaStr);
    }
  } catch {}
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

// ✅ អនុគមន៍ស្រង់យកបញ្ជីមុខវិជ្ជាពី API Response គ្រប់ទម្រង់ទាំងអស់
const extractValidCoursesList = (resData) => {
  if (!resData) return [];
  if (Array.isArray(resData)) return resData;
  if (Array.isArray(resData.data)) return resData.data;
  if (Array.isArray(resData.courses)) return resData.courses;
  if (Array.isArray(resData.enrollments)) return resData.enrollments;
  if (resData.data && Array.isArray(resData.data.data)) return resData.data.data;
  if (resData.data && Array.isArray(resData.data.courses)) return resData.data.courses;
  return [];
};

// ពណ៌គម្របមុខវិជ្ជាបែបទំនើប (Visual Course Studio Themes)
const COURSE_COVER_THEMES = [
  {
    coverBg: 'from-blue-600 via-indigo-600 to-violet-700',
    floatingIconBg: 'from-blue-500 to-indigo-600 text-white shadow-blue-500/30',
    avatarBg: 'from-blue-500 to-indigo-600 text-white',
    glow: 'hover:shadow-[0_14px_30px_-12px_rgba(79,70,229,0.28)]',
  },
  {
    coverBg: 'from-emerald-600 via-teal-600 to-cyan-700',
    floatingIconBg: 'from-emerald-500 to-teal-600 text-white shadow-emerald-500/30',
    avatarBg: 'from-emerald-500 to-teal-600 text-white',
    glow: 'hover:shadow-[0_14px_30px_-12px_rgba(16,185,129,0.28)]',
  },
  {
    coverBg: 'from-violet-600 via-purple-600 to-fuchsia-700',
    floatingIconBg: 'from-purple-500 to-fuchsia-600 text-white shadow-purple-500/30',
    avatarBg: 'from-purple-500 to-fuchsia-600 text-white',
    glow: 'hover:shadow-[0_14px_30px_-12px_rgba(147,51,234,0.28)]',
  },
  {
    coverBg: 'from-amber-500 via-orange-500 to-rose-600',
    floatingIconBg: 'from-amber-500 to-orange-600 text-white shadow-amber-500/30',
    avatarBg: 'from-amber-500 to-orange-600 text-white',
    glow: 'hover:shadow-[0_14px_30px_-12px_rgba(245,158,11,0.28)]',
  },
];

const StudentCourses = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [failedAvatars, setFailedAvatars] = useState({});

  const currentStudentId = useMemo(() => {
    const uid = resolveStudentUid(user);
    ensureCleanStudentSessionCache(uid);
    return uid;
  }, [user]);

  if (
    STUDENT_COURSES_MEM_CACHE.uid &&
    STUDENT_COURSES_MEM_CACHE.uid !== currentStudentId
  ) {
    STUDENT_COURSES_MEM_CACHE.courses = null;
    STUDENT_COURSES_MEM_CACHE.meta = null;
    STUDENT_COURSES_MEM_CACHE.lastSyncedAt = 0;
  }
  STUDENT_COURSES_MEM_CACHE.uid = currentStudentId;

  // ✅ ១. អានពី Cache ភ្លាមៗក្នុង 0 វិនាទី
  const [courses, setCourses] = useState(() => {
    if (Array.isArray(STUDENT_COURSES_MEM_CACHE.courses)) {
      return STUDENT_COURSES_MEM_CACHE.courses;
    }
    const fromUserCourse = readStorageJson(
      getCoursesCacheKey(currentStudentId),
      null
    );
    if (Array.isArray(fromUserCourse)) {
      STUDENT_COURSES_MEM_CACHE.courses = fromUserCourse;
      return fromUserCourse;
    }
    const fromUserDash = readStorageJson(
      getEnrollmentsCacheKey(currentStudentId),
      null
    );
    if (Array.isArray(fromUserDash)) {
      STUDENT_COURSES_MEM_CACHE.courses = fromUserDash;
      return fromUserDash;
    }
    const fromShared =
      readStorageJson(CACHE_KEY_SHARED_COURSES, null) ||
      readStorageJson(CACHE_KEY_SHARED_ENROLLMENTS, []);
    STUDENT_COURSES_MEM_CACHE.courses = fromShared;
    return fromShared;
  });

  const [page, setPage] = useState(1);
  const [perPage] = useState(12);
  const [meta, setMeta] = useState(() => {
    if (STUDENT_COURSES_MEM_CACHE.meta) return STUDENT_COURSES_MEM_CACHE.meta;
    const cachedMeta =
      readStorageJson(getCoursesMetaCacheKey(currentStudentId), null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES_META, {
        current_page: 1,
        last_page: 1,
        total: 0,
        per_page: 12,
      });
    STUDENT_COURSES_MEM_CACHE.meta = cachedMeta;
    return cachedMeta;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);

  // ============================================================================
  // 📌 ផ្នែកទី២៖ ការទាញទិន្នន័យពី Backend API ដោយមិនរាំងស្ទះ UI (0ms Sync)
  // ============================================================================
  const fetchCourses = useCallback(
    async (forceRefresh = false) => {
      const now = Date.now();
      const cachedForUser =
        STUDENT_COURSES_MEM_CACHE.courses !== null
          ? STUDENT_COURSES_MEM_CACHE.courses
          : readStorageJson(getCoursesCacheKey(currentStudentId), null) ||
            readStorageJson(getEnrollmentsCacheKey(currentStudentId), null);

      if (page === 1 && Array.isArray(cachedForUser) && cachedForUser.length > 0) {
        setCourses(cachedForUser);
        STUDENT_COURSES_MEM_CACHE.courses = cachedForUser;

        if (
          !forceRefresh &&
          STUDENT_COURSES_MEM_CACHE.uid === currentStudentId &&
          now - STUDENT_COURSES_MEM_CACHE.lastSyncedAt < 25000
        ) {
          return;
        }
      }

      try {
        let coursesData = [];
        let newMeta = null;

        try {
          const response = await api.get('/student/courses', {
            params: { page, per_page: perPage },
          });
          coursesData = extractValidCoursesList(response.data);
          newMeta = response.data?.meta || response.data?.data?.meta || null;
        } catch (primaryErr) {
          try {
            const dashRes = await api.get('/student/dashboard');
            coursesData = extractValidCoursesList(
              dashRes.data?.enrollments || dashRes.data
            );
          } catch (dashErr) {
            const scoreRes = await api.get('/student/scores');
            coursesData = extractValidCoursesList(scoreRes.data);
          }
        }

        const resolvedMeta = newMeta || {
          current_page: page,
          last_page: 1,
          total: coursesData.length,
          per_page: perPage,
        };

        if (page === 1) {
          STUDENT_COURSES_MEM_CACHE.uid = currentStudentId;
          STUDENT_COURSES_MEM_CACHE.courses = coursesData;
          STUDENT_COURSES_MEM_CACHE.meta = resolvedMeta;
          STUDENT_COURSES_MEM_CACHE.lastSyncedAt = Date.now();
        }

        setCourses(coursesData);
        setMeta(resolvedMeta);

        if (page === 1) {
          persistStudentCoursesFast(
            currentStudentId,
            coursesData,
            resolvedMeta
          );
        }
      } catch (error) {
        console.error('Error fetching courses:', error);
      }
    },
    [page, perPage, currentStudentId]
  );

  useEffect(() => {
    fetchCourses(false);
  }, [fetchCourses]);

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ អនុគមន៍ជំនួយសម្រាប់រូបភាព ឈ្មោះគ្រូ និងការស្វែងរកក្នុង 0ms (O(1) Lookup)
  // ============================================================================
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

  const getTeacherInitials = (nameStr) => {
    if (!nameStr) return 'T';
    const parts = nameStr.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
    }
    return (parts[0]?.[0] || 'T').toUpperCase();
  };

  const fallbackScoresAndAttAvatars = useMemo(() => {
    const map = {};
    const cachedScores =
      readStorageJson(getScoresCacheKey(currentStudentId), null) ||
      readStorageJson('cached_student_scores_list_v5', []);
    if (Array.isArray(cachedScores)) {
      cachedScores.forEach((s) => {
        const cid = String(s?.course_id || s?.course?.id || '');
        const img =
          s?.course?.teacher_profile?.profile_image_url ||
          s?.course?.teacher_profile?.profile_image ||
          s?.course?.teacher?.profile_image_url ||
          s?.course?.teacher?.profile_image ||
          s?.course?.teacher?.user?.profile_image;
        if (cid && img && !map[cid]) map[cid] = img;
      });
    }
    return map;
  }, [currentStudentId]);

  const resolveTeacherImagePath = useCallback(
    (courseObj) => {
      if (!courseObj) return null;
      const direct =
        courseObj.teacher?.profile_image_url ||
        courseObj.teacher?.profile_image ||
        courseObj.teacher?.user?.profile_image_url ||
        courseObj.teacher?.user?.profile_image ||
        courseObj.teacher_profile?.profile_image_url ||
        courseObj.teacher_profile?.profile_image ||
        courseObj.teacher_profile?.user?.profile_image ||
        courseObj.teacher_image ||
        courseObj.rawItem?.teacher?.profile_image ||
        courseObj.rawItem?.teacher?.user?.profile_image ||
        courseObj.rawItem?.course?.teacher?.profile_image ||
        courseObj.rawItem?.course?.teacher?.user?.profile_image;

      if (direct) return direct;

      const cid = String(courseObj.id || courseObj.course_id || '');
      const tchId = String(
        courseObj.teacher?.id ||
          courseObj.teacher_profile?.id ||
          courseObj.teacher_id ||
          ''
      );
      const avatarMap = getTeacherAvatarMapSync();

      if (cid && avatarMap[`crs_${cid}`]) return avatarMap[`crs_${cid}`];
      if (tchId && avatarMap[`tch_${tchId}`]) return avatarMap[`tch_${tchId}`];
      if (cid && fallbackScoresAndAttAvatars[cid]) {
        return fallbackScoresAndAttAvatars[cid];
      }

      return null;
    },
    [fallbackScoresAndAttAvatars]
  );

  const studentDeptName = useMemo(() => {
    const firstCourse = courses[0]?.course || courses[0];
    return (
      user?.department?.department_name ||
      user?.department?.name ||
      user?.student?.department?.department_name ||
      user?.student?.department?.name ||
      firstCourse?.department?.department_name ||
      firstCourse?.department?.name ||
      t('វិទ្យាសាស្ត្រកុំព្យូទ័រ', 'Computer Science')
    );
  }, [user, courses, t]);

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

  const enrichedCourses = useMemo(() => {
    if (!Array.isArray(courses)) return [];
    return courses.map((item, idx) => {
      const courseInfo = item?.course || item || {};
      const courseId = item?.course_id || courseInfo.id || item?.id;
      const teacherProfile =
        courseInfo.teacher_profile ||
        courseInfo.teacherProfile ||
        item?.teacher_profile ||
        item?.teacherProfile ||
        null;

      return {
        ...courseInfo,
        id: courseId,
        course_id: courseId,
        course_code: courseInfo.course_code || item?.course_code || '',
        course_name:
          courseInfo.course_name ||
          courseInfo.name ||
          item?.course_name ||
          t('មុខវិជ្ជាសិក្សា', 'Course'),
        description: courseInfo.description || item?.description || '',
        credit: Number(courseInfo.credit ?? item?.credit ?? 3) || 3,
        department: courseInfo.department || item?.department || null,
        teacher: courseInfo.teacher || item?.teacher || null,
        teacher_profile: teacherProfile,
        lessons_count: Number(courseInfo.lessons_count ?? item?.lessons_count ?? 0),
        assignments_count: Number(
          courseInfo.assignments_count ?? item?.assignments_count ?? 0
        ),
        quizzes_count: Number(courseInfo.quizzes_count ?? item?.quizzes_count ?? 0),
        rawItem: item,
        themeIndex: idx,
      };
    });
  }, [courses, t]);

  const courseStats = useMemo(() => {
    let total = enrichedCourses.length;
    let totalCredits = 0;
    let totalLessons = 0;
    let totalAssignments = 0;
    let totalQuizzes = 0;

    enrichedCourses.forEach((c) => {
      totalCredits += Number(c.credit || 3);
      totalLessons += Number(c.lessons_count || 0);
      totalAssignments += Number(c.assignments_count || 0);
      totalQuizzes += Number(c.quizzes_count || 0);
    });

    if (totalAssignments === 0) {
      const cachedAsg =
        readStorageJson(getAssignmentsCacheKey(currentStudentId), null) ||
        readStorageJson('cached_student_assignments_list_v5', []);
      if (Array.isArray(cachedAsg) && cachedAsg.length > 0) {
        totalAssignments = cachedAsg.length;
      }
    }

    return {
      total,
      totalCredits,
      totalLessons,
      totalAssignments,
      totalQuizzes,
    };
  }, [enrichedCourses, currentStudentId]);

  // ============================================================================
  // 📌 ផ្នែកទី៤៖ បង្កើតបញ្ជីគ្រូបង្រៀនសម្រាប់ប្រអប់រំកិលស្វ័យប្រវត្តិ
  // ============================================================================
  const courseInstructors = useMemo(() => {
    const map = new Map();

    const cachedScores =
      readStorageJson(getScoresCacheKey(currentStudentId), null) ||
      readStorageJson('cached_student_scores_list_v5', []);
    const combinedList = [...enrichedCourses];

    if (Array.isArray(cachedScores)) {
      cachedScores.forEach((sc) => {
        const scCourse = sc?.course || sc;
        const cid = sc?.course_id || scCourse?.id;
        if (
          cid &&
          !combinedList.some((existing) => String(existing.id) === String(cid))
        ) {
          combinedList.push({
            ...scCourse,
            id: cid,
            course_id: cid,
          });
        }
      });
    }

    combinedList.forEach((course, idx) => {
      const name = getTeacherDisplayName(course);
      const rawImg = resolveTeacherImagePath(course);
      const imageUrl = getImageUrl(rawImg);
      const theme = COURSE_COVER_THEMES[idx % COURSE_COVER_THEMES.length];

      const key =
        course.teacher?.id ||
        course.teacher_id ||
        name.toLowerCase() ||
        `teacher_${idx}`;

      if (!map.has(String(key))) {
        map.set(String(key), {
          key: String(key),
          name,
          initials: getTeacherInitials(name),
          imageUrl,
          avatarBg: theme.avatarBg,
        });
      } else {
        const existing = map.get(String(key));
        if (!existing.imageUrl && imageUrl) {
          existing.imageUrl = imageUrl;
        }
      }
    });

    return Array.from(map.values());
  }, [
    enrichedCourses,
    currentStudentId,
    getTeacherDisplayName,
    resolveTeacherImagePath,
    getImageUrl,
  ]);

  useEffect(() => {
    if (courseInstructors.length <= 1 || isCarouselPaused) return;
    const timer = setInterval(() => {
      setActiveSlideIndex((prev) => (prev + 1) % courseInstructors.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [courseInstructors.length, isCarouselPaused]);

  useEffect(() => {
    if (activeSlideIndex >= courseInstructors.length) {
      setActiveSlideIndex(0);
    }
  }, [courseInstructors.length, activeSlideIndex]);

  const currentInstructor =
    courseInstructors[activeSlideIndex] || courseInstructors[0] || null;

  const handlePrevSlide = () => {
    if (courseInstructors.length === 0) return;
    setActiveSlideIndex(
      (prev) => (prev - 1 + courseInstructors.length) % courseInstructors.length
    );
  };

  const handleNextSlide = () => {
    if (courseInstructors.length === 0) return;
    setActiveSlideIndex((prev) => (prev + 1) % courseInstructors.length);
  };

  const filteredCourses = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return enrichedCourses;

    return enrichedCourses.filter((course) => {
      const nameMatch = (course.course_name || '').toLowerCase().includes(q);
      const codeMatch = (course.course_code || '').toLowerCase().includes(q);
      const descMatch = (course.description || '').toLowerCase().includes(q);
      const teacherMatch = getTeacherDisplayName(course).toLowerCase().includes(q);
      return nameMatch || codeMatch || descMatch || teacherMatch;
    });
  }, [enrichedCourses, searchTerm, getTeacherDisplayName]);

  return (
    <div className="stdc-page-bg max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 pb-28 lg:pb-12 mt-2 md:mt-0 animate-fadeIn">
      
      {/* ================================================================== */}
      {/* 📌 1. MODERN BENTO HERO SECTION                                    */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
        
        {/* ១.១. ប្រអប់ធំខាងឆ្វេង (8 Columns) */}
        <div className="lg:col-span-8 relative overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] bg-gradient-to-br from-blue-950 via-indigo-900 to-violet-950 p-6 sm:p-8 text-white shadow-xl border border-indigo-500/30 flex flex-col justify-between">
          <div className="stdc-hero-grid absolute inset-0 opacity-15 pointer-events-none"></div>
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
                <span>{t('មុខវិជ្ជាសិក្សា,', 'My Courses,')}</span>
                <span className="bg-gradient-to-r from-yellow-300 via-amber-200 to-white bg-clip-text text-transparent">
                  {getStudentBatchYear()}
                </span>
                <CheckBadgeIcon className="h-6 w-6 sm:h-7 sm:w-7 text-yellow-400 shrink-0" />
              </h1>

              <p className="text-xs sm:text-sm text-blue-100/80 max-w-2xl leading-relaxed font-medium">
                {t(
                  'ចូលមើល និងតាមដានមុខវិជ្ជាសិក្សាសកម្មទាំងអស់របស់អ្នក រួមទាំងមេរៀន វីដេអូបង្រៀន លំហាត់ និងកម្រងសំណួរប្រឡង។',
                  'Browse and track all your active enrolled courses, including lessons, video lectures, assignments, and quizzes.'
                )}
              </p>
            </div>
          </div>

          <div
            className="relative z-10 mt-6 pt-5 border-t border-white/15"
            onMouseEnter={() => setIsCarouselPaused(true)}
            onMouseLeave={() => setIsCarouselPaused(false)}
          >
            {!currentInstructor ? (
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-12 w-12 rounded-full bg-indigo-500/30 border border-indigo-300/30 flex items-center justify-center text-indigo-200 shrink-0">
                    <UserIcon className="h-6 w-6" />
                  </div>
                  <span className="text-base sm:text-lg font-black text-white truncate">
                    {t('មិនទាន់មានគ្រូបង្រៀន', 'No instructor assigned')}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-cyan-400/15 border border-cyan-300/35 text-xs font-extrabold text-cyan-200 shrink-0">
                  <AcademicCapIcon className="h-4 w-4 text-cyan-300" />
                  <span>{t('គ្រូបង្រៀន', 'Instructor')}</span>
                </span>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="relative overflow-hidden bg-white/10 hover:bg-white/[0.14] backdrop-blur-md border border-white/20 rounded-2xl px-4 py-3.5 transition-all duration-300">
                  <div
                    key={`${currentInstructor.key}-${activeSlideIndex}`}
                    className="std-carousel-slide flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div
                        className={`h-12 w-12 rounded-full bg-gradient-to-br ${currentInstructor.avatarBg} flex items-center justify-center font-black text-sm text-white shrink-0 overflow-hidden relative ring-2 ring-white/30 shadow-md transition-transform duration-300`}
                      >
                        {currentInstructor.imageUrl &&
                        !failedAvatars[`inst_${currentInstructor.key}`] ? (
                          <img
                            src={currentInstructor.imageUrl}
                            alt={currentInstructor.name}
                            loading="eager"
                            decoding="async"
                            className="h-full w-full object-cover rounded-full"
                            onError={() =>
                              setFailedAvatars((prev) => ({
                                ...prev,
                                [`inst_${currentInstructor.key}`]: true,
                              }))
                            }
                          />
                        ) : (
                          <span>{currentInstructor.initials}</span>
                        )}
                      </div>

                      <h3 className="text-base sm:text-lg font-black text-white truncate leading-snug">
                        {currentInstructor.name}
                      </h3>
                    </div>

                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-cyan-400/15 border border-cyan-300/35 text-xs font-extrabold text-cyan-200 shadow-2xs shrink-0">
                      <AcademicCapIcon className="h-4 w-4 text-cyan-300 shrink-0" />
                      <span>{t('គ្រូបង្រៀន', 'Instructor')}</span>
                    </span>
                  </div>
                </div>

                {courseInstructors.length > 1 && (
                  <div className="flex items-center justify-between px-1 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      {courseInstructors.map((inst, idx) => (
                        <button
                          key={inst.key}
                          type="button"
                          onClick={() => setActiveSlideIndex(idx)}
                          className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                            idx === activeSlideIndex
                              ? 'w-6 bg-yellow-400'
                              : 'w-1.5 bg-white/30 hover:bg-white/60'
                          }`}
                          title={inst.name}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-200/80">
                      <span>
                        {activeSlideIndex + 1} / {courseInstructors.length}
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

        {/* ១.២. ប្រអប់ពណ៌សខាងស្ដាំ (4 Columns) */}
        <div className="lg:col-span-4 stdc-surface-card bg-white rounded-[1.75rem] sm:rounded-[2rem] p-6 border border-gray-200/80 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/30 flex items-center justify-center shrink-0">
                  <AcademicCapIcon className="h-5 w-5 stroke-[2.2]" />
                </div>
                <div>
                  <h2 className="stdc-text-primary text-base sm:text-lg font-extrabold text-gray-900 leading-tight">
                    {t('សង្ខេបការសិក្សារបស់ខ្ញុំ', 'Academic Summary')}
                  </h2>
                  <p className="stdc-text-secondary text-[11px] font-medium text-gray-500 mt-0.5">
                    {t(
                      'ទិន្នន័យសរុបនៃមុខវិជ្ជា និងក្រេឌីតសិក្សា',
                      'Overview of your active courses & credits'
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <div className="stdc-subbox p-4 rounded-2xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-between gap-3 transition-all">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300/50 dark:border-emerald-500/30 flex items-center justify-center shrink-0 shadow-2xs">
                    <BookOpenIcon className="h-6 w-6 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0">
                    <span className="stdc-text-primary block text-lg sm:text-xl font-black text-gray-900 leading-tight">
                      {courseStats.total} {t('មុខវិជ្ជា', 'Courses')}
                    </span>
                    <span className="stdc-text-secondary block text-xs font-bold text-gray-500 mt-0.5">
                      {t('មុខវិជ្ជាសិក្សាសកម្ម', 'Active Enrolled Courses')}
                    </span>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-xl text-[11px] font-extrabold bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30 shrink-0">
                  {t('កំពុងសិក្សា', 'Active')}
                </span>
              </div>

              <div className="stdc-subbox p-4 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50/70 via-orange-50/40 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-between gap-3 transition-all">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-12 w-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300/50 dark:border-amber-500/30 flex items-center justify-center shrink-0 shadow-2xs">
                    <AcademicCapIcon className="h-6 w-6 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0">
                    <span className="stdc-text-primary block text-lg sm:text-xl font-black text-gray-900 leading-tight">
                      {courseStats.totalCredits} {t('ក្រេឌីត', 'Credits')}
                    </span>
                    <span className="stdc-text-secondary block text-xs font-bold text-gray-500 mt-0.5">
                      {t('ចំនួនក្រេឌីតសរុប', 'Total Course Credits')}
                    </span>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-xl text-[11px] font-extrabold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30 shrink-0">
                  {courseStats.totalCredits} Cr
                </span>
              </div>
            </div>
          </div>

          <div className="stdc-divider pt-4 mt-4 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="stdc-text-secondary font-bold text-gray-500">
              {t('គ្រូបង្រៀនសរុប៖', 'Instructors:')}{' '}
              <strong className="stdc-text-primary text-gray-800">
                {courseInstructors.length} {t('នាក់', '')}
              </strong>
            </span>

            <span className="font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <SparklesIcon className="h-3.5 w-3.5" />
              <span>{getStudentBatchYear()}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 📌 2. SEARCH BAR                                                   */}
      {/* ================================================================== */}
      <div className="stdc-surface-card bg-white rounded-2xl border border-gray-200/80 shadow-xs p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:max-w-md flex-1">
          <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder=""
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="stdc-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-gray-50/60 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-end w-full sm:w-auto gap-3">
          <span className="stdc-text-secondary text-xs font-bold text-gray-500">
            {t('បង្ហាញ៖', 'Showing:')}{' '}
            <strong className="text-indigo-600 dark:text-indigo-400">
              {filteredCourses.length}
            </strong>{' '}
            {t('មុខវិជ្ជា', 'Courses')}
          </span>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 📌 3. MAIN COURSES CARDS (Static Display - មិនបាច់ឱ្យចុចទេ)          */}
      {/* ================================================================== */}
      <div className="w-full">
        {filteredCourses.length === 0 ? (
          <div className="stdc-surface-card bg-white border border-gray-200/80 rounded-3xl p-14 text-center text-gray-500 shadow-xs">
            <div className="max-w-md mx-auto space-y-3">
              <ExclamationCircleIcon className="h-16 w-16 text-indigo-300 mx-auto" />
              <h3 className="stdc-text-primary text-base sm:text-lg font-extrabold text-gray-900">
                {searchTerm
                  ? t('មិនឃើញមុខវិជ្ជាតាមការស្វែងរកទេ', 'No matching courses found')
                  : t('មិនទាន់មានមុខវិជ្ជាសិក្សានៅឡើយទេ', 'No courses found')}
              </h3>
              <p className="stdc-text-secondary text-xs sm:text-sm font-medium text-gray-500">
                {searchTerm
                  ? t(
                      'សូមសាកល្បងប្តូរពាក្យស្វែងរកផ្សេងទៀត។',
                      'Please try searching with a different keyword.'
                    )
                  : t(
                      'អ្នកមិនទាន់បានចុះឈ្មោះចូលរៀនក្នុងមុខវិជ្ជាណាមួយសកម្មនៅឡើយទេ។',
                      'You are not currently enrolled in any active courses.'
                    )}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
            {filteredCourses.map((course, idx) => {
              const teacherName = getTeacherDisplayName(course);
              const teacherInitials = getTeacherInitials(teacherName);
              const rawImagePath = resolveTeacherImagePath(course);
              const imageUrl = getImageUrl(rawImagePath);
              const avatarKey = `crs_tch_${course.id}`;
              const hasTeacherAvatar = Boolean(
                imageUrl && !failedAvatars[avatarKey]
              );

              const theme =
                COURSE_COVER_THEMES[course.themeIndex % COURSE_COVER_THEMES.length];
              const credit = course.credit || 3;
              const deptName =
                course.department?.department_name ||
                course.department?.name ||
                studentDeptName;

              return (
                <div
                  key={course.id}
                  className={`stdc-course-card group relative bg-white rounded-2xl border border-gray-200/80 shadow-xs ${theme.glow} transition-all duration-300 overflow-hidden flex flex-col justify-between h-full select-none`}
                >
                  <div>
                    {/* ១. គម្របខាងលើនៃកាតមុខវិជ្ជា (Static div មិនអាចចុចបានទេ) */}
                    <div
                      className={`relative h-20 bg-gradient-to-r ${theme.coverBg} p-3 flex flex-col justify-between text-white overflow-hidden`}
                    >
                      <div className="stdc-hero-grid absolute inset-0 opacity-20 pointer-events-none"></div>
                      <BookOpenIcon className="absolute right-2 -bottom-3 h-16 w-16 text-white/[0.12] -rotate-12 pointer-events-none" />

                      <div className="relative z-10 flex items-center justify-between gap-1.5">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-950/35 backdrop-blur-md border border-white/20 text-[10px] font-black tracking-wider uppercase">
                          {course.course_code || 'COURSE'}
                        </span>

                        <span className="px-2 py-0.5 rounded-lg bg-white/20 backdrop-blur-md border border-white/25 text-[10px] font-extrabold">
                          {credit} {t('ក្រេឌីត', 'Cr')}
                        </span>
                      </div>

                      <div className="relative z-10 flex justify-end">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/20 backdrop-blur-md border border-emerald-300/30 text-[9px] font-extrabold text-emerald-100">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
                          {t('កំពុងបើកបង្រៀន', 'Active')}
                        </span>
                      </div>
                    </div>

                    {/* ✅ ២. តួកាតខាងក្រោម (កែសម្រួលផ្លាកឈ្មោះដេប៉ាតឺម៉ង់ឱ្យធ្លាក់ចុះមកក្រោមមានគម្លាតស្អាត មិនឆ្មៀតជាប់គម្របលើ) */}
                    <div className="px-4 pb-3 pt-2.5 relative">
                      <div className="flex items-center justify-between gap-2 mb-3 relative z-20">
                        <div
                          className={`-mt-7 h-10 w-10 rounded-xl bg-gradient-to-br ${theme.floatingIconBg} border-[3px] border-white dark:border-slate-800 flex items-center justify-center shadow-sm shrink-0`}
                        >
                          <BookOpenIcon className="h-4 w-4 stroke-[2.2]" />
                        </div>

                        <span className="stdc-code-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-gray-100/90 text-gray-700 border border-gray-200/80 truncate max-w-[155px] shadow-2xs">
                          <BuildingLibraryIcon className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                          <span className="truncate">{deptName}</span>
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h3 className="stdc-text-primary text-sm sm:text-base font-black text-gray-900 line-clamp-1">
                          {course.course_name}
                        </h3>
                        <p className="stdc-text-secondary text-[11px] text-gray-500 line-clamp-1 leading-relaxed font-medium">
                          {course.description ||
                            t(
                              'ចូលមើលមេរៀន វីដេអូបង្រៀន និងធ្វើលំហាត់អនុវត្តន៍។',
                              'Access lessons, videos, and exercises.'
                            )}
                        </p>
                      </div>

                      {/* ផ្លាកបង្ហាញចំនួន៖ មេរៀន • កិច្ចការ • កម្រងសំណួរ (Static span មិនអាចចុចបានទេ) */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-gray-100 dark:border-slate-700/70">
                        <span className="stdc-resource-tag inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50/80 text-blue-700 border border-blue-100">
                          <FolderIcon className="h-3 w-3" />
                          <span>
                            {t('មេរៀន', 'Lessons')}
                            {course.lessons_count > 0 ? ` (${course.lessons_count})` : ''}
                          </span>
                        </span>
                        <span className="stdc-resource-tag inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50/80 text-purple-700 border border-purple-100">
                          <ClipboardDocumentListIcon className="h-3 w-3" />
                          <span>
                            {t('កិច្ចការ', 'Homework')}
                            {course.assignments_count > 0
                              ? ` (${course.assignments_count})`
                              : ''}
                          </span>
                        </span>
                        <span className="stdc-resource-tag inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50/80 text-emerald-700 border border-emerald-100">
                          <AcademicCapIcon className="h-3 w-3" />
                          <span>
                            {t('កម្រងសំណួរ', 'Quizzes')}
                            {course.quizzes_count > 0 ? ` (${course.quizzes_count})` : ''}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ៣. ផ្នែកខាងក្រោមកាត៖ បង្ហាញរូបថតមូល និងឈ្មោះគ្រូបង្រៀន */}
                  <div className="stdc-card-footer px-4 py-2.5 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`h-8 w-8 rounded-full bg-gradient-to-br ${theme.avatarBg} flex items-center justify-center font-black text-[10px] shrink-0 overflow-hidden relative shadow-2xs`}
                      >
                        {hasTeacherAvatar ? (
                          <img
                            src={imageUrl}
                            alt={teacherName}
                            loading={idx < 8 ? 'eager' : 'lazy'}
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
                          <span>{teacherInitials}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="stdc-text-muted block text-[9px] font-extrabold uppercase tracking-wider text-gray-400 leading-none truncate">
                          {course.teacher_profile?.specialization ||
                            course.teacher?.specialization ||
                            t('គ្រូបង្រៀន', 'Instructor')}
                        </span>
                        <span
                          className="stdc-text-primary block text-xs font-extrabold text-gray-800 truncate mt-0.5"
                          title={teacherName}
                        >
                          {teacherName}
                        </span>
                      </div>
                    </div>

                    <span className="stdc-code-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-white text-indigo-600 border border-gray-200/80 shrink-0">
                      <CheckBadgeIcon className="h-3.5 w-3.5 text-emerald-500" />
                      <span>{t('បានចុះឈ្មោះ', 'Enrolled')}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {meta.last_page > 1 && (
          <div className="stdc-surface-card mt-8 bg-white rounded-2xl border border-gray-200/80 shadow-xs px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <p className="stdc-text-secondary text-xs font-bold text-gray-600">
              {t('ទំព័រ', 'Page')} {meta.current_page} / {meta.last_page} (
              {meta.total} {t('មុខវិជ្ជា', 'courses')})
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={meta.current_page === 1}
                className="stdc-page-btn px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
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
                        : 'stdc-page-btn bg-white border border-gray-200 hover:bg-gray-50'
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
                className="stdc-page-btn px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {t('បន្ទាប់', 'Next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* 📌 5. CSS សម្រាប់កំណត់ពណ៌ក្នុងទម្រង់យប់ និងចលនា Carousel              */}
      {/* ================================================================== */}
      <style>{`
        .stdc-hero-grid {
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

        html.dark .stdc-page-bg {
          background-color: transparent !important;
        }
        html.dark .stdc-surface-card,
        html.dark .stdc-course-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .stdc-subbox {
          background: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .stdc-divider {
          border-color: #334155 !important;
        }
        html.dark .stdc-card-footer {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .stdc-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        html.dark .stdc-input::placeholder {
          color: #64748b !important;
        }
        html.dark .stdc-resource-tag,
        html.dark .stdc-code-pill,
        html.dark .stdc-page-btn {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .stdc-page-btn:hover:not(:disabled) {
          background-color: #4f46e5 !important;
          border-color: #6366f1 !important;
          color: #ffffff !important;
        }
        html.dark .stdc-text-primary {
          color: #f8fafc !important;
        }
        html.dark .stdc-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .stdc-text-muted {
          color: #64748b !important;
        }
      `}</style>
    </div>
  );
};

export default StudentCourses;
// src/components/student/ViewAttendance.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  DocumentCheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  BookOpenIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  AcademicCapIcon,
  BuildingLibraryIcon,
  CheckBadgeIcon,
  SparklesIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនីសិស្សម្នាក់ៗ (User-Scoped 0ms Instant Cache)
// ============================================================================
const LAST_ACTIVE_STUDENT_UID_KEY = 'lms_last_active_student_uid';
const CACHE_KEY_TEACHER_AVATARS = 'cached_student_teacher_avatars_v1';

const getAttListCacheKey = (uid) => `cached_student_attendance_list_v8_${uid}`;
const getAttSummaryCacheKey = (uid) => `cached_student_attendance_summary_v8_${uid}`;
const getAttMetaCacheKey = (uid) => `cached_student_attendance_meta_v8_${uid}`;

const DEFAULT_SUMMARY = {
  present: 0,
  absent: 0,
  permission: 0,
  late: 0,
};

const DEFAULT_META = {
  current_page: 1,
  last_page: 1,
  total: 0,
  per_page: 20,
};

// ✅ Global Memory Cache បែងចែកតាម uid របស់សិស្សម្នាក់ៗ (អានក្នុង 0ms គ្មានការគាំងទាក់)
const STUDENT_ATT_MEM_CACHE = {
  uid: null,
  attendance: null,
  summary: null,
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

// ✅ អានតារាងរូបថតគ្រូបង្រៀនពី RAM ភ្លាមៗក្នុង 0ms (គ្មានការប្រើ Canvas ឱ្យទាក់អេក្រង់ឡើយ)
const getTeacherAvatarMapSync = () => {
  if (
    STUDENT_ATT_MEM_CACHE.teacherAvatarMap &&
    typeof STUDENT_ATT_MEM_CACHE.teacherAvatarMap === 'object'
  ) {
    return STUDENT_ATT_MEM_CACHE.teacherAvatarMap;
  }
  const stored = readStorageJson(CACHE_KEY_TEACHER_AVATARS, {});
  STUDENT_ATT_MEM_CACHE.teacherAvatarMap =
    stored && typeof stored === 'object' ? stored : {};
  return STUDENT_ATT_MEM_CACHE.teacherAvatarMap;
};

// ✅ រក្សាទុកបញ្ជីវត្តមាន និងរូបថតគ្រូដោយលឿនបំផុត (0ms Synchronous Slim Save គ្មាន Canvas)
const persistStudentAttendanceFast = (uid, attList, summaryObj, metaObj) => {
  if (!Array.isArray(attList)) return;
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

  const slimList = attList.map((rec) => {
    if (!rec || typeof rec !== 'object') return rec;
    const course = rec.course || {};
    const cid = String(course.id || rec.course_id || '');

    const copy = { ...rec };
    if (copy.student && typeof copy.student === 'object') {
      const sCopy = { ...copy.student };
      if (
        typeof sCopy.profile_image === 'string' &&
        sCopy.profile_image.startsWith('data:')
      ) {
        delete sCopy.profile_image;
      }
      copy.student = sCopy;
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
    localStorage.setItem(getAttListCacheKey(uid), JSON.stringify(slimList));
    if (summaryObj) {
      localStorage.setItem(getAttSummaryCacheKey(uid), JSON.stringify(summaryObj));
    }
    if (metaObj) {
      localStorage.setItem(getAttMetaCacheKey(uid), JSON.stringify(metaObj));
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
      const legacySharedKeys = [
        'cached_student_attendance_list_v3',
        'cached_student_attendance_summary_v3',
        'cached_student_attendance_meta_v3',
        'cached_student_dashboard_stats_v8',
        'cached_student_dashboard_enrollments_v8',
        'cached_student_dashboard_activity_v8',
        'cached_student_courses_list_v3',
        'cached_student_scores_list_v5',
        CACHE_KEY_TEACHER_AVATARS,
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

const ViewAttendance = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const abortControllerRef = useRef(null);
  const [failedAvatars, setFailedAvatars] = useState({});

  const currentStudentId = useMemo(() => {
    const uid = resolveStudentUid(user);
    ensureCleanStudentSessionCache(uid);
    return uid;
  }, [user]);

  if (
    STUDENT_ATT_MEM_CACHE.uid &&
    STUDENT_ATT_MEM_CACHE.uid !== currentStudentId
  ) {
    STUDENT_ATT_MEM_CACHE.attendance = null;
    STUDENT_ATT_MEM_CACHE.summary = null;
    STUDENT_ATT_MEM_CACHE.meta = null;
    STUDENT_ATT_MEM_CACHE.lastSyncedAt = 0;
  }
  STUDENT_ATT_MEM_CACHE.uid = currentStudentId;

  // ✅ ១. អានពី Cache តាមគណនីសិស្សម្នាក់ៗភ្លាមៗក្នុង 0 វិនាទី
  const [attendance, setAttendance] = useState(() => {
    if (Array.isArray(STUDENT_ATT_MEM_CACHE.attendance)) {
      return STUDENT_ATT_MEM_CACHE.attendance;
    }
    const cached = readStorageJson(getAttListCacheKey(currentStudentId), []);
    STUDENT_ATT_MEM_CACHE.attendance = cached;
    return cached;
  });

  const [summary, setSummary] = useState(() => {
    if (STUDENT_ATT_MEM_CACHE.summary) {
      return STUDENT_ATT_MEM_CACHE.summary;
    }
    const cached = readStorageJson(
      getAttSummaryCacheKey(currentStudentId),
      DEFAULT_SUMMARY
    );
    STUDENT_ATT_MEM_CACHE.summary = cached;
    return cached;
  });

  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [meta, setMeta] = useState(() => {
    if (STUDENT_ATT_MEM_CACHE.meta) {
      return STUDENT_ATT_MEM_CACHE.meta;
    }
    const cached = readStorageJson(
      getAttMetaCacheKey(currentStudentId),
      DEFAULT_META
    );
    STUDENT_ATT_MEM_CACHE.meta = cached;
    return cached;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // ============================================================================
  // 📌 ផ្នែកទី២៖ ការទាញទិន្នន័យនៅផ្ទៃខាងក្រោយដោយមិនរាំងស្ទះ UI (0ms Sync)
  // ============================================================================
  useEffect(() => {
    let isMounted = true;

    if (page === 1) {
      const cachedList = readStorageJson(
        getAttListCacheKey(currentStudentId),
        null
      );
      const cachedSum = readStorageJson(
        getAttSummaryCacheKey(currentStudentId),
        null
      );
      const cachedMeta = readStorageJson(
        getAttMetaCacheKey(currentStudentId),
        null
      );

      if (Array.isArray(cachedList)) {
        setAttendance(cachedList);
        STUDENT_ATT_MEM_CACHE.attendance = cachedList;
      }
      if (cachedSum) {
        setSummary(cachedSum);
        STUDENT_ATT_MEM_CACHE.summary = cachedSum;
      }
      if (cachedMeta) {
        setMeta(cachedMeta);
        STUDENT_ATT_MEM_CACHE.meta = cachedMeta;
      }
    }

    const now = Date.now();
    if (
      page === 1 &&
      STUDENT_ATT_MEM_CACHE.uid === currentStudentId &&
      Array.isArray(STUDENT_ATT_MEM_CACHE.attendance) &&
      STUDENT_ATT_MEM_CACHE.attendance.length > 0 &&
      now - STUDENT_ATT_MEM_CACHE.lastSyncedAt < 25000
    ) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fetchAttendance = async () => {
      try {
        const response = await api.get('/student/attendance', {
          params: {
            page,
            per_page: perPage,
          },
          signal: controller.signal,
        });
        if (!isMounted) return;

        const rawList =
          response.data?.attendance ||
          response.data?.data ||
          (Array.isArray(response.data) ? response.data : []);
        const validList = Array.isArray(rawList) ? rawList : [];

        const apiSum = response.data?.summary || {};
        const computedPresent =
          apiSum.present ??
          validList.filter((r) => r.status === 'Present').length;
        const computedAbsent =
          apiSum.absent ??
          validList.filter((r) => r.status === 'Absent').length;
        const computedPermission =
          apiSum.permission ??
          validList.filter((r) => r.status === 'Permission').length;
        const computedLate =
          apiSum.late ?? validList.filter((r) => r.status === 'Late').length;

        const newSummary = {
          present: computedPresent,
          absent: computedAbsent,
          permission: computedPermission,
          late: computedLate,
        };

        const newMeta = response.data?.meta || {
          current_page: page,
          last_page: 1,
          total: validList.length,
          per_page: perPage,
        };

        if (page === 1) {
          STUDENT_ATT_MEM_CACHE.uid = currentStudentId;
          STUDENT_ATT_MEM_CACHE.attendance = validList;
          STUDENT_ATT_MEM_CACHE.summary = newSummary;
          STUDENT_ATT_MEM_CACHE.meta = newMeta;
          STUDENT_ATT_MEM_CACHE.lastSyncedAt = Date.now();
        }

        setAttendance(validList);
        setSummary(newSummary);
        setMeta(newMeta);

        if (page === 1) {
          persistStudentAttendanceFast(
            currentStudentId,
            validList,
            newSummary,
            newMeta
          );
        }
      } catch (error) {
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
          return;
        }
        console.error('Error fetching student attendance:', error);
      }
    };

    fetchAttendance();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [page, perPage, currentStudentId]);

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ អនុគមន៍ជំនួយសម្រាប់ព័ត៌មានសិស្ស កាលបរិច្ឆេទខ្មែរសុទ្ធ និងការច្រោះទិន្នន័យ
  // ============================================================================
  const studentDeptName = useMemo(() => {
    const fromUser =
      user?.department?.department_name ||
      user?.department?.name ||
      user?.student?.department?.department_name ||
      user?.student?.department?.name;
    if (fromUser) return fromUser;

    const firstCourseDept =
      attendance[0]?.course?.department?.department_name ||
      attendance[0]?.course?.department?.name;
    return firstCourseDept || t('វិទ្យាសាស្ត្រកុំព្យូទ័រ', 'Computer Science');
  }, [user, attendance, t]);

  const studentStudyShiftKey = useMemo(() => {
    const rawShift =
      user?.study_shift ||
      user?.student?.study_shift ||
      attendance[0]?.student?.study_shift ||
      attendance[0]?.study_shift ||
      'Monday-Friday';
    return normalizeShiftKey(rawShift);
  }, [user, attendance]);

  const isWeekendShift = studentStudyShiftKey === 'Saturday-Sunday';

  const studentStudyShiftLabel = useMemo(() => {
    if (language === 'km') {
      return isWeekendShift ? 'វេនសិក្សា៖ សៅរ៍-អាទិត្យ' : 'វេនសិក្សា៖ ចន្ទ-សុក្រ';
    }
    return isWeekendShift ? 'Shift: Sat-Sun' : 'Shift: Mon-Fri';
  }, [isWeekendShift, language]);

  const getProfileImageUrl = useCallback((imagePath) => {
    if (!imagePath || typeof imagePath !== 'string') return null;
    const trimmed = imagePath.trim();
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
      import.meta.env.VITE_API_URL || 'http://localhost:8000'
    ).replace(/\/api\/?$/, '');
    const cleanPath = trimmed.replace(/^\/?storage\//, '').replace(/^\/+/, '');
    return `${baseUrl}/storage/${cleanPath}`;
  }, []);

  // ✅ ទាញយកឈ្មោះ និងរូបថតគ្រូបង្រៀនពី RAM Dictionary ក្នុងល្បឿន 0ms
  const resolveRecordTeacherInfo = useCallback(
    (record) => {
      const course = record?.course || {};
      const cid = String(course.id || record?.course_id || '');
      const tchProfile = course.teacher_profile || course.teacherProfile;
      const tch = course.teacher;
      const tchId = String(
        course.teacher_id || tch?.id || tchProfile?.id || ''
      );

      let fullName = '';
      if (tchProfile) {
        if (tchProfile.full_name && tchProfile.full_name !== 'គ្រូបង្រៀន') {
          fullName = tchProfile.full_name;
        } else if (tchProfile.first_name || tchProfile.last_name) {
          fullName =
            `${tchProfile.first_name || ''} ${tchProfile.last_name || ''}`.trim();
        } else if (tchProfile.name && tchProfile.name !== 'គ្រូបង្រៀន') {
          fullName = tchProfile.name;
        }
      }

      if (!fullName && tch) {
        if (tch.full_name && tch.full_name !== 'គ្រូបង្រៀន') {
          fullName = tch.full_name;
        } else if (tch.first_name || tch.last_name) {
          fullName = `${tch.first_name || ''} ${tch.last_name || ''}`.trim();
        } else if (tch.user?.first_name || tch.user?.last_name) {
          fullName =
            `${tch.user.first_name || ''} ${tch.user.last_name || ''}`.trim();
        } else if (tch.name && tch.name !== 'គ្រូបង្រៀន') {
          fullName = tch.name;
        } else if (tch.user?.name) {
          fullName = tch.user.name;
        }
      }

      if (!fullName) {
        fullName = course.teacher_name || t('គ្រូបង្រៀន', 'Instructor');
      }

      const nameParts = fullName.trim().split(/\s+/);
      const initials =
        nameParts.length >= 2
          ? `${nameParts[0][0] || ''}${nameParts[nameParts.length - 1][0] || ''}`.toUpperCase()
          : (nameParts[0]?.[0] || 'T').toUpperCase();

      const avatarMap = getTeacherAvatarMapSync();
      const rawImage =
        tchProfile?.profile_image_url ||
        tchProfile?.profile_image ||
        tchProfile?.user?.profile_image ||
        tch?.profile_image_url ||
        tch?.profile_image ||
        tch?.user?.profile_image_url ||
        tch?.user?.profile_image ||
        course?.teacher_image ||
        (cid && avatarMap[`crs_${cid}`]) ||
        (tchId && avatarMap[`tch_${tchId}`]);

      return {
        name: fullName,
        initials,
        image: getProfileImageUrl(rawImage),
      };
    },
    [t, getProfileImageUrl]
  );

  const formatAttendanceDate = useCallback(
    (dateString) => {
      if (!dateString) return '—';
      const str = String(dateString).trim();
      const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const d = match
        ? new Date(
            parseInt(match[1], 10),
            parseInt(match[2], 10) - 1,
            parseInt(match[3], 10)
          )
        : new Date(str);

      if (isNaN(d.getTime())) return str.slice(0, 10);

      if (language === 'km') {
        const khDays = [
          'អាទិត្យ',
          'ចន្ទ',
          'អង្គារ',
          'ពុធ',
          'ព្រហស្បតិ៍',
          'សុក្រ',
          'សៅរ៍',
        ];
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
        const dayName = khDays[d.getDay()];
        const dayNum = String(d.getDate()).padStart(2, '0');
        const monthName = khMonths[d.getMonth()];
        const yearNum = d.getFullYear();
        return `ថ្ងៃ${dayName} ទី${dayNum} ${monthName} ${yearNum}`;
      }

      return d.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
    },
    [language]
  );

  const resolveRecordTime = useCallback(
    (record) => {
      if (!record || record.status !== 'Late' || !record.late_time) {
        return null;
      }

      const formatHourMin = (hNum, mNum) => {
        const minutes = String(mNum).padStart(2, '0');
        if (language === 'km') {
          const period = hNum >= 12 ? 'ល្ងាច' : 'ព្រឹក';
          const hr12 = hNum % 12 || 12;
          return `${String(hr12).padStart(2, '0')}:${minutes} ${period}`;
        }
        const period = hNum >= 12 ? 'PM' : 'AM';
        const hr12 = hNum % 12 || 12;
        return `${String(hr12).padStart(2, '0')}:${minutes} ${period}`;
      };

      const parts = String(record.late_time).split(':');
      if (parts.length >= 2) {
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h) && !isNaN(m)) return formatHourMin(h, m);
      }

      return record.late_time;
    },
    [language]
  );

  const getShiftLabel = useCallback(
    (rawShift) => {
      const s = (rawShift || '').toString().trim();
      if (!s || s === '—') {
        const userShift =
          user?.study_shift || user?.student?.study_shift || 'Monday-Friday';
        return normalizeShiftKey(userShift) === 'Saturday-Sunday'
          ? t('សៅរ៍-អាទិត្យ', 'Sat-Sun')
          : t('ចន្ទ-សុក្រ', 'Mon-Fri');
      }
      if (normalizeShiftKey(s) === 'Saturday-Sunday') {
        return t('សៅរ៍-អាទិត្យ', 'Sat-Sun');
      }
      return t('ចន្ទ-សុក្រ', 'Mon-Fri');
    },
    [user, t]
  );

  const availableCourses = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(attendance)) return [];
    attendance.forEach((rec) => {
      const c = rec.course;
      const cid = c?.id || rec.course_id;
      if (cid && !map.has(String(cid))) {
        map.set(String(cid), {
          id: String(cid),
          name: c?.course_name || rec.course_name || t('មុខវិជ្ជា', 'Course'),
          code: c?.course_code || '',
        });
      }
    });
    return Array.from(map.values());
  }, [attendance, t]);

  const filteredAttendance = useMemo(() => {
    if (!Array.isArray(attendance)) return [];
    const q = searchTerm.toLowerCase().trim();

    return attendance.filter((rec) => {
      if (selectedCourse !== 'all') {
        const cid = rec.course?.id || rec.course_id;
        if (String(cid) !== String(selectedCourse)) return false;
      }

      if (statusFilter !== 'all' && rec.status !== statusFilter) {
        return false;
      }

      if (!q) return true;
      const courseName = (
        rec.course?.course_name ||
        rec.course_name ||
        ''
      ).toLowerCase();
      const courseCode = (rec.course?.course_code || '').toLowerCase();
      const teacherMeta = resolveRecordTeacherInfo(rec);
      const teacherName = (teacherMeta.name || '').toLowerCase();
      const dateStr = (rec.attendance_date || '').toLowerCase();

      return (
        courseName.includes(q) ||
        courseCode.includes(q) ||
        teacherName.includes(q) ||
        dateStr.includes(q)
      );
    });
  }, [
    attendance,
    selectedCourse,
    statusFilter,
    searchTerm,
    resolveRecordTeacherInfo,
  ]);

  const totalRecordsCount = useMemo(() => {
    const sum =
      (Number(summary.present) || 0) +
      (Number(summary.absent) || 0) +
      (Number(summary.permission) || 0) +
      (Number(summary.late) || 0);
    return sum > 0 ? sum : attendance.length;
  }, [summary, attendance.length]);

  const attendanceRate = useMemo(() => {
    if (totalRecordsCount === 0) return 100;
    const attended =
      (Number(summary.present) || 0) +
      (Number(summary.late) || 0) +
      (Number(summary.permission) || 0) * 0.5;
    return Math.min(
      100,
      Math.max(0, Math.round((attended / totalRecordsCount) * 100))
    );
  }, [summary, totalRecordsCount]);

  const getActiveStatusTitle = () => {
    if (statusFilter === 'Present') return t('វត្តមានមករៀន', 'Present Records');
    if (statusFilter === 'Absent') return t('អវត្តមាន', 'Absent Records');
    if (statusFilter === 'Permission')
      return t('ច្បាប់ឈប់សម្រាក', 'Permission Records');
    if (statusFilter === 'Late') return t('មករៀនយឺត', 'Late Records');
    return t('គ្រប់ស្ថានភាព', 'All Statuses');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Present':
        return (
          <span className="std-att-badge-emerald inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            <CheckCircleIcon className="w-4 h-4 mr-1.5 shrink-0" />
            {t('វត្តមាន', 'Present')}
          </span>
        );
      case 'Absent':
        return (
          <span className="std-att-badge-rose inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
            <XCircleIcon className="w-4 h-4 mr-1.5 shrink-0" />
            {t('អវត្តមាន', 'Absent')}
          </span>
        );
      case 'Permission':
        return (
          <span className="std-att-badge-blue inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
            <DocumentTextIcon className="w-4 h-4 mr-1.5 shrink-0" />
            {t('ច្បាប់', 'Permission')}
          </span>
        );
      case 'Late':
        return (
          <span className="std-att-badge-amber inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
            <ClockIcon className="w-4 h-4 mr-1.5 shrink-0" />
            {t('មកយឺត', 'Late')}
          </span>
        );
      default:
        return (
          <span className="std-att-code-pill inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold bg-gray-100 text-gray-700 border border-gray-200">
            {status}
          </span>
        );
    }
  };

  const statusSelectorItems = [
    {
      id: 'Present',
      title: t('វត្តមាន', 'Present'),
      count: summary.present || 0,
      icon: CheckCircleIcon,
      iconStyle:
        'bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
      activeGradient:
        'from-emerald-600 to-teal-600 border-emerald-500 shadow-emerald-500/25',
    },
    {
      id: 'Absent',
      title: t('អវត្តមាន', 'Absent'),
      count: summary.absent || 0,
      icon: XCircleIcon,
      iconStyle:
        'bg-rose-100 text-rose-600 border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30',
      activeGradient:
        'from-rose-600 to-pink-600 border-rose-500 shadow-rose-500/25',
    },
    {
      id: 'Permission',
      title: t('ច្បាប់', 'Permission'),
      count: summary.permission || 0,
      icon: DocumentTextIcon,
      iconStyle:
        'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
      activeGradient:
        'from-blue-600 to-indigo-600 border-blue-500 shadow-blue-500/25',
    },
    {
      id: 'Late',
      title: t('មកយឺត', 'Late'),
      count: summary.late || 0,
      icon: ClockIcon,
      iconStyle:
        'bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
      activeGradient:
        'from-amber-500 to-orange-500 border-amber-500 shadow-amber-500/25',
    },
  ];

  return (
    <div className="std-att-page max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 pb-28 lg:pb-12 mt-2 md:mt-0 animate-fadeIn">
      
      {/* ================================================================== */}
      {/* 1. MODERN BENTO HERO SECTION                                       */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
        
        {/* ១.១. ប្រអប់ធំខាងឆ្វេង (8 Columns) */}
        <div className="lg:col-span-8 relative overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] bg-gradient-to-br from-blue-950 via-indigo-900 to-violet-950 p-6 sm:p-8 text-white shadow-xl border border-indigo-500/30 flex flex-col justify-between">
          <div className="std-att-grid-pattern absolute inset-0 opacity-15 pointer-events-none"></div>
          <div className="absolute -top-24 -right-20 w-80 h-80 bg-blue-400/25 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-24 -left-20 w-72 h-72 bg-purple-500/25 rounded-full blur-3xl pointer-events-none"></div>

          <BuildingLibraryIcon className="absolute -right-6 -bottom-10 w-44 sm:w-60 h-44 sm:h-60 text-white/[0.04] -rotate-12 pointer-events-none" />

          <div className="relative z-10 space-y-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-400/15 border border-cyan-300/30 text-xs font-extrabold text-cyan-200">
                <AcademicCapIcon className="h-4 w-4 text-cyan-300 shrink-0" />
                <span>{studentDeptName}</span>
              </span>

              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-extrabold ${
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
                <span>{t('របាយការណ៍វត្តមាន,', 'Attendance,')}</span>
                <span className="bg-gradient-to-r from-yellow-300 via-amber-200 to-white bg-clip-text text-transparent">
                  {getActiveStatusTitle()}
                </span>
                <CheckBadgeIcon className="h-6 w-6 sm:h-7 sm:w-7 text-yellow-400 shrink-0" />
              </h1>

              <p className="text-xs sm:text-sm text-blue-100/80 max-w-2xl leading-relaxed font-medium">
                {t(
                  'ពិនិត្យមើល និងតាមដានប្រវត្តិវត្តមាន អវត្តមាន ច្បាប់ និងការមកយឺតរបស់អ្នកតាមមុខវិជ្ជា និងកាលបរិច្ឆេទនីមួយៗក្នុងដេប៉ាតឺម៉ង់របស់អ្នក។',
                  'Check and track your detailed attendance history, permissions, and late arrivals across all courses in your department.'
                )}
              </p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-3 sm:gap-4 mt-6 pt-5 border-t border-white/15">
            <div className="bg-white/[0.08] hover:bg-white/[0.12] backdrop-blur-md border border-white/15 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5 transition-all">
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-blue-500/25 border border-blue-300/30 flex items-center justify-center text-cyan-300 shrink-0">
                <DocumentCheckIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl font-black text-white leading-none">
                  {totalRecordsCount}
                </span>
                <span className="block text-[11px] sm:text-xs font-bold text-blue-200/90 truncate mt-1">
                  {t('កំណត់ត្រាសរុប', 'Total Records')}
                </span>
              </div>
            </div>

            <div className="bg-white/[0.08] hover:bg-white/[0.12] backdrop-blur-md border border-white/15 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5 transition-all">
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-yellow-300 shrink-0">
                <ChartBarIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl font-black text-white leading-none">
                  {attendanceRate}%
                </span>
                <span className="block text-[11px] sm:text-xs font-bold text-blue-200/90 truncate mt-1">
                  {t('អត្រាវត្តមាន', 'Attendance Rate')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ១.២. ប្រអប់ពណ៌សខាងស្ដាំ (4 Columns) */}
        <div className="lg:col-span-4 std-att-surface bg-white rounded-[1.75rem] sm:rounded-[2rem] p-6 border border-gray-200/80 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/30 flex items-center justify-center shrink-0">
                  <DocumentCheckIcon className="h-5 w-5 stroke-[2.2]" />
                </div>
                <div>
                  <h2 className="std-att-text-primary text-base sm:text-lg font-extrabold text-gray-900 leading-tight">
                    {t('តាមដានវត្តមានតាមស្ថានភាព', 'Filter by Status')}
                  </h2>
                  <p className="std-att-text-secondary text-[11px] font-medium text-gray-500 mt-0.5">
                    {t('ចុចជ្រើសរើសស្ថានភាពដើម្បីច្រោះមើល', 'Select a status to filter records')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
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
                    className={`group p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? `bg-gradient-to-br ${item.activeGradient} text-white shadow-md -translate-y-0.5`
                        : 'std-att-subbox bg-gray-50/80 hover:bg-indigo-50/50 border-gray-200/80 hover:border-indigo-300 text-gray-800 hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                          isSelected
                            ? 'bg-white/20 text-white border-white/30'
                            : item.iconStyle
                        }`}
                      >
                        <StatusIcon className="h-5 w-5 stroke-[2.2]" />
                      </div>
                      <span
                        className={`text-xs sm:text-sm font-black truncate ${
                          isSelected
                            ? 'text-white'
                            : 'std-att-text-primary text-gray-900'
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

          <div className="std-att-divider pt-4 mt-4 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="std-att-text-secondary font-bold text-gray-500">
              {t('វត្តមាន៖', 'Present:')}{' '}
              <strong className="std-att-text-primary text-gray-800">
                {summary.present || 0}
              </strong>{' '}
              • {t('អវត្តមាន៖', 'Absent:')}{' '}
              <strong className="std-att-text-primary text-gray-800">
                {summary.absent || 0}
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
      {/* 2. SEARCH & COURSE FILTER BAR                                      */}
      {/* ================================================================== */}
      <div className="std-att-surface bg-white rounded-2xl border border-gray-200/80 shadow-xs p-4 flex flex-col sm:flex-row gap-3.5 items-center justify-between">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:max-w-xs lg:max-w-sm flex-1">
            <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder=""
              className="std-att-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-gray-50/60 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all"
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

          {availableCourses.length > 0 && (
            <div className="relative w-full sm:w-64 lg:w-72 shrink-0">
              <BookOpenIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="std-att-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white font-medium text-gray-700 appearance-none cursor-pointer transition-all"
              >
                <option value="all">
                  {t('គ្រប់មុខវិជ្ជាទាំងអស់', 'All Courses')}
                </option>
                {availableCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `${c.code} - ` : ''}
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* 3. DETAILED ATTENDANCE TABLE                                       */}
      {/* ================================================================== */}
      <div className="std-att-surface bg-white rounded-[1.5rem] border border-gray-200 shadow-sm overflow-hidden">
        <div className="std-att-bar px-6 py-5 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h3 className="std-att-text-primary text-base sm:text-lg font-extrabold text-gray-900">
              {t('ប្រវត្តិវត្តមានលម្អិត', 'Detailed Attendance History')}
            </h3>
            <span className="std-att-badge-blue px-3 py-1 rounded-lg text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-100">
              {filteredAttendance.length} {t('កំណត់ត្រា', 'Records')}
            </span>
          </div>

          {(selectedCourse !== 'all' || statusFilter !== 'all' || searchTerm !== '') && (
            <button
              type="button"
              onClick={() => {
                setSelectedCourse('all');
                setStatusFilter('all');
                setSearchTerm('');
              }}
              className="std-att-badge-blue text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
            >
              {t('សម្អាតតម្រងស្វែងរក', 'Reset Filters')}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="std-att-thead bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-4 text-center text-[11px] font-extrabold text-gray-500 uppercase tracking-wider w-14">
                  {t('ល.រ', 'No')}
                </th>
                <th className="px-6 py-4 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('មុខវិជ្ជា', 'Course')}
                </th>
                <th className="px-6 py-4 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('គ្រូបង្រៀន', 'Instructor')}
                </th>
                <th className="px-6 py-4 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('វេនសិក្សា', 'Shift')}
                </th>
                <th className="px-6 py-4 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('កាលបរិច្ឆេទ', 'Date')}
                </th>
                <th className="px-6 py-4 text-center text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('ស្ថានភាព', 'Status')}
                </th>
              </tr>
            </thead>
            <tbody className="std-att-tbody bg-white">
              {filteredAttendance.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-20 text-center text-gray-400">
                    <div className="flex flex-col items-center">
                      <DocumentCheckIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="std-att-text-primary font-extrabold text-gray-700 text-base">
                        {searchTerm || selectedCourse !== 'all' || statusFilter !== 'all'
                          ? t(
                              'មិនឃើញមានកំណត់ត្រាវត្តមានតាមការច្រោះនេះទេ',
                              'No matching attendance records found'
                            )
                          : t(
                              'មិនទាន់មានប្រវត្តិវត្តមាននៅឡើយទេ',
                              'No attendance records found'
                            )}
                      </p>
                      <p className="std-att-text-secondary text-xs text-gray-400 mt-1">
                        {t(
                          'ប្រវត្តិវត្តមាននឹងបង្ហាញនៅទីនេះ នៅពេលគ្រូបង្រៀនកត់ត្រាវត្តមានប្រចាំថ្ងៃ។',
                          'Attendance records will appear here once recorded by your instructor.'
                        )}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAttendance.map((record, idx) => {
                  const teacherMeta = resolveRecordTeacherInfo(record);
                  const avatarKey = `att_t_${record.id || idx}`;
                  const hasTeacherAvatar = Boolean(
                    teacherMeta.image && !failedAvatars[avatarKey]
                  );

                  const courseName =
                    record.course?.course_name ||
                    record.course_name ||
                    t('មុខវិជ្ជាសិក្សា', 'Course');
                  const courseCode = record.course?.course_code || '';

                  const shiftLabel = getShiftLabel(
                    record.student?.study_shift || record.study_shift
                  );
                  const timeString = resolveRecordTime(record);

                  return (
                    <tr
                      key={record.id || idx}
                      className="std-att-row hover:bg-blue-50/30 transition-colors duration-200 group"
                    >
                      <td className="std-att-text-secondary px-4 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-400">
                        {(page - 1) * perPage + idx + 1}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap align-middle">
                        <div className="flex items-center gap-3">
                          <div className="std-att-badge-indigo h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
                            <BookOpenIcon className="h-4 w-4 stroke-[2.2]" />
                          </div>
                          <div>
                            <div className="std-att-text-primary text-sm font-extrabold text-gray-900">
                              {courseName}
                            </div>
                            {courseCode && (
                              <span className="std-att-text-secondary text-[11px] font-bold text-gray-400">
                                {courseCode}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap align-middle">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-extrabold text-xs shadow-2xs shrink-0 overflow-hidden">
                            {hasTeacherAvatar ? (
                              <img
                                src={teacherMeta.image}
                                alt={teacherMeta.name}
                                loading={idx < 12 ? 'eager' : 'lazy'}
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
                              <span>{teacherMeta.initials}</span>
                            )}
                          </div>
                          <span className="std-att-text-primary text-sm font-bold text-gray-800">
                            {teacherMeta.name}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap align-middle">
                        <span className="std-att-code-pill text-xs font-extrabold text-gray-700 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
                          {shiftLabel}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap align-middle">
                        <div className="flex items-center gap-3">
                          <div className="std-att-code-pill p-2 bg-gray-50 rounded-xl border border-gray-200 shrink-0">
                            <CalendarDaysIcon className="w-4 h-4 text-indigo-500" />
                          </div>
                          <div className="flex flex-col">
                            <span className="std-att-text-primary text-xs sm:text-sm text-gray-900 font-extrabold">
                              {formatAttendanceDate(record.attendance_date)}
                            </span>
                            {timeString && (
                              <span className="text-[11px] font-bold flex items-center gap-1 mt-0.5 text-amber-600 dark:text-amber-400">
                                <ClockIcon className="w-3.5 h-3.5" />
                                {timeString}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap align-middle text-center">
                        {getStatusBadge(record.status)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {meta.last_page > 1 && (
          <div className="std-att-bar px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
            <p className="std-att-text-secondary text-xs font-bold text-gray-600">
              {t('ទំព័រ', 'Page')} {meta.current_page} / {meta.last_page} ({meta.total}{' '}
              {t('កំណត់ត្រា', 'records')})
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={meta.current_page === 1}
                className="std-att-code-pill px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
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
                        : 'std-att-code-pill bg-white border border-gray-200 hover:bg-gray-50'
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
                className="std-att-code-pill px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {t('បន្ទាប់', 'Next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* 4. CSS សម្រាប់កំណត់ពណ៌ក្នុងទម្រង់យប់ (DARK MODE STYLING)               */}
      {/* ================================================================== */}
      <style>{`
        .std-att-grid-pattern {
          background-image: radial-gradient(rgba(255, 255, 255, 0.25) 1px, transparent 1px);
          background-size: 20px 20px;
        }

        .std-att-row + .std-att-row > td {
          border-top: 1px solid #f1f5f9;
        }

        html.dark .std-att-page {
          background-color: transparent !important;
        }
        html.dark .std-att-surface,
        html.dark .std-att-bar {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .std-att-subbox {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .std-att-divider {
          border-color: #334155 !important;
        }
        html.dark .std-att-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        html.dark .std-att-input::placeholder {
          color: #64748b !important;
        }
        html.dark .std-att-thead {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .std-att-thead th {
          color: #94a3b8 !important;
        }
        html.dark .std-att-tbody {
          background-color: #1e293b !important;
        }
        html.dark .std-att-row + .std-att-row > td {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .std-att-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }
        html.dark .std-att-text-primary {
          color: #f8fafc !important;
        }
        html.dark .std-att-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .std-att-code-pill {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .std-att-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .std-att-badge-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .std-att-badge-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .std-att-badge-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          color: #818cf8 !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .std-att-badge-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
      `}</style>
    </div>
  );
};

export default ViewAttendance;
// src/components/teacher/ManageAttendance.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import XLSX from 'xlsx-js-style';
import {
  CalendarDaysIcon,
  BookOpenIcon,
  UsersIcon,
  CheckIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentCheckIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  DocumentIcon,
  AcademicCapIcon,
  UserGroupIcon,
  CheckBadgeIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យ និងរូបភាពសិស្សតាមគណនីគ្រូម្នាក់ៗ (0ms Cache)
// ============================================================================
const CACHE_KEY_SHARED_COURSES = 'cached_teacher_courses_list_v6';
const CACHE_KEY_SHARED_STUDENTS = 'cached_teacher_students_list_v6';
const CACHE_KEY_SHARED_MAP = 'cached_teacher_course_map_v6';
const CACHE_KEY_STUDENT_AVATARS = 'cached_teacher_student_avatars_v1';

const getCoursesCacheKey = (uid) => `cached_teacher_courses_list_v8_${uid}`;
const getStudentsCacheKey = (uid) => `cached_teacher_students_list_v8_${uid}`;
const getCourseMapCacheKey = (uid) => `cached_teacher_course_map_v8_${uid}`;
const getAttHistoryMapKey = (uid) => `cached_teacher_att_history_map_v8_${uid}`;
const getSelectedYearKey = (uid) => `cached_teacher_attendance_selected_year_${uid}`;
const getSelectedCourseKey = (uid) => `cached_teacher_attendance_selected_course_${uid}`;
const getSelectedShiftKey = (uid) => `cached_teacher_attendance_selected_shift_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់គ្រូម្នាក់ៗ + រក្សារូបភាពសិស្សក្នុង RAM (0ms)
const ATTENDANCE_MEM_CACHE = {
  uid: null,
  courses: null,
  allStudents: null,
  courseMap: null,
  avatarMap: null,
  historyByCourse: {},
  lastSyncedStudentsAt: 0,
  lastSyncedHistoryAt: {},
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

// ✅ អានតារាងរូបភាពសិស្ស (Avatar Dictionary) ពី RAM ឬ Storage ភ្លាមៗក្នុង 0ms
const getAvatarMapSync = () => {
  if (
    ATTENDANCE_MEM_CACHE.avatarMap &&
    typeof ATTENDANCE_MEM_CACHE.avatarMap === 'object'
  ) {
    return ATTENDANCE_MEM_CACHE.avatarMap;
  }
  const stored = readStorageJson(CACHE_KEY_STUDENT_AVATARS, {});
  ATTENDANCE_MEM_CACHE.avatarMap =
    stored && typeof stored === 'object' ? stored : {};
  return ATTENDANCE_MEM_CACHE.avatarMap;
};

// ✅ បង្រួមរូបភាព Base64 ធំៗរបស់សិស្សម្នាក់ៗឱ្យមកត្រឹម 80x80px (~2KB) សម្រាប់បង្ហាញក្នុង 0ms
const compressStudentAvatarAsync = (studentId, rawDataUrl, onCompressed) => {
  if (!studentId || !rawDataUrl || typeof rawDataUrl !== 'string') return;

  const map = getAvatarMapSync();
  if (!rawDataUrl.startsWith('data:image') || rawDataUrl.length < 12000) {
    map[studentId] = rawDataUrl;
    if (typeof onCompressed === 'function') onCompressed(studentId, rawDataUrl);
    return;
  }

  if (!map[studentId]) {
    map[studentId] = rawDataUrl;
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
        const tinyWebp = canvas.toDataURL('image/webp', 0.78);
        const bestImg =
          tinyWebp.length < rawDataUrl.length ? tinyWebp : rawDataUrl;
        map[studentId] = bestImg;
        if (typeof onCompressed === 'function') onCompressed(studentId, bestImg);
      } catch {}
    };
    img.src = rawDataUrl;
  } catch {}
};

// ✅ ភ្ជាប់រូបភាពពី Avatar Dictionary មកដាក់ក្នុងបញ្ជីសិស្សវិញភ្លាមៗក្នុង 0ms
const hydrateStudentsWithAvatars = (list) => {
  if (!Array.isArray(list)) return [];
  const avatarMap = getAvatarMapSync();
  return list.map((stu) => {
    if (!stu || typeof stu !== 'object') return stu;
    const rawImg =
      stu.profile_image ||
      stu.user?.profile_image ||
      avatarMap[stu.id] ||
      avatarMap[stu.user_id] ||
      null;
    if (rawImg && stu.profile_image !== rawImg) {
      return { ...stu, profile_image: rawImg };
    }
    return stu;
  });
};

// ✅ រក្សាទុកបញ្ជីសិស្ស (Slim JSON) និងរូបភាព Thumbnail ដាច់ដោយឡែក ការពារពេញ localStorage 100%
const persistStudentsAndAvatarsSafely = (uid, studentsList) => {
  if (!Array.isArray(studentsList)) return;
  const avatarMap = getAvatarMapSync();
  let pendingCompressCount = 0;

  const saveAvatarMapToStorage = () => {
    try {
      const str = JSON.stringify(avatarMap);
      sessionStorage.setItem(CACHE_KEY_STUDENT_AVATARS, str);
      localStorage.setItem(CACHE_KEY_STUDENT_AVATARS, str);
    } catch {}
  };

  const slimStudents = studentsList.map((stu) => {
    if (!stu || typeof stu !== 'object') return stu;
    const rawImg = stu.profile_image || stu.user?.profile_image || null;

    if (stu.id && rawImg) {
      pendingCompressCount++;
      compressStudentAvatarAsync(stu.id, rawImg, () => {
        pendingCompressCount--;
        if (pendingCompressCount <= 0) {
          saveAvatarMapToStorage();
        }
      });
    }

    const copy = { ...stu };
    if (
      typeof copy.profile_image === 'string' &&
      copy.profile_image.startsWith('data:') &&
      copy.profile_image.length > 12000
    ) {
      copy.profile_image = null;
    }
    if (copy.user && typeof copy.user === 'object') {
      copy.user = {
        id: copy.user.id,
        status: copy.user.status,
        email: copy.user.email,
      };
    }
    return copy;
  });

  if (pendingCompressCount === 0) {
    saveAvatarMapToStorage();
  } else {
    setTimeout(saveAvatarMapToStorage, 300);
  }

  try {
    const serialized = JSON.stringify(slimStudents);
    sessionStorage.setItem(getStudentsCacheKey(uid), serialized);
    localStorage.setItem(getStudentsCacheKey(uid), serialized);
    localStorage.setItem(CACHE_KEY_SHARED_STUDENTS, serialized);
  } catch {}
};

// ✅ បង្រួមកំណត់ត្រាប្រវត្តិវត្តមាន (លុប nested student object ធ្ងន់ៗចេញ) មុនពេល Save ចូល localStorage
const slimAttendanceRecords = (records) => {
  if (!Array.isArray(records)) return [];
  return records.map((rec) => ({
    id: rec.id,
    course_id: rec.course_id,
    student_id: rec.student_id,
    attendance_date: rec.attendance_date,
    status: rec.status,
    late_time: rec.late_time || null,
  }));
};

// ✅ អនុគមន៍ចាប់យកអត្តសញ្ញាណគ្រូឱ្យជាក់លាក់តាំងពីវិនាទីដំបូង (គាំទ្រទាំង sessionStorage និង localStorage)
const resolveTeacherUid = (contextUser, contextTeacher) => {
  const target = contextUser || contextTeacher;
  if (target) {
    const id =
      target.id ||
      target.user_id ||
      target.teacher?.id ||
      target.email;
    if (id) return String(id);
  }
  try {
    const raw =
      sessionStorage.getItem('user') ||
      sessionStorage.getItem('auth_user') ||
      localStorage.getItem('user') ||
      localStorage.getItem('auth_user') ||
      sessionStorage.getItem('teacher') ||
      localStorage.getItem('teacher');
    if (raw) {
      const parsed = JSON.parse(raw);
      const u = parsed?.user || parsed?.data || parsed;
      const id = u?.id || u?.user_id || u?.teacher?.id || u?.email;
      if (id) return String(id);
    }
  } catch {}
  return 'default_teacher';
};

// ✅ អនុគមន៍កំណត់ប្រភេទវេនសិក្សារបស់សិស្ស (ចន្ទ-សុក្រ vs សៅរ៍-អាទិត្យ)
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
  if (
    s === 'monday-friday' ||
    s.includes('ចន្ទ') ||
    s.includes('សុក្រ') ||
    s.includes('mon') ||
    s.includes('weekday')
  ) {
    return 'Monday-Friday';
  }
  return s ? shiftVal : 'Monday-Friday';
};

// ✅ អនុគមន៍ស្រង់យកលេខឆ្នាំសិក្សា (1, 2, 3, 4) យ៉ាងជាក់លាក់
const detectStudentYearNum = (student) => {
  if (!student) return null;

  const rawBatch = (
    student.batch_year ??
    student.year ??
    student.academic_year ??
    student.student?.batch_year ??
    student.student?.year ??
    ''
  )
    .toString()
    .toLowerCase()
    .trim();

  if (/ឆ្នាំទី\s*(?:៤|4)|year\s*(?:4|៤)|\by4\b/.test(rawBatch)) return '4';
  if (/ឆ្នាំទី\s*(?:៣|3)|year\s*(?:3|៣)|\by3\b/.test(rawBatch)) return '3';
  if (/ឆ្នាំទី\s*(?:២|2)|year\s*(?:2|២)|\by2\b/.test(rawBatch)) return '2';
  if (/ឆ្នាំទី\s*(?:១|1)|year\s*(?:1|១)|\by1\b/.test(rawBatch)) return '1';

  if (rawBatch === '4' || rawBatch === '៤') return '4';
  if (rawBatch === '3' || rawBatch === '៣') return '3';
  if (rawBatch === '2' || rawBatch === '២') return '2';
  if (rawBatch === '1' || rawBatch === '១') return '1';

  const rawCode = (student.student_code ?? student.student?.student_code ?? '')
    .toString()
    .toLowerCase();
  if (/\by4\b|-y4-/.test(rawCode)) return '4';
  if (/\by3\b|-y3-/.test(rawCode)) return '3';
  if (/\by2\b|-y2-/.test(rawCode)) return '2';
  if (/\by1\b|-y1-/.test(rawCode)) return '1';

  return null;
};

// អនុគមន៍តម្រៀបសិស្សតាមអត្តលេខពីតូចទៅធំ
const sortStudentsOldestFirst = (list) => {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const codeA = (a.student_code || '').toString().trim();
    const codeB = (b.student_code || '').toString().trim();
    if (codeA && codeB && codeA !== codeB) {
      return codeA.localeCompare(codeB, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    }
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
};

// អនុគមន៍ទាញយកបញ្ជី Course IDs ដែលសិស្សបានចុះឈ្មោះរៀន
const extractStudentCourseIds = (student) => {
  if (!student) return [];
  const ids = new Set();
  if (student.course_id) ids.add(String(student.course_id));
  if (student.pivot?.course_id) ids.add(String(student.pivot.course_id));
  if (Array.isArray(student.enrolled_course_ids)) {
    student.enrolled_course_ids.forEach((id) => id != null && ids.add(String(id)));
  }
  if (Array.isArray(student.course_ids)) {
    student.course_ids.forEach((id) => id != null && ids.add(String(id)));
  }
  if (Array.isArray(student.courses)) {
    student.courses.forEach((c) => {
      const cid = c?.id ?? c?.course_id ?? c?.pivot?.course_id ?? c;
      if (cid != null && typeof cid !== 'object') ids.add(String(cid));
    });
  }
  if (Array.isArray(student.enrollments)) {
    student.enrollments.forEach((e) => {
      const cid = e?.course_id ?? e?.course?.id ?? e;
      if (cid != null && typeof cid !== 'object') ids.add(String(cid));
    });
  }
  return Array.from(ids);
};

// ✅ អនុគមន៍ត្រួតពិនិត្យថាតើសិស្សម្នាក់បានចុះឈ្មោះក្នុងមុខវិជ្ជាជាក់លាក់ (courseId) មែនឬអត់
const isStudentEnrolledInCourse = (student, courseId, courseMap) => {
  if (!student || !courseId) return false;
  const cid = String(courseId);

  const directCourseIds = extractStudentCourseIds(student);
  if (directCourseIds.includes(cid)) {
    return true;
  }

  const mappedIds = courseMap?.[cid];
  if (Array.isArray(mappedIds)) {
    return (
      mappedIds.includes(Number(student.id)) ||
      mappedIds.includes(String(student.id))
    );
  }

  return false;
};

// ✅ អនុគមន៍ត្រួតពិនិត្យថាតើសិស្សម្នាក់បានចុះឈ្មោះរៀនយ៉ាងតិច ១ មុខវិជ្ជារបស់គ្រូដែលបាន Login ហើយឬនៅ
const isStudentEnrolledInAnyTeacherCourse = (student, courseMap) => {
  if (!student) return false;
  if (typeof student.is_enrolled_with_teacher === 'boolean') {
    return student.is_enrolled_with_teacher;
  }
  const directCourseIds = extractStudentCourseIds(student);
  if (directCourseIds.length > 0) return true;

  if (courseMap && typeof courseMap === 'object') {
    return Object.values(courseMap).some(
      (arr) =>
        Array.isArray(arr) &&
        (arr.includes(Number(student.id)) || arr.includes(String(student.id)))
    );
  }
  return false;
};

// ✅ អនុគមន៍បញ្ជូនសារជូនដំណឹងចូលរូបកណ្ដឹងលើ Navbar
const pushLocalNotification = (notif) => {
  try {
    const userObjStr =
      sessionStorage.getItem('auth_user') ||
      sessionStorage.getItem('user') ||
      localStorage.getItem('auth_user') ||
      localStorage.getItem('user');
    let uid = 'default';
    let role = 'teacher';
    if (userObjStr) {
      const userObj = JSON.parse(userObjStr);
      const u = userObj?.user || userObj?.data || userObj;
      uid = u?.id || u?.user_id || u?.email || 'default';
      if (u?.role) {
        const rName =
          typeof u.role === 'string'
            ? u.role
            : u.role.role_name || u.role.name || 'teacher';
        role = rName.toString().toLowerCase();
      } else if (Number(u?.role_id) === 1) {
        role = 'admin';
      } else if (Number(u?.role_id) === 3) {
        role = 'student';
      }
    }

    const keysToUpdate = Array.from(
      new Set([`lms_notifs_teacher_${uid}`, `lms_notifs_${role}_${uid}`])
    );

    const newNotif = {
      id: `local_att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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

// ✅ អនុគមន៍គណនាបញ្ជីសិស្សតាម «កាតឆ្នាំសិក្សា» និងតាម «មុខវិជ្ជា» ព្រមទាំងផ្គូផ្គងវត្តមានតាមថ្ងៃខែភ្លាមៗក្នុង RAM (0ms)
const buildCourseStudentListSync = (
  selectedYear,
  courseId,
  allStudents,
  courseMap,
  historyByCourse,
  targetDate
) => {
  if (!Array.isArray(allStudents) || allStudents.length === 0) return [];

  const yKey = String(selectedYear || 'all');
  const cid = yKey !== 'all' ? String(courseId || '') : '';

  const targetStudents = allStudents.filter((student) => {
    if (yKey !== 'all' && yKey !== '') {
      const stuYear = detectStudentYearNum(student);
      if (stuYear !== yKey) return false;
    }

    if (cid !== '') {
      return isStudentEnrolledInCourse(student, cid, courseMap);
    }

    return true;
  });

  const courseHistory =
    cid !== '' && Array.isArray(historyByCourse?.[cid])
      ? historyByCourse[cid]
      : [];
  const recordsForDate = courseHistory.filter(
    (rec) => (rec.attendance_date || '').toString().slice(0, 10) === targetDate
  );

  const avatarMap = getAvatarMapSync();

  return sortStudentsOldestFirst(targetStudents).map((student) => {
    const targetUserId = student.user_id || student.user?.id || student.id;
    const matched = recordsForDate.find(
      (rec) =>
        String(rec.student_id) === String(targetUserId) ||
        String(rec.student_id) === String(student.id)
    );

    const resolvedAvatar =
      avatarMap[student.id] ||
      student.profile_image ||
      student.user?.profile_image ||
      avatarMap[student.user_id] ||
      null;

    return {
      ...student,
      profile_image: resolvedAvatar,
      is_enrolled_with_teacher: isStudentEnrolledInAnyTeacherCourse(
        student,
        courseMap
      ),
      attendance_status: matched?.status || 'Present',
      late_time: matched?.late_time ? matched.late_time.slice(0, 5) : '',
    };
  });
};

const ManageAttendance = () => {
  const { t, language } = useLanguage();
  const { user, teacher } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const courseSelectRef = useRef(null);
  const [failedAvatars, setFailedAvatars] = useState({});

  const initialRouteCourseId =
    searchParams.get('course_id') || location.state?.courseId || '';

  // ✅ កំណត់អត្តសញ្ញាណគ្រូបច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentTeacherId = useMemo(
    () => resolveTeacherUid(user, teacher),
    [user, teacher]
  );

  // បើប្ដូរគណនីគ្រូ ឱ្យសម្អាត RAM Cache ចាស់ចោលភ្លាមៗ
  if (ATTENDANCE_MEM_CACHE.uid && ATTENDANCE_MEM_CACHE.uid !== currentTeacherId) {
    ATTENDANCE_MEM_CACHE.courses = null;
    ATTENDANCE_MEM_CACHE.allStudents = null;
    ATTENDANCE_MEM_CACHE.courseMap = null;
    ATTENDANCE_MEM_CACHE.historyByCourse = {};
    ATTENDANCE_MEM_CACHE.lastSyncedStudentsAt = 0;
    ATTENDANCE_MEM_CACHE.lastSyncedHistoryAt = {};
  }
  ATTENDANCE_MEM_CACHE.uid = currentTeacherId;

  const [allStudents, setAllStudents] = useState(() => {
    if (Array.isArray(ATTENDANCE_MEM_CACHE.allStudents)) {
      return hydrateStudentsWithAvatars(ATTENDANCE_MEM_CACHE.allStudents);
    }
    const fromUserKey = readStorageJson(
      getStudentsCacheKey(currentTeacherId),
      null
    );
    if (Array.isArray(fromUserKey)) {
      const hydrated = hydrateStudentsWithAvatars(fromUserKey);
      ATTENDANCE_MEM_CACHE.allStudents = hydrated;
      return hydrated;
    }
    const fallback = readStorageJson(CACHE_KEY_SHARED_STUDENTS, []);
    return Array.isArray(fallback) ? hydrateStudentsWithAvatars(fallback) : [];
  });

  const [courses, setCourses] = useState(() => {
    if (Array.isArray(ATTENDANCE_MEM_CACHE.courses))
      return ATTENDANCE_MEM_CACHE.courses;
    const cached =
      readStorageJson(getCoursesCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES, []);
    ATTENDANCE_MEM_CACHE.courses = cached;
    return cached;
  });

  const [courseMap, setCourseMap] = useState(() => {
    if (ATTENDANCE_MEM_CACHE.courseMap) return ATTENDANCE_MEM_CACHE.courseMap;
    const cached =
      readStorageJson(getCourseMapCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_MAP, {});
    ATTENDANCE_MEM_CACHE.courseMap = cached;
    return cached;
  });

  const [historyByCourse, setHistoryByCourse] = useState(() => {
    if (Object.keys(ATTENDANCE_MEM_CACHE.historyByCourse).length > 0) {
      return ATTENDANCE_MEM_CACHE.historyByCourse;
    }
    const cached = readStorageJson(getAttHistoryMapKey(currentTeacherId), {});
    ATTENDANCE_MEM_CACHE.historyByCourse = cached;
    return cached;
  });

  // ✅ កាតឆ្នាំសិក្សា៖ 'all' | '1' | '2' | '3' | '4'
  const [selectedYear, setSelectedYear] = useState(() => {
    if (initialRouteCourseId) {
      const enrolledInRouteCourse = (
        ATTENDANCE_MEM_CACHE.allStudents || []
      ).find((s) =>
        isStudentEnrolledInCourse(
          s,
          initialRouteCourseId,
          ATTENDANCE_MEM_CACHE.courseMap
        )
      );
      const detectedY = detectStudentYearNum(enrolledInRouteCourse);
      if (detectedY) return detectedY;
    }
    try {
      return sessionStorage.getItem(getSelectedYearKey(currentTeacherId)) || 'all';
    } catch {
      return 'all';
    }
  });

  // ✅ មុខវិជ្ជាដែលបានជ្រើសរើស
  const [selectedCourse, setSelectedCourse] = useState(() => {
    if (initialRouteCourseId) return String(initialRouteCourseId);
    try {
      const savedYear =
        sessionStorage.getItem(getSelectedYearKey(currentTeacherId)) || 'all';
      if (savedYear === 'all') return '';
      return sessionStorage.getItem(getSelectedCourseKey(currentTeacherId)) || '';
    } catch {
      return '';
    }
  });

  // ✅ វេនសិក្សាដែលបានជ្រើសរើស៖ 'all' | 'Monday-Friday' | 'Saturday-Sunday'
  const [selectedShift, setSelectedShift] = useState(() => {
    try {
      return sessionStorage.getItem(getSelectedShiftKey(currentTeacherId)) || 'all';
    } catch {
      return 'all';
    }
  });

  // កាលបរិច្ឆេទបច្ចុប្បន្នតាមម៉ោងក្នុងស្រុក (YYYY-MM-DD)
  const [attendanceDate, setAttendanceDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [searchTerm, setSearchTerm] = useState('');

  // គណនាបញ្ជីសិស្សភ្លាមៗចេញពី Cache
  const [students, setStudents] = useState(() =>
    buildCourseStudentListSync(
      selectedYear,
      selectedCourse,
      ATTENDANCE_MEM_CACHE.allStudents,
      ATTENDANCE_MEM_CACHE.courseMap,
      ATTENDANCE_MEM_CACHE.historyByCourse,
      attendanceDate
    )
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  const getArrayData = (resData) => {
    if (!resData) return [];
    if (Array.isArray(resData)) return resData;
    if (Array.isArray(resData.data)) return resData.data;
    if (resData.data && Array.isArray(resData.data.data))
      return resData.data.data;
    return [];
  };

  // ✅ គាំទ្រទាំងរូបភាព Base64 Data URI ក្នុង Database លើ Railway និង URL ធម្មតា
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

  const getGenderLabel = (gender) => {
    const g = (gender || '').toString().trim().toLowerCase();
    if (language === 'km') {
      if (g === 'male' || g === 'm' || g === 'ប្រុស') return 'ប្រុស';
      if (g === 'female' || g === 'f' || g === 'ស្រី') return 'ស្រី';
      return gender ? 'ផ្សេងៗ' : '—';
    }
    if (g === 'male' || g === 'm' || g === 'ប្រុស') return 'Male';
    if (g === 'female' || g === 'f' || g === 'ស្រី') return 'Female';
    return gender || '—';
  };

  const isFemaleGender = (gender) => {
    const g = (gender || '').toString().trim().toLowerCase();
    return g === 'female' || g === 'f' || g === 'ស្រី';
  };

  const getStudyShiftLabel = useCallback(
    (shift) => {
      const norm = normalizeShiftKey(shift);
      if (language === 'km') {
        const shifts = {
          'Monday-Friday': 'ចន្ទ-សុក្រ',
          'Saturday-Sunday': 'សៅរ៍-អាទិត្យ',
        };
        return shifts[norm] || shift || '—';
      }
      return norm || shift || '—';
    },
    [language]
  );

  const getYearTextLabel = useCallback(
    (yearNum) => {
      if (yearNum === '1') return t('ឆ្នាំទី១', 'Year 1');
      if (yearNum === '2') return t('ឆ្នាំទី២', 'Year 2');
      if (yearNum === '3') return t('ឆ្នាំទី៣', 'Year 3');
      if (yearNum === '4') return t('ឆ្នាំទី៤', 'Year 4');
      return '';
    },
    [t]
  );

  // ✅ ១. រាប់ចំនួនសិស្សសរុប និងតាមឆ្នាំសិក្សា (ឆ្នាំទី១ ដល់ ឆ្នាំទី៤) សម្រាប់បង្ហាញលើកាតទាំង ៥
  const yearCounts = useMemo(() => {
    const counts = { all: 0, '1': 0, '2': 0, '3': 0, '4': 0 };
    if (!Array.isArray(allStudents)) return counts;

    counts.all = allStudents.length;
    allStudents.forEach((s) => {
      const y = detectStudentYearNum(s);
      if (y && counts[y] !== undefined) {
        counts[y] += 1;
      }
    });
    return counts;
  }, [allStudents]);

  // ✅ ២. គណនាព័ត៌មានមុខវិជ្ជានីមួយៗ
  const enrichedCourses = useMemo(() => {
    if (!Array.isArray(courses)) return [];

    return courses.map((course) => {
      const cid = String(course.id);
      const enrolledList = (allStudents || []).filter((s) =>
        isStudentEnrolledInCourse(s, cid, courseMap)
      );

      return {
        ...course,
        enrolledCount: enrolledList.length,
      };
    });
  }, [courses, allStudents, courseMap]);

  // ✅ ៣. ច្រោះមុខវិជ្ជាសម្រាប់បង្ហាញក្នុង Dropdown តាមឆ្នាំសិក្សា
  const visibleCoursesForSelectedYear = useMemo(() => {
    if (selectedYear === 'all' || !selectedYear) return [];
    const targetYear = String(selectedYear);

    const studentsInThisYear = (allStudents || []).filter(
      (s) => detectStudentYearNum(s) === targetYear
    );

    const matched = enrichedCourses.filter((course) =>
      studentsInThisYear.some((s) =>
        isStudentEnrolledInCourse(s, course.id, courseMap)
      )
    );

    return matched.length > 0 ? matched : enrichedCourses;
  }, [enrichedCourses, allStudents, courseMap, selectedYear]);

  // បើគ្រូចុចចូលតាមផ្លូវកាត់ដែលមាន course_id ឱ្យចាប់យកកាតឆ្នាំសិក្សារបស់មុខវិជ្ជានោះដោយស្វ័យប្រវត្តិ
  useEffect(() => {
    if (initialRouteCourseId && allStudents.length > 0) {
      const cid = String(initialRouteCourseId);
      setSelectedCourse(cid);
      const enrolledStudent = allStudents.find((s) =>
        isStudentEnrolledInCourse(s, cid, courseMap)
      );
      const detectedY = detectStudentYearNum(enrolledStudent);
      if (detectedY) {
        setSelectedYear(detectedY);
      }
    }
  }, [initialRouteCourseId, allStudents, courseMap]);

  // ពេលគ្រូចុចលើកាតឆ្នាំសិក្សា (សិស្សសរុប, ឆ្នាំទី១, ឆ្នាំទី២, ឆ្នាំទី៣, ឆ្នាំទី៤)
  const handleSelectYearCard = (yearKey) => {
    setSelectedYear(yearKey);
    setSelectedCourse('');
    try {
      sessionStorage.setItem(getSelectedYearKey(currentTeacherId), yearKey);
      sessionStorage.removeItem(getSelectedCourseKey(currentTeacherId));
    } catch {}
  };

  const handleCourseChange = (e) => {
    const newCourseId = e.target.value;
    setSelectedCourse(newCourseId);
    try {
      sessionStorage.setItem(getSelectedCourseKey(currentTeacherId), newCourseId);
    } catch {}
  };

  const handleSelectShiftTab = (shiftKey) => {
    setSelectedShift(shiftKey);
    try {
      sessionStorage.setItem(getSelectedShiftKey(currentTeacherId), shiftKey);
    } catch {}
  };

  // ============================================================================
  // 📌 ផ្នែកទី២៖ ទាញយកទិន្នន័យដោយឯករាជ្យមិនរង់ចាំគ្នា (Non-Blocking 0ms Sync)
  // ============================================================================
  useEffect(() => {
    let isMounted = true;

    const cachedStd = readStorageJson(
      getStudentsCacheKey(currentTeacherId),
      null
    );
    const cachedCrs = readStorageJson(
      getCoursesCacheKey(currentTeacherId),
      null
    );
    const cachedMap = readStorageJson(
      getCourseMapCacheKey(currentTeacherId),
      null
    );
    const cachedHist = readStorageJson(
      getAttHistoryMapKey(currentTeacherId),
      null
    );

    if (Array.isArray(cachedStd)) {
      const hydrated = hydrateStudentsWithAvatars(cachedStd);
      setAllStudents(hydrated);
      ATTENDANCE_MEM_CACHE.allStudents = hydrated;
    }
    if (Array.isArray(cachedCrs)) {
      setCourses(cachedCrs);
      ATTENDANCE_MEM_CACHE.courses = cachedCrs;
    }
    if (cachedMap) {
      setCourseMap(cachedMap);
      ATTENDANCE_MEM_CACHE.courseMap = cachedMap;
    }
    if (cachedHist) {
      setHistoryByCourse(cachedHist);
      ATTENDANCE_MEM_CACHE.historyByCourse = cachedHist;
    }

    const now = Date.now();
    if (
      ATTENDANCE_MEM_CACHE.uid === currentTeacherId &&
      Array.isArray(ATTENDANCE_MEM_CACHE.allStudents) &&
      ATTENDANCE_MEM_CACHE.allStudents.length > 0 &&
      Array.isArray(ATTENDANCE_MEM_CACHE.courses) &&
      now - ATTENDANCE_MEM_CACHE.lastSyncedStudentsAt < 30000
    ) {
      return;
    }

    // ១. ទាញបញ្ជីសិស្សមុនគេ និងបង្រួមរូបភាពសិស្សទុកក្នុង Avatar Dictionary
    api
      .get('/teacher/students')
      .then((stdRes) => {
        if (!isMounted) return;
        const latestStudents = getArrayData(stdRes.data);

        persistStudentsAndAvatarsSafely(currentTeacherId, latestStudents);

        const hydrated = hydrateStudentsWithAvatars(latestStudents);
        setAllStudents(hydrated);
        ATTENDANCE_MEM_CACHE.allStudents = hydrated;
        ATTENDANCE_MEM_CACHE.lastSyncedStudentsAt = Date.now();

        if (stdRes.data?.course_students_map) {
          const latestMap = stdRes.data.course_students_map;
          setCourseMap(latestMap);
          ATTENDANCE_MEM_CACHE.courseMap = latestMap;
          try {
            const mapStr = JSON.stringify(latestMap);
            sessionStorage.setItem(
              getCourseMapCacheKey(currentTeacherId),
              mapStr
            );
            localStorage.setItem(
              getCourseMapCacheKey(currentTeacherId),
              mapStr
            );
            localStorage.setItem(CACHE_KEY_SHARED_MAP, mapStr);
          } catch {}
        }
      })
      .catch(() => {});

    // ២. ទាញមុខវិជ្ជានៅផ្ទៃខាងក្រោយដោយឯករាជ្យ
    api
      .get('/teacher/courses')
      .then((crsRes) => {
        if (!isMounted) return;
        const latestCourses = getArrayData(crsRes.data);
        setCourses(latestCourses);
        ATTENDANCE_MEM_CACHE.courses = latestCourses;
        try {
          const crsStr = JSON.stringify(latestCourses);
          sessionStorage.setItem(getCoursesCacheKey(currentTeacherId), crsStr);
          localStorage.setItem(getCoursesCacheKey(currentTeacherId), crsStr);
          localStorage.setItem(CACHE_KEY_SHARED_COURSES, crsStr);
        } catch {}
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [currentTeacherId]);

  // រាល់ពេលគ្រូចុចកាតឆ្នាំសិក្សា ជ្រើសរើសមុខវិជ្ជា ឬប្តូរថ្ងៃខែ -> គណនាបញ្ជីសិស្សចេញពី RAM ភ្លាមៗក្នុង 0 វិនាទី!
  useEffect(() => {
    const instantList = buildCourseStudentListSync(
      selectedYear,
      selectedCourse,
      allStudents,
      courseMap,
      historyByCourse,
      attendanceDate
    );
    setStudents(instantList);
  }, [
    selectedYear,
    selectedCourse,
    attendanceDate,
    allStudents,
    courseMap,
    historyByCourse,
  ]);

  // ទាញប្រវត្តិវត្តមាននៃមុខវិជ្ជាពី Backend នៅផ្ទៃខាងក្រោយដោយស្ងាត់ៗ
  useEffect(() => {
    if (selectedYear === 'all' || !selectedCourse) return;
    const cid = String(selectedCourse);
    const now = Date.now();
    const lastHistSync = ATTENDANCE_MEM_CACHE.lastSyncedHistoryAt[cid] || 0;

    if (
      ATTENDANCE_MEM_CACHE.historyByCourse[cid] &&
      now - lastHistSync < 30000
    ) {
      return;
    }

    let isMounted = true;
    api
      .get(`/teacher/attendance/${cid}`)
      .then((res) => {
        if (!isMounted) return;
        const rawRecords = getArrayData(res.data);
        const slimRecords = slimAttendanceRecords(rawRecords);
        ATTENDANCE_MEM_CACHE.historyByCourse[cid] = slimRecords;
        ATTENDANCE_MEM_CACHE.lastSyncedHistoryAt[cid] = Date.now();

        setHistoryByCourse((prev) => {
          const next = { ...prev, [cid]: slimRecords };
          try {
            localStorage.setItem(
              getAttHistoryMapKey(currentTeacherId),
              JSON.stringify(next)
            );
          } catch {}
          return next;
        });
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [selectedYear, selectedCourse, currentTeacherId]);

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ ការគណនាចំនួនសិស្សតាមវេនសិក្សា និងការច្រោះស្វែងរកសិស្ស
  // ============================================================================
  const isCourseSelected = selectedYear !== 'all' && selectedCourse !== '';
  const isSpecificShiftSelected =
    selectedShift !== 'all' && selectedShift !== '';

  // ✅ រាប់ចំនួនសិស្សតាមវេនសិក្សា (គ្រប់វេន, ចន្ទ-សុក្រ, សៅរ៍-អាទិត្យ)
  const shiftCounts = useMemo(() => {
    let monFri = 0;
    let satSun = 0;

    students.forEach((s) => {
      const norm = normalizeShiftKey(s.study_shift);
      if (norm === 'Saturday-Sunday') satSun += 1;
      else monFri += 1;
    });

    return {
      all: students.length,
      'Monday-Friday': monFri,
      'Saturday-Sunday': satSun,
    };
  }, [students]);

  // ✅ ច្រោះសិស្សតាមវេនសិក្សាដែលគ្រូបានចុចជ្រើសរើស
  const studentsByShift = useMemo(() => {
    if (!isSpecificShiftSelected) return students;
    return students.filter(
      (s) => normalizeShiftKey(s.study_shift) === selectedShift
    );
  }, [students, selectedShift, isSpecificShiftSelected]);

  // ✅ ច្រោះបញ្ជីសិស្សចុងក្រោយតាមវេនសិក្សា និងពាក្យស្វែងរក
  const filteredStudents = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return studentsByShift;
    return studentsByShift.filter((s) => {
      const fullName = `${s.first_name || ''} ${s.last_name || ''} ${
        s.name || ''
      }`.toLowerCase();
      const reverseName = `${s.last_name || ''} ${
        s.first_name || ''
      }`.toLowerCase();
      const code = (s.student_code || s.code || '').toLowerCase();
      return fullName.includes(q) || reverseName.includes(q) || code.includes(q);
    });
  }, [studentsByShift, searchTerm]);

  // គណនាស្ថិតិវត្តមានផ្ទាល់តាមវេនសិក្សាដែលកំពុងបង្ហាញ
  const attendanceSummary = useMemo(() => {
    const counts = { Present: 0, Absent: 0, Permission: 0, Late: 0 };
    studentsByShift.forEach((s) => {
      const st = s.attendance_status || 'Present';
      if (counts[st] !== undefined) counts[st] += 1;
    });
    return counts;
  }, [studentsByShift]);

  const activeCourseObj = useMemo(() => {
    if (selectedYear === 'all' || !selectedCourse) return null;
    return (
      enrichedCourses.find((c) => String(c.id) === String(selectedCourse)) ||
      null
    );
  }, [selectedYear, selectedCourse, enrichedCourses]);

  // ============================================================================
  // 📌 ផ្នែកទី៤៖ មុខងារកែប្រែស្ថានភាពវត្តមាន រក្សាទុកទៅកាន់ Backend និងនាំចេញ Excel
  // ============================================================================
  const handleAttendanceChange = (studentId, status) => {
    if (!isCourseSelected) return;
    setStudents((prev) =>
      prev.map((student) =>
        student.id === studentId
          ? {
              ...student,
              attendance_status: status,
              late_time:
                status === 'Late'
                  ? student.late_time || new Date().toTimeString().slice(0, 5)
                  : '',
            }
          : student
      )
    );
  };

  const handleLateTimeChange = (studentId, time) => {
    setStudents((prev) =>
      prev.map((student) =>
        student.id === studentId ? { ...student, late_time: time } : student
      )
    );
  };

  // ✅ ដាក់វត្តមានទាំងអស់ ចំពោះតែសិស្សក្នុងវេនសិក្សាដែលកំពុងជ្រើសរើសប៉ុណ្ណោះ
  const handleMarkAllPresent = () => {
    if (!isCourseSelected) return;
    const targetIds = new Set(studentsByShift.map((s) => s.id));
    setStudents((prev) =>
      prev.map((student) =>
        targetIds.has(student.id)
          ? {
              ...student,
              attendance_status: 'Present',
              late_time: '',
            }
          : student
      )
    );
  };

  // ✅ រក្សាទុកវត្តមានតាមវេនសិក្សាដែលកំពុងបង្ហាញ
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isCourseSelected || studentsByShift.length === 0) return;

    setIsSubmitting(true);
    try {
      const attendanceData = studentsByShift.map((student) => {
        const targetUserId = student.user_id || student.user?.id || student.id;
        return {
          student_id: targetUserId,
          status: student.attendance_status,
          late_time:
            student.attendance_status === 'Late' && student.late_time
              ? student.late_time.slice(0, 5)
              : null,
        };
      });

      try {
        await api.post('/teacher/attendance/bulk', {
          course_id: selectedCourse,
          attendance_date: attendanceDate,
          attendance: attendanceData,
        });
      } catch (bulkErr) {
        if (bulkErr.response?.status === 422) {
          const safeAttendanceData = attendanceData.map((item) => ({
            ...item,
            status: item.status === 'Permission' ? 'Present' : item.status,
          }));
          await api.post('/teacher/attendance/bulk', {
            course_id: selectedCourse,
            attendance_date: attendanceDate,
            attendance: safeAttendanceData,
          });
        } else {
          throw bulkErr;
        }
      }

      // ធ្វើបច្ចុប្បន្នភាព Cache ភ្លាមៗក្នុង RAM និង LocalStorage
      const cid = String(selectedCourse);
      const existingHistory = ATTENDANCE_MEM_CACHE.historyByCourse[cid] || [];
      const savedStudentIds = new Set(
        studentsByShift.flatMap((s) => [
          String(s.id),
          String(s.user_id || s.user?.id || s.id),
        ])
      );

      const remainingHistory = existingHistory.filter((rec) => {
        const isSameDate =
          (rec.attendance_date || '').toString().slice(0, 10) ===
          attendanceDate;
        if (!isSameDate) return true;
        return !savedStudentIds.has(String(rec.student_id));
      });

      const newRecordsForDate = studentsByShift.map((s) => ({
        course_id: Number(selectedCourse),
        student_id: s.user_id || s.user?.id || s.id,
        attendance_date: attendanceDate,
        status: s.attendance_status,
        late_time: s.attendance_status === 'Late' ? s.late_time : null,
      }));
      const updatedCourseHistory = [...newRecordsForDate, ...remainingHistory];

      ATTENDANCE_MEM_CACHE.historyByCourse[cid] = updatedCourseHistory;
      ATTENDANCE_MEM_CACHE.lastSyncedHistoryAt[cid] = Date.now();

      setHistoryByCourse((prev) => {
        const next = { ...prev, [cid]: updatedCourseHistory };
        try {
          localStorage.setItem(
            getAttHistoryMapKey(currentTeacherId),
            JSON.stringify(next)
          );
        } catch {}
        return next;
      });

      const shiftNoteKm = isSpecificShiftSelected
        ? ` (${getStudyShiftLabel(selectedShift)})`
        : '';

      // ✅ បញ្ជូនសារជូនដំណឹងចូលតែក្នុងរូបកណ្ដឹងលើ Navbar (ប្រើ Clean URL '/attendance')
      pushLocalNotification({
        titleKm: 'បានកត់ត្រាវត្តមានសិស្សជោគជ័យ',
        titleEn: 'Student Attendance Saved',
        descKm: `វត្តមានសិស្សមុខវិជ្ជា «${activeCourseObj?.course_name || ''}»${shiftNoteKm} សម្រាប់ថ្ងៃទី ${attendanceDate} ត្រូវបានរក្សាទុក។`,
        descEn: `Attendance for "${activeCourseObj?.course_name || ''}" on ${attendanceDate} was saved.`,
        category: 'attendance',
        link: '/attendance',
      });
    } catch (error) {
      console.error('Failed to mark attendance:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

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
          if (
            worksheet[cellAddress].v !== undefined &&
            worksheet[cellAddress].v !== null
          ) {
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
            fgColor: {
              rgb: isHeader ? '1E3A8A' : R % 2 === 1 ? 'FFFFFF' : 'F8FAFC',
            },
          },
          alignment: {
            vertical: 'center',
            horizontal: isHeader || C >= 4 ? 'center' : 'left',
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

    if (colWidths.length > 0) worksheet['!cols'] = colWidths;
    const rows = [];
    for (let R = range.s.r; R <= range.e.r; ++R) {
      rows.push({ hpt: R === 0 ? 28 : 22 });
    }
    worksheet['!rows'] = rows;
  };

  const handleExportExcel = () => {
    if (filteredStudents.length === 0) {
      return;
    }

    const statusLabelKm = {
      Present: t('វត្តមាន', 'Present'),
      Absent: t('អវត្តមាន', 'Absent'),
      Permission: t('ច្បាប់', 'Permission'),
      Late: t('មកយឺត', 'Late'),
    };

    const exportData = filteredStudents.map((student, idx) => {
      const studentName =
        `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
        student.name ||
        '—';
      const studentCode =
        student.student_code ||
        student.code ||
        `STU${String(student.id).padStart(3, '0')}`;
      const isEnrolledWithTeacher = isStudentEnrolledInAnyTeacherCourse(
        student,
        courseMap
      );

      return {
        'ល.រ': idx + 1,
        'អត្តលេខសិស្ស': studentCode,
        'ឈ្មោះសិស្ស': studentName,
        'ភេទ': getGenderLabel(student.gender),
        'ជំនាន់/ឆ្នាំសិក្សា': student.batch_year || '—',
        'វេនសិក្សា': getStudyShiftLabel(student.study_shift),
        'មុខវិជ្ជា': activeCourseObj
          ? activeCourseObj.course_name
          : isEnrolledWithTeacher
          ? '—'
          : t('មិនទាន់ចុះឈ្មោះមុខវិជ្ជា', 'Not enrolled in course'),
        'កាលបរិច្ឆេទ': attendanceDate,
        'ស្ថានភាពវត្តមាន': isCourseSelected
          ? statusLabelKm[student.attendance_status] || student.attendance_status
          : '—',
        'ម៉ោងមកដល់':
          isCourseSelected && student.attendance_status === 'Late'
            ? student.late_time || '—'
            : '—',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const colWidths = [
      { wch: 8 },
      { wch: 18 },
      { wch: 24 },
      { wch: 10 },
      { wch: 20 },
      { wch: 16 },
      { wch: 26 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
    ];
    applyExcelStyling(worksheet, colWidths, [1, 7, 9]);

    const yearSuffix = selectedYear !== 'all' ? `_Year${selectedYear}` : '';
    const courseSuffix = activeCourseObj?.course_code
      ? `_${activeCourseObj.course_code}`
      : '';
    const shiftSuffix = isSpecificShiftSelected ? `_${selectedShift}` : '';
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
    XLSX.writeFile(
      workbook,
      `Attendance${yearSuffix}${courseSuffix}${shiftSuffix}_${attendanceDate}.xlsx`
    );

    const exportScopeKm = activeCourseObj
      ? `មុខវិជ្ជា «${activeCourseObj.course_name}»`
      : selectedYear !== 'all'
      ? getYearTextLabel(selectedYear)
      : 'ទាំងអស់';

    // ✅ បញ្ជូនសារជូនដំណឹងចូលតែក្នុងរូបកណ្ដឹងលើ Navbar (ប្រើ Clean URL '/attendance')
    pushLocalNotification({
      titleKm: 'បាននាំចេញវត្តមានសិស្សទៅ Excel',
      titleEn: 'Attendance Exported to Excel',
      descKm: `បញ្ជីវត្តមាន (${exportScopeKm} - ${filteredStudents.length} នាក់) ត្រូវបានទាញយកជា Excel ជោគជ័យ។`,
      descEn: `Attendance list (${filteredStudents.length} students) was exported to Excel.`,
      category: 'export',
      link: '/attendance',
    });
  };

  const getCardBorderColor = (status) => {
    switch (status) {
      case 'Present':
        return 'border-emerald-500 shadow-emerald-500/10';
      case 'Absent':
        return 'border-rose-500 shadow-rose-500/10';
      case 'Permission':
        return 'border-blue-500 shadow-blue-500/10';
      case 'Late':
        return 'border-amber-500 shadow-amber-500/10';
      default:
        return 'border-gray-200';
    }
  };

  const getStatusButtonStyle = (status, currentStatus, courseSelectedFlag) => {
    if (!courseSelectedFlag) {
      return 'opacity-60 cursor-not-allowed bg-gray-50 text-gray-400 border border-gray-100 grayscale transition-none';
    }
    const isSelected = status === currentStatus;
    if (!isSelected) {
      return 'att-status-btn-inactive bg-gray-50/80 text-gray-500 border border-gray-100 hover:bg-gray-100 hover:border-gray-300';
    }
    switch (status) {
      case 'Present':
        return 'att-status-present bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-emerald-500 shadow-sm';
      case 'Absent':
        return 'att-status-absent bg-rose-50 text-rose-700 border-rose-300 ring-1 ring-rose-500 shadow-sm';
      case 'Permission':
        return 'att-status-permission bg-blue-50 text-blue-700 border-blue-300 ring-1 ring-blue-500 shadow-sm';
      case 'Late':
        return 'att-status-late bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-amber-500 shadow-sm';
      default:
        return '';
    }
  };

  // ទិន្នន័យកាតឆ្នាំសិក្សាទាំង ៥ សម្រាប់ Render
  const yearCardsConfig = [
    {
      key: 'all',
      titleKm: 'សិស្សសរុប',
      titleEn: 'Total Students',
      subtitleKm: 'គ្រប់ឆ្នាំសិក្សាទាំងអស់',
      subtitleEn: 'All Academic Years',
      count: yearCounts.all,
      activeGradient:
        'from-blue-600 to-indigo-700 text-white border-blue-600 shadow-blue-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive: 'bg-blue-50 text-blue-600 border-blue-100 att-pill-blue',
    },
    {
      key: '1',
      titleKm: 'និស្សិតឆ្នាំទី១',
      titleEn: 'Year 1 Students',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ១',
      subtitleEn: 'First Year Level',
      count: yearCounts['1'],
      activeGradient:
        'from-emerald-600 to-teal-700 text-white border-emerald-600 shadow-emerald-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive:
        'bg-emerald-50 text-emerald-600 border-emerald-100 att-pill-emerald',
    },
    {
      key: '2',
      titleKm: 'និស្សិតឆ្នាំទី២',
      titleEn: 'Year 2 Students',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ២',
      subtitleEn: 'Second Year Level',
      count: yearCounts['2'],
      activeGradient:
        'from-indigo-600 to-violet-700 text-white border-indigo-600 shadow-indigo-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive:
        'bg-indigo-50 text-indigo-600 border-indigo-100 att-pill-indigo',
    },
    {
      key: '3',
      titleKm: 'និស្សិតឆ្នាំទី៣',
      titleEn: 'Year 3 Students',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ៣',
      subtitleEn: 'Third Year Level',
      count: yearCounts['3'],
      activeGradient:
        'from-amber-500 to-orange-600 text-white border-amber-500 shadow-amber-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive:
        'bg-amber-50 text-amber-600 border-amber-100 att-pill-amber',
    },
    {
      key: '4',
      titleKm: 'និស្សិតឆ្នាំទី៤',
      titleEn: 'Year 4 Students',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ៤',
      subtitleEn: 'Fourth Year Level',
      count: yearCounts['4'],
      activeGradient:
        'from-rose-600 to-pink-700 text-white border-rose-600 shadow-rose-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive: 'bg-rose-50 text-rose-600 border-rose-100 att-pill-rose',
    },
  ];

  // ✅ បង្ហាញប៊ូតុង Excel នៅពេលចុចលើកាតឆ្នាំ (១-៤) ឬពេលជ្រើសរើសមុខវិជ្ជាណាមួយ
  const canShowExportExcel =
    (selectedYear !== 'all' || selectedCourse !== '') &&
    filteredStudents.length > 0;

  return (
    <div className="att-page-bg p-4 sm:p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6 pb-28 lg:pb-10 animate-fadeIn">
      
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
                <CheckIcon className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-400" />
              </div>
              <span>{t('គ្រប់គ្រងវត្តមានសិស្ស', 'Manage Student Attendance')}</span>
            </h1>
            <p className="text-blue-200/80 text-xs sm:text-sm max-w-xl font-medium leading-relaxed">
              {selectedYear === 'all'
                ? t(
                    'សូមចុចជ្រើសរើសកាតឆ្នាំសិក្សា (ឆ្នាំទី១-ទី៤) ខាងក្រោម ដើម្បីជ្រើសរើសមុខវិជ្ជា និងកត់ត្រាវត្តមានសិស្ស។',
                    'Please select an academic year card (Year 1–4) below to choose a course and record student attendance.'
                  )
                : t(
                    'កត់ត្រាវត្តមាន អវត្តមាន ច្បាប់ និងការមកយឺតរបស់សិស្សតាមមុខវិជ្ជា វេនសិក្សា និងកាលបរិច្ឆេទនីមួយៗដោយរហ័ស។',
                    'Record student attendance, absence, permission, and late arrival by course, shift, and date.'
                  )}
            </p>
          </div>

          {canShowExportExcel && (
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center justify-center px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer animate-fadeIn"
              >
                <DocumentIcon className="h-5 w-5 mr-2" />
                {t('នាំចេញ Excel', 'Export Excel')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* 📌 2. INTERACTIVE YEAR CARDS (សិស្សសរុប និង ឆ្នាំទី១ ដល់ ឆ្នាំទី៤)   */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {yearCardsConfig.map((card) => {
          const isSelected = selectedYear === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => handleSelectYearCard(card.key)}
              className={`relative text-left rounded-2xl p-4 sm:p-5 border transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden group ${
                isSelected
                  ? `bg-gradient-to-br ${card.activeGradient} shadow-lg -translate-y-0.5`
                  : 'att-year-card bg-white hover:bg-gray-50/80 border-gray-200/80 text-gray-800 shadow-xs hover:-translate-y-0.5'
              } ${card.key === 'all' ? 'col-span-2 sm:col-span-1' : ''}`}
            >
              <div className="flex items-start justify-between gap-2 w-full">
                <div
                  className={`p-2.5 rounded-xl border transition-colors ${
                    isSelected
                      ? `${card.iconBgActive} border-white/20`
                      : card.iconBgInactive
                  }`}
                >
                  {card.key === 'all' ? (
                    <UserGroupIcon className="h-5 w-5" />
                  ) : (
                    <AcademicCapIcon className="h-5 w-5" />
                  )}
                </div>

                <div className="text-right">
                  <span
                    className={`text-2xl sm:text-[26px] font-black leading-none tracking-tight ${
                      isSelected ? 'text-white' : 'att-text-primary text-gray-900'
                    }`}
                  >
                    {card.count}
                  </span>
                  <span
                    className={`block text-[10px] font-bold mt-0.5 ${
                      isSelected ? 'text-white/80' : 'att-text-secondary text-gray-400'
                    }`}
                  >
                    {t('នាក់', 'students')}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-2 border-t border-current/10 flex items-center justify-between gap-1">
                <div>
                  <h3
                    className={`text-xs sm:text-sm font-extrabold leading-snug ${
                      isSelected ? 'text-white' : 'att-text-primary text-gray-800'
                    }`}
                  >
                    {t(card.titleKm, card.titleEn)}
                  </h3>
                  <p
                    className={`text-[10px] font-medium mt-0.5 ${
                      isSelected ? 'text-white/75' : 'att-text-secondary text-gray-400'
                    }`}
                  >
                    {t(card.subtitleKm, card.subtitleEn)}
                  </p>
                </div>

                {isSelected && (
                  <CheckBadgeIcon className="h-5 w-5 text-white shrink-0 animate-fadeIn" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* ================================================================== */}
        {/* 📌 3. FILTERS CONTROLS (Search, Course, Date & Study Shift Tabs)   */}
        {/* ================================================================== */}
        <div className="att-surface-card bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col xl:flex-row gap-3.5 items-center justify-between">
          {/* ផ្នែកខាងឆ្វេង៖ Search Input + ប្រអប់ជ្រើសរើសមុខវិជ្ជា + កាលបរិច្ឆេទវត្តមាន */}
          <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 w-full xl:w-auto flex-1">
            <div className="relative w-full sm:w-64 lg:w-72 flex-1 sm:flex-initial">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t(
                  'ស្វែងរកឈ្មោះសិស្ស ឬអត្តលេខ...',
                  'Search student name or code...'
                )}
                className="att-input w-full pl-11 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-2xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 p-1 rounded-lg cursor-pointer"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* ✅ ប្រអប់ជ្រើសរើសមុខវិជ្ជា (បង្ហាញតែពេលចុចលើកាតឆ្នាំ ១-៤) */}
            {selectedYear !== 'all' && visibleCoursesForSelectedYear.length > 0 && (
              <div className="relative w-full sm:w-60 lg:w-64 shrink-0 animate-fadeIn">
                <BookOpenIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <select
                  ref={courseSelectRef}
                  value={selectedCourse}
                  onChange={handleCourseChange}
                  className="att-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white font-medium text-gray-700 appearance-none cursor-pointer shadow-2xs transition-all"
                >
                  <option value="">
                    {t('គ្រប់មុខវិជ្ជាទាំងអស់', 'All Courses')}
                  </option>
                  {visibleCoursesForSelectedYear.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.course_code ? `${course.course_code} - ` : ''}
                      {course.course_name}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            )}

            {/* កាលបរិច្ឆេទវត្តមាន */}
            <div className="relative w-full sm:w-44 shrink-0">
              <CalendarDaysIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={attendanceDate}
                onChange={(e) => setAttendanceDate(e.target.value)}
                title={t('កាលបរិច្ឆេទវត្តមាន', 'Attendance Date')}
                className="att-input w-full pl-10 pr-3.5 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-semibold text-gray-800 transition-all cursor-pointer shadow-2xs"
                required
              />
            </div>
          </div>

          {/* ✅ ផ្នែកខាងស្ដាំ៖ ប៊ូតុងវេនសិក្សាទាំង ៣ (គ្រប់វេនសិក្សា • ចន្ទ-សុក្រ • សៅរ៍-អាទិត្យ) */}
          <div className="att-shift-tabs flex flex-wrap items-center gap-1.5 bg-gray-100/80 p-1.5 rounded-xl border border-gray-200/60 w-full xl:w-auto justify-center sm:justify-start shrink-0">
            <button
              type="button"
              onClick={() => handleSelectShiftTab('all')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                !isSpecificShiftSelected
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'att-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              <Squares2X2Icon className="h-4 w-4" />
              <span>{t('គ្រប់វេនសិក្សា', 'All Shifts')}</span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                  !isSpecificShiftSelected
                    ? 'bg-white/20 text-white'
                    : 'att-shift-count bg-gray-200/80 text-gray-700'
                }`}
              >
                {shiftCounts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectShiftTab('Monday-Friday')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                selectedShift === 'Monday-Friday'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'att-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              <CalendarDaysIcon className="h-4 w-4" />
              <span>{t('ចន្ទ-សុក្រ', 'Mon-Fri')}</span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                  selectedShift === 'Monday-Friday'
                    ? 'bg-white/20 text-white'
                    : 'att-shift-count bg-indigo-50 text-indigo-700'
                }`}
              >
                {shiftCounts['Monday-Friday']}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectShiftTab('Saturday-Sunday')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                selectedShift === 'Saturday-Sunday'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'att-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              <CalendarDaysIcon className="h-4 w-4" />
              <span>{t('សៅរ៍-អាទិត្យ', 'Sat-Sun')}</span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                  selectedShift === 'Saturday-Sunday'
                    ? 'bg-white/20 text-white'
                    : 'att-shift-count bg-amber-50 text-amber-700'
                }`}
              >
                {shiftCounts['Saturday-Sunday']}
              </span>
            </button>
          </div>
        </div>

        {/* ================================================================== */}
        {/* 📌 4. STICKY ACTION BAR & LIVE SUMMARY COUNTERS                    */}
        {/* ================================================================== */}
        <div className="att-sticky-bar sticky top-4 z-30 bg-white/90 backdrop-blur-lg rounded-[1.5rem] border border-gray-200 shadow-md p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 mr-2">
              <div className="att-icon-blue bg-blue-100 text-blue-600 p-2.5 rounded-xl">
                <UsersIcon className="w-5 h-5" />
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="att-text-primary text-base sm:text-lg font-extrabold text-gray-900 leading-tight">
                  {activeCourseObj
                    ? `${t('បញ្ជីសិស្ស', 'Students List')} - ${activeCourseObj.course_name}`
                    : t('បញ្ជីសិស្សទាំងអស់', 'All Students List')}
                </h2>
                <span className="att-pill-blue px-3 py-1 rounded-lg text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-100">
                  {filteredStudents.length} {t('នាក់', 'Students')}
                </span>
              </div>
            </div>

            {/* ផ្លាករាប់ចំនួនវត្តមានផ្ទាល់ (Live Status Counters) បង្ហាញតែពេលជ្រើសរើសមុខវិជ្ជា */}
            {isCourseSelected && (
              <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold animate-fadeIn">
                <span className="att-pill-emerald px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {t('វត្តមាន', 'Present')}: {attendanceSummary.Present}
                </span>
                <span className="att-pill-rose px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
                  {t('អវត្តមាន', 'Absent')}: {attendanceSummary.Absent}
                </span>
                <span className="att-pill-blue px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
                  {t('ច្បាប់', 'Permission')}: {attendanceSummary.Permission}
                </span>
                <span className="att-pill-amber px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                  {t('យឺត', 'Late')}: {attendanceSummary.Late}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 ml-auto">
            {(selectedYear !== 'all' ||
              selectedCourse !== '' ||
              isSpecificShiftSelected ||
              searchTerm !== '') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedYear('all');
                  setSelectedCourse('');
                  setSelectedShift('all');
                  setSearchTerm('');
                  try {
                    sessionStorage.removeItem(getSelectedYearKey(currentTeacherId));
                    sessionStorage.removeItem(
                      getSelectedCourseKey(currentTeacherId)
                    );
                    sessionStorage.removeItem(
                      getSelectedShiftKey(currentTeacherId)
                    );
                  } catch {}
                }}
                className="att-pill-blue text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3.5 py-2.5 rounded-xl transition-all cursor-pointer shrink-0"
              >
                {t('សម្អាតតម្រងស្វែងរក', 'Reset Filters')}
              </button>
            )}

            {/* ✅ បង្ហាញប៊ូតុងកត់ត្រាវត្តមានតែនៅពេលជ្រើសរើសមុខវិជ្ជារួចប៉ុណ្ណោះ */}
            {isCourseSelected && (
              <>
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  className="att-btn-secondary px-4 py-3 rounded-xl text-xs sm:text-sm font-extrabold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer animate-fadeIn"
                >
                  {t('ដាក់វត្តមានទាំងអស់', 'Mark All Present')}
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || filteredStudents.length === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-extrabold transition-all shadow-[0_4px_12px_rgba(37,99,235,0.25)] hover:shadow-[0_6px_16px_rgba(37,99,235,0.35)] hover:-translate-y-0.5 disabled:opacity-60 cursor-pointer animate-fadeIn"
                >
                  {isSubmitting ? (
                    <ArrowPathIcon className="w-5 h-5 animate-spin stroke-[2.5]" />
                  ) : (
                    <DocumentCheckIcon className="w-5 h-5 stroke-[2.5]" />
                  )}
                  <span>{t('រក្សាទុកវត្តមាន', 'Save Attendance')}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ================================================================== */}
        {/* 📌 5. បង្ហាញទិន្នន័យ (Responsive: Table លើ Desktop, Cards លើ Mobile) */}
        {/* ================================================================== */}
        <div className="att-surface-card hidden lg:block bg-white rounded-[1.5rem] border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="att-table min-w-full">
              <thead className="att-table-head bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="py-4 px-4 text-center text-[11px] font-extrabold text-gray-500 uppercase tracking-wider w-14">
                    {t('ល.រ', 'No')}
                  </th>
                  <th className="py-4 px-6 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider w-28">
                    {t('អត្តលេខ', 'Code')}
                  </th>
                  <th className="py-4 px-6 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                    {t('ព័ត៌មានសិស្ស', 'Student Info')}
                  </th>
                  <th className="py-4 px-6 text-center text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                    {t('កំណត់វត្តមាន (Status)', 'Set Status')}
                  </th>
                  <th className="py-4 px-6 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider w-40">
                    {t('ម៉ោងមកដល់ (បើមាន)', 'Arrived At')}
                  </th>
                </tr>
              </thead>
              <tbody className="att-table-body bg-white">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-16 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <UsersIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="att-text-primary text-base font-extrabold text-gray-700">
                          {searchTerm || isSpecificShiftSelected
                            ? t(
                                'មិនឃើញឈ្មោះសិស្សតាមការស្វែងរក ឬវេនសិក្សានេះទេ',
                                'No matching students found for this filter or shift'
                              )
                            : isCourseSelected
                            ? t(
                                'មិនទាន់មានសិស្សចុះឈ្មោះក្នុងមុខវិជ្ជានេះទេ',
                                'No students enrolled in this course'
                              )
                            : selectedYear !== 'all'
                            ? t(
                                `មិនទាន់មាននិស្សិតក្នុង ${getYearTextLabel(selectedYear)} នៅឡើយទេ`,
                                `No students found in ${getYearTextLabel(selectedYear)}`
                              )
                            : t('មិនទាន់មានសិស្សនៅឡើយទេ', 'No students available')}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student, idx) => {
                    const studentName =
                      `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
                      student.name ||
                      'N/A';
                    const studentCode =
                      student.student_code ||
                      student.code ||
                      `STU${String(student.id).padStart(3, '0')}`;
                    const nameParts = studentName.split(' ');
                    const initial =
                      nameParts.length > 1
                        ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
                        : (studentName[0] || 'S').toUpperCase();
                    const currentStatus = isCourseSelected
                      ? student.attendance_status
                      : '';
                    const isFemale = isFemaleGender(student.gender);
                    const isWeekend =
                      normalizeShiftKey(student.study_shift) === 'Saturday-Sunday';
                    const isEnrolledWithTeacher =
                      isStudentEnrolledInAnyTeacherCourse(student, courseMap);

                    const avatarMap = getAvatarMapSync();
                    const rawAvatar =
                      avatarMap[student.id] ||
                      student.profile_image ||
                      student.user?.profile_image ||
                      avatarMap[student.user_id];
                    const avatarUrl = getProfileImageUrl(rawAvatar);
                    const avatarKey = `att_std_${student.id}`;
                    const hasAvatar = Boolean(
                      avatarUrl && !failedAvatars[avatarKey]
                    );

                    return (
                      <tr
                        key={`table-${student.id}`}
                        className="att-table-row hover:bg-blue-50/30 transition-colors duration-200 group"
                      >
                        <td className="att-text-secondary py-4 px-4 text-center whitespace-nowrap text-sm font-bold text-gray-500">
                          {idx + 1}
                        </td>
                        <td className="py-4 px-6 whitespace-nowrap align-middle">
                          <span className="att-code-pill text-xs font-bold text-gray-700 bg-gray-100/80 border border-gray-200 px-2.5 py-1 rounded-md">
                            {studentCode}
                          </span>
                        </td>
                        <td className="py-4 px-6 whitespace-nowrap align-middle">
                          <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 rounded-full bg-indigo-500 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
                              {hasAvatar ? (
                                <img
                                  src={avatarUrl}
                                  alt={studentName}
                                  loading={idx < 15 ? 'eager' : 'lazy'}
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
                                <span>{initial}</span>
                              )}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="att-text-primary font-extrabold text-gray-900 text-[14px]">
                                  {studentName}
                                </span>
                                {/* ✅ បង្ហាញស្លាកតែចំពោះសិស្សណាដែលមិនទាន់បានចុះឈ្មោះមុខវិជ្ជារបស់គ្រូដែល Login ប៉ុណ្ណោះ */}
                                {!isEnrolledWithTeacher && (
                                  <span className="att-pill-unassigned inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-50/90 text-amber-700 border border-dashed border-amber-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                    {t(
                                      'មិនទាន់ចុះឈ្មោះមុខវិជ្ជា',
                                      'Not enrolled in course'
                                    )}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {student.gender && (
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                      isFemale
                                        ? 'att-pill-rose bg-rose-50 text-rose-600 border-rose-200'
                                        : 'att-pill-blue bg-blue-50 text-blue-600 border-blue-200'
                                    }`}
                                  >
                                    {getGenderLabel(student.gender)}
                                  </span>
                                )}
                                {/* ✅ បង្ហាញផ្លាកវេនសិក្សាតែនៅពេលស្ថិតក្នុង «គ្រប់វេនសិក្សា» ប៉ុណ្ណោះ */}
                                {!isSpecificShiftSelected && (
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                      isWeekend
                                        ? 'att-pill-amber bg-amber-50 text-amber-700 border-amber-200'
                                        : 'att-pill-indigo bg-indigo-50 text-indigo-700 border-indigo-100'
                                    }`}
                                  >
                                    {getStudyShiftLabel(student.study_shift)}
                                  </span>
                                )}
                                {student.batch_year && (
                                  <>
                                    <span className="att-text-secondary text-xs text-gray-400 font-bold">
                                      &bull;
                                    </span>
                                    <span className="att-text-secondary text-xs text-gray-500 font-medium">
                                      {student.batch_year}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-center whitespace-nowrap align-middle">
                          <div
                            className={`att-status-group inline-flex flex-wrap justify-center gap-1.5 p-1 bg-gray-50 rounded-xl border border-gray-100 ${
                              !isCourseSelected
                                ? 'opacity-60 cursor-not-allowed grayscale'
                                : ''
                            }`}
                          >
                            <button
                              type="button"
                              disabled={!isCourseSelected}
                              onClick={() =>
                                handleAttendanceChange(student.id, 'Present')
                              }
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                                isCourseSelected
                                  ? 'cursor-pointer'
                                  : 'cursor-not-allowed'
                              } ${getStatusButtonStyle(
                                'Present',
                                currentStatus,
                                isCourseSelected
                              )}`}
                            >
                              <CheckCircleIcon className="w-4 h-4" />{' '}
                              {t('វត្តមាន', 'Present')}
                            </button>
                            <button
                              type="button"
                              disabled={!isCourseSelected}
                              onClick={() =>
                                handleAttendanceChange(student.id, 'Absent')
                              }
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                                isCourseSelected
                                  ? 'cursor-pointer'
                                  : 'cursor-not-allowed'
                              } ${getStatusButtonStyle(
                                'Absent',
                                currentStatus,
                                isCourseSelected
                              )}`}
                            >
                              <XCircleIcon className="w-4 h-4" />{' '}
                              {t('អវត្តមាន', 'Absent')}
                            </button>
                            <button
                              type="button"
                              disabled={!isCourseSelected}
                              onClick={() =>
                                handleAttendanceChange(student.id, 'Permission')
                              }
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                                isCourseSelected
                                  ? 'cursor-pointer'
                                  : 'cursor-not-allowed'
                              } ${getStatusButtonStyle(
                                'Permission',
                                currentStatus,
                                isCourseSelected
                              )}`}
                            >
                              <DocumentTextIcon className="w-4 h-4" />{' '}
                              {t('ច្បាប់', 'Permission')}
                            </button>
                            <button
                              type="button"
                              disabled={!isCourseSelected}
                              onClick={() =>
                                handleAttendanceChange(student.id, 'Late')
                              }
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                                isCourseSelected
                                  ? 'cursor-pointer'
                                  : 'cursor-not-allowed'
                              } ${getStatusButtonStyle(
                                'Late',
                                currentStatus,
                                isCourseSelected
                              )}`}
                            >
                              <ClockIcon className="w-4 h-4" /> {t('យឺត', 'Late')}
                            </button>
                          </div>
                        </td>
                        <td className="py-4 px-6 whitespace-nowrap align-middle">
                          {currentStatus === 'Late' && isCourseSelected ? (
                            <input
                              type="time"
                              disabled={!isCourseSelected}
                              value={student.late_time}
                              onChange={(e) =>
                                handleLateTimeChange(student.id, e.target.value)
                              }
                              required
                              className="att-late-input w-28 px-2.5 py-1.5 text-xs font-bold border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-900 bg-amber-50 shadow-inner cursor-pointer animate-fade-in-up"
                            />
                          ) : (
                            <span className="att-text-secondary text-gray-300 text-xs">
                              —
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
        </div>

        {/* 📱 ទម្រង់ទី ២៖ សម្រាប់ទូរស័ព្ទដៃ (Card View - Hidden on Desktop) */}
        <div className="grid lg:hidden grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {filteredStudents.map((student, idx) => {
            const studentName =
              `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
              student.name ||
              'N/A';
            const studentCode =
              student.student_code ||
              student.code ||
              `STU${String(student.id).padStart(3, '0')}`;
            const nameParts = studentName.split(' ');
            const initial =
              nameParts.length > 1
                ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
                : (studentName[0] || 'S').toUpperCase();
            const currentStatus = isCourseSelected
              ? student.attendance_status
              : '';
            const isWeekend =
              normalizeShiftKey(student.study_shift) === 'Saturday-Sunday';
            const isEnrolledWithTeacher = isStudentEnrolledInAnyTeacherCourse(
              student,
              courseMap
            );

            const avatarMap = getAvatarMapSync();
            const rawAvatar =
              avatarMap[student.id] ||
              student.profile_image ||
              student.user?.profile_image ||
              avatarMap[student.user_id];
            const avatarUrl = getProfileImageUrl(rawAvatar);
            const avatarKey = `att_std_${student.id}`;
            const hasAvatar = Boolean(avatarUrl && !failedAvatars[avatarKey]);

            return (
              <div
                key={`card-${student.id}`}
                className={`att-surface-card bg-white rounded-[1.5rem] border-2 shadow-sm transition-all duration-300 p-5 flex flex-col relative overflow-hidden group ${
                  isCourseSelected
                    ? getCardBorderColor(currentStatus)
                    : 'border-gray-200'
                }`}
              >
                <div
                  className={`absolute top-0 left-0 right-0 h-1.5 transition-colors ${
                    !isCourseSelected
                      ? 'bg-transparent'
                      : currentStatus === 'Present'
                      ? 'bg-emerald-500'
                      : currentStatus === 'Absent'
                      ? 'bg-rose-500'
                      : currentStatus === 'Permission'
                      ? 'bg-blue-500'
                      : currentStatus === 'Late'
                      ? 'bg-amber-500'
                      : 'bg-transparent'
                  }`}
                />

                <div className="flex items-start gap-4 mb-4 mt-1">
                  <div className="w-13 h-13 rounded-2xl bg-indigo-500 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                    {hasAvatar ? (
                      <img
                        src={avatarUrl}
                        alt={studentName}
                        loading={idx < 10 ? 'eager' : 'lazy'}
                        decoding="async"
                        className="h-full w-full object-cover rounded-2xl"
                        onError={() =>
                          setFailedAvatars((prev) => ({
                            ...prev,
                            [avatarKey]: true,
                          }))
                        }
                      />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="att-code-pill inline-block px-2.5 py-0.5 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-extrabold uppercase tracking-wider">
                        {studentCode}
                      </span>
                      {!isSpecificShiftSelected && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${
                            isWeekend
                              ? 'att-pill-amber bg-amber-50 text-amber-700 border-amber-200'
                              : 'att-pill-indigo bg-indigo-50 text-indigo-700 border-indigo-100'
                          }`}
                        >
                          {getStudyShiftLabel(student.study_shift)}
                        </span>
                      )}
                    </div>
                    <h3
                      className="att-text-primary font-extrabold text-gray-900 text-[15px] truncate"
                      title={studentName}
                    >
                      {studentName}
                    </h3>
                    {!isEnrolledWithTeacher && (
                      <div className="mt-1">
                        <span className="att-pill-unassigned inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-50/90 text-amber-700 border border-dashed border-amber-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                          {t(
                            'មិនទាន់ចុះឈ្មោះមុខវិជ្ជា',
                            'Not enrolled in course'
                          )}
                        </span>
                      </div>
                    )}
                    {student.batch_year && (
                      <p className="att-text-secondary text-xs text-gray-500 font-medium mt-0.5">
                        {student.batch_year}
                      </p>
                    )}
                  </div>
                </div>

                <div className="att-divider h-[1px] w-full bg-gray-100 mb-4"></div>

                <div
                  className={`grid grid-cols-2 gap-2 mt-auto ${
                    !isCourseSelected
                      ? 'opacity-60 cursor-not-allowed grayscale'
                      : ''
                  }`}
                >
                  <button
                    type="button"
                    disabled={!isCourseSelected}
                    onClick={() => handleAttendanceChange(student.id, 'Present')}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${
                      isCourseSelected ? 'cursor-pointer' : 'cursor-not-allowed'
                    } ${getStatusButtonStyle(
                      'Present',
                      currentStatus,
                      isCourseSelected
                    )}`}
                  >
                    <CheckCircleIcon className="w-5 h-5 mb-1" />
                    <span className="text-[11px] font-extrabold">
                      {t('វត្តមាន', 'Present')}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!isCourseSelected}
                    onClick={() => handleAttendanceChange(student.id, 'Absent')}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${
                      isCourseSelected ? 'cursor-pointer' : 'cursor-not-allowed'
                    } ${getStatusButtonStyle(
                      'Absent',
                      currentStatus,
                      isCourseSelected
                    )}`}
                  >
                    <XCircleIcon className="w-5 h-5 mb-1" />
                    <span className="text-[11px] font-extrabold">
                      {t('អវត្តមាន', 'Absent')}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!isCourseSelected}
                    onClick={() =>
                      handleAttendanceChange(student.id, 'Permission')
                    }
                    className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${
                      isCourseSelected ? 'cursor-pointer' : 'cursor-not-allowed'
                    } ${getStatusButtonStyle(
                      'Permission',
                      currentStatus,
                      isCourseSelected
                    )}`}
                  >
                    <DocumentTextIcon className="w-5 h-5 mb-1" />
                    <span className="text-[11px] font-extrabold">
                      {t('ច្បាប់', 'Permission')}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!isCourseSelected}
                    onClick={() => handleAttendanceChange(student.id, 'Late')}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${
                      isCourseSelected ? 'cursor-pointer' : 'cursor-not-allowed'
                    } ${getStatusButtonStyle(
                      'Late',
                      currentStatus,
                      isCourseSelected
                    )}`}
                  >
                    <ClockIcon className="w-5 h-5 mb-1" />
                    <span className="text-[11px] font-extrabold">
                      {t('យឺត', 'Late')}
                    </span>
                  </button>
                </div>

                {currentStatus === 'Late' && isCourseSelected && (
                  <div className="att-late-box mt-3 animate-fade-in-up bg-amber-50 p-3 rounded-xl border border-amber-200/60 shadow-inner flex flex-col gap-1.5">
                    <label className="att-late-label text-[11px] font-extrabold text-amber-800 uppercase flex items-center gap-1">
                      <ClockIcon className="w-3.5 h-3.5" />{' '}
                      {t('ម៉ោងមកដល់', 'Arrived at:')}
                    </label>
                    <input
                      type="time"
                      disabled={!isCourseSelected}
                      value={student.late_time}
                      onChange={(e) =>
                        handleLateTimeChange(student.id, e.target.value)
                      }
                      required
                      className="att-late-input w-full px-3 py-2 text-sm font-bold border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-900 bg-white shadow-sm cursor-pointer"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </form>

      {/* ================================================================== */}
      {/* 📌 6. CSS សម្រាប់កំណត់ពណ៌ក្នុងទម្រង់យប់ (DARK MODE STYLING)            */}
      {/* ================================================================== */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.2s ease-out forwards;
        }

        /* Light mode subtle row dividers */
        .att-table-row + .att-table-row > td {
          border-top: 1px solid #f1f5f9;
        }

        html.dark .att-page-bg {
          background-color: transparent !important;
        }
        html.dark .att-surface-card,
        html.dark .att-year-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .att-year-card:hover {
          background-color: #263449 !important;
        }
        html.dark .att-sticky-bar {
          background-color: rgba(30, 41, 59, 0.92) !important;
          border-color: #334155 !important;
        }
        html.dark .att-shift-tabs {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .att-shift-btn {
          color: #94a3b8 !important;
        }
        html.dark .att-shift-btn:hover {
          background-color: #1e293b !important;
          color: #f8fafc !important;
        }
        html.dark .att-shift-count {
          background-color: #1e293b !important;
          color: #cbd5e1 !important;
        }
        html.dark .att-text-primary {
          color: #f8fafc !important;
        }
        html.dark .att-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .att-divider {
          background-color: #334155 !important;
        }
        html.dark .att-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
          color-scheme: dark;
        }
        html.dark .att-input::placeholder {
          color: #64748b !important;
        }
        html.dark input[type="date"].att-input::-webkit-calendar-picker-indicator {
          filter: invert(1);
          opacity: 0.65;
        }
        html.dark .att-table-head {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .att-table-head th {
          color: #94a3b8 !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .att-table-body {
          background-color: #1e293b !important;
        }
        html.dark .att-table-row + .att-table-row > td {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .att-table-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }
        html.dark .att-code-pill {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .att-status-group {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .att-status-btn-inactive {
          background-color: #1e293b !important;
          color: #94a3b8 !important;
          border-color: #334155 !important;
        }
        html.dark .att-status-btn-inactive:hover {
          color: #f8fafc !important;
          border-color: #475569 !important;
        }

        html.dark .att-status-present {
          background-color: rgba(16, 185, 129, 0.2) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.45) !important;
        }
        html.dark .att-status-absent {
          background-color: rgba(244, 63, 94, 0.2) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.45) !important;
        }
        html.dark .att-status-permission {
          background-color: rgba(59, 130, 246, 0.2) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.45) !important;
        }
        html.dark .att-status-late {
          background-color: rgba(245, 158, 11, 0.2) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 138, 11, 0.45) !important;
        }

        html.dark .att-late-box {
          background-color: rgba(245, 158, 11, 0.1) !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
        html.dark .att-late-label {
          color: #fbbf24 !important;
        }
        html.dark .att-late-input {
          background-color: #0f172a !important;
          border-color: rgba(245, 158, 11, 0.4) !important;
          color: #fde68a !important;
          color-scheme: dark;
        }

        html.dark .att-icon-blue,
        html.dark .att-pill-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .att-pill-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          color: #818cf8 !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .att-pill-emerald,
        html.dark .att-btn-secondary {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .att-pill-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .att-pill-amber,
        html.dark .att-pill-unassigned {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.35) !important;
        }
      `}</style>
    </div>
  );
};

export default ManageAttendance;
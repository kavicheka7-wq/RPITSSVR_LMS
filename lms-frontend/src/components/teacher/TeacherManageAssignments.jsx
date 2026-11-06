// src/components/teacher/TeacherManageAssignments.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import XLSX from 'xlsx-js-style';
import {
  ClipboardDocumentListIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  UserCircleIcon,
  DocumentCheckIcon,
  BookOpenIcon,
  ChevronDownIcon,
  DocumentIcon,
  AcademicCapIcon,
  CheckBadgeIcon,
  Squares2X2Icon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនីគ្រូម្នាក់ៗ (User-Scoped 0ms Cache)
// ============================================================================
const CACHE_KEY_SHARED_ASSIGNMENTS = 'cached_teacher_assignments_list_v6';
const CACHE_KEY_SHARED_COURSES = 'cached_teacher_courses_list_v6';
const CACHE_KEY_SHARED_STUDENTS = 'cached_teacher_students_list_v6';
const CACHE_KEY_SHARED_MAP = 'cached_teacher_course_map_v6';

const getAssignmentsCacheKey = (uid) => `cached_teacher_assignments_list_v8_${uid}`;
const getCoursesCacheKey = (uid) => `cached_teacher_courses_list_v8_${uid}`;
const getStudentsCacheKey = (uid) => `cached_teacher_students_list_v8_${uid}`;
const getCourseMapCacheKey = (uid) => `cached_teacher_course_map_v8_${uid}`;
const getSelectedYearKey = (uid) => `cached_teacher_assignments_selected_year_${uid}`;
const getSelectedCourseKey = (uid) => `cached_teacher_assignments_selected_course_${uid}`;
const getSelectedShiftKey = (uid) => `cached_teacher_assignments_selected_shift_${uid}`;
const getSubmissionsCacheKey = (uid, assignmentId) =>
  `cached_teacher_assignment_subs_v4_${uid}_${assignmentId}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់គ្រូម្នាក់ៗ
const ASSIGNMENTS_MEM_CACHE = {
  uid: null,
  assignments: null,
  courses: null,
  allStudents: null,
  courseMap: null,
  submissionsByAssignment: {},
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

// ============================================================================
// 📌 អនុគមន៍ចាប់យកថ្ងៃខែ និងម៉ោងពិតប្រាកដ ១០០% (ការពារកុំឱ្យលោតខុស +7 ម៉ោងដោយសារ UTC 'Z')
// ============================================================================

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
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (match) {
    return {
      year: parseInt(match[1], 10),
      month: parseInt(match[2], 10),
      day: parseInt(match[3], 10),
      hour: parseInt(match[4], 10),
      minute: parseInt(match[5], 10),
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

const toDatetimeLocalInput = (dateVal) => {
  const parts = extractExactDateTimeParts(dateVal);
  if (!parts) return '';
  const y = String(parts.year).padStart(4, '0');
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  const hr = String(parts.hour).padStart(2, '0');
  const min = String(parts.minute).padStart(2, '0');
  return `${y}-${m}-${d}T${hr}:${min}`;
};

const toBackendDateTime = (inputVal) => {
  const parts = extractExactDateTimeParts(inputVal);
  if (!parts) return null;
  const y = String(parts.year).padStart(4, '0');
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  const hr = String(parts.hour).padStart(2, '0');
  const min = String(parts.minute).padStart(2, '0');
  return `${y}-${m}-${d} ${hr}:${min}:00`;
};

const toComparableTimeMs = (val) => {
  const p = extractExactDateTimeParts(val);
  if (!p) return NaN;
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0).getTime();
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

// ✅ អនុគមន៍ត្រួតពិនិត្យយ៉ាងជាក់លាក់ថាតើសិស្សម្នាក់ពិតជាបានចុះឈ្មោះក្នុងមុខវិជ្ជា (courseId) មែនឬអត់
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
      id: `local_assign_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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

export default function TeacherManageAssignments() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialRouteCourseId =
    searchParams.get('course_id') || location.state?.courseId || '';

  // ✅ កំណត់អត្តសញ្ញាណគ្រូបច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentTeacherId = useMemo(() => resolveTeacherUid(user), [user]);

  // បើប្ដូរគណនីគ្រូ ឱ្យសម្អាត RAM Cache ចាស់ចោលភ្លាមៗ
  if (
    ASSIGNMENTS_MEM_CACHE.uid &&
    ASSIGNMENTS_MEM_CACHE.uid !== currentTeacherId
  ) {
    ASSIGNMENTS_MEM_CACHE.assignments = null;
    ASSIGNMENTS_MEM_CACHE.courses = null;
    ASSIGNMENTS_MEM_CACHE.allStudents = null;
    ASSIGNMENTS_MEM_CACHE.courseMap = null;
    ASSIGNMENTS_MEM_CACHE.submissionsByAssignment = {};
    ASSIGNMENTS_MEM_CACHE.lastSyncedAt = 0;
  }
  ASSIGNMENTS_MEM_CACHE.uid = currentTeacherId;

  // ✅ ១. អានពី Cache ភ្លាមៗក្នុង 0 វិនាទី
  const [assignments, setAssignments] = useState(() => {
    if (Array.isArray(ASSIGNMENTS_MEM_CACHE.assignments)) {
      return ASSIGNMENTS_MEM_CACHE.assignments;
    }
    const fromUserKey = readStorageJson(
      getAssignmentsCacheKey(currentTeacherId),
      null
    );
    if (Array.isArray(fromUserKey)) {
      ASSIGNMENTS_MEM_CACHE.assignments = fromUserKey;
      return fromUserKey;
    }
    return readStorageJson(CACHE_KEY_SHARED_ASSIGNMENTS, []);
  });

  const [courses, setCourses] = useState(() => {
    if (Array.isArray(ASSIGNMENTS_MEM_CACHE.courses))
      return ASSIGNMENTS_MEM_CACHE.courses;
    const cached =
      readStorageJson(getCoursesCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES, []);
    ASSIGNMENTS_MEM_CACHE.courses = cached;
    return cached;
  });

  const [allStudents, setAllStudents] = useState(() => {
    if (Array.isArray(ASSIGNMENTS_MEM_CACHE.allStudents))
      return ASSIGNMENTS_MEM_CACHE.allStudents;
    const cached =
      readStorageJson(getStudentsCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_STUDENTS, []);
    ASSIGNMENTS_MEM_CACHE.allStudents = cached;
    return cached;
  });

  const [courseMap, setCourseMap] = useState(() => {
    if (ASSIGNMENTS_MEM_CACHE.courseMap) return ASSIGNMENTS_MEM_CACHE.courseMap;
    const cached =
      readStorageJson(getCourseMapCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_MAP, {});
    ASSIGNMENTS_MEM_CACHE.courseMap = cached;
    return cached;
  });

  const [searchTerm, setSearchTerm] = useState('');

  // ✅ កាតឆ្នាំសិក្សា៖ 'all' | '1' | '2' | '3' | '4'
  const [selectedYear, setSelectedYear] = useState(() => {
    if (initialRouteCourseId) {
      const enrolledInRouteCourse = (
        ASSIGNMENTS_MEM_CACHE.allStudents || []
      ).find((s) =>
        isStudentEnrolledInCourse(
          s,
          initialRouteCourseId,
          ASSIGNMENTS_MEM_CACHE.courseMap
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

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Submissions Modal State
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [viewingAssignment, setViewingAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [submissionSearch, setSubmissionSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [submissionShiftFilter, setSubmissionShiftFilter] = useState('all');
  const [gradingData, setGradingData] = useState({});

  // Form state (កំណត់ពិន្ទុពេញលំនាំដើមនៃកិច្ចការស្មើ 20 ពិន្ទុ ឱ្យត្រូវតាមកិច្ចការ 20%)
  const [formData, setFormData] = useState({
    course_id: '',
    title: '',
    description: '',
    due_date: '',
    total_score: 20,
  });

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

    const cachedAsg = readStorageJson(
      getAssignmentsCacheKey(currentTeacherId),
      null
    );
    const cachedCrs = readStorageJson(
      getCoursesCacheKey(currentTeacherId),
      null
    );
    const cachedStd = readStorageJson(
      getStudentsCacheKey(currentTeacherId),
      null
    );
    const cachedMap = readStorageJson(
      getCourseMapCacheKey(currentTeacherId),
      null
    );

    if (Array.isArray(cachedAsg)) {
      setAssignments(cachedAsg);
      ASSIGNMENTS_MEM_CACHE.assignments = cachedAsg;
    }
    if (Array.isArray(cachedCrs)) {
      setCourses(cachedCrs);
      ASSIGNMENTS_MEM_CACHE.courses = cachedCrs;
    }
    if (Array.isArray(cachedStd)) {
      setAllStudents(cachedStd);
      ASSIGNMENTS_MEM_CACHE.allStudents = cachedStd;
    }
    if (cachedMap) {
      setCourseMap(cachedMap);
      ASSIGNMENTS_MEM_CACHE.courseMap = cachedMap;
    }

    const now = Date.now();
    if (
      ASSIGNMENTS_MEM_CACHE.uid === currentTeacherId &&
      Array.isArray(ASSIGNMENTS_MEM_CACHE.assignments) &&
      Array.isArray(ASSIGNMENTS_MEM_CACHE.courses) &&
      now - ASSIGNMENTS_MEM_CACHE.lastSyncedAt < 25000
    ) {
      return;
    }

    // ១. ទាញបញ្ជីកិច្ចការមុនគេ
    api
      .get('/teacher/assignments')
      .then((asgRes) => {
        if (!isMounted) return;
        const rawAsg = asgRes.data?.data || asgRes.data || [];
        const validAssignments = Array.isArray(rawAsg) ? rawAsg : [];
        setAssignments(validAssignments);
        ASSIGNMENTS_MEM_CACHE.assignments = validAssignments;
        ASSIGNMENTS_MEM_CACHE.lastSyncedAt = Date.now();
        try {
          localStorage.setItem(
            getAssignmentsCacheKey(currentTeacherId),
            JSON.stringify(validAssignments)
          );
          localStorage.setItem(
            CACHE_KEY_SHARED_ASSIGNMENTS,
            JSON.stringify(validAssignments)
          );
        } catch (e) {}
      })
      .catch((error) => {
        console.error('Error syncing assignments data:', error);
      });

    // ២. ទាញមុខវិជ្ជានៅផ្ទៃខាងក្រោយដោយឯករាជ្យ
    api
      .get('/teacher/courses')
      .then((crsRes) => {
        if (!isMounted) return;
        const rawCrs = crsRes.data?.data || crsRes.data || [];
        const validCourses = Array.isArray(rawCrs) ? rawCrs : [];
        setCourses(validCourses);
        ASSIGNMENTS_MEM_CACHE.courses = validCourses;
        try {
          localStorage.setItem(
            getCoursesCacheKey(currentTeacherId),
            JSON.stringify(validCourses)
          );
          localStorage.setItem(
            CACHE_KEY_SHARED_COURSES,
            JSON.stringify(validCourses)
          );
        } catch (e) {}
      })
      .catch(() => {});

    // ៣. ទាញបញ្ជីសិស្សនៅផ្ទៃខាងក្រោយដោយឯករាជ្យ
    if (
      !Array.isArray(ASSIGNMENTS_MEM_CACHE.allStudents) ||
      ASSIGNMENTS_MEM_CACHE.allStudents.length === 0
    ) {
      api
        .get('/teacher/students')
        .then((stdRes) => {
          if (!isMounted) return;
          const rawStd = stdRes.data?.data || stdRes.data || [];
          const validStudents = Array.isArray(rawStd) ? rawStd : [];
          setAllStudents(validStudents);
          ASSIGNMENTS_MEM_CACHE.allStudents = validStudents;
          try {
            localStorage.setItem(
              getStudentsCacheKey(currentTeacherId),
              JSON.stringify(validStudents)
            );
            localStorage.setItem(
              CACHE_KEY_SHARED_STUDENTS,
              JSON.stringify(validStudents)
            );
          } catch (e) {}

          if (stdRes.data?.course_students_map) {
            setCourseMap(stdRes.data.course_students_map);
            ASSIGNMENTS_MEM_CACHE.courseMap = stdRes.data.course_students_map;
            try {
              localStorage.setItem(
                getCourseMapCacheKey(currentTeacherId),
                JSON.stringify(stdRes.data.course_students_map)
              );
              localStorage.setItem(
                CACHE_KEY_SHARED_MAP,
                JSON.stringify(stdRes.data.course_students_map)
              );
            } catch (e) {}
          }
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [currentTeacherId]);

  const fetchAssignments = async () => {
    try {
      const response = await api.get('/teacher/assignments');
      const assignmentsData = response.data?.data || response.data || [];
      const validAssignments = Array.isArray(assignmentsData)
        ? assignmentsData
        : [];
      setAssignments(validAssignments);
      ASSIGNMENTS_MEM_CACHE.assignments = validAssignments;
      ASSIGNMENTS_MEM_CACHE.lastSyncedAt = Date.now();
      try {
        localStorage.setItem(
          getAssignmentsCacheKey(currentTeacherId),
          JSON.stringify(validAssignments)
        );
        localStorage.setItem(
          CACHE_KEY_SHARED_ASSIGNMENTS,
          JSON.stringify(validAssignments)
        );
      } catch (e) {}
    } catch (error) {
      console.error('Error fetching assignments:', error);
    }
  };

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ ការគណនាឆ្នាំសិក្សា និងវេនសិក្សារបស់មុខវិជ្ជានីមួយៗ
  // ============================================================================
  const isSpecificShiftSelected =
    selectedShift !== 'all' && selectedShift !== '';

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

  const getStudyShiftLabel = (shift) => {
    const norm = normalizeShiftKey(shift);
    if (language === 'km') {
      const shifts = {
        'Monday-Friday': 'ចន្ទ-សុក្រ',
        'Saturday-Sunday': 'សៅរ៍-អាទិត្យ',
      };
      return shifts[norm] || shift || '—';
    }
    return norm || shift || '—';
  };

  // ✅ គណនាឆ្នាំសិក្សា និងវេនសិក្សា (ចន្ទ-សុក្រ vs សៅរ៍-អាទិត្យ) សម្រាប់មុខវិជ្ជានីមួយៗ
  const enrichedCourses = useMemo(() => {
    if (!Array.isArray(courses)) return [];

    return courses.map((course) => {
      const cid = String(course.id);
      const enrolledList = (allStudents || []).filter((s) =>
        isStudentEnrolledInCourse(s, cid, courseMap)
      );

      const yearFreq = {};
      const shiftsSet = new Set();

      enrolledList.forEach((s) => {
        const y = detectStudentYearNum(s);
        if (y) {
          yearFreq[y] = (yearFreq[y] || 0) + 1;
        }
        const normShift = normalizeShiftKey(s.study_shift);
        if (normShift) {
          shiftsSet.add(normShift);
        }
      });

      let sortedYears = Object.keys(yearFreq).sort();

      if (sortedYears.length === 0) {
        const fromCourseText = detectStudentYearNum({
          batch_year: `${course.course_name || ''} ${
            course.description || ''
          } ${course.year || ''}`,
        });
        if (fromCourseText) sortedYears = [fromCourseText];
      }

      if (shiftsSet.size === 0) {
        const fromCourseShift = `${course.study_shift || ''} ${
          course.course_name || ''
        } ${course.description || ''}`.toLowerCase();
        if (
          fromCourseShift.includes('សៅរ៍') ||
          fromCourseShift.includes('អាទិត្យ') ||
          fromCourseShift.includes('sat') ||
          fromCourseShift.includes('weekend')
        ) {
          shiftsSet.add('Saturday-Sunday');
        } else {
          shiftsSet.add('Monday-Friday');
        }
      }

      let primaryYear = 'other';
      if (sortedYears.length === 1) {
        primaryYear = sortedYears[0];
      } else if (sortedYears.length > 1) {
        primaryYear = sortedYears.reduce((a, b) =>
          yearFreq[a] >= yearFreq[b] ? a : b
        );
      }

      return {
        ...course,
        enrolledCount: enrolledList.length,
        yearsList: sortedYears,
        shiftsList: Array.from(shiftsSet),
        primaryYear,
      };
    });
  }, [courses, allStudents, courseMap]);

  // ✅ អនុគមន៍ពិនិត្យថាតើកិច្ចការមួយត្រូវនឹងវេនសិក្សាដែលបានជ្រើសរើសឬអត់
  const doesAssignmentHaveShift = useCallback(
    (assignment, targetShiftKey, matchedCourseObj) => {
      if (!targetShiftKey || targetShiftKey === 'all') return true;
      const cid = String(assignment?.course_id || '');

      const enrolledInCourse = (allStudents || []).filter((s) => {
        if (!isStudentEnrolledInCourse(s, cid, courseMap)) return false;
        if (selectedYear !== 'all' && selectedYear !== '') {
          return detectStudentYearNum(s) === String(selectedYear);
        }
        return true;
      });

      if (enrolledInCourse.length > 0) {
        return enrolledInCourse.some(
          (s) => normalizeShiftKey(s.study_shift) === targetShiftKey
        );
      }

      const courseShifts = matchedCourseObj?.shiftsList || ['Monday-Friday'];
      return courseShifts.includes(targetShiftKey);
    },
    [allStudents, courseMap, selectedYear]
  );

  // ✅ អនុគមន៍ទាញយកមុខវិជ្ជាសម្រាប់ឆ្នាំណាមួយជាក់លាក់
  const getCoursesForYearKey = useCallback(
    (yearKey) => {
      if (!yearKey || yearKey === 'all') return enrichedCourses;
      const targetYear = String(yearKey);

      const studentsInThisYear = (allStudents || []).filter(
        (s) => detectStudentYearNum(s) === targetYear
      );

      const matched = enrichedCourses.filter((course) => {
        if (
          studentsInThisYear.some((s) =>
            isStudentEnrolledInCourse(s, course.id, courseMap)
          )
        ) {
          return true;
        }
        return (
          Array.isArray(course.yearsList) &&
          course.yearsList.includes(targetYear)
        );
      });

      return matched.length > 0 ? matched : enrichedCourses;
    },
    [enrichedCourses, allStudents, courseMap]
  );

  // ✅ ច្រោះមុខវិជ្ជាតាមឆ្នាំសិក្សាដែលបានជ្រើសរើសលើកាត
  const visibleCoursesForSelectedYear = useMemo(() => {
    if (selectedYear === 'all' || !selectedYear) return [];
    return getCoursesForYearKey(selectedYear);
  }, [getCoursesForYearKey, selectedYear]);

  // ✅ ច្រោះមុខវិជ្ជាសម្រាប់បង្ហាញក្នុង Modal
  const modalAvailableCourses = useMemo(() => {
    if (selectedYear !== 'all' && selectedYear !== '') {
      const yearCourses = getCoursesForYearKey(selectedYear);
      if (editingAssignment && editingAssignment.course_id) {
        const exists = yearCourses.some(
          (c) => String(c.id) === String(editingAssignment.course_id)
        );
        if (!exists) {
          const currentCourseObj = enrichedCourses.find(
            (c) => String(c.id) === String(editingAssignment.course_id)
          );
          if (currentCourseObj) return [currentCourseObj, ...yearCourses];
        }
      }
      return yearCourses;
    }

    if (editingAssignment && editingAssignment.course_id) {
      const currentCourseObj = enrichedCourses.find(
        (c) => String(c.id) === String(editingAssignment.course_id)
      );
      if (
        currentCourseObj &&
        currentCourseObj.primaryYear &&
        currentCourseObj.primaryYear !== 'other'
      ) {
        return getCoursesForYearKey(currentCourseObj.primaryYear);
      }
    }

    return enrichedCourses;
  }, [selectedYear, editingAssignment, enrichedCourses, getCoursesForYearKey]);

  // ✅ គណនាចំនួនកិច្ចការសរុប និងតាមឆ្នាំសិក្សា (ឆ្នាំទី១ ដល់ ឆ្នាំទី៤) សម្រាប់បង្ហាញលើកាតទាំង ៥
  const assignmentYearCounts = useMemo(() => {
    const counts = { all: 0, '1': 0, '2': 0, '3': 0, '4': 0 };
    if (!Array.isArray(assignments)) return counts;

    counts.all = assignments.length;
    assignments.forEach((asg) => {
      const matchedCourse = enrichedCourses.find(
        (c) => String(c.id) === String(asg.course_id)
      );
      if (matchedCourse && Array.isArray(matchedCourse.yearsList)) {
        matchedCourse.yearsList.forEach((y) => {
          if (counts[y] !== undefined) counts[y] += 1;
        });
      }
    });
    return counts;
  }, [assignments, enrichedCourses]);

  const activeCourseObj = useMemo(() => {
    if (selectedYear === 'all' || !selectedCourse) return null;
    return (
      enrichedCourses.find((c) => String(c.id) === String(selectedCourse)) ||
      null
    );
  }, [selectedYear, selectedCourse, enrichedCourses]);

  // ✅ ច្រោះកិច្ចការតាមឆ្នាំសិក្សា និងមុខវិជ្ជា (មុនពេលច្រោះតាមវេនសិក្សា)
  const assignmentsByYearAndCourse = useMemo(() => {
    if (!Array.isArray(assignments)) return [];

    return assignments.filter((assignment) => {
      const matchedCourse = enrichedCourses.find(
        (c) => String(c.id) === String(assignment.course_id)
      );

      if (selectedYear !== 'all') {
        const hasYear =
          matchedCourse &&
          Array.isArray(matchedCourse.yearsList) &&
          matchedCourse.yearsList.includes(String(selectedYear));
        if (!hasYear) return false;
      }

      if (
        selectedYear !== 'all' &&
        selectedCourse !== '' &&
        String(assignment.course_id) !== String(selectedCourse)
      ) {
        return false;
      }

      return true;
    });
  }, [assignments, enrichedCourses, selectedYear, selectedCourse]);

  // ✅ គណនាចំនួនកិច្ចការតាមវេនសិក្សា (គ្រប់វេនសិក្សា, ចន្ទ-សុក្រ, សៅរ៍-អាទិត្យ)
  const shiftCounts = useMemo(() => {
    let monFri = 0;
    let satSun = 0;

    assignmentsByYearAndCourse.forEach((asg) => {
      const matchedCourse = enrichedCourses.find(
        (c) => String(c.id) === String(asg.course_id)
      );
      if (doesAssignmentHaveShift(asg, 'Monday-Friday', matchedCourse)) {
        monFri += 1;
      }
      if (doesAssignmentHaveShift(asg, 'Saturday-Sunday', matchedCourse)) {
        satSun += 1;
      }
    });

    return {
      all: assignmentsByYearAndCourse.length,
      'Monday-Friday': monFri,
      'Saturday-Sunday': satSun,
    };
  }, [assignmentsByYearAndCourse, enrichedCourses, doesAssignmentHaveShift]);

  // ✅ ច្រោះបញ្ជីកិច្ចការចុងក្រោយតាមវេនសិក្សា និងតាមពាក្យស្វែងរក
  const filteredAssignments = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();

    return assignmentsByYearAndCourse.filter((assignment) => {
      const matchedCourse = enrichedCourses.find(
        (c) => String(c.id) === String(assignment.course_id)
      );

      if (isSpecificShiftSelected) {
        if (!doesAssignmentHaveShift(assignment, selectedShift, matchedCourse)) {
          return false;
        }
      }

      if (!search) return true;
      const titleMatch = (assignment.title || '').toLowerCase().includes(search);
      const descMatch = (assignment.description || '')
        .toLowerCase()
        .includes(search);
      const courseMatch = (
        assignment.course?.course_name ||
        matchedCourse?.course_name ||
        ''
      )
        .toLowerCase()
        .includes(search);

      return titleMatch || descMatch || courseMatch;
    });
  }, [
    assignmentsByYearAndCourse,
    enrichedCourses,
    selectedShift,
    isSpecificShiftSelected,
    searchTerm,
    doesAssignmentHaveShift,
  ]);

  // ✅ ទាញរកវេនសិក្សារបស់សិស្សដែលបានប្រគល់កិច្ចការក្នុង Modal
  const resolveSubmissionStudentShift = useCallback(
    (sub) => {
      const directShift =
        sub?.student?.study_shift || sub?.study_shift || sub?.student?.shift;
      if (directShift) return normalizeShiftKey(directShift);

      const subUserId =
        sub?.student_id || sub?.user_id || sub?.student?.user_id || sub?.student?.id;
      const subEmail = (sub?.student?.email || '').toLowerCase().trim();

      const matchedStd = (allStudents || []).find(
        (s) =>
          (subUserId &&
            (String(s.user_id) === String(subUserId) ||
              String(s.id) === String(subUserId))) ||
          (subEmail && (s.email || '').toLowerCase().trim() === subEmail)
      );

      return normalizeShiftKey(matchedStd?.study_shift);
    },
    [allStudents]
  );

  // ============================================================================
  // 📌 ផ្នែកទី៤៖ មុខងារបង្កើត កែប្រែ លុបកិច្ចការ និងដាក់ពិន្ទុសិស្ស (ភ្ជាប់តែកណ្ដឹង)
  // ============================================================================
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const openAddModal = () => {
    setEditingAssignment(null);
    const defaultCourseId =
      selectedCourse ||
      (visibleCoursesForSelectedYear.length > 0
        ? String(visibleCoursesForSelectedYear[0].id)
        : '');

    setFormData({
      course_id: defaultCourseId,
      title: '',
      description: '',
      due_date: '',
      total_score: 20,
    });
    setShowAddModal(true);
  };

  const openEditModal = (assignment) => {
    setEditingAssignment(assignment);

    const formattedDueDate = toDatetimeLocalInput(assignment.due_date);

    setFormData({
      course_id: assignment.course_id ? String(assignment.course_id) : '',
      title: assignment.title || '',
      description: assignment.description || '',
      due_date: formattedDueDate,
      total_score: formatCleanScore(assignment.total_score ?? 20),
    });
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.due_date) {
      return;
    }

    const dueMs = toComparableTimeMs(formData.due_date);
    if (isNaN(dueMs)) {
      return;
    }

    setIsSubmitting(true);

    const exactDueStr = toBackendDateTime(formData.due_date);

    const payload = {
      course_id: formData.course_id,
      title: formData.title.trim(),
      description: formData.description.trim(),
      due_date: exactDueStr,
      total_score: parseFloat(formData.total_score) || 20,
    };

    const targetCourse = courses.find(
      (c) => String(c.id) === String(formData.course_id)
    );
    const courseName = targetCourse?.course_name || '';

    try {
      if (editingAssignment) {
        const res = await api.put(
          `/teacher/assignments/${editingAssignment.id}`,
          payload
        );
        const serverData = res.data?.data || res.data?.assignment || res.data;

        setAssignments((prev) => {
          const updated = prev.map((a) =>
            a.id === editingAssignment.id
              ? {
                  ...a,
                  ...(typeof serverData === 'object' ? serverData : {}),
                  ...payload,
                  due_date: exactDueStr,
                  course: targetCourse || a.course,
                }
              : a
          );
          ASSIGNMENTS_MEM_CACHE.assignments = updated;
          try {
            localStorage.setItem(
              getAssignmentsCacheKey(currentTeacherId),
              JSON.stringify(updated)
            );
            localStorage.setItem(
              CACHE_KEY_SHARED_ASSIGNMENTS,
              JSON.stringify(updated)
            );
          } catch (e) {}
          return updated;
        });

        pushLocalNotification({
          titleKm: 'បានកែប្រែកិច្ចការសិស្ស',
          titleEn: 'Assignment Updated',
          descKm: `កិច្ចការ «${payload.title}» ${courseName ? `(${courseName})` : ''} ត្រូវបានកែប្រែដោយជោគជ័យ។`,
          descEn: `Assignment "${payload.title}" was updated successfully.`,
          category: 'assignment',
          link: '/teacher/assignments',
        });
      } else {
        const res = await api.post('/teacher/assignments', payload);
        const serverData = res.data?.data || res.data?.assignment || res.data;
        const createdAsg = {
          id: Date.now(),
          submissions_count: 0,
          ...(typeof serverData === 'object' ? serverData : {}),
          ...payload,
          due_date: exactDueStr,
          course: targetCourse || null,
        };

        setAssignments((prev) => {
          const updated = [createdAsg, ...prev];
          ASSIGNMENTS_MEM_CACHE.assignments = updated;
          try {
            localStorage.setItem(
              getAssignmentsCacheKey(currentTeacherId),
              JSON.stringify(updated)
            );
            localStorage.setItem(
              CACHE_KEY_SHARED_ASSIGNMENTS,
              JSON.stringify(updated)
            );
          } catch (e) {}
          return updated;
        });

        pushLocalNotification({
          titleKm: 'បានបង្កើតកិច្ចការថ្មី',
          titleEn: 'New Assignment Created',
          descKm: `បានដាក់កិច្ចការថ្មី «${payload.title}» (${payload.total_score} ពិន្ទុ) សម្រាប់មុខវិជ្ជា «${courseName || '—'}»។`,
          descEn: `Created new assignment "${payload.title}" (${payload.total_score} pts).`,
          category: 'assignment',
          link: '/teacher/assignments',
        });
      }
      setShowAddModal(false);
      fetchAssignments();
    } catch (error) {
      console.error('Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (assignment) => {
    setSelectedAssignment(assignment);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedAssignment) return;

    const deletedId = selectedAssignment.id;
    const deletedTitle = selectedAssignment.title;
    const previousAssignments = [...assignments];

    setShowDeleteModal(false);
    setSelectedAssignment(null);

    setAssignments((prev) => {
      const updated = prev.filter((a) => a.id !== deletedId);
      ASSIGNMENTS_MEM_CACHE.assignments = updated;
      try {
        localStorage.setItem(
          getAssignmentsCacheKey(currentTeacherId),
          JSON.stringify(updated)
        );
        localStorage.setItem(
          CACHE_KEY_SHARED_ASSIGNMENTS,
          JSON.stringify(updated)
        );
      } catch (e) {}
      return updated;
    });

    try {
      await api.delete(`/teacher/assignments/${deletedId}`);

      pushLocalNotification({
        titleKm: 'បានលុបកិច្ចការសិស្ស',
        titleEn: 'Assignment Deleted',
        descKm: `កិច្ចការ «${deletedTitle}» ត្រូវបានលុបចេញពីប្រព័ន្ធរួចរាល់។`,
        descEn: `Assignment "${deletedTitle}" has been removed.`,
        category: 'assignment',
        link: '/teacher/assignments',
      });
    } catch (error) {
      console.error('Delete assignment error:', error);
      setAssignments(previousAssignments);
      ASSIGNMENTS_MEM_CACHE.assignments = previousAssignments;
      try {
        localStorage.setItem(
          getAssignmentsCacheKey(currentTeacherId),
          JSON.stringify(previousAssignments)
        );
        localStorage.setItem(
          CACHE_KEY_SHARED_ASSIGNMENTS,
          JSON.stringify(previousAssignments)
        );
      } catch (e) {}
    }
  };

  const initGradingState = (subs) => {
    const initialGrading = {};
    subs.forEach((sub) => {
      initialGrading[sub.id] = {
        score: sub.score !== null && sub.score !== undefined ? sub.score : '',
        feedback: sub.feedback || '',
        isSaving: false,
      };
    });
    setGradingData(initialGrading);
  };

  const openSubmissionsModal = async (assignment) => {
    setViewingAssignment(assignment);
    setShowSubmissionsModal(true);
    setSubmissionSearch('');
    setStatusFilter('all');
    setSubmissionShiftFilter(selectedShift !== 'all' ? selectedShift : 'all');

    const memSubs =
      ASSIGNMENTS_MEM_CACHE.submissionsByAssignment[assignment.id];
    if (Array.isArray(memSubs)) {
      setSubmissions(memSubs);
      initGradingState(memSubs);
    } else {
      try {
        const cachedSubs = localStorage.getItem(
          getSubmissionsCacheKey(currentTeacherId, assignment.id)
        );
        if (cachedSubs) {
          const parsed = JSON.parse(cachedSubs);
          setSubmissions(parsed);
          initGradingState(parsed);
          ASSIGNMENTS_MEM_CACHE.submissionsByAssignment[assignment.id] = parsed;
        } else {
          setSubmissions([]);
        }
      } catch {
        setSubmissions([]);
      }
    }

    try {
      const response = await api.get(
        `/teacher/assignments/${assignment.id}/submissions`
      );
      const subs = response.data?.submissions || response.data?.data || [];
      const validSubs = Array.isArray(subs) ? subs : [];
      setSubmissions(validSubs);
      initGradingState(validSubs);
      ASSIGNMENTS_MEM_CACHE.submissionsByAssignment[assignment.id] = validSubs;

      try {
        localStorage.setItem(
          getSubmissionsCacheKey(currentTeacherId, assignment.id),
          JSON.stringify(validSubs)
        );
      } catch (e) {}
    } catch (error) {
      console.error('Fetch submissions error:', error);
    }
  };

  const handleGradeChange = (submissionId, field, rawValue) => {
    let value = rawValue;
    if (field === 'score' && value !== '' && viewingAssignment) {
      const maxScore = parseFloat(viewingAssignment.total_score) || 20;
      const num = parseFloat(value);
      if (!isNaN(num)) {
        if (num > maxScore) value = String(maxScore);
        else if (num < 0) value = '0';
      }
    }

    setGradingData((prev) => ({
      ...prev,
      [submissionId]: {
        ...prev[submissionId],
        [field]: value,
      },
    }));
  };

  const handleSaveGrade = async (submissionId) => {
    const currentGrade = gradingData[submissionId];
    if (!currentGrade) return;

    const targetSub = submissions.find((s) => s.id === submissionId);
    const studentName = getStudentDisplayName(targetSub?.student);

    setGradingData((prev) => ({
      ...prev,
      [submissionId]: { ...prev[submissionId], isSaving: true },
    }));

    try {
      const payload = {
        score:
          currentGrade.score !== '' ? parseFloat(currentGrade.score) : null,
        feedback: currentGrade.feedback || null,
      };

      const response = await api.put(
        `/teacher/submissions/${submissionId}/grade`,
        payload
      );

      setSubmissions((prev) => {
        const updatedSubs = prev.map((sub) => {
          if (sub.id === submissionId) {
            return {
              ...sub,
              score: response.data?.submission?.score ?? payload.score,
              feedback: response.data?.submission?.feedback ?? payload.feedback,
            };
          }
          return sub;
        });

        if (viewingAssignment) {
          ASSIGNMENTS_MEM_CACHE.submissionsByAssignment[viewingAssignment.id] =
            updatedSubs;
          try {
            localStorage.setItem(
              getSubmissionsCacheKey(currentTeacherId, viewingAssignment.id),
              JSON.stringify(updatedSubs)
            );
            // សម្អាត Cache ពិន្ទុរួមនៃមុខវិជ្ជានេះ ដើម្បីឱ្យទំព័រ TeacherManageGrades ចាប់យកពិន្ទុកិច្ចការថ្មីភ្លាមៗ
            if (viewingAssignment.course_id) {
              localStorage.removeItem(
                `cached_teacher_course_scores_v8_${currentTeacherId}_${viewingAssignment.course_id}`
              );
              localStorage.removeItem(
                `cached_teacher_course_scores_v9_${currentTeacherId}_${viewingAssignment.course_id}`
              );
            }
          } catch (e) {}
        }
        return updatedSubs;
      });

      pushLocalNotification({
        titleKm: 'បានដាក់ពិន្ទុកិច្ចការសិស្ស',
        titleEn: 'Assignment Submission Graded',
        descKm: `បានដាក់ពិន្ទុ ${formatCleanScore(payload.score ?? 0)} ពិន្ទុ ជូនសិស្ស «${studentName}» សម្រាប់កិច្ចការ «${viewingAssignment?.title || ''}»។`,
        descEn: `Graded "${studentName}" (${formatCleanScore(payload.score ?? 0)} pts) for "${viewingAssignment?.title || ''}".`,
        category: 'assignment',
        link: '/teacher/assignments',
      });
    } catch (error) {
      console.error('Save grade error:', error);
    } finally {
      setGradingData((prev) => ({
        ...prev,
        [submissionId]: { ...prev[submissionId], isSaving: false },
      }));
    }
  };

  // ============================================================================
  // 📌 ផ្នែកទី៥៖ អនុគមន៍ជំនួយ និងការនាំចេញឯកសារ Excel (.xlsx)
  // ============================================================================
  const getFileUrl = (filePath) => {
    if (!filePath) return '#';
    if (filePath.startsWith('http://') || filePath.startsWith('https://'))
      return filePath;
    const backendBase = (
      import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
    ).replace(/\/api\/?$/, '');
    const cleanPath = filePath.replace(/^\/?storage\//, '');
    return `${backendBase}/api/download-file?path=${encodeURIComponent(cleanPath)}`;
  };

  const getProfileImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (
      imagePath.startsWith('http://') ||
      imagePath.startsWith('https://') ||
      imagePath.startsWith('data:')
    )
      return imagePath;
    const baseUrl = (
      import.meta.env.VITE_API_URL || 'http://localhost:8000'
    ).replace(/\/api\/?$/, '');
    const cleanPath = imagePath.replace(/^\/?storage\//, '').replace(/^\/+/, '');
    return `${baseUrl}/storage/${cleanPath}`;
  };

  const getStudentDisplayName = (student) => {
    if (!student) return 'Unknown';
    if (student.name) return student.name;
    const full = `${student.first_name || ''} ${student.last_name || ''}`.trim();
    return full || 'Unknown';
  };

  const getGenderLabel = (gender) => {
    const g = (gender || '').toString().trim().toLowerCase();
    if (language === 'km') {
      if (g === 'male' || g === 'm' || g === 'ប្រុស') return 'ប្រុស';
      if (g === 'female' || g === 'f' || g === 'ស្រី') return 'ស្រី';
      return gender ? 'ផ្សេងៗ' : '';
    }
    if (g === 'male' || g === 'm' || g === 'ប្រុស') return 'Male';
    if (g === 'female' || g === 'f' || g === 'ស្រី') return 'Female';
    return gender || '';
  };

  const isFemaleGender = (gender) => {
    const g = (gender || '').toString().trim().toLowerCase();
    return g === 'female' || g === 'f' || g === 'ស្រី';
  };

  const formatCleanScore = (val) => {
    if (val === null || val === undefined || val === '') return 20;
    const num = Number(val);
    return isNaN(num) ? val : Math.round(num * 100) / 100;
  };

  const formatDate = (dateString) => {
    const parts = extractExactDateTimeParts(dateString);
    if (!parts) return '—';

    const khMonths = [
      'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
      'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ',
    ];
    const enMonths = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    const day = String(parts.day).padStart(2, '0');
    const year = parts.year;
    let hours = parts.hour;
    const minutes = String(parts.minute).padStart(2, '0');

    if (language === 'km') {
      const month = khMonths[parts.month - 1] || '';
      const period = hours >= 12 ? 'ល្ងាច' : 'ព្រឹក';
      hours = hours % 12 || 12;
      return `${day} ${month} ${year}, ${String(hours).padStart(2, '0')}:${minutes} ${period}`;
    }

    const month = enMonths[parts.month - 1] || '';
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${month} ${day}, ${year}, ${String(hours).padStart(2, '0')}:${minutes} ${period}`;
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

    if (colWidths.length > 0) worksheet['!cols'] = colWidths;
    const rows = [];
    for (let R = range.s.r; R <= range.e.r; ++R) {
      rows.push({ hpt: R === 0 ? 28 : 22 });
    }
    worksheet['!rows'] = rows;
  };

  // ១. នាំចេញបញ្ជីកិច្ចការទៅជា Excel
  const handleExportAssignmentsExcel = () => {
    if (filteredAssignments.length === 0) {
      return;
    }

    const exportData = filteredAssignments.map((item, idx) => {
      const matchedCourse = enrichedCourses.find(
        (c) => String(c.id) === String(item.course_id)
      );
      const shiftLabels = (matchedCourse?.shiftsList || ['Monday-Friday'])
        .map((sh) => getStudyShiftLabel(sh))
        .join(', ');

      return {
        'ល.រ': idx + 1,
        'ចំណងជើងកិច្ចការ': item.title || '—',
        'មុខវិជ្ជា':
          item.course?.course_name || matchedCourse?.course_name || '—',
        'វេនសិក្សា': shiftLabels || '—',
        'ថ្ងៃកំណត់': formatDate(item.due_date),
        'ពិន្ទុសរុប': `${formatCleanScore(item.total_score ?? 20)} ${t('ពិន្ទុ', 'pts')}`,
        'ចំនួនសិស្សដាក់កិច្ចការ': item.submissions_count || 0,
        'ការពិពណ៌នា': item.description || '—',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const colWidths = [
      { wch: 8 },
      { wch: 28 },
      { wch: 24 },
      { wch: 18 },
      { wch: 26 },
      { wch: 14 },
      { wch: 22 },
      { wch: 36 },
    ];
    applyExcelStyling(worksheet, colWidths, []);

    const yearSuffix = selectedYear !== 'all' ? `_Year${selectedYear}` : '';
    const courseSuffix = activeCourseObj?.course_code
      ? `_${activeCourseObj.course_code}`
      : '';
    const shiftSuffix = isSpecificShiftSelected ? `_${selectedShift}` : '';
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Assignments');
    XLSX.writeFile(
      workbook,
      `Teacher_Assignments${yearSuffix}${courseSuffix}${shiftSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    pushLocalNotification({
      titleKm: 'បាននាំចេញបញ្ជីកិច្ចការទៅ Excel',
      titleEn: 'Assignments Exported to Excel',
      descKm: `បញ្ជីកិច្ចការចំនួន ${filteredAssignments.length} ត្រូវបានទាញយកជាឯកសារ Excel ជោគជ័យ។`,
      descEn: `Exported ${filteredAssignments.length} assignments to Excel.`,
      category: 'export',
      link: '/teacher/assignments',
    });
  };

  // ✅ ២. នាំចេញតារាងពិន្ទុសិស្សដាក់កិច្ចការក្នុង Modal ទៅជា Excel
  const handleExportSubmissionsExcel = () => {
    if (!viewingAssignment || submissions.length === 0) {
      return;
    }

    const dueTimeMs = toComparableTimeMs(viewingAssignment.due_date);

    const exportData = submissions.map((sub, idx) => {
      const subTimeMs = toComparableTimeMs(sub.submitted_at);
      const isLate =
        !isNaN(dueTimeMs) && !isNaN(subTimeMs) && subTimeMs > dueTimeMs;
      const currentScore =
        gradingData[sub.id]?.score !== undefined &&
        gradingData[sub.id]?.score !== ''
          ? `${formatCleanScore(gradingData[sub.id].score)} ${t('ពិន្ទុ', 'pts')}`
          : sub.score !== null && sub.score !== undefined
          ? `${formatCleanScore(sub.score)} ${t('ពិន្ទុ', 'pts')}`
          : '—';
      const currentFeedback =
        gradingData[sub.id]?.feedback !== undefined
          ? gradingData[sub.id].feedback
          : sub.feedback || '—';

      return {
        'ល.រ': idx + 1,
        'ឈ្មោះសិស្ស': getStudentDisplayName(sub.student),
        'ភេទ': getGenderLabel(sub.student?.gender) || '—',
        'វេនសិក្សា': getStudyShiftLabel(resolveSubmissionStudentShift(sub)),
        'អ៊ីមែល': sub.student?.email || '—',
        'ថ្ងៃដាក់កិច្ចការ': formatDate(sub.submitted_at),
        'ស្ថានភាព': isLate
          ? t('យឺត (Late)', 'Late')
          : t('ទាន់ពេល (On Time)', 'On Time'),
        'ពិន្ទុទទួលបាន': currentScore,
        'មតិយោបល់': currentFeedback,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const colWidths = [
      { wch: 8 },
      { wch: 24 },
      { wch: 10 },
      { wch: 16 },
      { wch: 28 },
      { wch: 24 },
      { wch: 18 },
      { wch: 16 },
      { wch: 32 },
    ];
    applyExcelStyling(worksheet, colWidths, []);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Submissions');
    const safeTitle = (viewingAssignment.title || 'Assignment').replace(
      /[\\/:*?"<>|\s]+/g,
      '_'
    );
    XLSX.writeFile(
      workbook,
      `Submissions_${safeTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    pushLocalNotification({
      titleKm: 'បាននាំចេញលទ្ធផលកិច្ចការសិស្សទៅ Excel',
      titleEn: 'Assignment Submissions Exported to Excel',
      descKm: `បញ្ជីសិស្សដាក់កិច្ចការ «${viewingAssignment.title}» (${submissions.length} នាក់) ត្រូវបានទាញយកជា Excel ជោគជ័យ។`,
      descEn: `Exported submissions for "${viewingAssignment.title}" (${submissions.length} students) to Excel.`,
      category: 'export',
      link: '/teacher/assignments',
    });
  };

  // ទិន្នន័យកាតឆ្នាំសិក្សាទាំង ៥ សម្រាប់ Render
  const yearCardsConfig = [
    {
      key: 'all',
      titleKm: 'កិច្ចការសរុប',
      titleEn: 'Total Assignments',
      subtitleKm: 'គ្រប់ឆ្នាំសិក្សាទាំងអស់',
      subtitleEn: 'All Academic Years',
      count: assignmentYearCounts.all,
      activeGradient:
        'from-blue-600 to-indigo-700 text-white border-blue-600 shadow-blue-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive: 'bg-blue-50 text-blue-600 border-blue-100 asg-pill-blue',
    },
    {
      key: '1',
      titleKm: 'កិច្ចការឆ្នាំទី១',
      titleEn: 'Year 1 Assignments',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ១',
      subtitleEn: 'First Year Level',
      count: assignmentYearCounts['1'],
      activeGradient:
        'from-emerald-600 to-teal-700 text-white border-emerald-600 shadow-emerald-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive:
        'bg-emerald-50 text-emerald-600 border-emerald-100 asg-pill-emerald',
    },
    {
      key: '2',
      titleKm: 'កិច្ចការឆ្នាំទី២',
      titleEn: 'Year 2 Assignments',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ២',
      subtitleEn: 'Second Year Level',
      count: assignmentYearCounts['2'],
      activeGradient:
        'from-indigo-600 to-violet-700 text-white border-indigo-600 shadow-indigo-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive:
        'bg-indigo-50 text-indigo-600 border-indigo-100 asg-pill-indigo',
    },
    {
      key: '3',
      titleKm: 'កិច្ចការឆ្នាំទី៣',
      titleEn: 'Year 3 Assignments',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ៣',
      subtitleEn: 'Third Year Level',
      count: assignmentYearCounts['3'],
      activeGradient:
        'from-amber-500 to-orange-600 text-white border-amber-500 shadow-amber-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive:
        'bg-amber-50 text-amber-600 border-amber-100 asg-pill-amber',
    },
    {
      key: '4',
      titleKm: 'កិច្ចការឆ្នាំទី៤',
      titleEn: 'Year 4 Assignments',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ៤',
      subtitleEn: 'Fourth Year Level',
      count: assignmentYearCounts['4'],
      activeGradient:
        'from-rose-600 to-pink-700 text-white border-rose-600 shadow-rose-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive: 'bg-rose-50 text-rose-600 border-rose-100 asg-pill-rose',
    },
  ];

  const canShowExportExcel =
    (selectedYear !== 'all' || selectedCourse !== '') &&
    filteredAssignments.length > 0;

  // ============================================================================
  // 📌 ផ្នែកទី៦៖ ការបង្ហាញផ្ទៃមុខកម្មវិធី (JSX UI Rendering)
  // ============================================================================
  return (
    <div className="asg-page-bg p-4 sm:p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6 pb-28 lg:pb-10">
      
      {/* ================================================================== */}
      {/* 1. HEADER BANNER                                                   */}
      {/* ================================================================== */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-6 sm:p-8 shadow-xl border border-blue-900">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-[28px] lg:text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shrink-0">
                <ClipboardDocumentListIcon className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-400" />
              </div>
              <span>{t('គ្រប់គ្រងកិច្ចការ និងលំហាត់', 'Manage Assignments & Homework')}</span>
            </h1>
            <p className="text-blue-200/80 text-xs sm:text-sm max-w-xl font-medium leading-relaxed">
              {selectedYear === 'all'
                ? t(
                    'សូមចុចជ្រើសរើសកាតឆ្នាំសិក្សា (ឆ្នាំទី១-ទី៤) ខាងក្រោម ដើម្បីមើលមុខវិជ្ជា បង្កើតកិច្ចការថ្មី និងដាក់ពិន្ទុសិស្ស។',
                    'Please select an academic year card (Year 1–4) below to filter courses, create assignments, and grade submissions.'
                  )
                : t(
                    'បង្កើត និងគ្រប់គ្រងកិច្ចការផ្ទះ ឬគម្រោងសម្រាប់សិស្សតាមមុខវិជ្ជា និងវេនសិក្សា រួមទាំងការពិនិត្យ និងដាក់ពិន្ទុ។',
                    'Create and manage homework or projects for students by course and study shift, including reviewing and grading.'
                  )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {canShowExportExcel && (
              <button
                type="button"
                onClick={handleExportAssignmentsExcel}
                className="inline-flex items-center justify-center px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer animate-fadeIn"
              >
                <DocumentIcon className="h-5 w-5 mr-2" />
                {t('នាំចេញ Excel', 'Export Excel')}
              </button>
            )}

            {/* ✅ បង្ហាញប៊ូតុង «បន្ថែមកិច្ចការថ្មី» តែនៅពេលចុចលើកាតឆ្នាំណាមួយ (ឆ្នាំទី១-៤) ប៉ុណ្ណោះ */}
            {selectedYear !== 'all' && (
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer shrink-0 animate-fadeIn"
              >
                <PlusIcon className="h-5 w-5 mr-2 stroke-[2.5]" />
                {t('បន្ថែមកិច្ចការថ្មី', 'Add New Assignment')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 2. INTERACTIVE YEAR CARDS (កិច្ចការសរុប និង ឆ្នាំទី១ ដល់ ឆ្នាំទី៤)     */}
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
                  : 'asg-year-card bg-white hover:bg-gray-50/80 border-gray-200/80 text-gray-800 shadow-xs hover:-translate-y-0.5'
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
                    <ClipboardDocumentListIcon className="h-5 w-5" />
                  ) : (
                    <AcademicCapIcon className="h-5 w-5" />
                  )}
                </div>

                <div className="text-right">
                  <span
                    className={`text-2xl sm:text-[26px] font-black leading-none tracking-tight ${
                      isSelected ? 'text-white' : 'asg-text-primary text-gray-900'
                    }`}
                  >
                    {card.count}
                  </span>
                  <span
                    className={`block text-[10px] font-bold mt-0.5 ${
                      isSelected ? 'text-white/80' : 'asg-text-secondary text-gray-400'
                    }`}
                  >
                    {t('កិច្ចការ', 'assignments')}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-2 border-t border-current/10 flex items-center justify-between gap-1">
                <div>
                  <h3
                    className={`text-xs sm:text-sm font-extrabold leading-snug ${
                      isSelected ? 'text-white' : 'asg-text-primary text-gray-800'
                    }`}
                  >
                    {t(card.titleKm, card.titleEn)}
                  </h3>
                  <p
                    className={`text-[10px] font-medium mt-0.5 ${
                      isSelected ? 'text-white/75' : 'asg-text-secondary text-gray-400'
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

      {/* ================================================================== */}
      {/* 3. SEARCH, COURSE FILTER & STUDY SHIFT TABS                        */}
      {/* ================================================================== */}
      <div className="asg-surface-card bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col xl:flex-row gap-4 items-center justify-between">
        {/* ផ្នែកខាងឆ្វេង៖ Search Input + ប្រអប់ជ្រើសរើសមុខវិជ្ជា */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto flex-1">
          {/* Search Input */}
          <div className="relative w-full sm:max-w-xs lg:max-w-sm flex-1">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder={t(
                'ស្វែងរកតាមចំណងជើង ឬការពិពណ៌នា...',
                'Search by title or description...'
              )}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="asg-input w-full pl-11 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-2xs"
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

          {/* ✅ ជ្រើសរើសមុខវិជ្ជា (បង្ហាញតែពេលចុចលើកាតឆ្នាំ ១-៤ និងប្រើ font-medium មិនឱ្យដិតពេក) */}
          {selectedYear !== 'all' && visibleCoursesForSelectedYear.length > 0 && (
            <div className="relative w-full sm:w-64 lg:w-72 shrink-0 animate-fadeIn">
              <BookOpenIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedCourse}
                onChange={handleCourseChange}
                className="asg-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white font-medium text-gray-700 appearance-none cursor-pointer shadow-2xs transition-all"
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
        </div>

        {/* ✅ ផ្នែកខាងស្ដាំ៖ ប៊ូតុងវេនសិក្សាទាំង ៣ (គ្រប់វេនសិក្សា, ចន្ទ-សុក្រ, សៅរ៍-អាទិត្យ) */}
        <div className="asg-shift-tabs flex flex-wrap items-center gap-1.5 bg-gray-100/80 p-1.5 rounded-xl border border-gray-200/60 w-full xl:w-auto justify-center sm:justify-start shrink-0">
          <button
            type="button"
            onClick={() => handleSelectShiftTab('all')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
              !isSpecificShiftSelected
                ? 'bg-blue-600 text-white shadow-xs'
                : 'asg-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <Squares2X2Icon className="h-4 w-4" />
            <span>{t('គ្រប់វេនសិក្សា', 'All Shifts')}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                !isSpecificShiftSelected
                  ? 'bg-white/20 text-white'
                  : 'asg-shift-count bg-gray-200/80 text-gray-700'
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
                : 'asg-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <CalendarDaysIcon className="h-4 w-4" />
            <span>{t('ចន្ទ-សុក្រ', 'Mon-Fri')}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                selectedShift === 'Monday-Friday'
                  ? 'bg-white/20 text-white'
                  : 'asg-shift-count bg-indigo-50 text-indigo-700'
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
                : 'asg-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <CalendarDaysIcon className="h-4 w-4" />
            <span>{t('សៅរ៍-អាទិត្យ', 'Sat-Sun')}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                selectedShift === 'Saturday-Sunday'
                  ? 'bg-white/20 text-white'
                  : 'asg-shift-count bg-amber-50 text-amber-700'
              }`}
            >
              {shiftCounts['Saturday-Sunday']}
            </span>
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 4. MAIN TABLE CONTENT                                              */}
      {/* ================================================================== */}
      <div className="asg-surface-card bg-white rounded-[1.5rem] border border-gray-200 shadow-sm overflow-hidden">
        <div className="asg-table-bar px-6 py-5 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="asg-text-primary text-lg sm:text-xl font-extrabold text-gray-900">
              {activeCourseObj
                ? `${t('បញ្ជីកិច្ចការ', 'Assignments List')} - ${activeCourseObj.course_name}`
                : t('បញ្ជីកិច្ចការទាំងអស់', 'All Assignments List')}
            </h2>

            <span className="asg-pill-blue px-3 py-1 bg-blue-50 text-blue-700 text-xs font-extrabold rounded-lg border border-blue-100">
              {filteredAssignments.length} {t('កិច្ចការ', 'Assignments')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isSpecificShiftSelected && (
              <button
                type="button"
                onClick={() => handleSelectShiftTab('all')}
                className="asg-pill-indigo text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
              >
                {t('បង្ហាញគ្រប់វេនវិញ', 'Show All Shifts')}
              </button>
            )}

            {(selectedYear !== 'all' ||
              selectedCourse !== '' ||
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
                    sessionStorage.removeItem(getSelectedShiftKey(currentTeacherId));
                  } catch {}
                }}
                className="asg-pill-blue text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3.5 py-2 rounded-xl transition-all cursor-pointer shrink-0"
              >
                {t('សម្អាតតម្រងស្វែងរក', 'Reset Filters')}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="asg-table-head bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-14">
                  {t('ល.រ', 'No')}
                </th>
                <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('កិច្ចការ', 'Assignment')}
                </th>
                <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('មុខវិជ្ជា', 'Course')}
                </th>
                <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('ថ្ងៃកំណត់', 'Due Date')}
                </th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('ពិន្ទុសរុប', 'Total Score')}
                </th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('ការដាក់កិច្ចការ', 'Submissions')}
                </th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('សកម្មភាព', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="asg-table-body bg-white">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-16 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <ClipboardDocumentListIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="asg-text-primary font-extrabold text-gray-800 text-base">
                        {searchTerm ||
                        selectedCourse ||
                        selectedYear !== 'all' ||
                        isSpecificShiftSelected
                          ? t(
                              'មិនឃើញមានកិច្ចការតាមការស្វែងរកនេះទេ',
                              'No matching assignments found'
                            )
                          : t('មិនទាន់មានកិច្ចការនៅឡើយទេ', 'No assignments available yet')}
                      </p>
                      <p className="asg-text-secondary text-sm text-gray-500 mt-1">
                        {selectedYear === 'all'
                          ? t(
                              'សូមចុចជ្រើសរើសកាតឆ្នាំសិក្សាខាងលើ ដើម្បីបន្ថែមកិច្ចការថ្មី',
                              'Select an academic year card above to add new assignments'
                            )
                          : t(
                              'ចុចប៊ូតុង «បន្ថែមកិច្ចការថ្មី» ខាងលើដើម្បីចាប់ផ្តើម។',
                              'Click "Add New Assignment" above to start.'
                            )}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((assignment, index) => {
                  const submissionsCount = assignment.submissions_count || 0;
                  const dueTimeMs = toComparableTimeMs(assignment.due_date);
                  const isOverdue = !isNaN(dueTimeMs) && dueTimeMs < Date.now();
                  const matchedCourse = enrichedCourses.find(
                    (c) => String(c.id) === String(assignment.course_id)
                  );
                  const courseShifts = matchedCourse?.shiftsList || [
                    'Monday-Friday',
                  ];

                  return (
                    <tr
                      key={assignment.id}
                      className="asg-table-row hover:bg-blue-50/30 transition-colors"
                    >
                      <td className="asg-text-secondary px-4 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-500">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4">
                        <div className="asg-text-primary text-sm font-extrabold text-gray-900">
                          {assignment.title}
                        </div>
                        <div className="asg-text-secondary text-xs text-gray-500 line-clamp-1 mt-1 font-medium max-w-xs">
                          {assignment.description}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="asg-text-primary text-sm text-gray-800 font-extrabold">
                          {assignment.course?.course_name ||
                            matchedCourse?.course_name ||
                            t('គ្មានមុខវិជ្ជា', 'No course')}
                        </div>
                        {/* ✅ បង្ហាញផ្លាកវេនសិក្សាតែនៅពេលស្ថិតក្នុង «គ្រប់វេនសិក្សា» ប៉ុណ្ណោះ */}
                        {!isSpecificShiftSelected && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {courseShifts.map((shKey) => {
                              const isWknd = shKey === 'Saturday-Sunday';
                              return (
                                <span
                                  key={shKey}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                    isWknd
                                      ? 'asg-pill-amber bg-amber-50 text-amber-700 border-amber-200'
                                      : 'asg-pill-indigo bg-indigo-50 text-indigo-700 border-indigo-100'
                                  }`}
                                >
                                  {getStudyShiftLabel(shKey)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div
                          className={`flex items-center gap-1.5 font-bold ${
                            isOverdue
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'asg-text-primary text-gray-700'
                          }`}
                        >
                          <CalendarIcon className="h-4 w-4 shrink-0" />
                          {formatDate(assignment.due_date)}
                        </div>
                        {isOverdue && (
                          <span className="asg-pill-rose inline-block mt-1 px-2 py-0.5 rounded text-rose-700 bg-rose-50 border border-rose-100 text-[10px] font-extrabold uppercase">
                            {t('ហួសកំណត់', 'Overdue')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                        {formatCleanScore(assignment.total_score)}{' '}
                        {t('ពិន្ទុ', 'pts')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          type="button"
                          onClick={() => openSubmissionsModal(assignment)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all shadow-2xs border cursor-pointer ${
                            submissionsCount > 0
                              ? 'asg-pill-emerald bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'asg-code-pill bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                          title={t('មើលការដាក់កិច្ចការ', 'View Submissions')}
                        >
                          <EyeIcon className="h-4 w-4" />
                          {submissionsCount} {t('នាក់', 'subs')}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(assignment)}
                            className="asg-action-edit p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-xl transition-all cursor-pointer"
                            title={t('កែប្រែ', 'Edit')}
                          >
                            <PencilSquareIcon className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(assignment)}
                            className="asg-action-delete p-2 text-rose-600 hover:text-rose-900 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition-all cursor-pointer"
                            title={t('លុប', 'Delete')}
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================================================================== */}
      {/* MODAL - 1: View & Grade Student Submissions                        */}
      {/* ================================================================== */}
      {showSubmissionsModal &&
        viewingAssignment &&
        (() => {
          const cleanMaxScore = formatCleanScore(viewingAssignment.total_score);
          const modalCourseName =
            viewingAssignment.course?.course_name ||
            enrichedCourses.find(
              (c) => String(c.id) === String(viewingAssignment.course_id)
            )?.course_name ||
            '—';
          const dueTimeMs = toComparableTimeMs(viewingAssignment.due_date);
          const isModalSpecificShift =
            submissionShiftFilter !== 'all' && submissionShiftFilter !== '';

          const filteredModalSubmissions = submissions.filter((sub) => {
            const search = submissionSearch.toLowerCase().trim();
            const sName = getStudentDisplayName(sub.student).toLowerCase();
            const sEmail = (sub.student?.email || '').toLowerCase();
            const nameMatch =
              !search || sName.includes(search) || sEmail.includes(search);

            const subShift = resolveSubmissionStudentShift(sub);
            const shiftMatch =
              !isModalSpecificShift || subShift === submissionShiftFilter;
            if (!shiftMatch) return false;

            if (statusFilter === 'graded')
              return (
                nameMatch && sub.score !== null && sub.score !== undefined
              );
            if (statusFilter === 'ungraded')
              return (
                nameMatch && (sub.score === null || sub.score === undefined)
              );
            return nameMatch;
          });

          return (
            <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4">
              <div className="asg-modal-card bg-white rounded-[1.5rem] shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-200 dark:border-slate-700/80 animate-fadeIn">
                
                {/* Modal Header */}
                <div className="asg-modal-bar px-6 py-5 sm:px-7 border-b border-gray-100 flex justify-between items-start bg-gray-50/50 shrink-0 gap-4">
                  <div className="flex items-start sm:items-center gap-4">
                    <span className="asg-pill-emerald bg-emerald-100 text-emerald-600 p-3 rounded-2xl border border-emerald-200 shrink-0 shadow-2xs">
                      <DocumentCheckIcon className="h-6 w-6" />
                    </span>
                    <div>
                      <h2 className="asg-text-primary text-lg sm:text-xl font-extrabold text-gray-900 leading-snug">
                        {t('បញ្ជីសិស្សដាក់កិច្ចការ៖', 'Submissions:')}{' '}
                        {viewingAssignment.title}
                      </h2>
                      <div className="text-xs font-bold text-gray-500 mt-2 flex flex-wrap gap-2 items-center">
                        <span className="asg-code-pill inline-flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1 rounded-lg">
                          <BookOpenIcon className="h-3.5 w-3.5 text-blue-500" />
                          <span>{t('មុខវិជ្ជា៖', 'Course:')}</span>
                          <strong className="asg-text-primary text-gray-800">
                            {modalCourseName}
                          </strong>
                        </span>

                        <span className="asg-code-pill inline-flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1 rounded-lg">
                          <CalendarIcon className="h-3.5 w-3.5 text-amber-500" />
                          <span>{t('ថ្ងៃកំណត់៖', 'Due:')}</span>
                          <strong className="asg-text-primary text-gray-800">
                            {formatDate(viewingAssignment.due_date)}
                          </strong>
                        </span>

                        <span className="asg-pill-indigo inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1 rounded-lg">
                          <span>{t('ពិន្ទុសរុប៖', 'Total Score:')}</span>
                          <strong>
                            {cleanMaxScore} {t('ពិន្ទុ', 'pts')}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {submissions.length > 0 && (
                      <button
                        type="button"
                        onClick={handleExportSubmissionsExcel}
                        className="inline-flex items-center px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                      >
                        <DocumentIcon className="h-4 w-4 mr-1.5" />
                        {t('នាំចេញ Excel', 'Export Excel')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowSubmissionsModal(false)}
                      className="asg-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-xl transition-all bg-white border border-gray-200 cursor-pointer"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="p-6 sm:p-7 overflow-y-auto flex-1 space-y-5">
                  <div className="flex flex-col lg:flex-row gap-3 justify-between items-center">
                    <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full lg:w-auto flex-1">
                      <div className="relative w-full sm:w-72">
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder={t(
                            'ស្វែងរកឈ្មោះ ឬអ៊ីមែលសិស្ស...',
                            'Search student name or email...'
                          )}
                          value={submissionSearch}
                          onChange={(e) => setSubmissionSearch(e.target.value)}
                          className="asg-input w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm font-medium border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-gray-50/70 focus:bg-white transition-all"
                        />
                        {submissionSearch && (
                          <button
                            type="button"
                            onClick={() => setSubmissionSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* ប្រអប់ច្រោះតាមវេនសិក្សាក្នុង Modal */}
                      <select
                        value={submissionShiftFilter}
                        onChange={(e) =>
                          setSubmissionShiftFilter(e.target.value)
                        }
                        className="asg-input w-full sm:w-44 px-3 py-2.5 text-xs font-medium border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                      >
                        <option value="all">
                          {t('គ្រប់វេនសិក្សា', 'All Shifts')}
                        </option>
                        <option value="Monday-Friday">
                          {t('វេន ចន្ទ-សុក្រ', 'Mon-Fri Shift')}
                        </option>
                        <option value="Saturday-Sunday">
                          {t('វេន សៅរ៍-អាទិត្យ', 'Sat-Sun Shift')}
                        </option>
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => setStatusFilter('all')}
                        className={`px-3.5 py-2 text-xs rounded-xl font-extrabold transition-all cursor-pointer ${
                          statusFilter === 'all'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'asg-code-pill bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {t('ទាំងអស់', 'All')} ({submissions.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter('graded')}
                        className={`px-3.5 py-2 text-xs rounded-xl font-extrabold transition-all cursor-pointer ${
                          statusFilter === 'graded'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'asg-code-pill bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {t('ដាក់ពិន្ទុរួច', 'Graded')} (
                        {
                          submissions.filter(
                            (s) => s.score !== null && s.score !== undefined
                          ).length
                        }
                        )
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter('ungraded')}
                        className={`px-3.5 py-2 text-xs rounded-xl font-extrabold transition-all cursor-pointer ${
                          statusFilter === 'ungraded'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'asg-code-pill bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {t('មិនទាន់កែ', 'Ungraded')} (
                        {
                          submissions.filter(
                            (s) => s.score === null || s.score === undefined
                          ).length
                        }
                        )
                      </button>
                    </div>
                  </div>

                  {submissions.length === 0 ? (
                    <div className="py-14 px-6 text-center flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-slate-700/80 bg-gray-50/40 dark:bg-slate-900/35">
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 flex items-center justify-center mb-3.5 text-gray-400 dark:text-slate-400">
                        <DocumentCheckIcon className="h-7 w-7" />
                      </div>
                      <p className="asg-text-primary font-extrabold text-gray-700 text-sm sm:text-base">
                        {t(
                          'មិនទាន់មានសិស្សដាក់កិច្ចការនេះនៅឡើយទេ',
                          'No students have submitted this assignment yet'
                        )}
                      </p>
                      <p className="asg-text-secondary text-xs text-gray-400 mt-1 max-w-md">
                        {t(
                          'នៅពេលសិស្សបញ្ជូនកិច្ចការ ឯកសារ និងឈ្មោះរបស់ពួកគេនឹងបង្ហាញនៅទីនេះសម្រាប់ដាក់ពិន្ទុ។',
                          'When students submit their work, their files and names will appear here for grading.'
                        )}
                      </p>
                    </div>
                  ) : filteredModalSubmissions.length === 0 ? (
                    <div className="py-12 px-6 text-center flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-slate-700/80 bg-gray-50/40 dark:bg-slate-900/35">
                      <MagnifyingGlassIcon className="h-10 w-10 text-gray-300 dark:text-slate-500 mb-2.5" />
                      <p className="asg-text-primary font-bold text-gray-700 text-sm">
                        {t(
                          'រកមិនឃើញទិន្នន័យសិស្សតាមការច្រោះនេះទេ',
                          'No matching student submissions found'
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="asg-surface-card border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                          <thead className="asg-table-head bg-gray-50 border-b border-gray-100">
                            <tr>
                              <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase">
                                {t('សិស្ស', 'Student')}
                              </th>
                              <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase">
                                {t('ស្ថានភាពដាក់', 'Status')}
                              </th>
                              <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase">
                                {t('ឯកសារ', 'File')}
                              </th>
                              <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase">
                                {t('ពិន្ទុ', 'Score')}
                              </th>
                              <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase">
                                {t('មតិយោបល់', 'Feedback')}
                              </th>
                              <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase">
                                {t('សកម្មភាព', 'Action')}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="asg-table-body bg-white">
                            {filteredModalSubmissions.map((sub) => {
                              const subTimeMs = toComparableTimeMs(
                                sub.submitted_at
                              );
                              const isLate =
                                !isNaN(dueTimeMs) &&
                                !isNaN(subTimeMs) &&
                                subTimeMs > dueTimeMs;
                              const grade = gradingData[sub.id] || {
                                score: sub.score ?? '',
                                feedback: sub.feedback || '',
                                isSaving: false,
                              };
                              const displayName = getStudentDisplayName(
                                sub.student
                              );
                              const profileImg =
                                sub.student?.profile_image ||
                                sub.student?.user?.profile_image;
                              const stdGender = sub.student?.gender || '';
                              const isFemale = isFemaleGender(stdGender);
                              const stdShift = resolveSubmissionStudentShift(sub);
                              const isWeekend = stdShift === 'Saturday-Sunday';

                              return (
                                <tr
                                  key={sub.id}
                                  className="asg-table-row hover:bg-emerald-50/30 transition-colors"
                                >
                                  <td className="px-4 py-3.5 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                      {profileImg ? (
                                        <img
                                          src={getProfileImageUrl(profileImg)}
                                          alt={displayName}
                                          className="w-9 h-9 rounded-full object-cover border border-gray-200 shrink-0"
                                          onError={(e) => {
                                            e.target.style.display = 'none';
                                          }}
                                        />
                                      ) : (
                                        <div className="w-9 h-9 rounded-full bg-indigo-500 text-white flex items-center justify-center font-extrabold text-xs shrink-0">
                                          {displayName !== 'Unknown' ? (
                                            displayName.charAt(0).toUpperCase()
                                          ) : (
                                            <UserCircleIcon className="h-5 w-5" />
                                          )}
                                        </div>
                                      )}
                                      <div>
                                        <div className="asg-text-primary text-sm font-extrabold text-gray-900">
                                          {displayName}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                          {stdGender && (
                                            <span
                                              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${
                                                isFemale
                                                  ? 'asg-pill-rose bg-rose-50 text-rose-600 border-rose-200'
                                                  : 'asg-pill-blue bg-blue-50 text-blue-600 border-blue-200'
                                              }`}
                                            >
                                              {getGenderLabel(stdGender)}
                                            </span>
                                          )}
                                          {!isModalSpecificShift && (
                                            <span
                                              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${
                                                isWeekend
                                                  ? 'asg-pill-amber bg-amber-50 text-amber-700 border-amber-200'
                                                  : 'asg-pill-indigo bg-indigo-50 text-indigo-700 border-indigo-100'
                                              }`}
                                            >
                                              {getStudyShiftLabel(stdShift)}
                                            </span>
                                          )}
                                          <span className="asg-text-secondary text-[11px] text-gray-500 font-medium">
                                            {sub.student?.email}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5 whitespace-nowrap">
                                    <div className="asg-text-secondary text-xs font-bold text-gray-700 mb-1">
                                      {formatDate(sub.submitted_at)}
                                    </div>
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                                        isLate
                                          ? 'asg-pill-amber bg-amber-50 text-amber-700 border-amber-200'
                                          : 'asg-pill-emerald bg-emerald-50 text-emerald-700 border-emerald-200'
                                      }`}
                                    >
                                      {isLate
                                        ? t('យឺត (Late)', 'Late')
                                        : t('ទាន់ពេល (On Time)', 'On Time')}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 whitespace-nowrap text-center">
                                    {sub.file_path ? (
                                      <a
                                        href={getFileUrl(sub.file_path)}
                                        download
                                        className="asg-pill-indigo inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-all cursor-pointer"
                                      >
                                        <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                                        {t('ទាញយក', 'Download')}
                                      </a>
                                    ) : (
                                      <span className="asg-text-secondary text-xs text-gray-400 font-medium italic">
                                        {t('គ្មានឯកសារ', 'No File')}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3.5 whitespace-nowrap text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      max={cleanMaxScore}
                                      step="0.5"
                                      placeholder="—"
                                      value={
                                        grade.score !== ''
                                          ? formatCleanScore(grade.score)
                                          : ''
                                      }
                                      onChange={(e) =>
                                        handleGradeChange(
                                          sub.id,
                                          'score',
                                          e.target.value
                                        )
                                      }
                                      title={`${t('ពិន្ទុអតិបរមា៖', 'Max Score:')} ${cleanMaxScore}`}
                                      className="asg-input w-20 px-3 py-2 text-sm font-bold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-gray-50 focus:bg-white transition-colors text-center"
                                    />
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <input
                                      type="text"
                                      placeholder={t(
                                        'មតិយោបល់...',
                                        'Feedback...'
                                      )}
                                      value={grade.feedback}
                                      onChange={(e) =>
                                        handleGradeChange(
                                          sub.id,
                                          'feedback',
                                          e.target.value
                                        )
                                      }
                                      className="asg-input w-full min-w-[160px] px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-gray-50 focus:bg-white transition-colors"
                                    />
                                  </td>
                                  <td className="px-4 py-3.5 whitespace-nowrap text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveGrade(sub.id)}
                                      disabled={grade.isSaving}
                                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                                    >
                                      {grade.isSaving ? (
                                        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <CheckCircleIcon className="h-3.5 w-3.5" />
                                      )}
                                      {t('រក្សាទុក', 'Save')}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="asg-modal-bar px-6 py-4 sm:px-7 border-t border-gray-100 bg-gray-50/50 flex justify-end shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowSubmissionsModal(false)}
                    className="asg-close-btn px-6 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all cursor-pointer"
                  >
                    {t('បិទផ្ទាំង', 'Close')}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ================================================================== */}
      {/* MODAL - 2: Add / Edit Assignment                                   */}
      {/* ================================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
          <div className="asg-modal-card bg-white rounded-[1.5rem] shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            
            {/* Modal Header */}
            <div className="asg-modal-bar flex justify-between items-center p-6 sm:p-7 border-b border-gray-100 bg-gray-50/50 shrink-0">
              <h2 className="asg-text-primary text-xl font-extrabold text-gray-900 flex items-center gap-2.5">
                <span className="asg-pill-indigo bg-indigo-100 text-indigo-600 p-2.5 rounded-xl border border-indigo-200">
                  <ClipboardDocumentListIcon className="h-6 w-6" />
                </span>
                {editingAssignment
                  ? t('កែប្រែកិច្ចការ', 'Edit Assignment')
                  : t('បន្ថែមកិច្ចការថ្មី', 'Add New Assignment')}
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="asg-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-xl transition-all bg-white border border-gray-200 cursor-pointer"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form
              id="assignmentForm"
              onSubmit={handleSubmit}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="p-6 sm:p-7 overflow-y-auto flex-1 space-y-5">
                <div>
                  <label className="asg-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('ចំណងជើងកិច្ចការ', 'Assignment Title')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="title"
                    required
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder={t(
                      'ឧ. កិច្ចការទី១៖ សរសេរកូដ HTML/CSS',
                      'e.g., Assignment 1'
                    )}
                    className="asg-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                  />
                </div>

                <div>
                  <label className="asg-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('មុខវិជ្ជា', 'Course')} <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="course_id"
                    required
                    value={formData.course_id}
                    onChange={handleInputChange}
                    className="asg-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white font-medium text-gray-800 transition-all shadow-sm cursor-pointer"
                  >
                    <option value="" disabled>
                      {t('ជ្រើសរើសមុខវិជ្ជា', 'Select Course')}
                    </option>
                    {modalAvailableCourses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.course_code ? `${course.course_code} - ` : ''}
                        {course.course_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="asg-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ថ្ងៃកំណត់ការដាក់កិច្ចការ', 'Due Date')}{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      name="due_date"
                      required
                      value={formData.due_date}
                      onChange={handleInputChange}
                      className="asg-input w-full px-3.5 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium text-[13px] transition-all shadow-sm cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="asg-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ពិន្ទុសរុប (20%)', 'Total Score (20%)')}{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      name="total_score"
                      min="1"
                      max="1000"
                      required
                      value={formData.total_score}
                      onChange={handleInputChange}
                      className="asg-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-extrabold text-indigo-700 transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="asg-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('ការពិពណ៌នាពីកិច្ចការ', 'Description')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    name="description"
                    required
                    rows={4}
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder={t(
                      'លម្អិតអំពីចំណុចការងារ លំហាត់ ឬការណែនាំផ្សេងៗ...',
                      'Detail instructions...'
                    )}
                    className="asg-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all resize-none shadow-sm"
                  />
                </div>
              </div>

              <div className="asg-modal-bar p-6 sm:p-7 border-t border-gray-100 bg-gray-50/50 flex justify-end space-x-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="asg-close-btn px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all cursor-pointer"
                >
                  {t('បោះបង់', 'Cancel')}
                </button>
                <button
                  type="submit"
                  form="assignmentForm"
                  disabled={isSubmitting}
                  className="px-6 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  ) : (
                    <ClipboardDocumentListIcon className="h-5 w-5" />
                  )}
                  {editingAssignment
                    ? t('រក្សាទុកការកែប្រែ', 'Save Changes')
                    : t('បង្កើតកិច្ចការ', 'Create Assignment')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL - 3: Delete Confirmation                                     */}
      {/* ================================================================== */}
      {showDeleteModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
          <div className="asg-modal-card bg-white rounded-[1.5rem] shadow-2xl w-full max-w-md p-8 animate-fadeIn border border-transparent">
            <div className="flex items-center text-rose-600 dark:text-rose-400 mb-5">
              <div className="asg-pill-rose p-2 bg-rose-100 rounded-full mr-3 border border-rose-200">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-extrabold">
                {t('បញ្ជាក់ការលុប', 'Confirm Deletion')}
              </h3>
            </div>
            <p className="asg-text-secondary text-sm font-medium text-gray-600 mb-6 leading-relaxed">
              {t(
                'តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបកិច្ចការ',
                'Are you sure you want to delete assignment'
              )}{' '}
              «
              <span className="asg-text-primary font-extrabold text-gray-900">
                {selectedAssignment?.title}
              </span>
              » {t('នេះមែនទេ?', 'this assignment?')}
              <br />
              <br />
              <span className="asg-pill-rose text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100 block">
                {t(
                  '* ការលុបកិច្ចការនេះនឹងធ្វើឱ្យបាត់បង់រាល់ព័ត៌មានពាក់ព័ន្ធ រួមទាំងការដាក់កិច្ចការរបស់សិស្សទាំងស្រុង។',
                  '* Deleting this assignment will permanently remove all related student submissions.'
                )}
              </span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedAssignment(null);
                }}
                className="asg-close-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-all shadow-md cursor-pointer"
              >
                {t('លុបចោល', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 📌 7. CSS សម្រាប់កំណត់ពណ៌ក្នុងទម្រង់យប់ (DARK MODE STYLING)            */}
      {/* ================================================================== */}
      <style>{`
        /* Light mode subtle row dividers */
        .asg-table-row + .asg-table-row > td {
          border-top: 1px solid #f1f5f9;
        }

        html.dark .asg-page-bg {
          background-color: transparent !important;
        }
        html.dark .asg-surface-card,
        html.dark .asg-table-bar,
        html.dark .asg-modal-card,
        html.dark .asg-year-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .asg-year-card:hover {
          background-color: #263449 !important;
        }
        html.dark .asg-modal-bar,
        html.dark .asg-filter-subbar {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
        }
        html.dark .asg-text-primary {
          color: #f8fafc !important;
        }
        html.dark .asg-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .asg-label {
          color: #cbd5e1 !important;
        }
        html.dark .asg-shift-tabs {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .asg-shift-btn {
          color: #94a3b8 !important;
        }
        html.dark .asg-shift-btn:hover {
          background-color: #1e293b !important;
          color: #f8fafc !important;
        }
        html.dark .asg-shift-count {
          background-color: #1e293b !important;
          color: #cbd5e1 !important;
        }
        html.dark .asg-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
          color-scheme: dark;
        }
        html.dark .asg-input::placeholder {
          color: #64748b !important;
        }
        html.dark .asg-close-btn {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .asg-close-btn:hover {
          background-color: #334155 !important;
          color: #ffffff !important;
        }
        html.dark .asg-table-head {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .asg-table-head th {
          color: #94a3b8 !important;
        }
        html.dark .asg-table-body {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .asg-table-row + .asg-table-row > td {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .asg-table-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }
        html.dark .asg-code-pill {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .asg-pill-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .asg-pill-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          color: #818cf8 !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .asg-pill-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .asg-pill-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
        html.dark .asg-pill-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .asg-action-edit {
          color: #818cf8 !important;
        }
        html.dark .asg-action-edit:hover {
          background-color: rgba(99, 102, 241, 0.18) !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .asg-action-delete {
          color: #fb7185 !important;
        }
        html.dark .asg-action-delete:hover {
          background-color: rgba(244, 63, 94, 0.18) !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
      `}</style>
    </div>
  );
}
// src/components/teacher/TeacherManageQuizzes.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import XLSX from 'xlsx-js-style';
import {
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  BookOpenIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  EyeIcon,
  AcademicCapIcon,
  DocumentCheckIcon,
  ArrowDownTrayIcon,
  DocumentIcon,
  CheckBadgeIcon,
  ChartBarIcon,
  Squares2X2Icon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនីគ្រូម្នាក់ៗ (User-Scoped 0ms Cache)
// ============================================================================
const CACHE_KEY_SHARED_QUIZZES = 'cached_teacher_quizzes_list_v6';
const CACHE_KEY_SHARED_COURSES = 'cached_teacher_courses_list_v6';
const CACHE_KEY_SHARED_STUDENTS = 'cached_teacher_students_list_v6';
const CACHE_KEY_SHARED_MAP = 'cached_teacher_course_map_v6';

const getQuizzesCacheKey = (uid) => `cached_teacher_quizzes_list_v8_${uid}`;
const getCoursesCacheKey = (uid) => `cached_teacher_courses_list_v8_${uid}`;
const getStudentsCacheKey = (uid) => `cached_teacher_students_list_v8_${uid}`;
const getCourseMapCacheKey = (uid) => `cached_teacher_course_map_v8_${uid}`;
const getSelectedYearKey = (uid) => `cached_teacher_quizzes_selected_year_${uid}`;
const getSelectedCourseKey = (uid) => `cached_teacher_quizzes_selected_course_${uid}`;
const getSelectedShiftKey = (uid) => `cached_teacher_quizzes_selected_shift_${uid}`;
const getQuizResultsCacheKey = (uid, quizId) =>
  `cached_teacher_quiz_results_v4_${uid}_${quizId}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់គ្រូម្នាក់ៗ
const QUIZZES_MEM_CACHE = {
  uid: null,
  quizzes: null,
  courses: null,
  allStudents: null,
  courseMap: null,
  resultsByQuiz: {},
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

// ✅ អនុគមន៍គណនាបម្លែងពិន្ទុប្រឡងរបស់សិស្សមកជាមាត្រដ្ឋាន 20 ពិន្ទុ (សំណួរខ្លី 20%)
const toQuizWeighted20Score = (rawScore, quizTotalMark) => {
  const s = parseFloat(rawScore) || 0;
  const max = parseFloat(quizTotalMark) || 20;
  if (max <= 0) return 0;
  if (max === 20) return Math.round(s * 100) / 100;
  const scaled = (s / max) * 20;
  return Math.min(20, Math.max(0, Math.round(scaled * 100) / 100));
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
      id: `local_quiz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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

export default function TeacherManageQuizzes() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [failedAvatars, setFailedAvatars] = useState({});

  const initialRouteCourseId =
    searchParams.get('course_id') || location.state?.courseId || '';

  // ✅ កំណត់អត្តសញ្ញាណគ្រូបច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentTeacherId = useMemo(() => resolveTeacherUid(user), [user]);

  // បើប្ដូរគណនីគ្រូ ឱ្យសម្អាត RAM Cache ចាស់ចោលភ្លាមៗ
  if (
    QUIZZES_MEM_CACHE.uid &&
    QUIZZES_MEM_CACHE.uid !== currentTeacherId
  ) {
    QUIZZES_MEM_CACHE.quizzes = null;
    QUIZZES_MEM_CACHE.courses = null;
    QUIZZES_MEM_CACHE.allStudents = null;
    QUIZZES_MEM_CACHE.courseMap = null;
    QUIZZES_MEM_CACHE.resultsByQuiz = {};
    QUIZZES_MEM_CACHE.lastSyncedAt = 0;
  }
  QUIZZES_MEM_CACHE.uid = currentTeacherId;

  // ✅ ១. អានពី Cache ភ្លាមៗក្នុង 0 វិនាទី
  const [quizzes, setQuizzes] = useState(() => {
    if (Array.isArray(QUIZZES_MEM_CACHE.quizzes)) {
      return QUIZZES_MEM_CACHE.quizzes;
    }
    const fromUserKey = readStorageJson(
      getQuizzesCacheKey(currentTeacherId),
      null
    );
    if (Array.isArray(fromUserKey)) {
      QUIZZES_MEM_CACHE.quizzes = fromUserKey;
      return fromUserKey;
    }
    return readStorageJson(CACHE_KEY_SHARED_QUIZZES, []);
  });

  const [courses, setCourses] = useState(() => {
    if (Array.isArray(QUIZZES_MEM_CACHE.courses)) return QUIZZES_MEM_CACHE.courses;
    const cached =
      readStorageJson(getCoursesCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES, []);
    QUIZZES_MEM_CACHE.courses = cached;
    return cached;
  });

  const [allStudents, setAllStudents] = useState(() => {
    if (Array.isArray(QUIZZES_MEM_CACHE.allStudents))
      return QUIZZES_MEM_CACHE.allStudents;
    const cached =
      readStorageJson(getStudentsCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_STUDENTS, []);
    QUIZZES_MEM_CACHE.allStudents = cached;
    return cached;
  });

  const [courseMap, setCourseMap] = useState(() => {
    if (QUIZZES_MEM_CACHE.courseMap) return QUIZZES_MEM_CACHE.courseMap;
    const cached =
      readStorageJson(getCourseMapCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_MAP, {});
    QUIZZES_MEM_CACHE.courseMap = cached;
    return cached;
  });

  const [searchTerm, setSearchTerm] = useState('');

  // ✅ កាតឆ្នាំសិក្សា៖ 'all' | '1' | '2' | '3' | '4'
  const [selectedYear, setSelectedYear] = useState(() => {
    if (initialRouteCourseId) {
      const enrolledInRouteCourse = (QUIZZES_MEM_CACHE.allStudents || []).find(
        (s) =>
          isStudentEnrolledInCourse(
            s,
            initialRouteCourseId,
            QUIZZES_MEM_CACHE.courseMap
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

  const [expandedQuiz, setExpandedQuiz] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State សម្រាប់បង្ហាញផ្ទាំង Modal បញ្ជាក់ការលុបសំណួរនីមួយៗ
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState(null);

  // Import JSON Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCourseId, setImportCourseId] = useState('');
  const [jsonContent, setJsonContent] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [parsedQuizzes, setParsedQuizzes] = useState([]);
  const [isImporting, setIsImporting] = useState(false);

  // Submissions Modal State
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [viewingQuiz, setViewingQuiz] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [submissionSearch, setSubmissionSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, passed, failed
  const [submissionShiftFilter, setSubmissionShiftFilter] = useState('all');

  // Form states for creating/editing a Quiz (កំណត់ពិន្ទុសរុបលំនាំដើមស្មើ 20 ពិន្ទុ ឱ្យត្រូវតាមសំណួរខ្លី 20%)
  const [formData, setFormData] = useState({
    course_id: '',
    title: '',
    duration: 60,
    total_mark: 20,
    start_date: '',
    end_date: '',
  });

  // Form states for adding questions (inside expanded section)
  const [questionText, setQuestionText] = useState('');
  const [questionType, setQuestionType] = useState('MCQ'); // MCQ, TrueFalse, Essay
  const [questionMark, setQuestionMark] = useState(2);
  const [mcqOptions, setMcqOptions] = useState([
    { option_text: '', is_correct: false },
    { option_text: '', is_correct: false },
    { option_text: '', is_correct: false },
    { option_text: '', is_correct: false },
  ]);
  const [tfCorrect, setTfCorrect] = useState('true'); // 'true' or 'false'

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

    const cachedQuz = readStorageJson(
      getQuizzesCacheKey(currentTeacherId),
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

    if (Array.isArray(cachedQuz)) {
      setQuizzes(cachedQuz);
      QUIZZES_MEM_CACHE.quizzes = cachedQuz;
    }
    if (Array.isArray(cachedCrs)) {
      setCourses(cachedCrs);
      QUIZZES_MEM_CACHE.courses = cachedCrs;
    }
    if (Array.isArray(cachedStd)) {
      setAllStudents(cachedStd);
      QUIZZES_MEM_CACHE.allStudents = cachedStd;
    }
    if (cachedMap) {
      setCourseMap(cachedMap);
      QUIZZES_MEM_CACHE.courseMap = cachedMap;
    }

    const now = Date.now();
    if (
      QUIZZES_MEM_CACHE.uid === currentTeacherId &&
      Array.isArray(QUIZZES_MEM_CACHE.quizzes) &&
      Array.isArray(QUIZZES_MEM_CACHE.courses) &&
      now - QUIZZES_MEM_CACHE.lastSyncedAt < 25000
    ) {
      return;
    }

    // ១. ទាញបញ្ជីកម្រងសំណួរមុនគេ
    api
      .get('/teacher/quizzes')
      .then((quzRes) => {
        if (!isMounted) return;
        const rawQuz = quzRes.data?.data || quzRes.data || [];
        const validQuizzes = Array.isArray(rawQuz) ? rawQuz : [];
        setQuizzes(validQuizzes);
        QUIZZES_MEM_CACHE.quizzes = validQuizzes;
        QUIZZES_MEM_CACHE.lastSyncedAt = Date.now();
        try {
          localStorage.setItem(
            getQuizzesCacheKey(currentTeacherId),
            JSON.stringify(validQuizzes)
          );
          localStorage.setItem(
            CACHE_KEY_SHARED_QUIZZES,
            JSON.stringify(validQuizzes)
          );
        } catch (e) {}
      })
      .catch((error) => {
        console.error('Error syncing quizzes data:', error);
      });

    // ២. ទាញមុខវិជ្ជានៅផ្ទៃខាងក្រោយដោយឯករាជ្យ
    api
      .get('/teacher/courses')
      .then((crsRes) => {
        if (!isMounted) return;
        const rawCrs = crsRes.data?.data || crsRes.data || [];
        const validCourses = Array.isArray(rawCrs) ? rawCrs : [];
        setCourses(validCourses);
        QUIZZES_MEM_CACHE.courses = validCourses;
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
      !Array.isArray(QUIZZES_MEM_CACHE.allStudents) ||
      QUIZZES_MEM_CACHE.allStudents.length === 0
    ) {
      api
        .get('/teacher/students')
        .then((stdRes) => {
          if (!isMounted) return;
          const rawStd = stdRes.data?.data || stdRes.data || [];
          const validStudents = Array.isArray(rawStd) ? rawStd : [];
          setAllStudents(validStudents);
          QUIZZES_MEM_CACHE.allStudents = validStudents;
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
            QUIZZES_MEM_CACHE.courseMap = stdRes.data.course_students_map;
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

  const fetchQuizzes = async () => {
    try {
      const response = await api.get('/teacher/quizzes');
      const quizzesData = response.data?.data || response.data || [];
      const validQuizzes = Array.isArray(quizzesData) ? quizzesData : [];
      setQuizzes(validQuizzes);
      QUIZZES_MEM_CACHE.quizzes = validQuizzes;
      QUIZZES_MEM_CACHE.lastSyncedAt = Date.now();
      try {
        localStorage.setItem(
          getQuizzesCacheKey(currentTeacherId),
          JSON.stringify(validQuizzes)
        );
        localStorage.setItem(
          CACHE_KEY_SHARED_QUIZZES,
          JSON.stringify(validQuizzes)
        );
      } catch (e) {}
    } catch (error) {
      console.error('Error fetching quizzes:', error);
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

  // ✅ អនុគមន៍ពិនិត្យថាតើកម្រងសំណួរមួយត្រូវនឹងវេនសិក្សាដែលបានជ្រើសរើសឬអត់
  const doesQuizHaveShift = useCallback(
    (quiz, targetShiftKey, matchedCourseObj) => {
      if (!targetShiftKey || targetShiftKey === 'all') return true;
      const cid = String(quiz?.course_id || '');

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
      if (editingQuiz && editingQuiz.course_id) {
        const exists = yearCourses.some(
          (c) => String(c.id) === String(editingQuiz.course_id)
        );
        if (!exists) {
          const currentCourseObj = enrichedCourses.find(
            (c) => String(c.id) === String(editingQuiz.course_id)
          );
          if (currentCourseObj) return [currentCourseObj, ...yearCourses];
        }
      }
      return yearCourses;
    }

    if (editingQuiz && editingQuiz.course_id) {
      const currentCourseObj = enrichedCourses.find(
        (c) => String(c.id) === String(editingQuiz.course_id)
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
  }, [selectedYear, editingQuiz, enrichedCourses, getCoursesForYearKey]);

  // ✅ គណនាចំនួនកម្រងសំណួរសរុប និងតាមឆ្នាំសិក្សា (ឆ្នាំទី១ ដល់ ឆ្នាំទី៤) សម្រាប់បង្ហាញលើកាតទាំង ៥
  const quizYearCounts = useMemo(() => {
    const counts = { all: 0, '1': 0, '2': 0, '3': 0, '4': 0 };
    if (!Array.isArray(quizzes)) return counts;

    counts.all = quizzes.length;
    quizzes.forEach((quz) => {
      const matchedCourse = enrichedCourses.find(
        (c) => String(c.id) === String(quz.course_id)
      );
      if (matchedCourse && Array.isArray(matchedCourse.yearsList)) {
        matchedCourse.yearsList.forEach((y) => {
          if (counts[y] !== undefined) counts[y] += 1;
        });
      }
    });
    return counts;
  }, [quizzes, enrichedCourses]);

  const activeCourseObj = useMemo(() => {
    if (selectedYear === 'all' || !selectedCourse) return null;
    return (
      enrichedCourses.find((c) => String(c.id) === String(selectedCourse)) ||
      null
    );
  }, [selectedYear, selectedCourse, enrichedCourses]);

  // ✅ ច្រោះកម្រងសំណួរតាមឆ្នាំសិក្សា និងមុខវិជ្ជា (មុនពេលច្រោះតាមវេនសិក្សា)
  const quizzesByYearAndCourse = useMemo(() => {
    if (!Array.isArray(quizzes)) return [];

    return quizzes.filter((quiz) => {
      const matchedCourse = enrichedCourses.find(
        (c) => String(c.id) === String(quiz.course_id)
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
        String(quiz.course_id) !== String(selectedCourse)
      ) {
        return false;
      }

      return true;
    });
  }, [quizzes, enrichedCourses, selectedYear, selectedCourse]);

  // ✅ គណនាចំនួនកម្រងសំណួរតាមវេនសិក្សា (គ្រប់វេនសិក្សា, ចន្ទ-សុក្រ, សៅរ៍-អាទិត្យ)
  const shiftCounts = useMemo(() => {
    let monFri = 0;
    let satSun = 0;

    quizzesByYearAndCourse.forEach((quz) => {
      const matchedCourse = enrichedCourses.find(
        (c) => String(c.id) === String(quz.course_id)
      );
      if (doesQuizHaveShift(quz, 'Monday-Friday', matchedCourse)) {
        monFri += 1;
      }
      if (doesQuizHaveShift(quz, 'Saturday-Sunday', matchedCourse)) {
        satSun += 1;
      }
    });

    return {
      all: quizzesByYearAndCourse.length,
      'Monday-Friday': monFri,
      'Saturday-Sunday': satSun,
    };
  }, [quizzesByYearAndCourse, enrichedCourses, doesQuizHaveShift]);

  // ✅ ច្រោះបញ្ជីកម្រងសំណួរចុងក្រោយតាមវេនសិក្សា និងតាមពាក្យស្វែងរក
  const filteredQuizzes = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();

    return quizzesByYearAndCourse.filter((quiz) => {
      const matchedCourse = enrichedCourses.find(
        (c) => String(c.id) === String(quiz.course_id)
      );

      if (isSpecificShiftSelected) {
        if (!doesQuizHaveShift(quiz, selectedShift, matchedCourse)) {
          return false;
        }
      }

      if (!search) return true;
      const titleMatch = (quiz.title || '').toLowerCase().includes(search);
      const courseMatch = (
        quiz.course?.course_name ||
        matchedCourse?.course_name ||
        ''
      )
        .toLowerCase()
        .includes(search);

      return titleMatch || courseMatch;
    });
  }, [
    quizzesByYearAndCourse,
    enrichedCourses,
    selectedShift,
    isSpecificShiftSelected,
    searchTerm,
    doesQuizHaveShift,
  ]);

  // ✅ ទាញរកវេនសិក្សារបស់សិស្សដែលបានប្រឡងក្នុង Modal
  const resolveAttemptStudentShift = useCallback(
    (attempt) => {
      const directShift =
        attempt?.student?.study_shift ||
        attempt?.study_shift ||
        attempt?.student?.shift;
      if (directShift) return normalizeShiftKey(directShift);

      const attUserId =
        attempt?.student_id ||
        attempt?.user_id ||
        attempt?.student?.user_id ||
        attempt?.student?.id;
      const attEmail = (attempt?.student?.email || '').toLowerCase().trim();

      const matchedStd = (allStudents || []).find(
        (s) =>
          (attUserId &&
            (String(s.user_id) === String(attUserId) ||
              String(s.id) === String(attUserId))) ||
          (attEmail && (s.email || '').toLowerCase().trim() === attEmail)
      );

      return normalizeShiftKey(matchedStd?.study_shift);
    },
    [allStudents]
  );

  // ✅ ទាញរករូបភាពប្រវត្តិរូប (Base64 / URL) របស់សិស្សដែលបានប្រឡងក្នុង Modal
  const resolveAttemptStudentAvatar = useCallback(
    (attempt) => {
      const directImg =
        attempt?.student?.profile_image ||
        attempt?.student?.user?.profile_image ||
        attempt?.profile_image ||
        attempt?.student_image;
      if (directImg) return directImg;

      const attUserId =
        attempt?.student_id ||
        attempt?.user_id ||
        attempt?.student?.user_id ||
        attempt?.student?.id;
      const attEmail = (attempt?.student?.email || '').toLowerCase().trim();

      const matchedStd = (allStudents || []).find(
        (s) =>
          (attUserId &&
            (String(s.user_id) === String(attUserId) ||
              String(s.id) === String(attUserId))) ||
          (attEmail && (s.email || '').toLowerCase().trim() === attEmail)
      );

      return matchedStd?.profile_image || matchedStd?.user?.profile_image || null;
    },
    [allStudents]
  );

  // ============================================================================
  // 📌 ផ្នែកទី៤៖ មុខងារគ្រប់គ្រងកម្រងសំណួរ និងសំណួរនីមួយៗ (ភ្ជាប់កណ្ដឹង)
  // ============================================================================
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

  const getQuestionTypeBadgeLabel = (type) => {
    if (type === 'MCQ') return t('ពហុជ្រើសរើស (MCQ)', 'MCQ');
    if (type === 'TrueFalse') return t('ពិត / មិនពិត', 'True / False');
    if (type === 'Essay') return t('សរសេររៀបរាប់', 'Essay');
    return type;
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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const openAddModal = () => {
    setEditingQuiz(null);
    const defaultCourseId =
      selectedCourse ||
      (visibleCoursesForSelectedYear.length > 0
        ? String(visibleCoursesForSelectedYear[0].id)
        : '');

    setFormData({
      course_id: defaultCourseId,
      title: '',
      duration: 60,
      total_mark: 20,
      start_date: '',
      end_date: '',
    });
    setShowAddModal(true);
  };

  const openEditModal = (quiz) => {
    setEditingQuiz(quiz);

    const formattedStart = toDatetimeLocalInput(quiz.start_date);
    const formattedEnd = toDatetimeLocalInput(quiz.end_date);

    setFormData({
      course_id: quiz.course_id ? String(quiz.course_id) : '',
      title: quiz.title || '',
      duration: quiz.duration ?? 60,
      total_mark: formatCleanScore(quiz.total_mark ?? 20),
      start_date: formattedStart,
      end_date: formattedEnd,
    });
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.start_date || !formData.end_date) {
      return;
    }

    const startMs = toComparableTimeMs(formData.start_date);
    const endMs = toComparableTimeMs(formData.end_date);

    if (isNaN(startMs) || isNaN(endMs)) {
      return;
    }

    if (endMs <= startMs) {
      return;
    }

    setIsSubmitting(true);

    const exactStartStr = toBackendDateTime(formData.start_date);
    const exactEndStr = toBackendDateTime(formData.end_date);

    const payload = {
      course_id: formData.course_id,
      title: formData.title.trim(),
      duration: parseInt(formData.duration, 10) || 60,
      total_mark: parseFloat(formData.total_mark) || 20,
      start_date: exactStartStr,
      end_date: exactEndStr,
    };

    const targetCourse = courses.find(
      (c) => String(c.id) === String(formData.course_id)
    );
    const courseName = targetCourse?.course_name || '';

    try {
      if (editingQuiz) {
        const res = await api.put(`/teacher/quizzes/${editingQuiz.id}`, payload);
        const serverData = res.data?.data || res.data?.quiz || res.data;

        setQuizzes((prev) => {
          const updated = prev.map((q) =>
            q.id === editingQuiz.id
              ? {
                  ...q,
                  ...(typeof serverData === 'object' ? serverData : {}),
                  ...payload,
                  start_date: exactStartStr,
                  end_date: exactEndStr,
                  course: targetCourse || q.course,
                }
              : q
          );
          QUIZZES_MEM_CACHE.quizzes = updated;
          try {
            localStorage.setItem(
              getQuizzesCacheKey(currentTeacherId),
              JSON.stringify(updated)
            );
            localStorage.setItem(
              CACHE_KEY_SHARED_QUIZZES,
              JSON.stringify(updated)
            );
          } catch (e) {}
          return updated;
        });

        pushLocalNotification({
          titleKm: 'បានកែប្រែកម្រងសំណួរ',
          titleEn: 'Quiz Updated',
          descKm: `កម្រងសំណួរ «${payload.title}» ${courseName ? `(${courseName})` : ''} ត្រូវបានកែប្រែដោយជោគជ័យ។`,
          descEn: `Quiz "${payload.title}" was updated successfully.`,
          category: 'quiz',
          link: '/quizzes',
        });
      } else {
        const res = await api.post('/teacher/quizzes', payload);
        const serverData = res.data?.data || res.data?.quiz || res.data;
        const createdQuiz = {
          id: Date.now(),
          questions_count: 0,
          attempts_count: 0,
          questions: [],
          ...(typeof serverData === 'object' ? serverData : {}),
          ...payload,
          start_date: exactStartStr,
          end_date: exactEndStr,
          course: targetCourse || null,
        };

        setQuizzes((prev) => {
          const updated = [createdQuiz, ...prev];
          QUIZZES_MEM_CACHE.quizzes = updated;
          try {
            localStorage.setItem(
              getQuizzesCacheKey(currentTeacherId),
              JSON.stringify(updated)
            );
            localStorage.setItem(
              CACHE_KEY_SHARED_QUIZZES,
              JSON.stringify(updated)
            );
          } catch (e) {}
          return updated;
        });

        pushLocalNotification({
          titleKm: 'បានបង្កើតកម្រងសំណួរថ្មី',
          titleEn: 'New Quiz Created',
          descKm: `បានបង្កើតកម្រងសំណួរថ្មី «${payload.title}» (${payload.duration} នាទី | ${payload.total_mark} ពិន្ទុ) សម្រាប់មុខវិជ្ជា «${courseName || '—'}»។`,
          descEn: `Created new quiz "${payload.title}" (${payload.duration} mins, ${payload.total_mark} pts).`,
          category: 'quiz',
          link: '/quizzes',
        });
      }
      setShowAddModal(false);
      fetchQuizzes();
    } catch (error) {
      console.error('Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (quiz) => {
    setSelectedQuiz(quiz);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedQuiz) return;

    const deletedId = selectedQuiz.id;
    const deletedTitle = selectedQuiz.title;
    const previousQuizzes = [...quizzes];

    setShowDeleteModal(false);
    setSelectedQuiz(null);

    setQuizzes((prev) => {
      const updated = prev.filter((q) => q.id !== deletedId);
      QUIZZES_MEM_CACHE.quizzes = updated;
      try {
        localStorage.setItem(
          getQuizzesCacheKey(currentTeacherId),
          JSON.stringify(updated)
        );
        localStorage.setItem(CACHE_KEY_SHARED_QUIZZES, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    try {
      await api.delete(`/teacher/quizzes/${deletedId}`);

      pushLocalNotification({
        titleKm: 'បានលុបកម្រងសំណួរ',
        titleEn: 'Quiz Deleted',
        descKm: `កម្រងសំណួរ «${deletedTitle}» ត្រូវបានលុបចេញពីប្រព័ន្ធរួចរាល់។`,
        descEn: `Quiz "${deletedTitle}" has been removed.`,
        category: 'quiz',
        link: '/quizzes',
      });
    } catch (error) {
      console.error('Delete quiz error:', error);
      setQuizzes(previousQuizzes);
      QUIZZES_MEM_CACHE.quizzes = previousQuizzes;
      try {
        localStorage.setItem(
          getQuizzesCacheKey(currentTeacherId),
          JSON.stringify(previousQuizzes)
        );
        localStorage.setItem(
          CACHE_KEY_SHARED_QUIZZES,
          JSON.stringify(previousQuizzes)
        );
      } catch (e) {}
    }
  };

  const handleAddQuestion = async (quizId) => {
    if (!questionText.trim()) {
      return;
    }

    let options = [];
    if (questionType === 'MCQ') {
      const filledOptions = mcqOptions.filter(
        (opt) => opt.option_text.trim() !== ''
      );
      if (filledOptions.length < 2) {
        return;
      }
      const hasCorrect = filledOptions.some((opt) => opt.is_correct);
      if (!hasCorrect) {
        return;
      }
      options = filledOptions;
    } else if (questionType === 'TrueFalse') {
      options = [
        { option_text: t('ពិត (True)', 'True'), is_correct: tfCorrect === 'true' },
        {
          option_text: t('មិនពិត (False)', 'False'),
          is_correct: tfCorrect === 'false',
        },
      ];
    }

    const payload = {
      question_text: questionText.trim(),
      question_type: questionType,
      mark: parseFloat(questionMark) || 2,
      options: questionType === 'Essay' ? [] : options,
    };

    const tempId = `temp_q_${Date.now()}`;
    const optimisticQuestion = {
      id: tempId,
      ...payload,
    };

    const previousQuizzes = [...quizzes];
    const targetQuiz = quizzes.find((q) => q.id === quizId);

    setQuizzes((prev) => {
      const updated = prev.map((q) => {
        if (q.id !== quizId) return q;
        const nextQuestions = [
          ...(Array.isArray(q.questions) ? q.questions : []),
          optimisticQuestion,
        ];
        return {
          ...q,
          questions: nextQuestions,
          questions_count: nextQuestions.length,
        };
      });
      QUIZZES_MEM_CACHE.quizzes = updated;
      try {
        localStorage.setItem(
          getQuizzesCacheKey(currentTeacherId),
          JSON.stringify(updated)
        );
        localStorage.setItem(CACHE_KEY_SHARED_QUIZZES, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    setQuestionText('');
    setQuestionMark(2);
    setMcqOptions([
      { option_text: '', is_correct: false },
      { option_text: '', is_correct: false },
      { option_text: '', is_correct: false },
      { option_text: '', is_correct: false },
    ]);

    try {
      const res = await api.post(`/teacher/quizzes/${quizId}/questions`, payload);
      const savedQuestion = res.data?.question || res.data?.data || res.data;

      if (savedQuestion && savedQuestion.id) {
        setQuizzes((prev) => {
          const updated = prev.map((q) => {
            if (q.id !== quizId) return q;
            const nextQuestions = (q.questions || []).map((item) =>
              item.id === tempId
                ? { ...optimisticQuestion, ...savedQuestion }
                : item
            );
            return { ...q, questions: nextQuestions };
          });
          QUIZZES_MEM_CACHE.quizzes = updated;
          try {
            localStorage.setItem(
              getQuizzesCacheKey(currentTeacherId),
              JSON.stringify(updated)
            );
            localStorage.setItem(
              CACHE_KEY_SHARED_QUIZZES,
              JSON.stringify(updated)
            );
          } catch (e) {}
          return updated;
        });
      } else {
        fetchQuizzes();
      }

      pushLocalNotification({
        titleKm: 'បានបន្ថែមសំណួរថ្មីក្នុងកម្រងសំណួរ',
        titleEn: 'New Question Added',
        descKm: `បានបន្ថែមសំណួរប្រភេទ ${questionType} (${payload.mark} ពិន្ទុ) ទៅក្នុងកម្រងសំណួរ «${targetQuiz?.title || ''}»។`,
        descEn: `Added a new ${questionType} question (${payload.mark} pts) to "${targetQuiz?.title || ''}".`,
        category: 'quiz',
        link: '/quizzes',
      });
    } catch (error) {
      console.error('Add question error:', error);
      setQuizzes(previousQuizzes);
      QUIZZES_MEM_CACHE.quizzes = previousQuizzes;
    }
  };

  const handleDeleteQuestionClick = (question) => {
    setDeleteQuestionTarget(question);
  };

  const confirmDeleteQuestion = async () => {
    if (!deleteQuestionTarget) return;

    const questionId = deleteQuestionTarget.id;
    const deletedQText = deleteQuestionTarget.question_text;
    const previousQuizzes = [...quizzes];
    setDeleteQuestionTarget(null);

    setQuizzes((prev) => {
      const updated = prev.map((q) => {
        if (!Array.isArray(q.questions)) return q;
        const filteredQs = q.questions.filter((item) => item.id !== questionId);
        return {
          ...q,
          questions: filteredQs,
          questions_count: filteredQs.length,
        };
      });
      QUIZZES_MEM_CACHE.quizzes = updated;
      try {
        localStorage.setItem(
          getQuizzesCacheKey(currentTeacherId),
          JSON.stringify(updated)
        );
        localStorage.setItem(CACHE_KEY_SHARED_QUIZZES, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    try {
      await api.delete(`/teacher/quizzes/questions/${questionId}`);

      pushLocalNotification({
        titleKm: 'បានលុបសំណួរចេញពីកម្រងសំណួរ',
        titleEn: 'Quiz Question Deleted',
        descKm: `សំណួរ «${deletedQText}» ត្រូវបានលុបចេញពីកម្រងសំណួរ។`,
        descEn: `Question "${deletedQText}" was removed.`,
        category: 'quiz',
        link: '/quizzes',
      });
    } catch (error) {
      console.error('Delete question error:', error);
      setQuizzes(previousQuizzes);
      QUIZZES_MEM_CACHE.quizzes = previousQuizzes;
      try {
        localStorage.setItem(
          getQuizzesCacheKey(currentTeacherId),
          JSON.stringify(previousQuizzes)
        );
        localStorage.setItem(
          CACHE_KEY_SHARED_QUIZZES,
          JSON.stringify(previousQuizzes)
        );
      } catch (e) {}
    }
  };

  const handleMcqOptionChange = (index, value) => {
    setMcqOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, option_text: value } : opt))
    );
  };

  const handleMcqCorrectToggle = (index) => {
    setMcqOptions((prev) =>
      prev.map((opt, i) => ({ ...opt, is_correct: i === index }))
    );
  };

  // ============================================================================
  // 📌 ផ្នែកទី៥៖ មុខងារនាំចូល JSON និងនាំចេញឯកសារ Excel (.xlsx)
  // ============================================================================
  const downloadSampleJson = () => {
    const sample = [
      {
        title: 'HTML & CSS Basics Quiz',
        duration: 45,
        total_mark: 20,
        questions: [
          {
            question_text: 'What does HTML stand for?',
            question_type: 'MCQ',
            mark: 5,
            options: [
              { option_text: 'HyperText Markup Language', is_correct: true },
              { option_text: 'HighText Machine Language', is_correct: false },
              { option_text: 'Hyperlink Text Mark Language', is_correct: false },
              { option_text: 'Home Tool Markup Language', is_correct: false },
            ],
          },
          {
            question_text: 'Is CSS used for styling web pages?',
            question_type: 'TrueFalse',
            mark: 5,
            options: [
              { option_text: 'True', is_correct: true },
              { option_text: 'False', is_correct: false },
            ],
          },
          {
            question_text: 'Explain the CSS Box Model.',
            question_type: 'Essay',
            mark: 10,
            options: [],
          },
        ],
      },
    ];

    const blob = new Blob([JSON.stringify(sample, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quiz_import_template.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const quizArray = Array.isArray(parsed) ? parsed : [parsed];
        setParsedQuizzes(quizArray);
        setJsonContent(JSON.stringify(parsed, null, 2));
      } catch (err) {
        console.error('Invalid JSON format:', err);
        setParsedQuizzes([]);
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!parsedQuizzes || parsedQuizzes.length === 0) return;
    const targetCourse =
      importCourseId ||
      (modalAvailableCourses.length > 0
        ? String(modalAvailableCourses[0].id)
        : '');
    if (!targetCourse) {
      return;
    }

    const courseObj = courses.find((c) => String(c.id) === String(targetCourse));

    setIsImporting(true);
    try {
      const payload = {
        course_id: targetCourse,
        quizzes: parsedQuizzes.map((q) => ({
          ...q,
          course_id: q.course_id || targetCourse,
        })),
      };

      await api.post('/teacher/quizzes/import', payload);

      pushLocalNotification({
        titleKm: 'បាននាំចូលកម្រងសំណួរពី JSON',
        titleEn: 'Quizzes Imported from JSON',
        descKm: `បាននាំចូលកម្រងសំណួរចំនួន ${parsedQuizzes.length} ទៅក្នុងមុខវិជ្ជា «${courseObj?.course_name || ''}»។`,
        descEn: `Imported ${parsedQuizzes.length} quizzes into "${courseObj?.course_name || ''}".`,
        category: 'quiz',
        link: '/quizzes',
      });

      setShowImportModal(false);
      setParsedQuizzes([]);
      setJsonContent('');
      setImportFile(null);
      await fetchQuizzes();
    } catch (error) {
      console.error('Import error:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const openSubmissionsModal = async (quiz) => {
    setViewingQuiz(quiz);
    setShowSubmissionsModal(true);
    setSubmissionSearch('');
    setStatusFilter('all');
    setSubmissionShiftFilter(selectedShift !== 'all' ? selectedShift : 'all');

    const memRes = QUIZZES_MEM_CACHE.resultsByQuiz[quiz.id];
    if (Array.isArray(memRes)) {
      setSubmissions(memRes);
    } else {
      try {
        const cached = localStorage.getItem(
          getQuizResultsCacheKey(currentTeacherId, quiz.id)
        );
        if (cached) {
          const parsed = JSON.parse(cached);
          setSubmissions(parsed);
          QUIZZES_MEM_CACHE.resultsByQuiz[quiz.id] = parsed;
        } else {
          setSubmissions([]);
        }
      } catch {
        setSubmissions([]);
      }
    }

    try {
      const response = await api.get(`/teacher/quizzes/${quiz.id}/results`);
      const attemptsData =
        response.data?.attempts || response.data?.data || response.data || [];
      const validAttempts = Array.isArray(attemptsData) ? attemptsData : [];
      setSubmissions(validAttempts);
      QUIZZES_MEM_CACHE.resultsByQuiz[quiz.id] = validAttempts;

      try {
        localStorage.setItem(
          getQuizResultsCacheKey(currentTeacherId, quiz.id),
          JSON.stringify(validAttempts)
        );
      } catch (e) {}
    } catch (error) {
      console.error('Error fetching quiz submissions:', error);
    }
  };

  // ✅ ច្រោះលទ្ធផលប្រឡងរបស់សិស្សក្នុង Modal (តាមឈ្មោះ, តាមវេនសិក្សា និងតាមស្ថានភាព ជាប់/ធ្លាក់)
  const filteredSubmissions = useMemo(() => {
    if (!Array.isArray(submissions)) return [];
    const search = submissionSearch.toLowerCase().trim();
    const totalVal = parseFloat(viewingQuiz?.total_mark) || 20;

    return submissions.filter((attempt) => {
      const studentName = attempt.student
        ? (
            `${attempt.student.first_name || ''} ${attempt.student.last_name || ''}`.trim() ||
            attempt.student.name ||
            ''
          ).toLowerCase()
        : '';
      const studentEmail = attempt.student?.email?.toLowerCase() || '';
      const nameMatch =
        !search || studentName.includes(search) || studentEmail.includes(search);

      const attShift = resolveAttemptStudentShift(attempt);
      const shiftMatch =
        submissionShiftFilter === 'all' || attShift === submissionShiftFilter;
      if (!shiftMatch) return false;

      const scoreVal = parseFloat(attempt.score) || 0;
      const isPassed = scoreVal / totalVal >= 0.5;

      if (statusFilter === 'passed') return nameMatch && isPassed;
      if (statusFilter === 'failed') return nameMatch && !isPassed;
      return nameMatch;
    });
  }, [
    submissions,
    submissionSearch,
    submissionShiftFilter,
    statusFilter,
    viewingQuiz,
    resolveAttemptStudentShift,
  ]);

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

  // ✅ ១. នាំចេញបញ្ជីកម្រងសំណួរទៅជា Excel (.xlsx)
  const handleExportQuizzesExcel = () => {
    if (filteredQuizzes.length === 0) {
      return;
    }

    const exportData = filteredQuizzes.map((item, idx) => {
      const matchedCourse = enrichedCourses.find(
        (c) => String(c.id) === String(item.course_id)
      );
      const shiftLabels = (matchedCourse?.shiftsList || ['Monday-Friday'])
        .map((sh) => getStudyShiftLabel(sh))
        .join(', ');

      return {
        'ល.រ': idx + 1,
        'ចំណងជើងកម្រងសំណួរ': item.title || '—',
        'មុខវិជ្ជា':
          item.course?.course_name || matchedCourse?.course_name || '—',
        'វេនសិក្សា': shiftLabels || '—',
        'រយៈពេល (នាទី)': item.duration || 60,
        'ពិន្ទុសរុប': `${formatCleanScore(item.total_mark ?? 20)} ${t('ពិន្ទុ', 'pts')}`,
        'ចំនួនសំណួរ': item.questions_count || item.questions?.length || 0,
        'ចំនួនសិស្សប្រឡង': item.attempts_count || 0,
        'ថ្ងៃចាប់ផ្តើម': formatDate(item.start_date),
        'ថ្ងៃបញ្ចប់': formatDate(item.end_date),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const colWidths = [
      { wch: 8 },
      { wch: 28 },
      { wch: 24 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
      { wch: 26 },
      { wch: 26 },
    ];
    applyExcelStyling(worksheet, colWidths, []);

    const yearSuffix = selectedYear !== 'all' ? `_Year${selectedYear}` : '';
    const courseSuffix = activeCourseObj?.course_code
      ? `_${activeCourseObj.course_code}`
      : '';
    const shiftSuffix = isSpecificShiftSelected ? `_${selectedShift}` : '';
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Quizzes');
    XLSX.writeFile(
      workbook,
      `Teacher_Quizzes${yearSuffix}${courseSuffix}${shiftSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    pushLocalNotification({
      titleKm: 'បាននាំចេញបញ្ជីកម្រងសំណួរទៅ Excel',
      titleEn: 'Quizzes Exported to Excel',
      descKm: `បញ្ជីកម្រងសំណួរចំនួន ${filteredQuizzes.length} ត្រូវបានទាញយកជាឯកសារ Excel ជោគជ័យ។`,
      descEn: `Exported ${filteredQuizzes.length} quizzes to Excel.`,
      category: 'export',
      link: '/quizzes',
    });
  };

  // ✅ ២. នាំចេញលទ្ធផលប្រឡងរបស់សិស្សក្នុង Modal ទៅជាឯកសារ Excel (.xlsx)
  const handleExportQuizResultsExcel = () => {
    if (!viewingQuiz || filteredSubmissions.length === 0) {
      return;
    }

    const totalVal = parseFloat(viewingQuiz.total_mark) || 20;

    const exportData = filteredSubmissions.map((attempt, idx) => {
      const student = attempt.student;
      const studentName = student
        ? `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
          student.name ||
          student.email
        : 'Unknown';
      const weighted20 = toQuizWeighted20Score(attempt.score ?? 0, totalVal);
      const isPassed = (parseFloat(attempt.score) || 0) / totalVal >= 0.5;

      return {
        'ល.រ': idx + 1,
        'ឈ្មោះសិស្ស': studentName,
        'ភេទ': getGenderLabel(student?.gender) || '—',
        'វេនសិក្សា': getStudyShiftLabel(resolveAttemptStudentShift(attempt)),
        'អ៊ីមែល': student?.email || '—',
        'ម៉ោងចាប់ផ្តើម': formatDate(attempt.started_at),
        'ម៉ោងប្រគល់': formatDate(attempt.submitted_at),
        'ពិន្ទុទទួលបាន': `${weighted20} ${t('ពិន្ទុ', 'pts')}`,
        'លទ្ធផល': isPassed
          ? t('ជាប់ (Passed)', 'Passed')
          : t('ធ្លាក់ (Failed)', 'Failed'),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const colWidths = [
      { wch: 8 },
      { wch: 24 },
      { wch: 10 },
      { wch: 16 },
      { wch: 26 },
      { wch: 24 },
      { wch: 24 },
      { wch: 16 },
      { wch: 16 },
    ];
    applyExcelStyling(worksheet, colWidths, []);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Quiz_Results');
    const safeTitle = (viewingQuiz.title || 'Quiz').replace(
      /[\\/:*?"<>|\s]+/g,
      '_'
    );
    XLSX.writeFile(
      workbook,
      `Quiz_Results_${safeTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    pushLocalNotification({
      titleKm: 'បាននាំចេញលទ្ធផលប្រឡងទៅ Excel',
      titleEn: 'Quiz Results Exported to Excel',
      descKm: `លទ្ធផលប្រឡងកម្រងសំណួរ «${viewingQuiz.title}» (${filteredSubmissions.length} នាក់) ត្រូវបានទាញយកជា Excel ជោគជ័យ។`,
      descEn: `Exported results for "${viewingQuiz.title}" (${filteredSubmissions.length} students) to Excel.`,
      category: 'export',
      link: '/quizzes',
    });
  };

  // ទិន្នន័យកាតឆ្នាំសិក្សាទាំង ៥ សម្រាប់ Render
  const yearCardsConfig = [
    {
      key: 'all',
      titleKm: 'កម្រងសំណួរសរុប',
      titleEn: 'Total Quizzes',
      subtitleKm: 'គ្រប់ឆ្នាំសិក្សាទាំងអស់',
      subtitleEn: 'All Academic Years',
      count: quizYearCounts.all,
      activeGradient:
        'from-blue-600 to-indigo-700 text-white border-blue-600 shadow-blue-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive: 'bg-blue-50 text-blue-600 border-blue-100 quz-pill-blue',
    },
    {
      key: '1',
      titleKm: 'កម្រងសំណួរឆ្នាំទី១',
      titleEn: 'Year 1 Quizzes',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ១',
      subtitleEn: 'First Year Level',
      count: quizYearCounts['1'],
      activeGradient:
        'from-emerald-600 to-teal-700 text-white border-emerald-600 shadow-emerald-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive:
        'bg-emerald-50 text-emerald-600 border-emerald-100 quz-pill-emerald',
    },
    {
      key: '2',
      titleKm: 'កម្រងសំណួរឆ្នាំទី២',
      titleEn: 'Year 2 Quizzes',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ២',
      subtitleEn: 'Second Year Level',
      count: quizYearCounts['2'],
      activeGradient:
        'from-indigo-600 to-violet-700 text-white border-indigo-600 shadow-indigo-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive:
        'bg-indigo-50 text-indigo-600 border-indigo-100 quz-pill-indigo',
    },
    {
      key: '3',
      titleKm: 'កម្រងសំណួរឆ្នាំទី៣',
      titleEn: 'Year 3 Quizzes',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ៣',
      subtitleEn: 'Third Year Level',
      count: quizYearCounts['3'],
      activeGradient:
        'from-amber-500 to-orange-600 text-white border-amber-500 shadow-amber-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive:
        'bg-amber-50 text-amber-600 border-amber-100 quz-pill-amber',
    },
    {
      key: '4',
      titleKm: 'កម្រងសំណួរឆ្នាំទី៤',
      titleEn: 'Year 4 Quizzes',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ៤',
      subtitleEn: 'Fourth Year Level',
      count: quizYearCounts['4'],
      activeGradient:
        'from-rose-600 to-pink-700 text-white border-rose-600 shadow-rose-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive: 'bg-rose-50 text-rose-600 border-rose-100 quz-pill-rose',
    },
  ];

  const canShowExportExcel =
    (selectedYear !== 'all' || selectedCourse !== '') &&
    filteredQuizzes.length > 0;

  // ============================================================================
  // 📌 ផ្នែកទី៦៖ ការបង្ហាញផ្ទៃមុខកម្មវិធី (JSX UI Rendering)
  // ============================================================================
  return (
    <div className="quz-page-bg p-4 sm:p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6 pb-28 lg:pb-10">
      
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
                <AcademicCapIcon className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-400" />
              </div>
              <span>{t('គ្រប់គ្រងកម្រងសំណួរ និងការប្រឡង', 'Manage Quizzes & Exams')}</span>
            </h1>
            <p className="text-blue-200/80 text-xs sm:text-sm max-w-xl font-medium leading-relaxed">
              {selectedYear === 'all'
                ? t(
                    'សូមចុចជ្រើសរើសកាតឆ្នាំសិក្សា (ឆ្នាំទី១-ទី៤) ខាងក្រោម ដើម្បីមើលមុខវិជ្ជា បង្កើតកម្រងសំណួរប្រឡង និងពិនិត្យលទ្ធផលសិស្ស។',
                    'Please select an academic year card (Year 1–4) below to filter courses, create quizzes, and review student results.'
                  )
                : t(
                    'បង្កើតកម្រងសំណួរប្រឡង និងគ្រប់គ្រងសំណួរនីមួយៗ តាមមុខវិជ្ជា និងវេនសិក្សា រួមទាំងការពិនិត្យមើលលទ្ធផលប្រឡងរបស់សិស្ស។',
                    'Create exam quizzes and manage individual questions by course and study shift, including student results.'
                  )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {canShowExportExcel && (
              <button
                type="button"
                onClick={handleExportQuizzesExcel}
                className="inline-flex items-center justify-center px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer animate-fadeIn"
              >
                <DocumentIcon className="h-5 w-5 mr-2" />
                {t('នាំចេញ Excel', 'Export Excel')}
              </button>
            )}

            {/* ✅ បង្ហាញប៊ូតុង «នាំចូលកម្រងសំណួរ» និង «បន្ថែមកម្រងសំណួរថ្មី» តែនៅពេលចុចលើកាតឆ្នាំណាមួយ (ឆ្នាំទី១-៤) ប៉ុណ្ណោះ */}
            {selectedYear !== 'all' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const defaultCrs =
                      selectedCourse ||
                      (visibleCoursesForSelectedYear.length > 0
                        ? String(visibleCoursesForSelectedYear[0].id)
                        : '');
                    setImportCourseId(defaultCrs);
                    setShowImportModal(true);
                  }}
                  className="inline-flex items-center justify-center px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-bold rounded-xl transition-all cursor-pointer animate-fadeIn"
                >
                  <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
                  {t('នាំចូលកម្រងសំណួរ', 'Import Quiz')}
                </button>
                <button
                  type="button"
                  onClick={openAddModal}
                  className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer animate-fadeIn"
                >
                  <PlusIcon className="h-5 w-5 mr-2 stroke-[2.5]" />
                  {t('បន្ថែមកម្រងសំណួរថ្មី', 'Add New Quiz')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 2. INTERACTIVE YEAR CARDS (កម្រងសំណួរសរុប និង ឆ្នាំទី១ ដល់ ឆ្នាំទី៤)   */}
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
                  : 'quz-year-card bg-white hover:bg-gray-50/80 border-gray-200/80 text-gray-800 shadow-xs hover:-translate-y-0.5'
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
                  <AcademicCapIcon className="h-5 w-5" />
                </div>

                <div className="text-right">
                  <span
                    className={`text-2xl sm:text-[26px] font-black leading-none tracking-tight ${
                      isSelected ? 'text-white' : 'quz-text-primary text-gray-900'
                    }`}
                  >
                    {card.count}
                  </span>
                  <span
                    className={`block text-[10px] font-bold mt-0.5 ${
                      isSelected ? 'text-white/80' : 'quz-text-secondary text-gray-400'
                    }`}
                  >
                    {t('កម្រងសំណួរ', 'quizzes')}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-2 border-t border-current/10 flex items-center justify-between gap-1">
                <div>
                  <h3
                    className={`text-xs sm:text-sm font-extrabold leading-snug ${
                      isSelected ? 'text-white' : 'quz-text-primary text-gray-800'
                    }`}
                  >
                    {t(card.titleKm, card.titleEn)}
                  </h3>
                  <p
                    className={`text-[10px] font-medium mt-0.5 ${
                      isSelected ? 'text-white/75' : 'quz-text-secondary text-gray-400'
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
      <div className="quz-surface-card bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col xl:flex-row gap-4 items-center justify-between">
        {/* ផ្នែកខាងឆ្វេង៖ Search Input + ប្រអប់ជ្រើសរើសមុខវិជ្ជា */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto flex-1">
          <div className="relative w-full sm:max-w-xs lg:max-w-sm flex-1">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder=""
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="quz-input w-full pl-11 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-2xs"
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
                className="quz-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white font-medium text-gray-700 appearance-none cursor-pointer shadow-2xs transition-all"
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
        <div className="quz-shift-tabs flex flex-wrap items-center gap-1.5 bg-gray-100/80 p-1.5 rounded-xl border border-gray-200/60 w-full xl:w-auto justify-center sm:justify-start shrink-0">
          <button
            type="button"
            onClick={() => handleSelectShiftTab('all')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
              !isSpecificShiftSelected
                ? 'bg-blue-600 text-white shadow-xs'
                : 'quz-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <Squares2X2Icon className="h-4 w-4" />
            <span>{t('គ្រប់វេនសិក្សា', 'All Shifts')}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                !isSpecificShiftSelected
                  ? 'bg-white/20 text-white'
                  : 'quz-shift-count bg-gray-200/80 text-gray-700'
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
                : 'quz-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <CalendarDaysIcon className="h-4 w-4" />
            <span>{t('ចន្ទ-សុក្រ', 'Mon-Fri')}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                selectedShift === 'Monday-Friday'
                  ? 'bg-white/20 text-white'
                  : 'quz-shift-count bg-indigo-50 text-indigo-700'
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
                : 'quz-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <CalendarDaysIcon className="h-4 w-4" />
            <span>{t('សៅរ៍-អាទិត្យ', 'Sat-Sun')}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                selectedShift === 'Saturday-Sunday'
                  ? 'bg-white/20 text-white'
                  : 'quz-shift-count bg-amber-50 text-amber-700'
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
      <div className="quz-surface-card bg-white rounded-[1.5rem] border border-gray-200 shadow-sm overflow-hidden">
        <div className="quz-table-bar px-6 py-5 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="quz-text-primary text-lg sm:text-xl font-extrabold text-gray-900">
              {activeCourseObj
                ? `${t('បញ្ជីកម្រងសំណួរ', 'Quizzes List')} - ${activeCourseObj.course_name}`
                : t('បញ្ជីកម្រងសំណួរទាំងអស់', 'All Quizzes List')}
            </h2>

            <span className="quz-pill-blue px-3 py-1 bg-blue-50 text-blue-700 text-xs font-extrabold rounded-lg border border-blue-100">
              {filteredQuizzes.length} {t('កម្រងសំណួរ', 'Quizzes')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isSpecificShiftSelected && (
              <button
                type="button"
                onClick={() => handleSelectShiftTab('all')}
                className="quz-pill-indigo text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
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
                className="quz-pill-blue text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3.5 py-2 rounded-xl transition-all cursor-pointer shrink-0"
              >
                {t('សម្អាតតម្រងស្វែងរក', 'Reset Filters')}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="quz-table-head bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-14">
                  {t('ល.រ', 'No')}
                </th>
                <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('ចំណងជើងកម្រងសំណួរ', 'Quiz Title')}
                </th>
                <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('មុខវិជ្ជា', 'Course')}
                </th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('រយៈពេល', 'Duration')}
                </th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('ពិន្ទុសរុប', 'Total Mark')}
                </th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('ចំនួនសំណួរ', 'Questions')}
                </th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('ការប្រឡង', 'Attempts')}
                </th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('សកម្មភាព', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="quz-table-body bg-white">
              {filteredQuizzes.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-16 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <BookOpenIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="quz-text-primary font-extrabold text-gray-800 text-base">
                        {searchTerm ||
                        selectedCourse ||
                        selectedYear !== 'all' ||
                        isSpecificShiftSelected
                          ? t(
                              'មិនឃើញមានកម្រងសំណួរតាមការស្វែងរកនេះទេ',
                              'No matching quizzes found'
                            )
                          : t('មិនទាន់មានកម្រងសំណួរនៅឡើយទេ', 'No quizzes available yet')}
                      </p>
                      <p className="quz-text-secondary text-sm text-gray-500 mt-1">
                        {selectedYear === 'all'
                          ? t(
                              'សូមចុចជ្រើសរើសកាតឆ្នាំសិក្សាខាងលើ ដើម្បីបន្ថែមកម្រងសំណួរថ្មី',
                              'Select an academic year card above to add new quizzes'
                            )
                          : t(
                              'ចុចប៊ូតុង «បន្ថែមកម្រងសំណួរថ្មី» ខាងលើដើម្បីចាប់ផ្តើម។',
                              'Click "Add New Quiz" above to get started.'
                            )}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredQuizzes.map((quiz, index) => {
                  const isExpanded = expandedQuiz === quiz.id;
                  const questionsCount =
                    quiz.questions_count || quiz.questions?.length || 0;
                  const attemptsCount = quiz.attempts_count || 0;
                  const matchedCourse = enrichedCourses.find(
                    (c) => String(c.id) === String(quiz.course_id)
                  );
                  const courseShifts = matchedCourse?.shiftsList || [
                    'Monday-Friday',
                  ];

                  return (
                    <React.Fragment key={quiz.id}>
                      <tr
                        className="quz-table-row hover:bg-blue-50/30 transition-colors cursor-pointer"
                        onClick={() =>
                          setExpandedQuiz(isExpanded ? null : quiz.id)
                        }
                      >
                        <td className="quz-text-secondary px-4 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-500">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4">
                          <div className="quz-text-primary text-sm font-extrabold text-gray-900">
                            {quiz.title}
                          </div>
                          <div className="quz-code-pill text-[10px] text-gray-500 mt-1.5 font-medium bg-gray-50 inline-block px-2.5 py-1 rounded-lg border border-gray-100">
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                              {t('ចាប់ផ្តើម៖', 'Start:')}
                            </span>{' '}
                            {formatDate(quiz.start_date)} <br />
                            <span className="text-rose-600 dark:text-rose-400 font-bold">
                              {t('បញ្ចប់៖', 'End:')}
                            </span>{' '}
                            {formatDate(quiz.end_date)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="quz-text-primary text-sm text-gray-800 font-extrabold">
                            {quiz.course?.course_name ||
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
                                        ? 'quz-pill-amber bg-amber-50 text-amber-700 border-amber-200'
                                        : 'quz-pill-indigo bg-indigo-50 text-indigo-700 border-indigo-100'
                                    }`}
                                  >
                                    {getStudyShiftLabel(shKey)}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="quz-text-primary px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-700">
                          <div className="flex items-center justify-center gap-1.5">
                            <ClockIcon className="h-4 w-4 text-gray-400" />
                            {quiz.duration} {t('នាទី', 'mins')}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                          {formatCleanScore(quiz.total_mark)}{' '}
                          {t('ពិន្ទុ', 'pts')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="quz-pill-indigo inline-flex items-center px-3 py-1 rounded-lg text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-2xs">
                            {questionsCount} {t('សំណួរ', 'Qs')}
                          </span>
                        </td>
                        <td
                          className="px-6 py-4 whitespace-nowrap text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => openSubmissionsModal(quiz)}
                            className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-extrabold border transition-colors cursor-pointer shadow-2xs ${
                              attemptsCount > 0
                                ? 'quz-pill-emerald bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'quz-code-pill bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                            }`}
                            title={t(
                              'មើលការប្រឡងរបស់សិស្ស',
                              'View Student Submissions'
                            )}
                          >
                            <EyeIcon className="h-3.5 w-3.5 mr-1.5" />
                            {attemptsCount} {t('នាក់', 'students')}
                          </button>
                        </td>
                        <td
                          className="px-6 py-4 whitespace-nowrap text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(quiz)}
                              className="quz-action-edit p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-xl transition-all cursor-pointer"
                              title={t('កែប្រែ', 'Edit')}
                            >
                              <PencilSquareIcon className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(quiz)}
                              className="quz-action-delete p-2 text-rose-600 hover:text-rose-900 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition-all cursor-pointer"
                              title={t('លុប', 'Delete')}
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedQuiz(isExpanded ? null : quiz.id)
                              }
                              className="quz-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                              title={
                                isExpanded
                                  ? t('បិទសំណួរ', 'Hide Questions')
                                  : t('បង្ហាញសំណួរ', 'Show Questions')
                              }
                            >
                              {isExpanded ? (
                                <ChevronUpIcon className="h-5 w-5" />
                              ) : (
                                <ChevronDownIcon className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* ===================================================== */}
                      {/* Expanded Section for managing Questions               */}
                      {/* ===================================================== */}
                      {isExpanded &&
                        (() => {
                          const currentSumMarks = formatCleanScore(
                            quiz.questions?.reduce(
                              (sum, q) => sum + parseFloat(q.mark || 0),
                              0
                            ) || 0
                          );
                          const maxQuizMarks = formatCleanScore(quiz.total_mark);
                          const isOverMarks =
                            Number(currentSumMarks) > Number(maxQuizMarks);
                          const isExactMarks =
                            Number(currentSumMarks) === Number(maxQuizMarks);

                          return (
                            <tr className="quz-expanded-row bg-gray-50/70 border-b border-gray-100">
                              <td colSpan="8" className="px-6 sm:px-8 py-6">
                                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                                  
                                  {/* Questions List (Left 2 columns) */}
                                  <div className="quz-surface-card xl:col-span-2 bg-white p-5 sm:p-6 rounded-2xl border border-gray-200 shadow-sm">
                                    <div className="border-b border-gray-100 dark:border-slate-700 pb-4 mb-4 flex flex-wrap justify-between items-center gap-2">
                                      <h4 className="quz-text-primary text-sm sm:text-base font-extrabold text-gray-900 flex items-center gap-2.5">
                                        <span className="quz-pill-indigo p-2 bg-indigo-50 rounded-xl text-indigo-600 border border-indigo-100">
                                          <DocumentTextIcon className="h-4 w-4" />
                                        </span>
                                        {t('បញ្ជីសំណួរ', 'Questions List')} (
                                        {quiz.questions?.length || 0})
                                      </h4>
                                      <span
                                        className={`text-xs font-extrabold px-3.5 py-1.5 rounded-xl border ${
                                          isOverMarks
                                            ? 'quz-pill-rose bg-rose-50 text-rose-700 border-rose-200'
                                            : isExactMarks
                                            ? 'quz-pill-emerald bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : 'quz-pill-indigo bg-indigo-50 text-indigo-700 border-indigo-100'
                                        }`}
                                      >
                                        {t('ពិន្ទុសរុប៖', 'Total Mark:')}{' '}
                                        {currentSumMarks} / {maxQuizMarks}
                                      </span>
                                    </div>

                                    <div className="quz-custom-scroll space-y-4 max-h-[450px] overflow-y-auto pr-1.5">
                                      {!Array.isArray(quiz.questions) ||
                                      quiz.questions.length === 0 ? (
                                        <p className="quz-subbox quz-text-secondary text-xs text-gray-400 font-bold italic bg-gray-50 p-8 rounded-2xl text-center border border-dashed border-gray-200">
                                          {t(
                                            'គ្មានសំណួរនៅក្នុងកម្រងសំណួរនេះទេ។ សូមបន្ថែមសំណួរនៅផ្នែកខាងស្ដាំ។',
                                            'No questions in this quiz yet. Add questions using the form on the right.'
                                          )}
                                        </p>
                                      ) : (
                                        quiz.questions.map((question, qIdx) => (
                                          <div
                                            key={question.id}
                                            className="quz-subbox bg-gray-50/70 p-5 rounded-2xl border border-gray-200/90 shadow-2xs transition relative"
                                          >
                                            <div className="flex justify-between items-start mb-3">
                                              <div className="quz-text-primary text-sm font-extrabold text-gray-900 flex items-center gap-2">
                                                <span>
                                                  {t('សំណួរទី', 'Question')}{' '}
                                                  {qIdx + 1}
                                                </span>
                                                <span className="quz-pill-blue font-extrabold text-[11px] text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-lg">
                                                  {getQuestionTypeBadgeLabel(
                                                    question.question_type
                                                  )}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <span className="quz-pill-indigo text-xs font-extrabold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                                                  {formatCleanScore(
                                                    question.mark
                                                  )}{' '}
                                                  {t('ពិន្ទុ', 'pts')}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    handleDeleteQuestionClick(
                                                      question
                                                    )
                                                  }
                                                  className="quz-action-delete p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-100 rounded-lg transition cursor-pointer"
                                                  title={t(
                                                    'លុបសំណួរ',
                                                    'Delete question'
                                                  )}
                                                >
                                                  <TrashIcon className="h-4 w-4" />
                                                </button>
                                              </div>
                                            </div>

                                            <p className="quz-text-primary text-sm text-gray-800 font-bold mb-4 leading-relaxed">
                                              {question.question_text}
                                            </p>

                                            {/* Display MCQ Options */}
                                            {question.question_type ===
                                              'MCQ' && (
                                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                {Array.isArray(
                                                  question.options
                                                ) &&
                                                  question.options.map(
                                                    (opt, oIdx) => (
                                                      <div
                                                        key={opt.id || oIdx}
                                                        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-bold shadow-2xs ${
                                                          opt.is_correct
                                                            ? 'quz-pill-emerald bg-emerald-50/90 border-emerald-400 text-emerald-800'
                                                            : 'quz-surface-card quz-text-secondary bg-white border-gray-200 text-gray-700'
                                                        }`}
                                                      >
                                                        <span
                                                          className={
                                                            opt.is_correct
                                                              ? 'text-emerald-600 font-black'
                                                              : 'text-gray-400 font-extrabold'
                                                          }
                                                        >
                                                          {String.fromCharCode(
                                                            65 + oIdx
                                                          )}
                                                          .
                                                        </span>
                                                        <span className="truncate">
                                                          {opt.option_text}
                                                        </span>
                                                        {opt.is_correct && (
                                                          <CheckCircleIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 ml-auto" />
                                                        )}
                                                      </div>
                                                    )
                                                  )}
                                              </div>
                                            )}

                                            {/* Display True/False Options */}
                                            {question.question_type ===
                                              'TrueFalse' && (
                                              <div className="flex gap-3">
                                                {Array.isArray(
                                                  question.options
                                                ) &&
                                                  question.options.map(
                                                    (opt, oIdx) => (
                                                      <span
                                                        key={opt.id || oIdx}
                                                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-bold shadow-2xs ${
                                                          opt.is_correct
                                                            ? 'quz-pill-emerald bg-emerald-50 border-emerald-400 text-emerald-800'
                                                            : 'quz-surface-card quz-text-secondary bg-white border-gray-200 text-gray-500'
                                                        }`}
                                                      >
                                                        {opt.option_text}
                                                        {opt.is_correct && (
                                                          <CheckCircleIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                                        )}
                                                      </span>
                                                    )
                                                  )}
                                              </div>
                                            )}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>

                                  {/* Add Question Form (Right 1 column) */}
                                  <div className="quz-surface-card bg-white p-5 sm:p-6 rounded-2xl border border-gray-200 shadow-sm h-fit space-y-4">
                                    <h4 className="quz-text-primary text-sm sm:text-base font-extrabold text-gray-900 border-b border-gray-100 dark:border-slate-700 pb-4 mb-4 flex items-center gap-2.5">
                                      <span className="quz-pill-blue p-2 bg-blue-50 rounded-xl text-blue-600 border border-blue-100">
                                        <PlusIcon className="h-4 w-4 stroke-[2.5]" />
                                      </span>
                                      {t('បន្ថែមសំណួរថ្មី', 'Add New Question')}
                                    </h4>

                                    <div>
                                      <label className="quz-label block text-xs font-bold text-gray-700 mb-1.5">
                                        {t('ខ្លឹមសារសំណួរ', 'Question Content')}{' '}
                                        <span className="text-rose-500">*</span>
                                      </label>
                                      <textarea
                                        rows={3}
                                        placeholder={t(
                                          'បញ្ចូលសំណួរ...',
                                          'Enter question content...'
                                        )}
                                        value={questionText}
                                        onChange={(e) =>
                                          setQuestionText(e.target.value)
                                        }
                                        className="quz-input w-full px-3.5 py-2.5 text-sm font-medium border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-gray-50/60 focus:bg-white resize-none transition-all shadow-2xs"
                                      />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="quz-label block text-xs font-bold text-gray-700 mb-1.5">
                                          {t('ប្រភេទសំណួរ', 'Question Type')}
                                        </label>
                                        <select
                                          value={questionType}
                                          onChange={(e) =>
                                            setQuestionType(e.target.value)
                                          }
                                          className="quz-input w-full px-3 py-2.5 text-xs font-bold border border-gray-200 rounded-xl bg-gray-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-2xs cursor-pointer"
                                        >
                                          <option value="MCQ">
                                            {t(
                                              'ពហុជ្រើសរើស (MCQ)',
                                              'Multiple Choice (MCQ)'
                                            )}
                                          </option>
                                          <option value="TrueFalse">
                                            {t(
                                              'ពិត/មិនពិត (True/False)',
                                              'True / False'
                                            )}
                                          </option>
                                          <option value="Essay">
                                            {t('សរសេររៀបរាប់ (Essay)', 'Essay')}
                                          </option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="quz-label block text-xs font-bold text-gray-700 mb-1.5">
                                          {t('ពិន្ទុ', 'Mark')}
                                        </label>
                                        <input
                                          type="number"
                                          min="0.5"
                                          step="0.5"
                                          value={questionMark}
                                          onChange={(e) =>
                                            setQuestionMark(e.target.value)
                                          }
                                          className="quz-input w-full px-3.5 py-2.5 text-xs font-extrabold text-indigo-600 border border-gray-200 rounded-xl bg-gray-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-2xs"
                                        />
                                      </div>
                                    </div>

                                    {/* MCQ Option Inputs */}
                                    {questionType === 'MCQ' && (
                                      <div className="quz-subbox space-y-2.5 bg-gray-50/80 p-4 rounded-2xl border border-gray-100">
                                        <div className="flex items-center justify-between mb-1">
                                          <label className="quz-label block text-xs font-bold text-gray-700">
                                            {t(
                                              'បញ្ចូលជម្រើស និងធីកចម្លើយត្រូវ',
                                              'Options & Correct Answer'
                                            )}
                                          </label>
                                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                            {t(
                                              '* ចុចរង្វង់ខាងស្ដាំដើម្បីកំណត់ចម្លើយត្រូវ',
                                              '* Click circle to mark correct'
                                            )}
                                          </span>
                                        </div>

                                        {mcqOptions.map((opt, oIdx) => (
                                          <div
                                            key={oIdx}
                                            className={`flex items-center gap-2 p-1.5 rounded-xl border transition-all ${
                                              opt.is_correct
                                                ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-400 shadow-2xs'
                                                : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                                            }`}
                                          >
                                            <span
                                              className={`text-xs font-extrabold pl-2 w-6 ${
                                                opt.is_correct
                                                  ? 'text-emerald-600'
                                                  : 'text-gray-400'
                                              }`}
                                            >
                                              {String.fromCharCode(65 + oIdx)}.
                                            </span>
                                            <input
                                              type="text"
                                              placeholder={`${t(
                                                'ជម្រើស',
                                                'Option'
                                              )} ${String.fromCharCode(
                                                65 + oIdx
                                              )}...`}
                                              value={opt.option_text}
                                              onChange={(e) =>
                                                handleMcqOptionChange(
                                                  oIdx,
                                                  e.target.value
                                                )
                                              }
                                              className="flex-1 px-2 py-1.5 text-xs font-bold bg-transparent text-gray-800 dark:text-slate-100 focus:outline-none"
                                            />
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleMcqCorrectToggle(oIdx)
                                              }
                                              className={`h-6 w-6 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 mr-1 ${
                                                opt.is_correct
                                                  ? 'bg-emerald-500 text-white shadow-xs'
                                                  : 'border-2 border-gray-300 dark:border-slate-600 hover:border-emerald-400 text-transparent'
                                              }`}
                                              title={t(
                                                'កំណត់ជាចម្លើយត្រឹមត្រូវ',
                                                'Set correct answer'
                                              )}
                                            >
                                              <CheckCircleIcon className="h-4 w-4 stroke-[2.5]" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* True/False Options */}
                                    {questionType === 'TrueFalse' && (
                                      <div className="quz-subbox bg-gray-50/80 p-4 rounded-2xl border border-gray-100">
                                        <label className="quz-label block text-xs font-bold text-gray-700 mb-2.5">
                                          {t(
                                            'កំណត់ចម្លើយត្រូវ',
                                            'Set Correct Answer'
                                          )}
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                          <button
                                            type="button"
                                            onClick={() => setTfCorrect('true')}
                                            className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-extrabold transition-all cursor-pointer ${
                                              tfCorrect === 'true'
                                                ? 'quz-pill-emerald bg-emerald-50 border-emerald-400 text-emerald-800 shadow-2xs'
                                                : 'quz-surface-card quz-text-secondary bg-white border-gray-200 text-gray-600'
                                            }`}
                                          >
                                            <CheckCircleIcon
                                              className={`h-4 w-4 ${
                                                tfCorrect === 'true'
                                                  ? 'text-emerald-600'
                                                  : 'text-gray-300'
                                              }`}
                                            />
                                            {t('ពិត (True)', 'True')}
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              setTfCorrect('false')
                                            }
                                            className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-extrabold transition-all cursor-pointer ${
                                              tfCorrect === 'false'
                                                ? 'quz-pill-emerald bg-emerald-50 border-emerald-400 text-emerald-800 shadow-2xs'
                                                : 'quz-surface-card quz-text-secondary bg-white border-gray-200 text-gray-600'
                                            }`}
                                          >
                                            <CheckCircleIcon
                                              className={`h-4 w-4 ${
                                                tfCorrect === 'false'
                                                  ? 'text-emerald-600'
                                                  : 'text-gray-300'
                                              }`}
                                            />
                                            {t('មិនពិត (False)', 'False')}
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleAddQuestion(quiz.id)}
                                      disabled={!questionText.trim()}
                                      className="w-full mt-2 inline-flex items-center justify-center px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-extrabold rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer"
                                    >
                                      <PlusIcon className="h-4 w-4 mr-1.5 stroke-[2.5]" />
                                      {t('បន្ថែមសំណួរ', 'Add Question')}
                                    </button>
                                  </div>

                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================================================================== */}
      {/* MODAL - 1: Add / Edit Quiz                                         */}
      {/* ================================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
          <div className="quz-modal-card bg-white rounded-[1.5rem] shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            <div className="quz-modal-bar flex justify-between items-center p-6 sm:p-7 border-b border-gray-100 bg-gray-50/50 shrink-0">
              <h2 className="quz-text-primary text-xl font-extrabold text-gray-900 flex items-center gap-2.5">
                <span className="quz-pill-indigo bg-indigo-100 text-indigo-600 p-2.5 rounded-xl border border-indigo-200">
                  <BookOpenIcon className="h-6 w-6" />
                </span>
                {editingQuiz
                  ? t('កែប្រែកម្រងសំណួរ', 'Edit Quiz')
                  : t('បង្កើតកម្រងសំណួរថ្មី', 'Create New Quiz')}
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="quz-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-xl transition-all bg-white border border-gray-200 cursor-pointer"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form
              id="quizForm"
              onSubmit={handleSubmit}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="p-6 sm:p-7 overflow-y-auto flex-1 space-y-5">
                <div>
                  <label className="quz-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('ចំណងជើងកម្រងសំណួរ', 'Quiz Title')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="title"
                    required
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder=""
                    className="quz-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                  />
                </div>

                <div>
                  <label className="quz-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('មុខវិជ្ជា', 'Course')} <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="course_id"
                    required
                    value={formData.course_id}
                    onChange={handleInputChange}
                    className="quz-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white font-medium text-gray-800 transition-all shadow-sm cursor-pointer"
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
                    <label className="quz-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('រយៈពេលធ្វើតេស្ត (នាទី)', 'Duration (Mins)')}{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      name="duration"
                      min="5"
                      required
                      value={formData.duration}
                      onChange={handleInputChange}
                      className="quz-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-bold transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="quz-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ពិន្ទុសរុប (20%)', 'Total Mark (20%)')}{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      name="total_mark"
                      min="1"
                      max="1000"
                      required
                      value={formData.total_mark}
                      onChange={handleInputChange}
                      className="quz-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-extrabold text-indigo-700 transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="quz-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ថ្ងៃ និងម៉ោងចាប់ផ្តើម', 'Start Date & Time')}{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      name="start_date"
                      required
                      value={formData.start_date}
                      onChange={handleInputChange}
                      className="quz-input w-full px-3.5 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium text-[13px] transition-all shadow-sm cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="quz-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ថ្ងៃ និងម៉ោងបញ្ចប់', 'End Date & Time')}{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      name="end_date"
                      min={formData.start_date || undefined}
                      required
                      value={formData.end_date}
                      onChange={handleInputChange}
                      className="quz-input w-full px-3.5 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium text-[13px] transition-all shadow-sm cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div className="quz-modal-bar p-6 sm:p-7 border-t border-gray-100 bg-gray-50/50 flex justify-end space-x-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="quz-close-btn px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all cursor-pointer"
                >
                  {t('បោះបង់', 'Cancel')}
                </button>
                <button
                  type="submit"
                  form="quizForm"
                  disabled={isSubmitting}
                  className="px-6 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  ) : (
                    <BookOpenIcon className="h-5 w-5" />
                  )}
                  {editingQuiz
                    ? t('រក្សាទុកការកែប្រែ', 'Save Changes')
                    : t('បង្កើតកម្រងសំណួរ', 'Create Quiz')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL - 2: Import JSON                                             */}
      {/* ================================================================== */}
      {showImportModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
          <div className="quz-modal-card bg-white rounded-[1.5rem] shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            <div className="quz-modal-bar flex justify-between items-center p-6 sm:p-7 border-b border-gray-100 bg-gray-50/50 shrink-0">
              <h2 className="quz-text-primary text-xl font-extrabold text-gray-900 flex items-center gap-2.5">
                <span className="quz-pill-emerald bg-emerald-100 text-emerald-600 p-2.5 rounded-xl border border-emerald-200">
                  <ArrowUpTrayIcon className="h-5 w-5" />
                </span>
                {t('នាំចូលកម្រងសំណួរតាម JSON', 'Import Quiz JSON')}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setParsedQuizzes([]);
                  setJsonContent('');
                  setImportFile(null);
                }}
                className="quz-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-xl transition-all bg-white border border-gray-200 cursor-pointer"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form
              id="importForm"
              onSubmit={handleImportSubmit}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="p-6 sm:p-7 overflow-y-auto flex-1 space-y-5">
                <div>
                  <label className="quz-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('ជ្រើសរើសមុខវិជ្ជាសម្រាប់នាំចូល', 'Select Course to Import')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={importCourseId}
                    onChange={(e) => setImportCourseId(e.target.value)}
                    className="quz-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white font-medium text-gray-800 transition-all cursor-pointer shadow-sm"
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

                <div className="quz-subbox bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="quz-label block text-sm font-bold text-gray-700">
                      {t('ជ្រើសរើសឯកសារ JSON', 'Select JSON File')}{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={downloadSampleJson}
                      className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4" />
                      {t('ទាញយកគំរូឯកសារ JSON', 'Download JSON Sample')}
                    </button>
                  </div>
                  <label
                    htmlFor="json-file-input"
                    className="quz-surface-card flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-emerald-300 rounded-xl cursor-pointer bg-white hover:bg-emerald-50/50 hover:border-emerald-500 transition-all shadow-2xs"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <DocumentTextIcon className="h-10 w-10 text-emerald-500 mb-2" />
                      <span className="quz-text-primary text-sm font-bold text-gray-800">
                        {importFile
                          ? importFile.name
                          : t(
                              'ចុចទីនេះដើម្បីជ្រើសរើសឯកសារ .json',
                              'Click here to select .json file'
                            )}
                      </span>
                      <span className="quz-text-secondary text-xs text-gray-400 font-medium mt-1">
                        {importFile
                          ? `${(importFile.size / 1024).toFixed(1)} KB`
                          : t(
                              'ទម្រង់ឯកសារ JSON (Standard Quiz JSON)',
                              'Standard Quiz JSON format'
                            )}
                      </span>
                    </div>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleFileChange}
                      className="hidden"
                      id="json-file-input"
                    />
                  </label>
                </div>

                {parsedQuizzes.length > 0 && (
                  <div className="quz-pill-emerald bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 space-y-2 shadow-2xs">
                    <div className="font-extrabold flex items-center gap-1.5">
                      <CheckCircleIcon className="h-5 w-5" />
                      {t('បានរកឃើញកម្រងសំណួរចំនួន', 'Found quizzes:')}{' '}
                      {parsedQuizzes.length} {t('កម្រង', 'quizzes')}
                    </div>
                    {parsedQuizzes.map((q, idx) => (
                      <div key={idx} className="pl-6 font-bold text-xs">
                        • {q.title || t('កម្រងសំណួរគ្មានចំណងជើង', 'Untitled Quiz')} (
                        {q.questions?.length || 0} {t('សំណួរ', 'Qs')})
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <label className="quz-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('ឬបិទភ្ជាប់ទិន្នន័យ JSON ផ្ទាល់នៅទីនេះ', 'Or Paste JSON Directly')}
                  </label>
                  <textarea
                    rows={5}
                    value={jsonContent}
                    onChange={(e) => {
                      setJsonContent(e.target.value);
                      try {
                        const parsed = JSON.parse(e.target.value);
                        setParsedQuizzes(Array.isArray(parsed) ? parsed : [parsed]);
                      } catch (err) {
                        setParsedQuizzes([]);
                      }
                    }}
                    placeholder='[ { "title": "Quiz Title", "duration": 45, "questions": [...] } ]'
                    className="quz-input w-full px-4 py-3 font-mono text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 transition-all bg-gray-50 focus:bg-white shadow-2xs resize-none"
                  />
                </div>
              </div>

              <div className="quz-modal-bar p-6 sm:p-7 border-t border-gray-100 bg-gray-50/50 flex justify-end space-x-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportModal(false);
                    setParsedQuizzes([]);
                    setJsonContent('');
                    setImportFile(null);
                  }}
                  className="quz-close-btn px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
                >
                  {t('បោះបង់', 'Cancel')}
                </button>
                <button
                  type="submit"
                  form="importForm"
                  disabled={isImporting || parsedQuizzes.length === 0}
                  className="px-6 py-3 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isImporting ? (
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  ) : (
                    <ArrowUpTrayIcon className="h-5 w-5" />
                  )}
                  {t('នាំចូលកម្រងសំណួរ', 'Import Quizzes')} ({parsedQuizzes.length})
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL - 3: View Student Quiz Results & Export Excel                */}
      {/* ================================================================== */}
      {showSubmissionsModal &&
        viewingQuiz &&
        (() => {
          const cleanMaxMark = formatCleanScore(viewingQuiz.total_mark);
          const rawTotalVal = parseFloat(viewingQuiz.total_mark) || 20;
          const modalCourseName =
            viewingQuiz.course?.course_name ||
            enrichedCourses.find(
              (c) => String(c.id) === String(viewingQuiz.course_id)
            )?.course_name ||
            '—';
          const isModalSpecificShift =
            submissionShiftFilter !== 'all' && submissionShiftFilter !== '';

          const passedCount = submissions.filter(
            (s) => (parseFloat(s.score) || 0) / rawTotalVal >= 0.5
          ).length;
          const failedCount = submissions.length - passedCount;
          const avgScoreDisplay =
            submissions.length > 0
              ? formatCleanScore(
                  (
                    submissions.reduce(
                      (acc, curr) =>
                        acc +
                        toQuizWeighted20Score(curr.score ?? 0, rawTotalVal),
                      0
                    ) / submissions.length
                  ).toFixed(1)
                )
              : '0';

          return (
            <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 overflow-y-auto">
              <div className="quz-modal-card bg-white rounded-[1.5rem] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-slate-700/80 animate-fadeIn">
                
                {/* Modal Header */}
                <div className="quz-modal-bar px-6 py-5 sm:px-7 border-b border-gray-100 flex justify-between items-start gap-4 bg-gray-50/50 shrink-0">
                  <div className="flex items-start sm:items-center gap-4">
                    <span className="quz-pill-emerald bg-emerald-100 text-emerald-600 p-3 rounded-2xl border border-emerald-200 shrink-0 shadow-2xs">
                      <DocumentCheckIcon className="h-6 w-6" />
                    </span>
                    <div>
                      <h2 className="quz-text-primary text-lg sm:text-xl font-extrabold text-gray-900 leading-snug">
                        {t('លទ្ធផលប្រឡង៖', 'Quiz Results:')} {viewingQuiz.title}
                      </h2>
                      <div className="text-xs font-bold text-gray-500 mt-2 flex flex-wrap gap-2 items-center">
                        <span className="quz-code-pill inline-flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1 rounded-lg">
                          <BookOpenIcon className="h-3.5 w-3.5 text-blue-500" />
                          <span>{t('មុខវិជ្ជា៖', 'Course:')}</span>
                          <strong className="quz-text-primary text-gray-800">
                            {modalCourseName}
                          </strong>
                        </span>

                        <span className="quz-code-pill inline-flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1 rounded-lg">
                          <ClockIcon className="h-3.5 w-3.5 text-amber-500" />
                          <span>{t('រយៈពេល៖', 'Duration:')}</span>
                          <strong className="quz-text-primary text-gray-800">
                            {viewingQuiz.duration} {t('នាទី', 'mins')}
                          </strong>
                        </span>

                        <span className="quz-pill-indigo inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1 rounded-lg">
                          <span>{t('ពិន្ទុសរុប៖', 'Total Mark:')}</span>
                          <strong>
                            {cleanMaxMark} {t('ពិន្ទុ', 'pts')}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {filteredSubmissions.length > 0 && (
                      <button
                        type="button"
                        onClick={handleExportQuizResultsExcel}
                        className="inline-flex items-center px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl shadow-sm transition-all cursor-pointer"
                      >
                        <DocumentIcon className="h-4 w-4 mr-1.5" />
                        {t('នាំចេញ Excel', 'Export Excel')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubmissionsModal(false);
                        setViewingQuiz(null);
                        setSubmissions([]);
                      }}
                      className="quz-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-xl transition-all bg-white border border-gray-200 cursor-pointer"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="p-6 sm:p-7 overflow-y-auto space-y-5 flex-1">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="quz-stat-indigo bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 flex items-center gap-4">
                      <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0">
                        <AcademicCapIcon className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-extrabold leading-relaxed">
                          {t('សិស្សប្រឡងសរុប', 'Total Students')}
                        </div>
                        <div className="quz-text-primary text-2xl font-black text-indigo-950 mt-0.5">
                          {submissions.length} {t('នាក់', 'students')}
                        </div>
                      </div>
                    </div>

                    <div className="quz-stat-emerald bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 flex items-center gap-4">
                      <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-xs shrink-0">
                        <CheckCircleIcon className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="text-xs text-emerald-600 dark:text-emerald-400 font-extrabold leading-relaxed">
                          {t('សិស្សប្រឡងជាប់ (≥ 50%)', 'Passed (≥ 50%)')}
                        </div>
                        <div className="quz-text-primary text-2xl font-black text-emerald-950 mt-0.5">
                          {passedCount} {t('នាក់', 'students')}
                        </div>
                      </div>
                    </div>

                    <div className="quz-stat-amber bg-amber-50/70 border border-amber-100 rounded-2xl p-4 flex items-center gap-4">
                      <div className="p-3 bg-amber-500 text-white rounded-xl shadow-xs shrink-0">
                        <ChartBarIcon className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="text-xs text-amber-600 dark:text-amber-400 font-extrabold leading-relaxed">
                          {t('ពិន្ទុមធ្យមសរុប (20%)', 'Average Score (20%)')}
                        </div>
                        <div className="quz-text-primary text-2xl font-black text-amber-950 mt-0.5">
                          {avgScoreDisplay} {t('ពិន្ទុ', 'pts')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Filter Area */}
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
                          className="quz-input w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm font-medium border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-gray-50/70 focus:bg-white transition-all"
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
                        className="quz-input w-full sm:w-44 px-3 py-2.5 text-xs font-medium border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
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
                            : 'quz-code-pill bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {t('ទាំងអស់', 'All')} ({submissions.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter('passed')}
                        className={`px-3.5 py-2 text-xs rounded-xl font-extrabold transition-all cursor-pointer ${
                          statusFilter === 'passed'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'quz-code-pill bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {t('ជាប់', 'Passed')} ({passedCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter('failed')}
                        className={`px-3.5 py-2 text-xs rounded-xl font-extrabold transition-all cursor-pointer ${
                          statusFilter === 'failed'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'quz-code-pill bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {t('ធ្លាក់', 'Failed')} ({failedCount})
                      </button>
                    </div>
                  </div>

                  {/* Submissions Table */}
                  {submissions.length === 0 ? (
                    <div className="py-14 px-6 text-center flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-slate-700/80 bg-gray-50/40 dark:bg-slate-900/35">
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 flex items-center justify-center mb-3.5 text-gray-400 dark:text-slate-400">
                        <DocumentCheckIcon className="h-7 w-7" />
                      </div>
                      <p className="quz-text-primary text-sm sm:text-base font-extrabold text-gray-700">
                        {t(
                          'មិនទាន់មានសិស្សប្រឡងកម្រងសំណួរនេះនៅឡើយទេ',
                          'No students have taken this quiz yet'
                        )}
                      </p>
                      <p className="quz-text-secondary text-xs text-gray-400 mt-1 max-w-md">
                        {t(
                          'នៅពេលសិស្សចូលប្រឡង និងបញ្ជូនចម្លើយ លទ្ធផលពិន្ទុរបស់ពួកគេនឹងបង្ហាញនៅទីនេះដោយស្វ័យប្រវត្តិ។',
                          'When students complete the quiz, their scores and status will appear here automatically.'
                        )}
                      </p>
                    </div>
                  ) : filteredSubmissions.length === 0 ? (
                    <div className="py-12 px-6 text-center flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-slate-700/80 bg-gray-50/40 dark:bg-slate-900/35">
                      <MagnifyingGlassIcon className="h-10 w-10 text-gray-300 dark:text-slate-500 mb-2.5" />
                      <p className="quz-text-primary font-bold text-gray-700 text-sm">
                        {t(
                          'មិនរកឃើញសិស្សតាមការច្រោះនេះទេ',
                          'No matching student results found'
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="quz-surface-card border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                          <thead className="quz-table-head bg-gray-50 border-b border-gray-100">
                            <tr>
                              <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase">
                                {t('ល.រ', 'No')}
                              </th>
                              <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase">
                                {t('ព័ត៌មានសិស្ស', 'Student Info')}
                              </th>
                              <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase">
                                {t('ថ្ងៃចាប់ផ្តើម', 'Started At')}
                              </th>
                              <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase">
                                {t('ថ្ងៃប្រគល់', 'Submitted At')}
                              </th>
                              <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase">
                                {t('ពិន្ទុទទួលបាន (20%)', 'Score (20%)')}
                              </th>
                              <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase">
                                {t('ស្ថានភាព', 'Status')}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="quz-table-body bg-white">
                            {filteredSubmissions.map((attempt, idx) => {
                              const student = attempt.student;
                              const studentName = student
                                ? `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
                                  student.name ||
                                  student.email
                                : t('មិនស្គាល់អត្តសញ្ញាណ', 'Unknown Student');
                              const weighted20 = toQuizWeighted20Score(
                                attempt.score ?? 0,
                                rawTotalVal
                              );
                              const isPassed =
                                (parseFloat(attempt.score) || 0) / rawTotalVal >=
                                0.5;
                              const rawAvatar = resolveAttemptStudentAvatar(
                                attempt
                              );
                              const avatarUrl = getProfileImageUrl(rawAvatar);
                              const avatarKey = `quz_att_${attempt.id || idx}`;
                              const hasAvatar = Boolean(
                                avatarUrl && !failedAvatars[avatarKey]
                              );
                              const stdGender = student?.gender || '';
                              const isFemale = isFemaleGender(stdGender);
                              const stdShift = resolveAttemptStudentShift(attempt);
                              const isWeekend = stdShift === 'Saturday-Sunday';

                              return (
                                <tr
                                  key={attempt.id || idx}
                                  className="quz-table-row hover:bg-gray-50/60 transition-colors"
                                >
                                  <td className="quz-text-secondary px-4 py-3.5 text-xs font-bold text-gray-400">
                                    {idx + 1}
                                  </td>
                                  <td className="px-4 py-3.5 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                      <div className="w-9 h-9 rounded-full bg-indigo-500 text-white flex items-center justify-center font-extrabold text-xs shrink-0 overflow-hidden shadow-xs">
                                        {hasAvatar ? (
                                          <img
                                            src={avatarUrl}
                                            alt={studentName}
                                            className="h-full w-full object-cover rounded-full"
                                            onError={() =>
                                              setFailedAvatars((prev) => ({
                                                ...prev,
                                                [avatarKey]: true,
                                              }))
                                            }
                                          />
                                        ) : (
                                          <span>
                                            {studentName
                                              .charAt(0)
                                              .toUpperCase()}
                                          </span>
                                        )}
                                      </div>
                                      <div>
                                        <div className="quz-text-primary text-sm font-extrabold text-gray-900">
                                          {studentName}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                          {stdGender && (
                                            <span
                                              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${
                                                isFemale
                                                  ? 'quz-pill-rose bg-rose-50 text-rose-600 border-rose-200'
                                                  : 'quz-pill-blue bg-blue-50 text-blue-600 border-blue-200'
                                              }`}
                                            >
                                              {getGenderLabel(stdGender)}
                                            </span>
                                          )}
                                          {!isModalSpecificShift && (
                                            <span
                                              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${
                                                isWeekend
                                                  ? 'quz-pill-amber bg-amber-50 text-amber-700 border-amber-200'
                                                  : 'quz-pill-indigo bg-indigo-50 text-indigo-700 border-indigo-100'
                                              }`}
                                            >
                                              {getStudyShiftLabel(stdShift)}
                                            </span>
                                          )}
                                          <span className="quz-text-secondary text-xs text-gray-400">
                                            {student?.email || '—'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="quz-text-secondary px-4 py-3.5 text-center text-xs text-gray-600 font-medium">
                                    {formatDate(attempt.started_at)}
                                  </td>
                                  <td className="quz-text-secondary px-4 py-3.5 text-center text-xs text-gray-600 font-bold">
                                    {formatDate(attempt.submitted_at)}
                                  </td>
                                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                    <span className="quz-pill-indigo inline-block px-3 py-1.5 rounded-xl text-sm font-black text-indigo-700 bg-indigo-50 border border-indigo-200/80">
                                      {weighted20} {t('ពិន្ទុ', 'pts')}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-center">
                                    <span
                                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold border ${
                                        isPassed
                                          ? 'quz-pill-emerald bg-emerald-100 text-emerald-800 border-emerald-200'
                                          : 'quz-pill-rose bg-rose-100 text-rose-800 border-rose-200'
                                      }`}
                                    >
                                      {isPassed
                                        ? t('ជាប់ (Passed)', 'Passed')
                                        : t('ធ្លាក់ (Failed)', 'Failed')}
                                    </span>
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

                <div className="quz-modal-bar px-6 py-4 sm:px-7 border-t border-gray-100 bg-gray-50/50 flex justify-end shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubmissionsModal(false);
                      setViewingQuiz(null);
                      setSubmissions([]);
                    }}
                    className="quz-close-btn px-6 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all cursor-pointer"
                  >
                    {t('បិទផ្ទាំង', 'Close')}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ================================================================== */}
      {/* MODAL - 4: Delete Quiz Confirmation                                */}
      {/* ================================================================== */}
      {showDeleteModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="quz-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fadeIn border border-transparent">
            <div className="flex items-center text-rose-600 dark:text-rose-400 mb-5">
              <div className="quz-pill-rose p-2 bg-rose-100 rounded-full mr-3 border border-rose-200">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-extrabold">
                {t('បញ្ជាក់ការលុប', 'Confirm Deletion')}
              </h3>
            </div>
            <p className="quz-text-secondary text-sm font-medium text-gray-600 mb-6 leading-relaxed">
              {t(
                'តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបកម្រងសំណួរ',
                'Are you sure you want to delete quiz'
              )}{' '}
              «
              <span className="quz-text-primary font-extrabold text-gray-900">
                {selectedQuiz?.title}
              </span>
              » {t('នេះមែនទេ?', 'this quiz?')}
              <br />
              <br />
              <span className="quz-pill-rose text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100 block">
                {t(
                  'ការលុបកម្រងសំណួរនេះនឹងធ្វើឱ្យបាត់បង់រាល់ព័ត៌មានសំណួរ និងចម្លើយទាំងអស់ពាក់ព័ន្ធជាអចិន្ត្រៃយ៍។',
                  'Deleting this quiz will permanently remove all associated questions and answers.'
                )}
              </span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedQuiz(null);
                }}
                className="quz-close-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
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
      {/* MODAL - 5: Delete Single Question Confirmation                     */}
      {/* ================================================================== */}
      {deleteQuestionTarget && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="quz-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fadeIn border border-transparent">
            <div className="flex items-center text-rose-600 dark:text-rose-400 mb-5">
              <div className="quz-pill-rose p-2 bg-rose-100 rounded-full mr-3 border border-rose-200">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-extrabold">
                {t('បញ្ជាក់ការលុប', 'Confirm Deletion')}
              </h3>
            </div>
            <p className="quz-text-secondary text-sm font-medium text-gray-600 mb-6 leading-relaxed">
              {t(
                'តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបសំណួរ',
                'Are you sure you want to delete question'
              )}{' '}
              «
              <span className="quz-text-primary font-extrabold text-gray-900 break-all">
                {deleteQuestionTarget.question_text}
              </span>
              » {t('នេះមែនទេ?', 'this question?')}
              <br />
              <br />
              <span className="quz-pill-rose text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100 block">
                {t(
                  '* សំណួរនេះនឹងត្រូវលុបចោលទាំងស្រុងចេញពីកម្រងសំណួរ។',
                  '* This question will be permanently deleted from the quiz.'
                )}
              </span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setDeleteQuestionTarget(null)}
                className="quz-close-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDeleteQuestion}
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
        .quz-table-row + .quz-table-row > td {
          border-top: 1px solid #f1f5f9;
        }

        .quz-custom-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .quz-custom-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .quz-custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.35);
          border-radius: 10px;
        }
        .quz-custom-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.55);
        }

        html.dark .quz-page-bg {
          background-color: transparent !important;
        }
        html.dark .quz-surface-card,
        html.dark .quz-table-bar,
        html.dark .quz-modal-card,
        html.dark .quz-year-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .quz-year-card:hover {
          background-color: #263449 !important;
        }
        html.dark .quz-modal-bar,
        html.dark .quz-subbox,
        html.dark .quz-expanded-row {
          background-color: rgba(15, 23, 42, 0.65) !important;
          border-color: #334155 !important;
        }
        html.dark .quz-stat-indigo {
          background-color: rgba(99, 102, 241, 0.12) !important;
          border-color: rgba(99, 102, 241, 0.25) !important;
        }
        html.dark .quz-stat-emerald {
          background-color: rgba(16, 185, 129, 0.12) !important;
          border-color: rgba(16, 185, 129, 0.25) !important;
        }
        html.dark .quz-stat-amber {
          background-color: rgba(245, 158, 11, 0.12) !important;
          border-color: rgba(245, 158, 11, 0.25) !important;
        }
        html.dark .quz-text-primary {
          color: #f8fafc !important;
        }
        html.dark .quz-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .quz-label {
          color: #cbd5e1 !important;
        }
        html.dark .quz-shift-tabs {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .quz-shift-btn {
          color: #94a3b8 !important;
        }
        html.dark .quz-shift-btn:hover {
          background-color: #1e293b !important;
          color: #f8fafc !important;
        }
        html.dark .quz-shift-count {
          background-color: #1e293b !important;
          color: #cbd5e1 !important;
        }
        html.dark .quz-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
          color-scheme: dark;
        }
        html.dark .quz-input::placeholder {
          color: #64748b !important;
        }
        html.dark .quz-close-btn {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .quz-close-btn:hover {
          background-color: #334155 !important;
          color: #ffffff !important;
        }
        html.dark .quz-table-head {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .quz-table-head th {
          color: #94a3b8 !important;
        }
        html.dark .quz-table-body {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .quz-table-row + .quz-table-row > td {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .quz-table-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }
        html.dark .quz-code-pill {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .quz-pill-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .quz-pill-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          color: #818cf8 !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .quz-pill-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .quz-pill-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
        html.dark .quz-pill-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .quz-action-edit {
          color: #818cf8 !important;
        }
        html.dark .quz-action-edit:hover {
          background-color: rgba(99, 102, 241, 0.18) !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .quz-action-delete {
          color: #fb7185 !important;
        }
        html.dark .quz-action-delete:hover {
          background-color: rgba(244, 63, 94, 0.18) !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
      `}</style>
    </div>
  );
}
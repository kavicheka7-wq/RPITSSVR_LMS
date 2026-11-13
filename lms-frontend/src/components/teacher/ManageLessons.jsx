// src/components/teacher/ManageLessons.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import XLSX from 'xlsx-js-style';
import {
  BookOpenIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  DocumentIcon,
  VideoCameraIcon,
  PencilSquareIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  PaperClipIcon,
  LinkIcon,
  ArrowDownTrayIcon,
  PlayIcon,
  AcademicCapIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនីគ្រូម្នាក់ៗ (User-Scoped 0ms Slim Cache)
// ============================================================================
const CACHE_KEY_SHARED_LESSONS = 'cached_teacher_lessons_list_v6';
const CACHE_KEY_SHARED_COURSES = 'cached_teacher_courses_list_v6';
const CACHE_KEY_SHARED_STUDENTS = 'cached_teacher_students_list_v6';
const CACHE_KEY_SHARED_MAP = 'cached_teacher_course_map_v6';

const getLessonsCacheKey = (uid) => `cached_teacher_lessons_list_v8_${uid}`;
const getCoursesCacheKey = (uid) => `cached_teacher_courses_list_v8_${uid}`;
const getStudentsCacheKey = (uid) => `cached_teacher_students_list_v8_${uid}`;
const getCourseMapCacheKey = (uid) => `cached_teacher_course_map_v8_${uid}`;
const getSelectedYearKey = (uid) => `cached_teacher_lessons_selected_year_${uid}`;
const getSelectedCourseKey = (uid) => `cached_teacher_lessons_selected_course_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់គ្រូម្នាក់ៗ
const LESSONS_MEM_CACHE = {
  uid: null,
  lessons: null,
  courses: null,
  allStudents: null,
  courseMap: null,
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

// ✅ លុបជួរឈរ file_data (Base64 ធំៗ) ចេញពីមេរៀនមុនពេល Save ចូល localStorage ការពារ QuotaExceededError
const stripHeavyDataFromLessons = (lessonsList) => {
  if (!Array.isArray(lessonsList)) return [];
  return lessonsList.map((lsn) => {
    if (!lsn || typeof lsn !== 'object') return lsn;
    const copy = { ...lsn };
    if (Array.isArray(copy.files)) {
      copy.files = copy.files.map((f) => {
        if (!f || typeof f !== 'object') return f;
        const { file_data, ...restFile } = f;
        return restFile;
      });
    }
    return copy;
  });
};

// ✅ លុបរូបភាព Base64 ធំៗចេញពីបញ្ជីសិស្សមុនពេល Save ចូល localStorage
const stripHeavyDataFromStudents = (studentsList) => {
  if (!Array.isArray(studentsList)) return [];
  return studentsList.map((stu) => {
    if (!stu || typeof stu !== 'object') return stu;
    const copy = { ...stu };
    if (
      typeof copy.profile_image === 'string' &&
      copy.profile_image.startsWith('data:') &&
      copy.profile_image.length > 15000
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
};

const safeSaveLessonsCache = (uid, lessonsList) => {
  const slim = stripHeavyDataFromLessons(lessonsList);
  try {
    localStorage.setItem(getLessonsCacheKey(uid), JSON.stringify(slim));
    localStorage.setItem(CACHE_KEY_SHARED_LESSONS, JSON.stringify(slim));
  } catch {}
};

const safeSaveCoursesCache = (uid, coursesList) => {
  if (!Array.isArray(coursesList)) return;
  try {
    localStorage.setItem(getCoursesCacheKey(uid), JSON.stringify(coursesList));
    localStorage.setItem(CACHE_KEY_SHARED_COURSES, JSON.stringify(coursesList));
  } catch {}
};

const safeSaveStudentsCache = (uid, studentsList) => {
  const slim = stripHeavyDataFromStudents(studentsList);
  try {
    localStorage.setItem(getStudentsCacheKey(uid), JSON.stringify(slim));
    localStorage.setItem(CACHE_KEY_SHARED_STUDENTS, JSON.stringify(slim));
  } catch {}
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
      id: `local_lesson_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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

export default function ManageLessons() {
  const { t } = useLanguage();
  const { user, teacher } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialRouteCourseId =
    searchParams.get('course_id') || location.state?.courseId || '';

  // ✅ កំណត់អត្តសញ្ញាណគ្រូបច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentTeacherId = useMemo(
    () => resolveTeacherUid(user, teacher),
    [user, teacher]
  );

  // បើប្ដូរគណនីគ្រូ ឱ្យសម្អាត RAM Cache ចាស់ចោលភ្លាមៗ
  if (
    LESSONS_MEM_CACHE.uid &&
    LESSONS_MEM_CACHE.uid !== currentTeacherId
  ) {
    LESSONS_MEM_CACHE.lessons = null;
    LESSONS_MEM_CACHE.courses = null;
    LESSONS_MEM_CACHE.allStudents = null;
    LESSONS_MEM_CACHE.courseMap = null;
    LESSONS_MEM_CACHE.lastSyncedAt = 0;
  }
  LESSONS_MEM_CACHE.uid = currentTeacherId;

  // ✅ ១. អានពី Cache ភ្លាមៗក្នុង 0 វិនាទី
  const [lessons, setLessons] = useState(() => {
    if (Array.isArray(LESSONS_MEM_CACHE.lessons)) {
      return LESSONS_MEM_CACHE.lessons;
    }
    const fromUserKey = readStorageJson(
      getLessonsCacheKey(currentTeacherId),
      null
    );
    if (Array.isArray(fromUserKey)) {
      LESSONS_MEM_CACHE.lessons = fromUserKey;
      return fromUserKey;
    }
    return readStorageJson(CACHE_KEY_SHARED_LESSONS, []);
  });

  const [courses, setCourses] = useState(() => {
    if (Array.isArray(LESSONS_MEM_CACHE.courses)) return LESSONS_MEM_CACHE.courses;
    const cached =
      readStorageJson(getCoursesCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES, []);
    LESSONS_MEM_CACHE.courses = cached;
    return cached;
  });

  const [allStudents, setAllStudents] = useState(() => {
    if (Array.isArray(LESSONS_MEM_CACHE.allStudents))
      return LESSONS_MEM_CACHE.allStudents;
    const cached =
      readStorageJson(getStudentsCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_STUDENTS, []);
    LESSONS_MEM_CACHE.allStudents = cached;
    return cached;
  });

  const [courseMap, setCourseMap] = useState(() => {
    if (LESSONS_MEM_CACHE.courseMap) return LESSONS_MEM_CACHE.courseMap;
    const cached =
      readStorageJson(getCourseMapCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_MAP, {});
    LESSONS_MEM_CACHE.courseMap = cached;
    return cached;
  });

  const [searchTerm, setSearchTerm] = useState('');

  // ✅ កាតឆ្នាំសិក្សា៖ 'all' | '1' | '2' | '3' | '4'
  const [selectedYear, setSelectedYear] = useState(() => {
    if (initialRouteCourseId) {
      const enrolledInRouteCourse = (LESSONS_MEM_CACHE.allStudents || []).find(
        (s) =>
          isStudentEnrolledInCourse(
            s,
            initialRouteCourseId,
            LESSONS_MEM_CACHE.courseMap
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

  const [expandedLesson, setExpandedLesson] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [deleteMediaTarget, setDeleteMediaTarget] = useState(null);

  const [uploadingFileId, setUploadingFileId] = useState(null);
  const [uploadingVideoId, setUploadingVideoId] = useState(null);

  const fileInputRef = useRef(null);
  const videoFileInputRef = useRef(null);

  const [videoInputMode, setVideoInputMode] = useState('file'); // 'file' | 'url'
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrlInput, setVideoUrlInput] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    course_id: '',
    lesson_order: '1',
    description: '',
  });

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [youtubeVideo, setYoutubeVideo] = useState({ title: '', url: '' });

  // ✅ សម្អាតប្រអប់វាយចំណងជើងវីដេអូរាល់ពេលប្ដូរកាតមេរៀនដែលបើក
  const handleToggleExpandLesson = useCallback((lessonId) => {
    setExpandedLesson((prev) => {
      const next = prev === lessonId ? null : lessonId;
      setVideoTitle('');
      setVideoUrlInput('');
      return next;
    });
  }, []);

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

  // ============================================================================
  // 📌 ផ្នែកទី២៖ ទាញយកទិន្នន័យដោយឯករាជ្យមិនរង់ចាំគ្នា (Non-Blocking 0ms Sync)
  // ============================================================================
  useEffect(() => {
    let isMounted = true;

    const cachedLsn = readStorageJson(getLessonsCacheKey(currentTeacherId), null);
    const cachedCrs = readStorageJson(getCoursesCacheKey(currentTeacherId), null);
    const cachedStd = readStorageJson(getStudentsCacheKey(currentTeacherId), null);
    const cachedMap = readStorageJson(getCourseMapCacheKey(currentTeacherId), null);

    if (Array.isArray(cachedLsn)) {
      setLessons(cachedLsn);
      LESSONS_MEM_CACHE.lessons = cachedLsn;
    }
    if (Array.isArray(cachedCrs)) {
      setCourses(cachedCrs);
      LESSONS_MEM_CACHE.courses = cachedCrs;
    }
    if (Array.isArray(cachedStd)) {
      setAllStudents(cachedStd);
      LESSONS_MEM_CACHE.allStudents = cachedStd;
    }
    if (cachedMap) {
      setCourseMap(cachedMap);
      LESSONS_MEM_CACHE.courseMap = cachedMap;
    }

    const now = Date.now();
    if (
      LESSONS_MEM_CACHE.uid === currentTeacherId &&
      Array.isArray(LESSONS_MEM_CACHE.lessons) &&
      Array.isArray(LESSONS_MEM_CACHE.courses) &&
      now - LESSONS_MEM_CACHE.lastSyncedAt < 25000
    ) {
      return;
    }

    // ១. ទាញមេរៀនមុនគេ
    api
      .get('/teacher/lessons')
      .then((lsnRes) => {
        if (!isMounted) return;
        const rawLsn = lsnRes.data?.data || lsnRes.data || [];
        const validLessons = stripHeavyDataFromLessons(
          Array.isArray(rawLsn) ? rawLsn : []
        );
        setLessons(validLessons);
        LESSONS_MEM_CACHE.lessons = validLessons;
        LESSONS_MEM_CACHE.lastSyncedAt = Date.now();
        safeSaveLessonsCache(currentTeacherId, validLessons);
      })
      .catch((err) => {
        console.error('Error fetching lessons:', err);
      });

    // ២. ទាញមុខវិជ្ជានៅផ្ទៃខាងក្រោយដោយឯករាជ្យ
    api
      .get('/teacher/courses')
      .then((crsRes) => {
        if (!isMounted) return;
        const rawCrs = crsRes.data?.data || crsRes.data || [];
        const validCourses = Array.isArray(rawCrs) ? rawCrs : [];
        setCourses(validCourses);
        LESSONS_MEM_CACHE.courses = validCourses;
        safeSaveCoursesCache(currentTeacherId, validCourses);
      })
      .catch(() => {});

    // ៣. ទាញបញ្ជីសិស្សនៅផ្ទៃខាងក្រោយដោយឯករាជ្យ
    if (
      !Array.isArray(LESSONS_MEM_CACHE.allStudents) ||
      LESSONS_MEM_CACHE.allStudents.length === 0
    ) {
      api
        .get('/teacher/students')
        .then((stdRes) => {
          if (!isMounted) return;
          const rawStd = stdRes.data?.data || stdRes.data || [];
          const validStudents = stripHeavyDataFromStudents(
            Array.isArray(rawStd) ? rawStd : []
          );
          setAllStudents(validStudents);
          LESSONS_MEM_CACHE.allStudents = validStudents;
          safeSaveStudentsCache(currentTeacherId, validStudents);

          if (stdRes.data?.course_students_map) {
            setCourseMap(stdRes.data.course_students_map);
            LESSONS_MEM_CACHE.courseMap = stdRes.data.course_students_map;
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

  const fetchLessons = async () => {
    try {
      const response = await api.get('/teacher/lessons');
      const lessonsData = response.data?.data || response.data || [];
      const validLessons = stripHeavyDataFromLessons(
        Array.isArray(lessonsData) ? lessonsData : []
      );
      setLessons(validLessons);
      LESSONS_MEM_CACHE.lessons = validLessons;
      LESSONS_MEM_CACHE.lastSyncedAt = Date.now();
      safeSaveLessonsCache(currentTeacherId, validLessons);
    } catch (error) {
      console.error('Error fetching lessons:', error);
    }
  };

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ ការគណនាឆ្នាំសិក្សារបស់មុខវិជ្ជានីមួយៗ និងកាតឆ្នាំទាំង ៥
  // ============================================================================
  const enrichedCourses = useMemo(() => {
    if (!Array.isArray(courses)) return [];

    return courses.map((course) => {
      const cid = String(course.id);
      const enrolledList = (allStudents || []).filter((s) =>
        isStudentEnrolledInCourse(s, cid, courseMap)
      );

      const yearFreq = {};
      enrolledList.forEach((s) => {
        const y = detectStudentYearNum(s);
        if (y) {
          yearFreq[y] = (yearFreq[y] || 0) + 1;
        }
      });

      let sortedYears = Object.keys(yearFreq).sort();

      if (sortedYears.length === 0) {
        const fromCourseText = detectStudentYearNum({
          batch_year: `${course.course_name || ''} ${course.description || ''} ${course.year || ''}`,
        });
        if (fromCourseText) sortedYears = [fromCourseText];
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
        primaryYear,
      };
    });
  }, [courses, allStudents, courseMap]);

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
          Array.isArray(course.yearsList) && course.yearsList.includes(targetYear)
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
      if (editingLesson && editingLesson.course_id) {
        const exists = yearCourses.some(
          (c) => String(c.id) === String(editingLesson.course_id)
        );
        if (!exists) {
          const currentCourseObj = enrichedCourses.find(
            (c) => String(c.id) === String(editingLesson.course_id)
          );
          if (currentCourseObj) return [currentCourseObj, ...yearCourses];
        }
      }
      return yearCourses;
    }

    if (editingLesson && editingLesson.course_id) {
      const currentCourseObj = enrichedCourses.find(
        (c) => String(c.id) === String(editingLesson.course_id)
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
  }, [selectedYear, editingLesson, enrichedCourses, getCoursesForYearKey]);

  // គណនាមេរៀនសរុប និងតាមឆ្នាំសិក្សា (ឆ្នាំទី១ ដល់ ឆ្នាំទី៤) សម្រាប់កាតទាំង ៥
  const lessonYearCounts = useMemo(() => {
    const counts = { all: 0, '1': 0, '2': 0, '3': 0, '4': 0 };
    if (!Array.isArray(lessons)) return counts;

    counts.all = lessons.length;
    lessons.forEach((lsn) => {
      const matchedCourse = enrichedCourses.find(
        (c) => String(c.id) === String(lsn.course_id)
      );
      if (matchedCourse && Array.isArray(matchedCourse.yearsList)) {
        matchedCourse.yearsList.forEach((y) => {
          if (counts[y] !== undefined) counts[y] += 1;
        });
      }
    });
    return counts;
  }, [lessons, enrichedCourses]);

  const activeCourseObj = useMemo(() => {
    if (selectedYear === 'all' || !selectedCourse) return null;
    return (
      enrichedCourses.find((c) => String(c.id) === String(selectedCourse)) || null
    );
  }, [selectedYear, selectedCourse, enrichedCourses]);

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

  // ✅ គាំទ្រទាំង Domain Server Online លើ Railway (VITE_API_URL) និង Data URI/URL ធម្មតា
  const getStorageUrl = (path) => {
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
    return `${backendBase}/api/download-file?path=${encodeURIComponent(cleanPath)}`;
  };

  const getVideoUrl = (url) => {
    if (!url || typeof url !== 'string') return '#';
    const trimmed = url.trim();
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
  };

  const getNextLessonOrderForCourse = (courseId) => {
    if (!courseId || !Array.isArray(lessons)) return '1';
    const courseLessons = lessons.filter(
      (l) => String(l.course_id) === String(courseId)
    );
    if (courseLessons.length === 0) return '1';
    const maxOrder = Math.max(
      ...courseLessons.map((l) => Number(l.lesson_order) || 0)
    );
    return String(maxOrder + 1);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'course_id' && !editingLesson) {
      setFormData((prev) => ({
        ...prev,
        course_id: value,
        lesson_order: getNextLessonOrderForCourse(value),
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const openAddModal = () => {
    setEditingLesson(null);
    const defaultCourseId =
      selectedCourse ||
      (visibleCoursesForSelectedYear.length > 0
        ? String(visibleCoursesForSelectedYear[0].id)
        : '');

    setFormData({
      title: '',
      course_id: defaultCourseId,
      lesson_order: getNextLessonOrderForCourse(defaultCourseId),
      description: '',
    });
    setSelectedFiles([]);
    setYoutubeVideo({ title: '', url: '' });
    setShowAddModal(true);
  };

  const openEditModal = (lesson) => {
    setEditingLesson(lesson);
    setFormData({
      title: lesson.title || '',
      course_id: lesson.course_id ? String(lesson.course_id) : '',
      lesson_order: (lesson.lesson_order ?? 1).toString(),
      description: lesson.description || '',
    });
    setSelectedFiles([]);
    setYoutubeVideo({ title: '', url: '' });
    setShowAddModal(true);
  };

  // ============================================================================
  // 📌 ផ្នែកទី៤៖ មុខងារបង្កើត កែប្រែ លុបមេរៀន និងផ្ទុកហ្វាល់ (ភ្ជាប់តែកណ្ដឹង)
  // ============================================================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = {
      title: formData.title.trim(),
      course_id: formData.course_id,
      lesson_order: parseInt(formData.lesson_order, 10) || 1,
      description: formData.description ? formData.description.trim() : '',
    };

    const targetCourse = courses.find(
      (c) => String(c.id) === String(formData.course_id)
    );
    const courseName = targetCourse?.course_name || '';

    try {
      let currentLessonId = null;

      if (editingLesson) {
        await api.put(`/teacher/lessons/${editingLesson.id}`, payload);
        currentLessonId = editingLesson.id;

        pushLocalNotification({
          titleKm: 'បានកែប្រែមេរៀន',
          titleEn: 'Lesson Updated',
          descKm: `មេរៀនទី ${payload.lesson_order}: «${payload.title}» ត្រូវបានកែប្រែដោយជោគជ័យ។`,
          descEn: `Lesson ${payload.lesson_order}: "${payload.title}" was updated successfully.`,
          category: 'lesson',
          link: '/lessons',
        });
      } else {
        const response = await api.post('/teacher/lessons', payload);
        currentLessonId =
          response.data?.lesson?.id ||
          response.data?.data?.id ||
          response.data?.id;

        pushLocalNotification({
          titleKm: 'បានបន្ថែមមេរៀនថ្មី',
          titleEn: 'New Lesson Added',
          descKm: `បានបង្កើតមេរៀនថ្មីទី ${payload.lesson_order}: «${payload.title}» សម្រាប់មុខវិជ្ជា «${courseName || '—'}»។`,
          descEn: `Created new lesson ${payload.lesson_order}: "${payload.title}" for "${courseName || '—'}".`,
          category: 'lesson',
          link: '/lessons',
        });
      }

      if (selectedFiles.length > 0 && currentLessonId) {
        for (const file of selectedFiles) {
          const filePayload = new FormData();
          filePayload.append('lesson_id', currentLessonId);
          filePayload.append('file', file);

          try {
            // ✅ ដាក់ Content-Type: undefined ដើម្បីឱ្យ Browser បង្កើត multipart boundary ដោយស្វ័យប្រវត្តិ
            await api.post('/teacher/lessons/file', filePayload, {
              headers: { 'Content-Type': undefined },
            });
          } catch (fileError) {
            console.error('File upload failed', fileError);
          }
        }
      }

      if (youtubeVideo.url.trim() && currentLessonId) {
        const videoPayload = new FormData();
        videoPayload.append('lesson_id', currentLessonId);
        videoPayload.append(
          'title',
          youtubeVideo.title.trim() || payload.title
        );
        videoPayload.append('video_url', youtubeVideo.url.trim());

        try {
          await api.post('/teacher/lessons/video', videoPayload, {
            headers: { 'Content-Type': undefined },
          });
        } catch (videoError) {
          console.error('Video upload failed', videoError);
        }
      }

      setShowAddModal(false);
      setSelectedFiles([]);
      setYoutubeVideo({ title: '', url: '' });
      await fetchLessons();
    } catch (error) {
      console.error('Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (lesson) => {
    setSelectedLesson(lesson);
    setShowDeleteModal(true);
  };

  // ✅ Optimistic Delete Lesson + បញ្ជូនសារទៅកាន់កណ្ដឹង
  const confirmDelete = async () => {
    if (!selectedLesson) return;

    const deletedId = selectedLesson.id;
    const deletedTitle = selectedLesson.title;
    const previousLessons = [...lessons];

    setShowDeleteModal(false);
    setSelectedLesson(null);

    setLessons((prev) => {
      const updated = prev.filter((l) => l.id !== deletedId);
      LESSONS_MEM_CACHE.lessons = updated;
      safeSaveLessonsCache(currentTeacherId, updated);
      return updated;
    });

    try {
      await api.delete(`/teacher/lessons/${deletedId}`);

      pushLocalNotification({
        titleKm: 'បានលុបមេរៀន',
        titleEn: 'Lesson Deleted',
        descKm: `មេរៀន «${deletedTitle}» ត្រូវបានលុបចេញពីប្រព័ន្ធរួចរាល់។`,
        descEn: `Lesson "${deletedTitle}" has been removed.`,
        category: 'lesson',
        link: '/lessons',
      });
    } catch (error) {
      setLessons(previousLessons);
      LESSONS_MEM_CACHE.lessons = previousLessons;
      safeSaveLessonsCache(currentTeacherId, previousLessons);
      console.error('Cannot delete lesson:', error);
    }
  };

  // ✅ Upload File + បញ្ជូនសារទៅកាន់កណ្ដឹង
  const handleUploadFile = async (lessonId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const filePayload = new FormData();
    filePayload.append('lesson_id', lessonId);
    filePayload.append('file', file);

    const targetLesson = lessons.find((l) => l.id === lessonId);

    setUploadingFileId(lessonId);
    try {
      await api.post('/teacher/lessons/file', filePayload, {
        headers: { 'Content-Type': undefined },
      });
      await fetchLessons();

      pushLocalNotification({
        titleKm: 'បានផ្ទុកឡើងឯកសារមេរៀន',
        titleEn: 'Lesson File Uploaded',
        descKm: `បានផ្ទុកឡើងឯកសារ «${file.name}» ទៅកាន់មេរៀន «${targetLesson?.title || ''}»។`,
        descEn: `Uploaded file "${file.name}" to lesson "${targetLesson?.title || ''}".`,
        category: 'lesson',
        link: '/lessons',
      });
    } catch (error) {
      console.error('Failed to upload file:', error);
    } finally {
      setUploadingFileId(null);
      e.target.value = '';
    }
  };

  const handleDeleteFileClick = (file) => {
    setDeleteMediaTarget({
      type: 'file',
      id: file.id,
      name: file.file_name || t('ឯកសារនេះ', 'this file'),
    });
  };

  // ✅ Upload Video + បញ្ជូនសារទៅកាន់កណ្ដឹង
  const handleUploadVideo = async (lessonId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!videoTitle.trim()) {
      e.target.value = '';
      return;
    }

    const videoPayload = new FormData();
    videoPayload.append('lesson_id', lessonId);
    videoPayload.append('title', videoTitle.trim());
    videoPayload.append('video', file);

    const targetLesson = lessons.find((l) => l.id === lessonId);

    setUploadingVideoId(lessonId);
    try {
      await api.post('/teacher/lessons/video', videoPayload, {
        headers: { 'Content-Type': undefined },
      });
      setVideoTitle('');
      await fetchLessons();

      pushLocalNotification({
        titleKm: 'បានផ្ទុកឡើងវីដេអូបង្រៀន',
        titleEn: 'Teaching Video Uploaded',
        descKm: `បានផ្ទុកឡើងវីដេអូ «${videoTitle.trim()}» ទៅកាន់មេរៀន «${targetLesson?.title || ''}»។`,
        descEn: `Uploaded video "${videoTitle.trim()}" to lesson "${targetLesson?.title || ''}".`,
        category: 'lesson',
        link: '/lessons',
      });
    } catch (error) {
      console.error('Failed to upload video:', error);
    } finally {
      setUploadingVideoId(null);
      e.target.value = '';
    }
  };

  // ✅ Add Video URL + បញ្ជូនសារទៅកាន់កណ្ដឹង
  const handleAddVideoUrl = async (lessonId) => {
    if (!videoTitle.trim() || !videoUrlInput.trim()) {
      return;
    }

    const videoPayload = new FormData();
    videoPayload.append('lesson_id', lessonId);
    videoPayload.append('title', videoTitle.trim());
    videoPayload.append('video_url', videoUrlInput.trim());

    const targetLesson = lessons.find((l) => l.id === lessonId);

    setUploadingVideoId(lessonId);
    try {
      await api.post('/teacher/lessons/video', videoPayload, {
        headers: { 'Content-Type': undefined },
      });
      setVideoTitle('');
      setVideoUrlInput('');
      await fetchLessons();

      pushLocalNotification({
        titleKm: 'បានភ្ជាប់តំណវីដេអូ YouTube',
        titleEn: 'YouTube Video Linked',
        descKm: `បានភ្ជាប់តំណវីដេអូ «${videoTitle.trim()}» ទៅកាន់មេរៀន «${targetLesson?.title || ''}»។`,
        descEn: `Attached video link "${videoTitle.trim()}" to lesson "${targetLesson?.title || ''}".`,
        category: 'lesson',
        link: '/lessons',
      });
    } catch (error) {
      console.error('Failed to attach video URL:', error);
    } finally {
      setUploadingVideoId(null);
    }
  };

  const handleDeleteVideoClick = (video) => {
    setDeleteMediaTarget({
      type: 'video',
      id: video.id,
      name: video.title || t('វីដេអូនេះ', 'this video'),
    });
  };

  const confirmDeleteMedia = async () => {
    if (!deleteMediaTarget) return;

    const { type, id } = deleteMediaTarget;
    const previousLessons = [...lessons];
    setDeleteMediaTarget(null);

    if (type === 'file') {
      setLessons((prev) => {
        const updated = prev.map((lesson) => ({
          ...lesson,
          files: Array.isArray(lesson.files)
            ? lesson.files.filter((f) => f.id !== id)
            : [],
        }));
        LESSONS_MEM_CACHE.lessons = updated;
        safeSaveLessonsCache(currentTeacherId, updated);
        return updated;
      });

      try {
        await api.delete(`/teacher/lessons/files/${id}`);

        pushLocalNotification({
          titleKm: 'បានលុបឯកសារមេរៀន',
          titleEn: 'Lesson File Deleted',
          descKm: `ឯកសារមេរៀនត្រូវបានលុបចេញពីប្រព័ន្ធ។`,
          descEn: `Lesson file was deleted.`,
          category: 'lesson',
          link: '/lessons',
        });
      } catch (error) {
        setLessons(previousLessons);
        LESSONS_MEM_CACHE.lessons = previousLessons;
        safeSaveLessonsCache(currentTeacherId, previousLessons);
        console.error('Cannot delete file:', error);
      }
    } else if (type === 'video') {
      setLessons((prev) => {
        const updated = prev.map((lesson) => ({
          ...lesson,
          videos: Array.isArray(lesson.videos)
            ? lesson.videos.filter((v) => v.id !== id)
            : [],
        }));
        LESSONS_MEM_CACHE.lessons = updated;
        safeSaveLessonsCache(currentTeacherId, updated);
        return updated;
      });

      try {
        await api.delete(`/teacher/lessons/videos/${id}`);

        pushLocalNotification({
          titleKm: 'បានលុបវីដេអូមេរៀន',
          titleEn: 'Lesson Video Deleted',
          descKm: `វីដេអូបង្រៀនត្រូវបានលុបចេញពីប្រព័ន្ធ។`,
          descEn: `Lesson video was deleted.`,
          category: 'lesson',
          link: '/lessons',
        });
      } catch (error) {
        setLessons(previousLessons);
        LESSONS_MEM_CACHE.lessons = previousLessons;
        safeSaveLessonsCache(currentTeacherId, previousLessons);
        console.error('Cannot delete video:', error);
      }
    }
  };

  // ============================================================================
  // 📌 ផ្នែកទី៥៖ ការច្រោះទិន្នន័យមេរៀន និងការនាំចេញឯកសារ Excel (.xlsx)
  // ============================================================================
  const filteredLessons = useMemo(() => {
    if (!Array.isArray(lessons)) return [];
    const search = searchTerm.toLowerCase().trim();

    return lessons
      .filter((lesson) => {
        const matchedCourse = enrichedCourses.find(
          (c) => String(c.id) === String(lesson.course_id)
        );

        // ១. ច្រោះតាមកាតឆ្នាំសិក្សា (ឆ្នាំទី១ ដល់ ឆ្នាំទី៤)
        if (selectedYear !== 'all') {
          const hasYear =
            matchedCourse &&
            Array.isArray(matchedCourse.yearsList) &&
            matchedCourse.yearsList.includes(String(selectedYear));
          if (!hasYear) return false;
        }

        // ២. ច្រោះតាមមុខវិជ្ជា (ដំណើរការពេលឈរលើកាតឆ្នាំទី១-៤)
        if (
          selectedYear !== 'all' &&
          selectedCourse !== '' &&
          String(lesson.course_id) !== String(selectedCourse)
        ) {
          return false;
        }

        // ៣. ច្រោះតាមពាក្យស្វែងរក
        if (!search) return true;
        const courseObj = lesson.course || matchedCourse;
        const titleMatch = (lesson.title || '').toLowerCase().includes(search);
        const descMatch = (lesson.description || '')
          .toLowerCase()
          .includes(search);
        const courseMatch = (courseObj?.course_name || '')
          .toLowerCase()
          .includes(search);
        const codeMatch = (courseObj?.course_code || '')
          .toLowerCase()
          .includes(search);

        return titleMatch || descMatch || courseMatch || codeMatch;
      })
      .sort((a, b) => {
        const orderA = Number(a.lesson_order) || 0;
        const orderB = Number(b.lesson_order) || 0;
        if (orderA !== orderB) return orderA - orderB;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });
  }, [lessons, enrichedCourses, selectedYear, selectedCourse, searchTerm]);

  const handleExportLessonsExcel = () => {
    if (filteredLessons.length === 0) {
      return;
    }

    const exportData = filteredLessons.map((item, idx) => {
      const matchedCourse = enrichedCourses.find(
        (c) => String(c.id) === String(item.course_id)
      );
      return {
        'ល.រ': idx + 1,
        'លំដាប់មេរៀន': item.lesson_order || idx + 1,
        'ចំណងជើងមេរៀន': item.title || '—',
        'មុខវិជ្ជា':
          item.course?.course_name || matchedCourse?.course_name || '—',
        'ចំនួនឯកសារ': item.files?.length || 0,
        'ចំនួនវីដេអូ': item.videos?.length || 0,
        'ការពិពណ៌នា': item.description || '—',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const range = XLSX.utils.decode_range(worksheet['!ref']);

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!worksheet[cellAddress]) continue;
        const isHeader = R === 0;
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
            horizontal:
              isHeader || C === 0 || C === 1 || C === 4 || C === 5
                ? 'center'
                : 'left',
            wrapText: true,
          },
          border: {
            top: { style: 'thin', color: { rgb: 'CBD5E1' } },
            bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } },
          },
        };
      }
    }

    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 14 },
      { wch: 30 },
      { wch: 24 },
      { wch: 14 },
      { wch: 14 },
      { wch: 36 },
    ];

    const yearSuffix = selectedYear !== 'all' ? `_Year${selectedYear}` : '';
    const courseSuffix = activeCourseObj?.course_code
      ? `_${activeCourseObj.course_code}`
      : '';
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lessons');
    XLSX.writeFile(
      workbook,
      `Teacher_Lessons${yearSuffix}${courseSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    // ✅ បញ្ជូនសារជូនដំណឹងចូលតែក្នុងរូបកណ្ដឹងលើ Navbar (ប្រើ Clean URL '/lessons')
    pushLocalNotification({
      titleKm: 'បាននាំចេញបញ្ជីមេរៀនទៅ Excel',
      titleEn: 'Lessons Exported to Excel',
      descKm: `បញ្ជីមេរៀនចំនួន ${filteredLessons.length} មេរៀន ត្រូវបានទាញយកជា Excel ជោគជ័យ។`,
      descEn: `Exported ${filteredLessons.length} lessons to Excel.`,
      category: 'export',
      link: '/lessons',
    });
  };

  // ទិន្នន័យកាតឆ្នាំសិក្សាទាំង ៥ សម្រាប់ Render
  const yearCardsConfig = [
    {
      key: 'all',
      titleKm: 'មេរៀនសរុប',
      titleEn: 'Total Lessons',
      subtitleKm: 'គ្រប់ឆ្នាំសិក្សាទាំងអស់',
      subtitleEn: 'All Academic Years',
      count: lessonYearCounts.all,
      activeGradient:
        'from-blue-600 to-indigo-700 text-white border-blue-600 shadow-blue-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive: 'bg-blue-50 text-blue-600 border-blue-100 lsn-badge-blue',
    },
    {
      key: '1',
      titleKm: 'មេរៀនឆ្នាំទី១',
      titleEn: 'Year 1 Lessons',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ១',
      subtitleEn: 'First Year Level',
      count: lessonYearCounts['1'],
      activeGradient:
        'from-emerald-600 to-teal-700 text-white border-emerald-600 shadow-emerald-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive:
        'bg-emerald-50 text-emerald-600 border-emerald-100 lsn-badge-emerald',
    },
    {
      key: '2',
      titleKm: 'មេរៀនឆ្នាំទី២',
      titleEn: 'Year 2 Lessons',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ២',
      subtitleEn: 'Second Year Level',
      count: lessonYearCounts['2'],
      activeGradient:
        'from-indigo-600 to-violet-700 text-white border-indigo-600 shadow-indigo-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive:
        'bg-indigo-50 text-indigo-600 border-indigo-100 lsn-badge-indigo',
    },
    {
      key: '3',
      titleKm: 'មេរៀនឆ្នាំទី៣',
      titleEn: 'Year 3 Lessons',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ៣',
      subtitleEn: 'Third Year Level',
      count: lessonYearCounts['3'],
      activeGradient:
        'from-amber-500 to-orange-600 text-white border-amber-500 shadow-amber-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive:
        'bg-amber-50 text-amber-600 border-amber-100 lsn-badge-amber',
    },
    {
      key: '4',
      titleKm: 'មេរៀនឆ្នាំទី៤',
      titleEn: 'Year 4 Lessons',
      subtitleKm: 'កម្រិតឆ្នាំសិក្សាទី ៤',
      subtitleEn: 'Fourth Year Level',
      count: lessonYearCounts['4'],
      activeGradient:
        'from-rose-600 to-pink-700 text-white border-rose-600 shadow-rose-500/20',
      iconBgActive: 'bg-white/20 text-white',
      iconBgInactive: 'bg-rose-50 text-rose-600 border-rose-100 lsn-badge-rose',
    },
  ];

  const canShowExportExcel =
    (selectedYear !== 'all' || selectedCourse !== '') &&
    filteredLessons.length > 0;

  return (
    <div className="lsn-page-bg p-4 sm:p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6 pb-28 lg:pb-10">
      
      {/* ================================================================== */}
      {/* 1. Header Banner                                                   */}
      {/* ================================================================== */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-6 sm:p-8 shadow-xl border border-blue-900">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-[28px] lg:text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shrink-0">
                <BookOpenIcon className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-400" />
              </div>
              <span>{t('មេរៀន និងឯកសារមេរៀនទាំងអស់', 'All Lessons and Materials')}</span>
            </h1>
            <p className="text-blue-200/80 text-xs sm:text-sm max-w-xl font-medium leading-relaxed">
              {selectedYear === 'all'
                ? t(
                    'សូមចុចជ្រើសរើសកាតឆ្នាំសិក្សា (ឆ្នាំទី១-ទី៤) ខាងក្រោម ដើម្បីមើលមុខវិជ្ជា និងបន្ថែមមេរៀនថ្មី។',
                    'Please select an academic year card (Year 1–4) below to filter courses and add new lessons.'
                  )
                : t(
                    'ស្វែងរក និងទាញយកមេរៀន វីដេអូបង្រៀន និងឯកសារជំនួយការសិក្សាពីគ្រប់មុខវិជ្ជា។',
                    'Manage lessons, teaching videos, and study materials for every course.'
                  )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {canShowExportExcel && (
              <button
                type="button"
                onClick={handleExportLessonsExcel}
                className="inline-flex items-center justify-center px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer animate-fadeIn"
              >
                <DocumentIcon className="h-5 w-5 mr-2" />
                {t('នាំចេញ Excel', 'Export Excel')}
              </button>
            )}

            {/* ✅ បង្ហាញប៊ូតុង «បន្ថែមមេរៀនថ្មី» តែនៅពេលចុចលើកាតឆ្នាំណាមួយ (ឆ្នាំទី១-៤) ប៉ុណ្ណោះ */}
            {selectedYear !== 'all' && (
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer shrink-0 animate-fadeIn"
              >
                <PlusIcon className="h-5 w-5 mr-2 stroke-[2.5]" />
                {t('បន្ថែមមេរៀនថ្មី', 'Add New Lesson')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 2. Interactive Year Cards (មេរៀនសរុប និង ឆ្នាំទី១ ដល់ ឆ្នាំទី៤)       */}
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
                  : 'lsn-year-card bg-white hover:bg-gray-50/80 border-gray-200/80 text-gray-800 shadow-xs hover:-translate-y-0.5'
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
                      isSelected ? 'text-white' : 'lsn-text-primary text-gray-900'
                    }`}
                  >
                    {card.count}
                  </span>
                  <span
                    className={`block text-[10px] font-bold mt-0.5 ${
                      isSelected ? 'text-white/80' : 'lsn-text-secondary text-gray-400'
                    }`}
                  >
                    {t('មេរៀន', 'lessons')}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-2 border-t border-current/10 flex items-center justify-between gap-1">
                <div>
                  <h3
                    className={`text-xs sm:text-sm font-extrabold leading-snug ${
                      isSelected ? 'text-white' : 'lsn-text-primary text-gray-800'
                    }`}
                  >
                    {t(card.titleKm, card.titleEn)}
                  </h3>
                  <p
                    className={`text-[10px] font-medium mt-0.5 ${
                      isSelected ? 'text-white/75' : 'lsn-text-secondary text-gray-400'
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

      {/* ------------------------------------------------------------------ */}
      {/* 3. Search & Filters Box                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="lsn-surface-card bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3.5 items-center justify-between">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:max-w-xs lg:max-w-sm flex-1">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder={t(
                'ស្វែងរកមេរៀន ឬមុខវិជ្ជា...',
                'Search lessons or courses...'
              )}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="lsn-input w-full pl-11 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 p-1 rounded-lg transition-colors cursor-pointer"
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
                className="lsn-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white font-medium text-gray-700 appearance-none cursor-pointer shadow-2xs transition-all"
              >
                <option value="">{t('គ្រប់មុខវិជ្ជាទាំងអស់', 'All Courses')}</option>
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

        {(selectedYear !== 'all' ||
          selectedCourse !== '' ||
          searchTerm !== '') && (
          <button
            type="button"
            onClick={() => {
              setSelectedYear('all');
              setSelectedCourse('');
              setSearchTerm('');
              try {
                sessionStorage.removeItem(getSelectedYearKey(currentTeacherId));
                sessionStorage.removeItem(
                  getSelectedCourseKey(currentTeacherId)
                );
              } catch {}
            }}
            className="lsn-badge-blue text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3.5 py-2 rounded-xl transition-all cursor-pointer shrink-0"
          >
            {t('សម្អាតតម្រងស្វែងរក', 'Reset Filters')}
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Main Card Content                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="lsn-surface-card bg-white rounded-[1.5rem] border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="lsn-table-bar px-6 py-5 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="lsn-text-primary text-[18px] font-extrabold text-gray-900">
              {activeCourseObj
                ? `${t('បញ្ជីមេរៀន', 'Lessons List')} - ${activeCourseObj.course_name}`
                : t('បញ្ជីមេរៀនទាំងអស់', 'All Lessons List')}
            </h2>
            <span className="lsn-badge-blue px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-100">
              {filteredLessons.length} {t('មេរៀន', 'Lessons')}
            </span>
          </div>
        </div>

        {/* កាតមេរៀន */}
        <div className="lsn-list-container p-6 bg-gray-50/30">
          {filteredLessons.length === 0 ? (
            <div className="lsn-empty-box py-16 text-center text-gray-500 bg-white rounded-2xl border border-dashed border-gray-200">
              <div className="flex flex-col items-center">
                <BookOpenIcon className="h-16 w-16 text-gray-300 mb-3" />
                <p className="lsn-text-primary font-bold text-gray-600 text-base">
                  {searchTerm || selectedCourse || selectedYear !== 'all'
                    ? t('មិនឃើញលទ្ធផលស្វែងរក', 'No search results found')
                    : t('មិនទាន់មានមេរៀននៅឡើយទេ', 'No lessons available yet')}
                </p>
                <p className="lsn-text-secondary text-sm text-gray-400 mt-1">
                  {selectedYear === 'all'
                    ? t(
                        'សូមចុចជ្រើសរើសកាតឆ្នាំសិក្សាខាងលើ ដើម្បីបន្ថែមមេរៀនថ្មី',
                        'Select an academic year card above to add new lessons'
                      )
                    : t(
                        'ចុចប៊ូតុង «បន្ថែមមេរៀនថ្មី» ខាងលើដើម្បីចាប់ផ្តើម',
                        'Click "Add New Lesson" above to get started'
                      )}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLessons.map((lesson, index) => {
                const isExpanded = expandedLesson === lesson.id;
                const filesCount = lesson.files?.length || 0;
                const videosCount = lesson.videos?.length || 0;
                const matchedCourse =
                  lesson.course ||
                  courses.find((c) => String(c.id) === String(lesson.course_id));

                return (
                  <div
                    key={lesson.id}
                    className={`lsn-card bg-white border rounded-[1.25rem] shadow-sm transition-all duration-300 ${
                      isExpanded
                        ? 'border-blue-400 ring-4 ring-blue-500/10'
                        : 'border-gray-200 hover:border-blue-200 hover:shadow-md'
                    }`}
                  >
                    {/* ផ្ទៃកាតខាងលើ (Main Card Info) */}
                    <div
                      className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 cursor-pointer"
                      onClick={() => handleToggleExpandLesson(lesson.id)}
                    >
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div
                          className={`flex items-center justify-center w-12 h-12 rounded-2xl font-black text-sm shrink-0 transition-colors ${
                            isExpanded
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'lsn-order-badge bg-gray-100 text-gray-600'
                          }`}
                        >
                          {lesson.lesson_order || index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="lsn-text-primary text-base font-extrabold text-gray-900 truncate pr-4">
                            {lesson.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="lsn-badge-blue text-[11px] text-blue-700 font-bold bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg truncate max-w-[300px]">
                              {matchedCourse?.course_name ||
                                t('គ្មានមុខវិជ្ជា', 'No Course')}
                            </span>
                          </div>
                          {lesson.description && (
                            <p className="lsn-text-secondary text-xs text-gray-500 mt-2.5 line-clamp-2 leading-relaxed font-medium">
                              {lesson.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* ផ្នែកខាងស្តាំ (Badges & Actions) */}
                      <div
                        className="flex items-center gap-4 shrink-0 pl-12 md:pl-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex gap-2">
                          <span
                            className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                              filesCount > 0
                                ? 'lsn-badge-indigo bg-indigo-50 text-indigo-700 border-indigo-100'
                                : 'lsn-badge-muted bg-gray-50 text-gray-500 border-gray-100'
                            }`}
                          >
                            <DocumentIcon className="h-4 w-4 mr-1.5" /> {filesCount}{' '}
                            {t('ឯកសារ', 'Files')}
                          </span>
                          <span
                            className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                              videosCount > 0
                                ? 'lsn-badge-purple bg-purple-50 text-purple-700 border-purple-100'
                                : 'lsn-badge-muted bg-gray-50 text-gray-500 border-gray-100'
                            }`}
                          >
                            <VideoCameraIcon className="h-4 w-4 mr-1.5" />{' '}
                            {videosCount} {t('វីដេអូ', 'Videos')}
                          </span>
                        </div>

                        <div className="lsn-divider-left flex items-center space-x-1 border-l border-gray-100 pl-4">
                          <button
                            type="button"
                            onClick={() => openEditModal(lesson)}
                            className="lsn-action-edit p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                            title={t('កែប្រែ', 'Edit')}
                          >
                            <PencilSquareIcon className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(lesson)}
                            className="lsn-action-delete p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                            title={t('លុប', 'Delete')}
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleExpandLesson(lesson.id)}
                            className={`lsn-expand-btn p-2 rounded-xl transition-all cursor-pointer ${
                              isExpanded
                                ? 'bg-gray-100 text-gray-800'
                                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                            }`}
                            title={isExpanded ? t('បិទ', 'Close') : t('បើកមើល', 'Expand')}
                          >
                            {isExpanded ? (
                              <ChevronUpIcon className="h-5 w-5" />
                            ) : (
                              <ChevronDownIcon className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ផ្ទៃកាតទម្លាក់ចុះក្រោម (Expanded Content: Files & Videos) */}
                    {isExpanded && (
                      <div className="lsn-expanded-bg bg-slate-50/80 border-t border-gray-100 rounded-b-[1.25rem] p-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
                          
                          {/* ផ្នែកឯកសារមេរៀន (Files Section) */}
                          <div className="lsn-subcard bg-white p-6 rounded-[1.25rem] border border-gray-200/60 shadow-sm flex flex-col h-full">
                            <div className="lsn-divider-bottom flex items-center justify-between mb-5 border-b border-gray-100 pb-4">
                              <h4 className="lsn-text-primary text-base font-extrabold text-gray-900 flex items-center gap-3">
                                <span className="lsn-badge-indigo p-2 bg-indigo-50 rounded-xl text-indigo-600 shadow-inner">
                                  <DocumentIcon className="h-5 w-5" />
                                </span>
                                {t('ឯកសារមេរៀន', 'Lesson Files')}
                                <span className="lsn-count-pill text-xs font-bold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg ml-2">
                                  {filesCount}
                                </span>
                              </h4>
                            </div>

                            <div className="space-y-3 mb-6 flex-1 max-h-[280px] overflow-y-auto pr-2 custom-scrollbar">
                              {filesCount === 0 ? (
                                <div className="lsn-empty-sub flex flex-col items-center justify-center h-32 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200">
                                  <DocumentIcon className="w-8 h-8 text-gray-300 mb-2" />
                                  <p className="lsn-text-secondary text-sm font-bold text-gray-500">
                                    {t('មិនទាន់មានឯកសារទេ', 'No uploaded files')}
                                  </p>
                                </div>
                              ) : (
                                Array.isArray(lesson.files) &&
                                lesson.files.map((file) => (
                                  <div
                                    key={file.id}
                                    className="lsn-media-item group flex items-center justify-between p-3.5 bg-white border border-gray-100 hover:border-indigo-300 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300"
                                  >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                      <div className="lsn-badge-indigo p-2.5 bg-indigo-50/80 text-indigo-600 rounded-xl shrink-0">
                                        <DocumentIcon className="w-5 h-5" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p
                                          className="lsn-text-primary text-sm font-extrabold text-gray-800 truncate"
                                          title={file.file_name}
                                        >
                                          {file.file_name}
                                        </p>
                                        <p className="lsn-text-secondary text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                                          Document File
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <a
                                        href={getStorageUrl(file.file_path)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="lsn-badge-blue p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-colors duration-300"
                                        title={t('ទាញយក', 'Download')}
                                      >
                                        <ArrowDownTrayIcon className="w-4 h-4 stroke-[2.5]" />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteFileClick(file)}
                                        className="lsn-badge-rose p-2 bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl transition-colors duration-300 cursor-pointer"
                                        title={t('លុប', 'Delete')}
                                      >
                                        <TrashIcon className="w-4 h-4 stroke-[2.5]" />
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>

                            <div className="lsn-divider-top pt-4 border-t border-gray-100 mt-auto">
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingFileId === lesson.id}
                                className="lsn-upload-btn w-full flex items-center justify-center gap-2 px-4 py-3.5 border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/30 hover:bg-indigo-50 text-indigo-700 text-sm font-extrabold rounded-2xl transition-all duration-300 cursor-pointer disabled:opacity-50"
                              >
                                {uploadingFileId === lesson.id ? (
                                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                ) : (
                                  <PaperClipIcon className="h-5 w-5" />
                                )}
                                {t('ផ្ទុកឡើងឯកសារថ្មី', 'Upload New File')}
                              </button>
                              <input
                                ref={fileInputRef}
                                type="file"
                                onChange={(e) => handleUploadFile(lesson.id, e)}
                                className="hidden"
                                accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls"
                              />
                            </div>
                          </div>

                          {/* ផ្នែកវីដេអូបង្រៀន (Videos Section) */}
                          <div className="lsn-subcard bg-white p-6 rounded-[1.25rem] border border-gray-200/60 shadow-sm flex flex-col h-full">
                            <div className="lsn-divider-bottom flex flex-wrap items-center justify-between gap-2 mb-5 border-b border-gray-100 pb-4">
                              <h4 className="lsn-text-primary text-base font-extrabold text-gray-900 flex items-center gap-3">
                                <span className="lsn-badge-purple p-2 bg-purple-50 rounded-xl text-purple-600 shadow-inner">
                                  <VideoCameraIcon className="h-5 w-5" />
                                </span>
                                {t('វីដេអូបង្រៀន', 'Teaching Videos')}
                                <span className="lsn-count-pill text-xs font-bold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg">
                                  {videosCount}
                                </span>
                              </h4>

                              <div className="lsn-mode-switch inline-flex bg-gray-100 p-1 rounded-xl">
                                <button
                                  type="button"
                                  onClick={() => setVideoInputMode('file')}
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                                    videoInputMode === 'file'
                                      ? 'bg-purple-600 text-white shadow-2xs'
                                      : 'lsn-text-secondary text-gray-600 hover:text-gray-900'
                                  }`}
                                >
                                  {t('ផ្ទុកហ្វាល់', 'Upload File')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setVideoInputMode('url')}
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                                    videoInputMode === 'url'
                                      ? 'bg-purple-600 text-white shadow-2xs'
                                      : 'lsn-text-secondary text-gray-600 hover:text-gray-900'
                                  }`}
                                >
                                  {t('លីង YouTube', 'YouTube Link')}
                                </button>
                              </div>
                            </div>

                            <div className="space-y-3 mb-6 flex-1 max-h-[280px] overflow-y-auto pr-2 custom-scrollbar">
                              {videosCount === 0 ? (
                                <div className="lsn-empty-sub flex flex-col items-center justify-center h-32 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200">
                                  <VideoCameraIcon className="w-8 h-8 text-gray-300 mb-2" />
                                  <p className="lsn-text-secondary text-sm font-bold text-gray-500">
                                    {t('មិនទាន់មានវីដេអូទេ', 'No uploaded videos')}
                                  </p>
                                </div>
                              ) : (
                                Array.isArray(lesson.videos) &&
                                lesson.videos.map((video) => (
                                  <div
                                    key={video.id}
                                    className="lsn-media-item group flex items-center justify-between p-3.5 bg-white border border-gray-100 hover:border-purple-300 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300"
                                  >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                      <div className="lsn-badge-purple p-2.5 bg-purple-50/80 text-purple-600 rounded-xl shrink-0">
                                        <PlayIcon className="w-5 h-5 ml-0.5" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p
                                          className="lsn-text-primary text-sm font-extrabold text-gray-800 truncate"
                                          title={video.title}
                                        >
                                          {video.title}
                                        </p>
                                        <p className="lsn-text-secondary text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                                          Video / Link
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <a
                                        href={getVideoUrl(video.video_url)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="lsn-badge-emerald p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-colors duration-300"
                                        title={t('មើលវីដេអូ', 'Watch Video')}
                                      >
                                        <PlayIcon className="w-4 h-4 stroke-[2.5]" />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteVideoClick(video)}
                                        className="lsn-badge-rose p-2 bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl transition-colors duration-300 cursor-pointer"
                                        title={t('លុប', 'Delete')}
                                      >
                                        <TrashIcon className="w-4 h-4 stroke-[2.5]" />
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>

                            <div className="lsn-divider-top pt-4 border-t border-gray-100 mt-auto">
                              {videoInputMode === 'file' ? (
                                <div className="lsn-video-input-box flex gap-2 p-1.5 bg-purple-50/50 border border-purple-100 rounded-2xl focus-within:ring-2 focus-within:ring-purple-300 transition-all">
                                  <input
                                    type="text"
                                    placeholder={t(
                                      'បញ្ចូលចំណងជើងវីដេអូមុនផ្ទុកឡើង...',
                                      'Enter video title before uploading...'
                                    )}
                                    value={videoTitle}
                                    onChange={(e) => setVideoTitle(e.target.value)}
                                    className="lsn-transparent-input flex-1 px-4 py-2.5 text-sm font-semibold border-none bg-transparent focus:outline-none focus:ring-0 text-gray-800 placeholder-gray-400"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => videoFileInputRef.current?.click()}
                                    disabled={
                                      uploadingVideoId === lesson.id ||
                                      !videoTitle.trim()
                                    }
                                    className="inline-flex items-center justify-center px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
                                  >
                                    {uploadingVideoId === lesson.id ? (
                                      <ArrowPathIcon className="h-5 w-5 animate-spin mr-2" />
                                    ) : (
                                      <VideoCameraIcon className="h-5 w-5 mr-2" />
                                    )}
                                    {t('ផ្ទុកឡើង', 'Upload')}
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    placeholder={t(
                                      'ចំណងជើងវីដេអូ...',
                                      'Video title...'
                                    )}
                                    value={videoTitle}
                                    onChange={(e) => setVideoTitle(e.target.value)}
                                    className="lsn-input w-full px-3.5 py-2 text-xs font-semibold border border-purple-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                  />
                                  <div className="flex gap-2">
                                    <input
                                      type="url"
                                      placeholder="https://www.youtube.com/watch?v=..."
                                      value={videoUrlInput}
                                      onChange={(e) =>
                                        setVideoUrlInput(e.target.value)
                                      }
                                      className="lsn-input flex-1 px-3.5 py-2 text-xs font-semibold border border-purple-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleAddVideoUrl(lesson.id)}
                                      disabled={
                                        uploadingVideoId === lesson.id ||
                                        !videoTitle.trim() ||
                                        !videoUrlInput.trim()
                                      }
                                      className="inline-flex items-center justify-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
                                    >
                                      {uploadingVideoId === lesson.id ? (
                                        <ArrowPathIcon className="h-4 w-4 animate-spin mr-1.5" />
                                      ) : (
                                        <LinkIcon className="h-4 w-4 mr-1.5" />
                                      )}
                                      {t('ភ្ជាប់លីង', 'Attach')}
                                    </button>
                                  </div>
                                </div>
                              )}
                              <input
                                ref={videoFileInputRef}
                                type="file"
                                onChange={(e) => handleUploadVideo(lesson.id, e)}
                                className="hidden"
                                accept="video/mp4,video/x-m4v,video/*"
                              />
                            </div>
                          </div>

                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 5. MODAL - Add/Edit Lesson                                         */}
      {/* ------------------------------------------------------------------ */}
      {showAddModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
          <div className="lsn-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            <div className="lsn-modal-bar flex justify-between items-center p-6 sm:p-8 border-b border-gray-100">
              <h2 className="lsn-text-primary text-xl font-extrabold text-gray-900 flex items-center gap-2">
                <span className="lsn-badge-indigo bg-indigo-100 text-indigo-600 p-2.5 rounded-xl border border-indigo-200">
                  <BookOpenIcon className="h-6 w-6" />
                </span>
                {editingLesson
                  ? t('កែប្រែមេរៀន', 'Edit Lesson')
                  : t('បន្ថែមមេរៀនថ្មី', 'Add New Lesson')}
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="lsn-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto flex-1">
              <form id="lessonForm" onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="lsn-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('មុខវិជ្ជា', 'Course')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="course_id"
                      required
                      value={formData.course_id}
                      onChange={handleInputChange}
                      className="lsn-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white font-medium text-gray-800 transition-all shadow-sm cursor-pointer"
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
                  <div>
                    <label className="lsn-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('លំដាប់លំដោយមេរៀន', 'Lesson Order')}{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      name="lesson_order"
                      min="1"
                      required
                      value={formData.lesson_order}
                      onChange={handleInputChange}
                      className="lsn-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="lsn-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('ចំណងជើងមេរៀន', 'Lesson Title')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="title"
                    required
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder=""
                    className="lsn-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                  />
                </div>

                <div>
                  <label className="lsn-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('ការពណ៌នាសង្ខេប', 'Description')}
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder={t('ពិពណ៌នាអំពីមេរៀន...', 'Describe the lesson...')}
                    className="lsn-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all resize-none shadow-sm"
                  />
                </div>

                <div className="lsn-box-muted bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                  <label className="lsn-label block text-sm font-bold text-gray-700 mb-2">
                    {t(
                      'ផ្ទុកឡើងឯកសារភ្ជាប់ (PDF, DOCX, ជាដើម)',
                      'Upload Files (PDF, DOCX, etc.)'
                    )}
                  </label>
                  <label className="lsn-dropzone flex flex-col items-center justify-center w-full h-24 border-2 border-gray-300 border-dashed rounded-xl cursor-pointer bg-white hover:bg-indigo-50/50 hover:border-indigo-400 transition-all">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <PaperClipIcon className="w-6 h-6 mb-2 text-gray-400" />
                      <p className="lsn-text-secondary text-sm font-bold text-gray-600">
                        {t('ចុចទីនេះដើម្បីជ្រើសរើសឯកសារ', 'Click here to select files')}
                      </p>
                    </div>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                      accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls"
                    />
                  </label>

                  {selectedFiles.length > 0 && (
                    <div className="mt-3 space-y-2 max-h-[150px] overflow-y-auto pr-1">
                      {selectedFiles.map((file, index) => (
                        <div
                          key={index}
                          className="lsn-media-item flex items-center justify-between bg-white border border-gray-200 px-4 py-2.5 rounded-xl shadow-sm"
                        >
                          <span className="lsn-text-primary text-xs font-bold text-gray-700 truncate max-w-[80%]">
                            {file.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="lsn-badge-rose text-rose-500 hover:text-rose-700 bg-rose-50 p-1.5 rounded-md transition cursor-pointer"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="lsn-box-purple bg-purple-50/30 p-4 rounded-2xl border border-purple-100/50">
                  <label className="lsn-label block text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                    <VideoCameraIcon className="h-5 w-5 text-purple-600" />
                    {t('ភ្ជាប់វីដេអូពី (YouTube URL)', 'Attach Video (YouTube URL)')}
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder={t('ចំណងជើងវីដេអូ...', 'Video title...')}
                      value={youtubeVideo.title}
                      onChange={(e) =>
                        setYoutubeVideo({ ...youtubeVideo, title: e.target.value })
                      }
                      className="lsn-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 font-medium transition-all shadow-sm bg-white"
                    />
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <LinkIcon className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="url"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={youtubeVideo.url}
                        onChange={(e) =>
                          setYoutubeVideo({ ...youtubeVideo, url: e.target.value })
                        }
                        className="lsn-input w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 font-medium transition-all shadow-sm bg-white"
                      />
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="lsn-modal-bar p-6 sm:p-8 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50 shrink-0">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="lsn-cancel-btn px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                type="submit"
                form="lessonForm"
                disabled={isSubmitting}
                className="px-6 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                ) : (
                  <BookOpenIcon className="h-5 w-5" />
                )}
                {editingLesson
                  ? t('រក្សាទុកការកែប្រែ', 'Save Changes')
                  : t('បង្កើតមេរៀន', 'Create Lesson')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 6. Delete Lesson Confirmation Modal                                */}
      {/* ------------------------------------------------------------------ */}
      {showDeleteModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="lsn-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fadeIn border border-transparent">
            <div className="lsn-delete-title flex items-center text-rose-600 mb-5">
              <div className="lsn-badge-rose p-2 bg-rose-100 rounded-full mr-3 border border-rose-200">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-extrabold">
                {t('បញ្ជាក់ការលុប', 'Confirm Deletion')}
              </h3>
            </div>
            <p className="lsn-text-secondary text-sm font-medium text-gray-600 mb-6 leading-relaxed">
              {t(
                'តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបមេរៀន',
                'Are you sure you want to delete lesson'
              )}{' '}
              «
              <span className="lsn-text-primary font-extrabold text-gray-900">
                {selectedLesson?.title}
              </span>
              » {t('នេះមែនទេ?', 'this lesson?')}
              <br />
              <br />
              <span className="lsn-warning-box text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100 block">
                {t(
                  '* ឯកសារ និងវីដេអូទាំងអស់របស់មេរៀននេះនឹងត្រូវលុបចោលទាំងស្រុងពីប្រព័ន្ធ។',
                  '* All files and videos in this lesson will be permanently deleted.'
                )}
              </span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedLesson(null);
                }}
                className="lsn-cancel-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
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

      {/* ------------------------------------------------------------------ */}
      {/* 7. Delete File / Video Confirmation Modal                          */}
      {/* ------------------------------------------------------------------ */}
      {deleteMediaTarget && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="lsn-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fadeIn border border-transparent">
            <div className="lsn-delete-title flex items-center text-rose-600 mb-5">
              <div className="lsn-badge-rose p-2 bg-rose-100 rounded-full mr-3 border border-rose-200">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-extrabold">
                {t('បញ្ជាក់ការលុប', 'Confirm Deletion')}
              </h3>
            </div>
            <p className="lsn-text-secondary text-sm font-medium text-gray-600 mb-6 leading-relaxed">
              {deleteMediaTarget.type === 'file'
                ? t(
                    'តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបឯកសារ',
                    'Are you sure you want to delete file'
                  )
                : t(
                    'តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបវីដេអូ',
                    'Are you sure you want to delete video'
                  )}{' '}
              «
              <span className="lsn-text-primary font-extrabold text-gray-900 break-all">
                {deleteMediaTarget.name}
              </span>
              » {t('នេះមែនទេ?', 'this item?')}
              <br />
              <br />
              <span className="lsn-warning-box text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100 block">
                {deleteMediaTarget.type === 'file'
                  ? t(
                      '* ឯកសារនេះនឹងត្រូវលុបចោលទាំងស្រុងចេញពីមេរៀន។',
                      '* This file will be permanently deleted from the lesson.'
                    )
                  : t(
                      '* វីដេអូនេះនឹងត្រូវលុបចោលទាំងស្រុងចេញពីមេរៀន។',
                      '* This video will be permanently deleted from the lesson.'
                    )}
              </span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setDeleteMediaTarget(null)}
                className="lsn-cancel-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDeleteMedia}
                className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-all shadow-md cursor-pointer"
              >
                {t('លុបចោល', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 📌 8. CSS សម្រាប់កំណត់ពណ៌ទម្រង់យប់ (Dark Mode Styling)                 */}
      {/* ------------------------------------------------------------------ */}
      <style>{`
        html.dark .lsn-page-bg {
          background-color: transparent !important;
        }
        html.dark .lsn-surface-card,
        html.dark .lsn-card,
        html.dark .lsn-year-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .lsn-year-card:hover {
          background-color: #263449 !important;
        }
        html.dark .lsn-table-bar {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .lsn-list-container {
          background-color: rgba(15, 23, 42, 0.35) !important;
        }
        html.dark .lsn-expanded-bg {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .lsn-subcard,
        html.dark .lsn-media-item,
        html.dark .lsn-empty-box {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .lsn-empty-sub,
        html.dark .lsn-box-muted,
        html.dark .lsn-dropzone {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .lsn-box-purple,
        html.dark .lsn-video-input-box {
          background-color: rgba(168, 85, 247, 0.08) !important;
          border-color: rgba(168, 85, 247, 0.25) !important;
        }
        html.dark .lsn-transparent-input {
          color: #f8fafc !important;
        }
        html.dark .lsn-text-primary {
          color: #f8fafc !important;
        }
        html.dark .lsn-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .lsn-label {
          color: #cbd5e1 !important;
        }
        html.dark .lsn-order-badge,
        html.dark .lsn-count-pill,
        html.dark .lsn-mode-switch {
          background-color: #0f172a !important;
          color: #cbd5e1 !important;
        }
        html.dark .lsn-divider-left,
        html.dark .lsn-divider-bottom,
        html.dark .lsn-divider-top {
          border-color: #334155 !important;
        }
        html.dark .lsn-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        html.dark .lsn-input::placeholder {
          color: #64748b !important;
        }
        html.dark .lsn-badge-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .lsn-badge-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          color: #818cf8 !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .lsn-badge-purple {
          background-color: rgba(168, 85, 247, 0.15) !important;
          color: #c084fc !important;
          border-color: rgba(168, 85, 247, 0.3) !important;
        }
        html.dark .lsn-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .lsn-badge-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
        html.dark .lsn-badge-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .lsn-badge-muted {
          background-color: #0f172a !important;
          color: #94a3b8 !important;
          border-color: #334155 !important;
        }
        html.dark .lsn-upload-btn {
          background-color: rgba(99, 102, 241, 0.1) !important;
          border-color: rgba(99, 102, 241, 0.35) !important;
          color: #818cf8 !important;
        }
        html.dark .lsn-upload-btn:hover {
          background-color: rgba(99, 102, 241, 0.2) !important;
        }
        html.dark .lsn-action-edit {
          color: #818cf8 !important;
        }
        html.dark .lsn-action-edit:hover {
          background-color: rgba(99, 102, 241, 0.18) !important;
        }
        html.dark .lsn-action-delete {
          color: #fb7185 !important;
        }
        html.dark .lsn-action-delete:hover {
          background-color: rgba(244, 63, 94, 0.18) !important;
        }
        html.dark .lsn-expand-btn {
          background-color: #0f172a !important;
          color: #cbd5e1 !important;
        }
        html.dark .lsn-modal-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .lsn-modal-bar {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
        }
        html.dark .lsn-close-btn,
        html.dark .lsn-cancel-btn {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .lsn-delete-title {
          color: #fb7185 !important;
        }
        html.dark .lsn-warning-box {
          background-color: rgba(244, 63, 94, 0.12) !important;
          border-color: rgba(244, 63, 94, 0.25) !important;
          color: #fda4af !important;
        }
      `}</style>
    </div>
  );
}
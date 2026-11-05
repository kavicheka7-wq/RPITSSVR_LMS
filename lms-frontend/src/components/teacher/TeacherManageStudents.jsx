// src/components/teacher/TeacherManageStudents.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import XLSX from 'xlsx-js-style';
import {
  UserGroupIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  AcademicCapIcon,
  ChevronDownIcon,
  BookOpenIcon,
  DocumentIcon,
  Squares2X2Icon,
  CalendarDaysIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនីគ្រូម្នាក់ៗ (User-Scoped 0ms Cache)
// ============================================================================
const CACHE_KEY_SHARED_STUDENTS = 'cached_teacher_students_list_v6';
const CACHE_KEY_SHARED_COURSES = 'cached_teacher_courses_list_v6';
const CACHE_KEY_SHARED_MAP = 'cached_teacher_course_map_v6';

const getStudentsCacheKey = (uid) => `cached_teacher_students_list_v8_${uid}`;
const getCoursesCacheKey = (uid) => `cached_teacher_courses_list_v8_${uid}`;
const getCourseMapCacheKey = (uid) => `cached_teacher_course_map_v8_${uid}`;
const getSelectedYearKey = (uid) => `cached_teacher_selected_year_${uid}`;
const getSelectedCourseKey = (uid) => `cached_teacher_selected_course_${uid}`;
const getSelectedShiftKey = (uid) => `cached_teacher_selected_shift_${uid}`;

// ✅ Global In-Memory Cache បែងចែកតាម uid របស់គ្រូម្នាក់ៗ
const MEMORY_CACHE = {
  uid: null,
  students: null,
  courses: null,
  courseMap: null,
  lastFetchedAt: 0,
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

// ✅ អនុគមន៍ទាញយកបញ្ជី Course IDs ទាំងអស់ដែលសិស្សម្នាក់បានចុះឈ្មោះរៀនពិតប្រាកដ
const extractStudentCourseIds = (student) => {
  if (!student) return [];
  const ids = new Set();

  if (student.course_id) ids.add(String(student.course_id));
  if (student.pivot?.course_id) ids.add(String(student.pivot.course_id));

  if (Array.isArray(student.enrolled_course_ids)) {
    student.enrolled_course_ids.forEach((id) => {
      if (id !== null && id !== undefined) ids.add(String(id));
    });
  }
  if (Array.isArray(student.course_ids)) {
    student.course_ids.forEach((id) => {
      if (id !== null && id !== undefined) ids.add(String(id));
    });
  }
  if (Array.isArray(student.courses)) {
    student.courses.forEach((c) => {
      const cid = c?.id ?? c?.course_id ?? c?.pivot?.course_id ?? c;
      if (cid !== null && cid !== undefined && typeof cid !== 'object')
        ids.add(String(cid));
    });
  }
  if (Array.isArray(student.enrollments)) {
    student.enrollments.forEach((e) => {
      const cid = e?.course_id ?? e?.course?.id ?? e;
      if (cid !== null && cid !== undefined && typeof cid !== 'object')
        ids.add(String(cid));
    });
  }

  return Array.from(ids);
};

// ✅ អនុគមន៍ត្រួតពិនិត្យថាតើសិស្សម្នាក់បានចុះឈ្មោះក្នុងមុខវិជ្ជា (courseId) មែនឬអត់
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

// ✅ អនុគមន៍ត្រួតពិនិត្យថាតើសិស្សម្នាក់បានចុះឈ្មោះយ៉ាងហោចណាស់ ១ មុខវិជ្ជារបស់គ្រូដែលបាន Login ឬអត់
const hasStudentEnrolledAnyTeacherCourse = (student, courses, courseMap) => {
  if (!student) return false;
  if (typeof student.is_enrolled_with_teacher === 'boolean') {
    return student.is_enrolled_with_teacher;
  }

  const directIds = extractStudentCourseIds(student);
  if (directIds.length > 0) return true;

  if (Array.isArray(courses) && courses.length > 0) {
    return courses.some((c) =>
      isStudentEnrolledInCourse(student, c.id, courseMap)
    );
  }

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
      id: `local_act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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

const TeacherManageStudents = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialRouteCourseId =
    searchParams.get('course_id') || location.state?.courseId || '';

  const currentTeacherId = useMemo(() => resolveTeacherUid(user), [user]);

  if (MEMORY_CACHE.uid && MEMORY_CACHE.uid !== currentTeacherId) {
    MEMORY_CACHE.students = null;
    MEMORY_CACHE.courses = null;
    MEMORY_CACHE.courseMap = null;
    MEMORY_CACHE.lastFetchedAt = 0;
  }
  MEMORY_CACHE.uid = currentTeacherId;

  const [students, setStudents] = useState(() => {
    if (Array.isArray(MEMORY_CACHE.students)) {
      return MEMORY_CACHE.students;
    }
    const fromUserKey = readStorageJson(
      getStudentsCacheKey(currentTeacherId),
      null
    );
    if (Array.isArray(fromUserKey)) {
      MEMORY_CACHE.students = fromUserKey;
      return fromUserKey;
    }
    return readStorageJson(CACHE_KEY_SHARED_STUDENTS, []);
  });

  const [courses, setCourses] = useState(() => {
    if (Array.isArray(MEMORY_CACHE.courses)) return MEMORY_CACHE.courses;
    const cached =
      readStorageJson(getCoursesCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES, []);
    MEMORY_CACHE.courses = cached;
    return cached;
  });

  const [courseMap, setCourseMap] = useState(() => {
    if (MEMORY_CACHE.courseMap) return MEMORY_CACHE.courseMap;
    const cached =
      readStorageJson(getCourseMapCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_MAP, {});
    MEMORY_CACHE.courseMap = cached;
    return cached;
  });

  const [searchTerm, setSearchTerm] = useState('');

  const [selectedYear, setSelectedYear] = useState(() => {
    if (initialRouteCourseId) {
      const enrolledInRouteCourse = (MEMORY_CACHE.students || []).find((s) =>
        isStudentEnrolledInCourse(
          s,
          initialRouteCourseId,
          MEMORY_CACHE.courseMap
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

  const [selectedShift, setSelectedShift] = useState(() => {
    try {
      return sessionStorage.getItem(getSelectedShiftKey(currentTeacherId)) || 'all';
    } catch {
      return 'all';
    }
  });

  useEffect(() => {
    if (initialRouteCourseId && students.length > 0) {
      const cid = String(initialRouteCourseId);
      setSelectedCourse(cid);
      const enrolledStudent = students.find((s) =>
        isStudentEnrolledInCourse(s, cid, courseMap)
      );
      const detectedY = detectStudentYearNum(enrolledStudent);
      if (detectedY) {
        setSelectedYear(detectedY);
      }
    }
  }, [initialRouteCourseId, students, courseMap]);

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

    if (Array.isArray(cachedStd)) {
      setStudents(cachedStd);
      MEMORY_CACHE.students = cachedStd;
    }
    if (Array.isArray(cachedCrs)) {
      setCourses(cachedCrs);
      MEMORY_CACHE.courses = cachedCrs;
    }
    if (cachedMap) {
      setCourseMap(cachedMap);
      MEMORY_CACHE.courseMap = cachedMap;
    }

    const now = Date.now();
    if (
      MEMORY_CACHE.uid === currentTeacherId &&
      Array.isArray(MEMORY_CACHE.students) &&
      Array.isArray(MEMORY_CACHE.courses) &&
      MEMORY_CACHE.courseMap &&
      now - MEMORY_CACHE.lastFetchedAt < 25000
    ) {
      return;
    }

    api
      .get('/teacher/students')
      .then((stdRes) => {
        if (!isMounted) return;
        const rawStd = stdRes.data?.data || stdRes.data || [];
        const latestStudents = Array.isArray(rawStd) ? rawStd : [];
        setStudents(latestStudents);
        MEMORY_CACHE.students = latestStudents;
        MEMORY_CACHE.lastFetchedAt = Date.now();
        try {
          localStorage.setItem(
            getStudentsCacheKey(currentTeacherId),
            JSON.stringify(latestStudents)
          );
          localStorage.setItem(
            CACHE_KEY_SHARED_STUDENTS,
            JSON.stringify(latestStudents)
          );
        } catch (e) {}

        if (stdRes.data?.course_students_map) {
          setCourseMap(stdRes.data.course_students_map);
          MEMORY_CACHE.courseMap = stdRes.data.course_students_map;
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
      .catch((error) => {
        console.error('Error syncing teacher students:', error);
      });

    api
      .get('/teacher/courses')
      .then((crsRes) => {
        if (!isMounted) return;
        const rawCrs = crsRes.data?.data || crsRes.data || [];
        const latestCourses = Array.isArray(rawCrs) ? rawCrs : [];
        setCourses(latestCourses);
        MEMORY_CACHE.courses = latestCourses;
        try {
          localStorage.setItem(
            getCoursesCacheKey(currentTeacherId),
            JSON.stringify(latestCourses)
          );
          localStorage.setItem(
            CACHE_KEY_SHARED_COURSES,
            JSON.stringify(latestCourses)
          );
        } catch (e) {}
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [currentTeacherId]);

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ ការគណនាចំនួនសិស្សលើកាតឆ្នាំទី១-ទី៤ និងការច្រោះមុខវិជ្ជា
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

  const yearCounts = useMemo(() => {
    const counts = { all: 0, '1': 0, '2': 0, '3': 0, '4': 0 };
    if (!Array.isArray(students)) return counts;

    counts.all = students.length;
    students.forEach((s) => {
      const y = detectStudentYearNum(s);
      if (y && counts[y] !== undefined) {
        counts[y] += 1;
      }
    });
    return counts;
  }, [students]);

  const enrichedCourses = useMemo(() => {
    if (!Array.isArray(courses)) return [];

    return courses.map((course) => {
      const cid = String(course.id);

      const enrolledList = (students || []).filter((s) =>
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
        yearsInCourse: sortedYears,
        primaryYear,
      };
    });
  }, [courses, students, courseMap]);

  const visibleCoursesForSelectedYear = useMemo(() => {
    if (selectedYear === 'all' || !selectedYear) return [];
    const targetYear = String(selectedYear);

    const studentsInThisYear = (students || []).filter(
      (s) => detectStudentYearNum(s) === targetYear
    );

    const matched = enrichedCourses.filter(
      (course) =>
        studentsInThisYear.some((s) =>
          isStudentEnrolledInCourse(s, course.id, courseMap)
        ) ||
        (Array.isArray(course.yearsInCourse) &&
          course.yearsInCourse.includes(targetYear))
    );

    return matched.length > 0 ? matched : enrichedCourses;
  }, [enrichedCourses, students, courseMap, selectedYear]);

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

  const getStudentExtraDepartmentNames = useCallback(
    (student) => {
      if (!student || !Array.isArray(courses) || courses.length === 0) return [];
      const primaryDeptName = (
        student.department?.department_name ||
        student.department?.name ||
        ''
      ).trim();

      const extraNames = new Set();

      courses.forEach((matchedCourse) => {
        if (isStudentEnrolledInCourse(student, matchedCourse.id, courseMap)) {
          const cDeptName = (
            matchedCourse?.department?.department_name ||
            matchedCourse?.department?.name ||
            ''
          ).trim();
          if (cDeptName && cDeptName !== primaryDeptName) {
            extraNames.add(cDeptName);
          }
        }
      });

      return Array.from(extraNames);
    },
    [courses, courseMap]
  );

  // ✅ ច្រោះបញ្ជីសិស្សតាម «កាតឆ្នាំសិក្សា» និងតាម «មុខវិជ្ជា»
  const studentsByYearAndCourse = useMemo(() => {
    if (!Array.isArray(students)) return [];

    return students.filter((student) => {
      if (selectedYear !== 'all' && selectedYear !== '') {
        const stuYear = detectStudentYearNum(student);
        if (stuYear !== String(selectedYear)) return false;
      }

      if (selectedYear !== 'all' && selectedCourse !== '') {
        if (selectedCourse === 'not_enrolled') {
          return !hasStudentEnrolledAnyTeacherCourse(
            student,
            courses,
            courseMap
          );
        }
        return isStudentEnrolledInCourse(student, selectedCourse, courseMap);
      }

      return true;
    });
  }, [students, courses, courseMap, selectedYear, selectedCourse]);

  const shiftCounts = useMemo(() => {
    let monFri = 0;
    let satSun = 0;

    studentsByYearAndCourse.forEach((s) => {
      const norm = normalizeShiftKey(s.study_shift);
      if (norm === 'Saturday-Sunday') satSun += 1;
      else monFri += 1;
    });

    return {
      all: studentsByYearAndCourse.length,
      'Monday-Friday': monFri,
      'Saturday-Sunday': satSun,
    };
  }, [studentsByYearAndCourse]);

  const filteredStudents = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();

    const filtered = studentsByYearAndCourse.filter((student) => {
      const matchesShift =
        !isSpecificShiftSelected ||
        normalizeShiftKey(student.study_shift) === selectedShift;
      if (!matchesShift) return false;

      if (!search) return true;
      const fullName = `${student.first_name || ''} ${student.last_name || ''}`.toLowerCase();
      const reverseName = `${student.last_name || ''} ${student.first_name || ''}`.toLowerCase();
      const deptName = (
        student.department?.name ||
        student.department?.department_name ||
        ''
      ).toLowerCase();

      return (
        fullName.includes(search) ||
        reverseName.includes(search) ||
        student.first_name?.toLowerCase()?.includes(search) ||
        student.last_name?.toLowerCase()?.includes(search) ||
        student.email?.toLowerCase()?.includes(search) ||
        student.phone?.toLowerCase()?.includes(search) ||
        student.student_code?.toLowerCase()?.includes(search) ||
        student.batch_year?.toString().toLowerCase()?.includes(search) ||
        deptName.includes(search)
      );
    });

    return sortStudentsOldestFirst(filtered);
  }, [studentsByYearAndCourse, selectedShift, isSpecificShiftSelected, searchTerm]);

  // ============================================================================
  // 📌 ផ្នែកទី៤៖ មុខងារបកប្រែផ្លាកព័ត៌មាន និងនាំចេញឯកសារ Excel (.xlsx)
  // ============================================================================
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

  const getDegreeLevelLabel = (level) => {
    if (language === 'km') {
      const levels = {
        'Associate Degree': 'បរិញ្ញាបត្ររង',
        'Bachelor Degree': 'បរិញ្ញាបត្រ',
        'Master Degree': 'បរិញ្ញាបត្រជាន់ខ្ពស់',
      };
      return levels[level] || level || '—';
    }
    return level || '—';
  };

  const getProfileImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http') || imagePath.startsWith('data:')) {
      return imagePath;
    }
    const baseUrl = (
      import.meta.env.VITE_API_URL || 'http://localhost:8000'
    ).replace(/\/api\/?$/, '');
    const cleanPath = imagePath.replace(/^\/?storage\//, '').replace(/^\/+/, '');
    return `${baseUrl}/storage/${cleanPath}`;
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

    if (colWidths.length > 0) {
      worksheet['!cols'] = colWidths;
    }

    const rows = [];
    for (let R = range.s.r; R <= range.e.r; ++R) {
      rows.push({ hpt: R === 0 ? 28 : 22 });
    }
    worksheet['!rows'] = rows;
  };

  const activeCourseObj = useMemo(() => {
    if (
      selectedYear === 'all' ||
      !selectedCourse ||
      selectedCourse === 'not_enrolled'
    )
      return null;
    return (
      enrichedCourses.find((c) => String(c.id) === String(selectedCourse)) ||
      null
    );
  }, [selectedYear, selectedCourse, enrichedCourses]);

  // នាំចេញ Excel
  const handleExportExcel = () => {
    if (!filteredStudents || filteredStudents.length === 0) {
      toast.warning(
        t('គ្មានទិន្នន័យសិស្សសម្រាប់នាំចេញទេ', 'No students data to export')
      );
      return;
    }

    const sortedForExport = sortStudentsOldestFirst(filteredStudents);

    const exportData = sortedForExport.map((student, idx) => {
      const isActive =
        (student.user?.status || student.status || 'active') === 'active';
      const primaryDept =
        student.department?.department_name ||
        student.department?.name ||
        '—';
      const extraDepts = getStudentExtraDepartmentNames(student);
      const deptDisplay =
        extraDepts.length > 0
          ? `${primaryDept} + ${extraDepts.join(' + ')}`
          : primaryDept;

      return {
        'ល.រ': idx + 1,
        'អត្តលេខសិស្ស': student.student_code || '',
        'នាមខ្លួន': student.first_name || '',
        'នាមត្រកូល': student.last_name || '',
        'ភេទ': getGenderLabel(student.gender),
        'អ៊ីមែល': student.email || '',
        'លេខទូរស័ព្ទ': student.phone || '',
        'ដេប៉ាតឺម៉ង់': deptDisplay,
        'ជំនាន់/ឆ្នាំសិក្សា': student.batch_year || '—',
        'កម្រិតសិក្សា': getDegreeLevelLabel(student.degree_level),
        'វេនសិក្សា': getStudyShiftLabel(student.study_shift),
        'ស្ថានភាព': isActive ? t('សកម្ម', 'Active') : t('អសកម្ម', 'Inactive'),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const colWidths = [
      { wch: 8 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 10 },
      { wch: 28 },
      { wch: 16 },
      { wch: 26 },
      { wch: 22 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
    ];
    applyExcelStyling(worksheet, colWidths, [1, 6]);

    const yearSuffix = selectedYear !== 'all' ? `_Year${selectedYear}` : '';
    const courseSuffix = activeCourseObj?.course_code
      ? `_${activeCourseObj.course_code}`
      : '';
    const shiftSuffix = isSpecificShiftSelected ? `_${selectedShift}` : '';
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'My_Students');
    XLSX.writeFile(
      workbook,
      `My_Department_Students${yearSuffix}${courseSuffix}${shiftSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    toast.success(
      t(
        'បាននាំចេញបញ្ជីសិស្សទៅជា Excel ដោយជោគជ័យ!',
        'Students list exported to Excel successfully!'
      )
    );

    const exportScopeKm = activeCourseObj
      ? `មុខវិជ្ជា «${activeCourseObj.course_name}»`
      : selectedYear !== 'all'
      ? getYearTextLabel(selectedYear)
      : 'ទាំងអស់';

    pushLocalNotification({
      titleKm: 'បាននាំចេញទិន្នន័យសិស្សទៅ Excel',
      titleEn: 'Students Exported to Excel',
      descKm: `បញ្ជីសិស្ស (${exportScopeKm} - ${filteredStudents.length} នាក់) ត្រូវបានទាញយកជា Excel ជោគជ័យ។`,
      descEn: `Exported ${filteredStudents.length} students to Excel successfully.`,
      category: 'export',
      link: '/teacher/students',
    });
  };

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
      iconBgInactive: 'bg-blue-50 text-blue-600 border-blue-100 tstd-badge-blue',
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
        'bg-emerald-50 text-emerald-600 border-emerald-100 tstd-badge-emerald',
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
        'bg-indigo-50 text-indigo-600 border-indigo-100 tstd-badge-indigo',
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
        'bg-amber-50 text-amber-600 border-amber-100 tstd-badge-amber',
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
      iconBgInactive: 'bg-rose-50 text-rose-600 border-rose-100 tstd-badge-rose',
    },
  ];

  const canShowExportExcel =
    (selectedYear !== 'all' || selectedCourse !== '') &&
    filteredStudents.length > 0;

  return (
    <div className="tstd-page-bg p-4 sm:p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6 pb-28 lg:pb-10">
      
      {/* ------------------------------------------------------------------ */}
      {/* 1. Header Banner                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-6 sm:p-8 shadow-xl border border-blue-900">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-[28px] lg:text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shrink-0">
                <UserGroupIcon className="h-7 w-7 sm:h-8 sm:w-8 text-yellow-400" />
              </div>
              <span>{t('សិស្សក្នុងមុខវិជ្ជារបស់ខ្ញុំ', 'My Enrolled Students')}</span>
            </h1>
            <p className="text-blue-200/80 text-xs sm:text-sm max-w-xl font-medium leading-relaxed">
              {selectedYear === 'all'
                ? t(
                    'សូមចុចជ្រើសរើសកាតឆ្នាំសិក្សា (ឆ្នាំទី១-ទី៤) ខាងក្រោម ដើម្បីមើលមុខវិជ្ជា និងទាញយកទិន្នន័យ Excel។',
                    'Select an academic year card (Year 1–4) below to filter by course and export Excel data.'
                  )
                : t(
                    'មើល ស្វែងរកតាមមុខវិជ្ជា វេនសិក្សា និងទាញយកបញ្ជីឈ្មោះសិស្សដែលបានចុះឈ្មោះចូលរៀន។',
                    'View, filter by course and study shift, and export enrolled students.'
                  )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {canShowExportExcel && (
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center justify-center px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer animate-fadeIn"
                title={t('នាំចេញបញ្ជីសិស្សជា Excel', 'Export students list to Excel')}
              >
                <DocumentIcon className="h-5 w-5 mr-2" />
                {t('នាំចេញ Excel', 'Export Excel')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Interactive Year Cards                                          */}
      {/* ------------------------------------------------------------------ */}
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
                  : 'tstd-year-card bg-white hover:bg-gray-50/80 border-gray-200/80 text-gray-800 shadow-xs hover:-translate-y-0.5'
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
                      isSelected ? 'text-white' : 'tstd-text-primary text-gray-900'
                    }`}
                  >
                    {card.count}
                  </span>
                  <span
                    className={`block text-[10px] font-bold mt-0.5 ${
                      isSelected ? 'text-white/80' : 'tstd-text-secondary text-gray-400'
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
                      isSelected ? 'text-white' : 'tstd-text-primary text-gray-800'
                    }`}
                  >
                    {t(card.titleKm, card.titleEn)}
                  </h3>
                  <p
                    className={`text-[10px] font-medium mt-0.5 ${
                      isSelected ? 'text-white/75' : 'tstd-text-secondary text-gray-400'
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
      {/* 3. Search, Course Selector & Study Shift Filter                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="tstd-surface-card bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col xl:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto flex-1">
          <div className="relative w-full sm:max-w-xs lg:max-w-sm flex-1">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder={t(
                'ស្វែងរក (ឈ្មោះ, អ៊ីមែល, ទូរស័ព្ទ, អត្តលេខ)...',
                'Search (name, email, phone, code)...'
              )}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="tstd-input w-full pl-11 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-blue-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          {selectedYear !== 'all' && visibleCoursesForSelectedYear.length > 0 && (
            <div className="relative w-full sm:w-64 lg:w-72 shrink-0 animate-fadeIn">
              <BookOpenIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedCourse}
                onChange={handleCourseChange}
                className="tstd-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white font-medium text-gray-700 appearance-none cursor-pointer shadow-2xs transition-all"
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
                <option value="not_enrolled">
                  {t(
                    '⏳ សិស្សមិនទាន់ចុះឈ្មោះមុខវិជ្ជា',
                    '⏳ Not Enrolled in Course'
                  )}
                </option>
              </select>
              <ChevronDownIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          )}
        </div>

        {/* ប៊ូតុងវេនសិក្សាទាំង ៣ */}
        <div className="tstd-shift-tabs flex flex-wrap items-center gap-1.5 bg-gray-100/80 p-1.5 rounded-xl border border-gray-200/60 w-full xl:w-auto justify-center sm:justify-start shrink-0">
          <button
            type="button"
            onClick={() => handleSelectShiftTab('all')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
              !isSpecificShiftSelected
                ? 'bg-blue-600 text-white shadow-xs'
                : 'tstd-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <Squares2X2Icon className="h-4 w-4" />
            <span>{t('គ្រប់វេនសិក្សា', 'All Shifts')}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                !isSpecificShiftSelected
                  ? 'bg-white/20 text-white'
                  : 'tstd-shift-count bg-gray-200/80 text-gray-700'
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
                : 'tstd-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <CalendarDaysIcon className="h-4 w-4" />
            <span>{t('ចន្ទ-សុក្រ', 'Mon-Fri')}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                selectedShift === 'Monday-Friday'
                  ? 'bg-white/20 text-white'
                  : 'tstd-shift-count bg-indigo-50 text-indigo-700'
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
                : 'tstd-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <CalendarDaysIcon className="h-4 w-4" />
            <span>{t('សៅរ៍-អាទិត្យ', 'Sat-Sun')}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                selectedShift === 'Saturday-Sunday'
                  ? 'bg-white/20 text-white'
                  : 'tstd-shift-count bg-amber-50 text-amber-700'
              }`}
            >
              {shiftCounts['Saturday-Sunday']}
            </span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Main Table Card                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="w-full">
        <div className="tstd-surface-card bg-white rounded-[1.5rem] border border-gray-200 shadow-sm overflow-hidden">
          <div className="tstd-table-bar px-6 py-5 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="tstd-text-primary text-[18px] font-extrabold text-gray-900">
                {activeCourseObj
                  ? `${t('បញ្ជីសិស្ស', 'Students List')} - ${activeCourseObj.course_name}`
                  : selectedCourse === 'not_enrolled'
                  ? t(
                      'បញ្ជីសិស្សមិនទាន់ចុះឈ្មោះមុខវិជ្ជារបស់ខ្ញុំ',
                      'Students Not Enrolled in My Courses'
                    )
                  : t('បញ្ជីសិស្សទាំងអស់', 'All Students List')}
              </h2>

              <span className="tstd-badge-blue px-3 py-1 rounded-lg text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-100">
                {filteredStudents.length} {t('នាក់', 'Students')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isSpecificShiftSelected && (
                <button
                  type="button"
                  onClick={() => handleSelectShiftTab('all')}
                  className="tstd-badge-indigo text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
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
                      sessionStorage.removeItem(getSelectedCourseKey(currentTeacherId));
                      sessionStorage.removeItem(getSelectedShiftKey(currentTeacherId));
                    } catch {}
                  }}
                  className="tstd-badge-blue text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                >
                  {t('សម្អាតតម្រងស្វែងរក', 'Reset Filters')}
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="tstd-table-head bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-14 whitespace-nowrap">
                    {t('ល.រ', 'No')}
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('សិស្ស', 'Student')}
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('អត្តលេខ', 'Code')}
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('កម្រិតសិក្សា', 'Degree Level')}
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('អ៊ីមែល / ទូរស័ព្ទ', 'Email / Phone')}
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('ដេប៉ាតឺម៉ង់', 'Department')}
                  </th>
                  {!isSpecificShiftSelected && (
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {t('វេនសិក្សា', 'Shift')}
                    </th>
                  )}
                  <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('ស្ថានភាព', 'Status')}
                  </th>
                </tr>
              </thead>
              <tbody className="tstd-table-body bg-white">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isSpecificShiftSelected ? '7' : '8'}
                      className="px-6 py-16 text-center text-gray-500"
                    >
                      <div className="flex flex-col items-center">
                        <UserGroupIcon className="h-16 w-16 text-gray-300 mb-4" />
                        <p className="tstd-text-primary font-extrabold text-gray-800 text-base">
                          {selectedCourse
                            ? t(
                                `មិនទាន់មានសិស្សចុះឈ្មោះក្នុងមុខវិជ្ជា «${activeCourseObj?.course_name || ''}» នៅឡើយទេ`,
                                'No students enrolled in this course yet'
                              )
                            : selectedYear !== 'all'
                            ? t(
                                `មិនទាន់មាននិស្សិតក្នុង ${getYearTextLabel(selectedYear)} នៅឡើយទេ`,
                                `No students found in ${getYearTextLabel(selectedYear)}`
                              )
                            : searchTerm || isSpecificShiftSelected
                            ? t(
                                'មិនឃើញមានសិស្សតាមការស្វែងរកនេះទេ',
                                'No matching students found'
                              )
                            : t(
                                'មិនទាន់មានសិស្សនៅឡើយទេ',
                                'No students available yet'
                              )}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student, idx) => {
                    const initials = `${student.first_name?.charAt(0) || ''}${
                      student.last_name?.charAt(0) || ''
                    }`.toUpperCase();
                    const isFemale = isFemaleGender(student.gender);
                    const isActive =
                      (student.user?.status || student.status || 'active') ===
                      'active';
                    const isWeekend =
                      normalizeShiftKey(student.study_shift) ===
                      'Saturday-Sunday';
                    const extraDeptNames =
                      getStudentExtraDepartmentNames(student);
                    const isEnrolledWithMe =
                      hasStudentEnrolledAnyTeacherCourse(
                        student,
                        courses,
                        courseMap
                      );

                    return (
                      <tr
                        key={student.id}
                        className="tstd-table-row hover:bg-blue-50/30 transition-colors"
                      >
                        <td className="tstd-text-secondary px-4 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-500">
                          {idx + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3.5">
                            {student.profile_image ? (
                              <img
                                src={getProfileImageUrl(student.profile_image)}
                                alt={`${student.first_name} ${student.last_name}`}
                                className="h-10 w-10 rounded-full object-cover border border-gray-200 shadow-sm shrink-0"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div
                              className={`tstd-avatar h-10 w-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-extrabold text-sm shadow-sm shrink-0 ${
                                student.profile_image ? 'hidden' : ''
                              }`}
                            >
                              {initials || 'ST'}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="tstd-text-primary text-sm font-extrabold text-gray-900">
                                  {student.first_name} {student.last_name}
                                </span>
                                {/* ✅ បង្ហាញស្លាកតែចំពោះសិស្សណាដែលមិនទាន់បានចុះឈ្មោះមុខវិជ្ជារបស់គ្រូដែល Login ប៉ុណ្ណោះ (បើចុះឈ្មោះហើយមិនដាក់អ្វីទេ) */}
                                {!isEnrolledWithMe && (
                                  <span
                                    className="tstd-badge-unassigned inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-50/90 text-amber-700 border border-dashed border-amber-300"
                                    title={t(
                                      'សិស្សនេះស្ថិតក្នុងដេប៉ាតឺម៉ង់របស់អ្នក តែមិនទាន់បានចុះឈ្មោះក្នុងមុខវិជ្ជាដែលអ្នកបង្រៀននៅឡើយទេ',
                                      'This student is in your department but has not enrolled in your courses yet'
                                    )}
                                  >
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                    {t(
                                      'មិនទាន់ចុះឈ្មោះមុខវិជ្ជា',
                                      'Not enrolled in course'
                                    )}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                    isFemale
                                      ? 'tstd-badge-rose bg-rose-50 text-rose-600 border-rose-200'
                                      : 'tstd-badge-blue bg-blue-50 text-blue-600 border-blue-200'
                                  }`}
                                >
                                  {getGenderLabel(student.gender)}
                                </span>
                                <span className="tstd-text-secondary text-xs text-gray-400 font-bold">
                                  &bull;
                                </span>
                                <span className="tstd-text-secondary text-xs font-medium text-gray-500">
                                  {student.batch_year ||
                                    t('មិនទាន់កំណត់ឆ្នាំ', 'No Year')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="tstd-code-pill text-xs font-bold text-gray-700 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
                            {student.student_code || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="tstd-badge-emerald inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {getDegreeLevelLabel(student.degree_level)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="tstd-text-secondary text-sm text-gray-600 font-medium">
                            {student.email || '—'}
                          </div>
                          {student.phone && (
                            <div className="tstd-text-secondary text-xs text-gray-400 font-medium mt-0.5">
                              {student.phone}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="tstd-text-secondary text-sm text-gray-600 font-medium">
                            {student.department?.department_name ||
                              student.department?.name ||
                              '—'}
                          </div>
                          {extraDeptNames.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {extraDeptNames.map((dName, dIdx) => (
                                <span
                                  key={dIdx}
                                  className="tstd-badge-indigo inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-50 text-indigo-600 border border-indigo-200"
                                >
                                  + {dName}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        {!isSpecificShiftSelected && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold border ${
                                isWeekend
                                  ? 'tstd-badge-amber bg-amber-50 text-amber-700 border-amber-200'
                                  : 'tstd-badge-indigo bg-indigo-50 text-indigo-700 border-indigo-100'
                              }`}
                            >
                              {getStudyShiftLabel(student.study_shift)}
                            </span>
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span
                            className={`px-3 py-1 text-[11px] font-extrabold rounded-lg shadow-2xs border ${
                              isActive
                                ? 'tstd-badge-emerald bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'tstd-badge-rose bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {isActive
                              ? t('សកម្ម', 'Active')
                              : t('អសកម្ម', 'Inactive')}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 📌 ផ្នែកទី៦៖ CSS សម្រាប់កំណត់ពណ៌ទម្រង់យប់ (Dark Mode Styling)          */}
      {/* ==================================================================== */}
      <style>{`
        .tstd-table-row + .tstd-table-row > td {
          border-top: 1px solid #f1f5f9;
        }
        html.dark .tstd-page-bg {
          background-color: transparent !important;
        }
        html.dark .tstd-surface-card,
        html.dark .tstd-table-bar,
        html.dark .tstd-year-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .tstd-year-card:hover {
          background-color: #263449 !important;
        }
        html.dark .tstd-text-primary {
          color: #f8fafc !important;
        }
        html.dark .tstd-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .tstd-shift-tabs {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .tstd-shift-btn {
          color: #94a3b8 !important;
        }
        html.dark .tstd-shift-btn:hover {
          background-color: #1e293b !important;
          color: #f8fafc !important;
        }
        html.dark .tstd-shift-count {
          background-color: #1e293b !important;
          color: #cbd5e1 !important;
        }
        html.dark .tstd-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        html.dark .tstd-input::placeholder {
          color: #64748b !important;
        }
        html.dark .tstd-table-head {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .tstd-table-head th {
          color: #94a3b8 !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .tstd-table-body {
          background-color: #1e293b !important;
        }
        html.dark .tstd-table-row + .tstd-table-row > td {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .tstd-table-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }
        html.dark .tstd-code-pill {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .tstd-badge-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .tstd-badge-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          color: #818cf8 !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .tstd-badge-amber,
        html.dark .tstd-badge-unassigned {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.35) !important;
        }
        html.dark .tstd-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .tstd-badge-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
      `}</style>
    </div>
  );
};

export default TeacherManageStudents;
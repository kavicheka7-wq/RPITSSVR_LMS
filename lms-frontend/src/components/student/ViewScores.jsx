// src/components/student/ViewScores.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  AcademicCapIcon,
  CheckCircleIcon,
  XCircleIcon,
  BookOpenIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronDownIcon,
  BuildingLibraryIcon,
  CalendarDaysIcon,
  CheckBadgeIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនីសិស្សម្នាក់ៗ (User-Scoped 0ms Instant Cache)
// ============================================================================
const LAST_ACTIVE_STUDENT_UID_KEY = 'lms_last_active_student_uid';
const CACHE_KEY_TEACHER_AVATARS = 'cached_student_teacher_avatars_v1';
const CACHE_KEY_SHARED_SCORES = 'cached_student_scores_list_v5';

const getScoresCacheKey = (uid) => `cached_student_scores_list_v10_${uid}`;
const getEnrollmentsCacheKey = (uid) => `cached_student_dashboard_enrollments_v10_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់សិស្សម្នាក់ៗ (អានក្នុង 0ms គ្មានការគាំងទាក់)
const STUDENT_SCORES_MEM_CACHE = {
  uid: null,
  grades: null,
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
    STUDENT_SCORES_MEM_CACHE.teacherAvatarMap &&
    typeof STUDENT_SCORES_MEM_CACHE.teacherAvatarMap === 'object'
  ) {
    return STUDENT_SCORES_MEM_CACHE.teacherAvatarMap;
  }
  const stored = readStorageJson(CACHE_KEY_TEACHER_AVATARS, {});
  STUDENT_SCORES_MEM_CACHE.teacherAvatarMap =
    stored && typeof stored === 'object' ? stored : {};
  return STUDENT_SCORES_MEM_CACHE.teacherAvatarMap;
};

// ✅ រក្សាទុកបញ្ជីពិន្ទុ និងរូបថតគ្រូដោយលឿនបំផុត (0ms Synchronous Slim Save គ្មាន Canvas)
const persistStudentScoresFast = (uid, scoresList) => {
  if (!Array.isArray(scoresList)) return;
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

  const slimList = scoresList.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const course = row.course || {};
    const cid = String(row.course_id || course.id || row.id || '');

    const copy = { ...row };
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
    const listStr = JSON.stringify(slimList);
    localStorage.setItem(getScoresCacheKey(uid), listStr);
    localStorage.setItem(CACHE_KEY_SHARED_SCORES, listStr);
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
        'cached_student_scores_list_v5',
        'cached_student_scores_list_v3',
        'cached_student_dashboard_stats_v8',
        'cached_student_dashboard_enrollments_v8',
        'cached_student_dashboard_activity_v8',
        'cached_student_courses_list_v3',
        'cached_student_attendance_list_v3',
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

const extractValidScoresArray = (resData) => {
  if (!resData) return [];
  if (Array.isArray(resData)) return resData;
  if (Array.isArray(resData.data)) return resData.data;
  if (Array.isArray(resData.scores)) return resData.scores;
  if (Array.isArray(resData.grades)) return resData.grades;
  if (resData.data && Array.isArray(resData.data.data)) return resData.data.data;
  if (resData.data && Array.isArray(resData.data.scores))
    return resData.data.scores;
  return [];
};

const formatCleanNumber = (val) => {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  return Math.round(num * 100) / 100;
};

const toWeightedComponentPoints = (rawPercentageScore, maxWeightPoints) => {
  if (rawPercentageScore === null || rawPercentageScore === undefined || rawPercentageScore === '') {
    return null;
  }
  const num = Number(rawPercentageScore);
  if (isNaN(num)) return null;

  const scaled = (num * maxWeightPoints) / 100;
  return Math.min(maxWeightPoints, Math.max(0, Math.round(scaled * 100) / 100));
};

// ✅ អនុគមន៍គណនា និងស្រង់ទិន្នន័យពិន្ទុនិស្សិតឱ្យត្រូវគ្នា ១០០% ជាមួយ TeacherManageGrades.jsx
const enrichGradeRow = (row, idx) => {
  const scoreObj = row?.score || row?.pivot || row || {};
  const courseObj = row?.course || (row?.course_name ? row : {}) || {};
  const courseId =
    row?.course_id || courseObj?.id || scoreObj?.course_id || row?.id || idx + 1;

  const assignRaw100 = formatCleanNumber(
    row?.assignment_score ??
      scoreObj?.assignment_score ??
      row?.auto_assignment_score ??
      scoreObj?.auto_assignment_score
  );

  const quizRaw100 = formatCleanNumber(
    row?.quiz_score ??
      scoreObj?.quiz_score ??
      row?.auto_quiz_score ??
      scoreObj?.auto_quiz_score
  );

  const midtermRaw100 = formatCleanNumber(
    row?.midterm_score ?? scoreObj?.midterm_score
  );

  let examRaw100 = formatCleanNumber(row?.exam_score ?? scoreObj?.exam_score);
  let finalScore = formatCleanNumber(row?.final_score ?? scoreObj?.final_score);

  let partialWeightedSum = 0;
  let partialWeightTotal = 0;

  if (assignRaw100 !== null) {
    partialWeightedSum += assignRaw100 * 0.2;
    partialWeightTotal += 0.2;
  }
  if (quizRaw100 !== null) {
    partialWeightedSum += quizRaw100 * 0.2;
    partialWeightTotal += 0.2;
  }
  if (midtermRaw100 !== null) {
    partialWeightedSum += midtermRaw100 * 0.25;
    partialWeightTotal += 0.25;
  }

  if (examRaw100 === null && finalScore !== null) {
    const partialOnlyAvg =
      partialWeightTotal > 0
        ? Math.round((partialWeightedSum / partialWeightTotal) * 100) / 100
        : null;

    if (partialWeightTotal === 0) {
      examRaw100 = finalScore;
    } else if (
      partialOnlyAvg !== null &&
      Math.abs(finalScore - partialOnlyAvg) > 0.05
    ) {
      const totalWeightWithExam = partialWeightTotal + 0.35;
      const calcExam =
        (finalScore * totalWeightWithExam - partialWeightedSum) / 0.35;

      if (!isNaN(calcExam) && calcExam >= 0 && calcExam <= 100) {
        examRaw100 = Math.round(calcExam * 100) / 100;
      }
    }
  }

  const assignPts20 = toWeightedComponentPoints(assignRaw100, 20);
  const quizPts20 = toWeightedComponentPoints(quizRaw100, 20);
  const midtermPts25 = toWeightedComponentPoints(midtermRaw100, 25);
  const examPts35 = toWeightedComponentPoints(examRaw100, 35);

  const gradedParts = [
    assignPts20,
    quizPts20,
    midtermPts25,
    examPts35,
  ].filter((v) => v !== null);

  const gradedPartsCount = gradedParts.length;

  let totalPointsSum = null;
  if (gradedPartsCount > 0) {
    totalPointsSum =
      Math.round(gradedParts.reduce((acc, v) => acc + v, 0) * 100) / 100;
  } else if (finalScore !== null) {
    totalPointsSum = finalScore;
  }

  let ratioScore = finalScore;
  if (ratioScore === null) {
    let totalW = partialWeightTotal;
    let totalSum = partialWeightedSum;
    if (examRaw100 !== null) {
      totalSum += examRaw100 * 0.35;
      totalW += 0.35;
    }
    if (totalW > 0) {
      ratioScore = Math.round((totalSum / totalW) * 100) / 100;
    }
  }

  const rawLetter = (row?.grade_letter || scoreObj?.grade_letter || '')
    .toString()
    .trim()
    .toUpperCase();

  let resultStatus = 'pending';
  if (ratioScore !== null) {
    if (rawLetter === 'F' || ratioScore < 50) {
      resultStatus = 'failed';
    } else {
      resultStatus = 'passed';
    }
  }

  return {
    ...row,
    course_id: String(courseId),
    course: {
      ...courseObj,
      id: courseId,
      course_name:
        courseObj?.course_name || row?.course_name || 'មុខវិជ្ជាសិក្សា',
      course_code: courseObj?.course_code || row?.course_code || '',
      credit: courseObj?.credit ?? row?.credit ?? 3,
      teacher:
        courseObj?.teacher ||
        courseObj?.teacher_profile ||
        row?.teacher ||
        row?.teacher_profile ||
        null,
      teacher_profile:
        courseObj?.teacher_profile ||
        courseObj?.teacher ||
        row?.teacher_profile ||
        row?.teacher ||
        null,
      department: courseObj?.department || row?.department || null,
    },
    cleanAssign: assignPts20,
    cleanQuiz: quizPts20,
    cleanMidterm: midtermPts25,
    cleanExam: examPts35,
    rawAssign100: assignRaw100,
    rawQuiz100: quizRaw100,
    rawMidterm100: midtermRaw100,
    rawExam100: examRaw100,
    cleanFinal: totalPointsSum,
    resultStatus,
    gradedPartsCount,
  };
};

const ViewScores = () => {
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
    STUDENT_SCORES_MEM_CACHE.uid &&
    STUDENT_SCORES_MEM_CACHE.uid !== currentStudentId
  ) {
    STUDENT_SCORES_MEM_CACHE.grades = null;
    STUDENT_SCORES_MEM_CACHE.lastSyncedAt = 0;
  }
  STUDENT_SCORES_MEM_CACHE.uid = currentStudentId;

  // ✅ ១. អានពី Cache តាមគណនីសិស្សម្នាក់ៗភ្លាមៗក្នុង 0 វិនាទី
  const [grades, setGrades] = useState(() => {
    if (Array.isArray(STUDENT_SCORES_MEM_CACHE.grades)) {
      return STUDENT_SCORES_MEM_CACHE.grades;
    }
    const cached =
      readStorageJson(getScoresCacheKey(currentStudentId), null) ||
      readStorageJson(`cached_student_scores_list_v8_${currentStudentId}`, null) ||
      readStorageJson(CACHE_KEY_SHARED_SCORES, []);
    STUDENT_SCORES_MEM_CACHE.grades = cached;
    return cached;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('all');

  // ============================================================================
  // 📌 ផ្នែកទី២៖ ការទាញទិន្នន័យពី `/student/scores` ដោយមិនរាំងស្ទះ UI (0ms Sync)
  // ============================================================================
  useEffect(() => {
    let isMounted = true;

    const cachedList =
      readStorageJson(getScoresCacheKey(currentStudentId), null) ||
      readStorageJson(`cached_student_scores_list_v8_${currentStudentId}`, null);
    if (Array.isArray(cachedList)) {
      setGrades(cachedList);
      STUDENT_SCORES_MEM_CACHE.grades = cachedList;
    }

    const now = Date.now();
    if (
      STUDENT_SCORES_MEM_CACHE.uid === currentStudentId &&
      Array.isArray(STUDENT_SCORES_MEM_CACHE.grades) &&
      STUDENT_SCORES_MEM_CACHE.grades.length > 0 &&
      now - STUDENT_SCORES_MEM_CACHE.lastSyncedAt < 25000
    ) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fetchScores = async () => {
      try {
        const response = await api.get('/student/scores', {
          signal: controller.signal,
        });
        if (!isMounted) return;

        let validList = extractValidScoresArray(response.data);

        const cachedEnrollments =
          readStorageJson(getEnrollmentsCacheKey(currentStudentId), null) ||
          readStorageJson('cached_student_dashboard_enrollments_v8', []);

        if (Array.isArray(cachedEnrollments) && cachedEnrollments.length > 0) {
          const existingCourseIds = new Set(
            validList.map((item) =>
              String(item?.course_id || item?.course?.id || item?.id)
            )
          );

          cachedEnrollments.forEach((enr) => {
            const cObj = enr?.course || enr;
            const cid = String(enr?.course_id || cObj?.id || enr?.id || '');
            if (cid && !existingCourseIds.has(cid)) {
              existingCourseIds.add(cid);
              validList.push({
                course_id: cid,
                course: cObj,
                assignment_score: null,
                quiz_score: null,
                midterm_score: null,
                exam_score: null,
                final_score: null,
                grade_letter: null,
              });
            }
          });
        }

        // ✅ រក្សាទុកក្នុង RAM មុនគេដើម្បីបង្ហាញលើអេក្រង់ក្នុង 0ms រួចទើប Save Slim JSON ចូល localStorage
        STUDENT_SCORES_MEM_CACHE.uid = currentStudentId;
        STUDENT_SCORES_MEM_CACHE.grades = validList;
        STUDENT_SCORES_MEM_CACHE.lastSyncedAt = Date.now();
        setGrades(validList);

        persistStudentScoresFast(currentStudentId, validList);
      } catch (error) {
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
          return;
        }
        console.error('Error fetching student scores:', error);
      }
    };

    fetchScores();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [currentStudentId]);

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ អនុគមន៍ជំនួយសម្រាប់ព័ត៌មានសិស្ស គ្រូបង្រៀន និងការគណនាពិន្ទុតាមផ្នែកទាំង ៤
  // ============================================================================
  const enrichedGrades = useMemo(() => {
    if (!Array.isArray(grades)) return [];
    return grades.map((g, idx) => enrichGradeRow(g, idx));
  }, [grades]);

  const studentDeptName = useMemo(() => {
    const fromUser =
      user?.department?.department_name ||
      user?.department?.name ||
      user?.student?.department?.department_name ||
      user?.student?.department?.name;
    if (fromUser) return fromUser;

    const firstCourseDept =
      enrichedGrades[0]?.course?.department?.department_name ||
      enrichedGrades[0]?.course?.department?.name;
    return firstCourseDept || t('វិទ្យាសាស្ត្រកុំព្យូទ័រ', 'Computer Science');
  }, [user, enrichedGrades, t]);

  const studentStudyShiftKey = useMemo(() => {
    const rawShift =
      user?.study_shift ||
      user?.student?.study_shift ||
      enrichedGrades[0]?.student?.study_shift ||
      'Monday-Friday';
    return normalizeShiftKey(rawShift);
  }, [user, enrichedGrades]);

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
  const resolveGradeTeacherMeta = useCallback(
    (gradeRow) => {
      const course = gradeRow?.course || {};
      const cid = String(course.id || gradeRow?.course_id || '');
      const tchProfile = course.teacher_profile || course.teacherProfile;
      const tch = course.teacher || gradeRow?.teacher;
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
        fullName =
          course.teacher_name ||
          gradeRow?.teacher_name ||
          t('គ្រូបង្រៀន', 'Instructor');
      }

      const teacherParts = fullName.trim().split(/\s+/);
      const initials =
        teacherParts.length >= 2
          ? `${teacherParts[0][0] || ''}${
              teacherParts[teacherParts.length - 1][0] || ''
            }`.toUpperCase()
          : (fullName.charAt(0) || 'T').toUpperCase();

      const avatarMap = getTeacherAvatarMapSync();
      const rawImg =
        tchProfile?.profile_image_url ||
        tchProfile?.profile_image ||
        tchProfile?.user?.profile_image ||
        tch?.profile_image_url ||
        tch?.profile_image ||
        tch?.user?.profile_image_url ||
        tch?.user?.profile_image ||
        course?.teacher_image ||
        gradeRow?.teacher_image ||
        (cid && avatarMap[`crs_${cid}`]) ||
        (tchId && avatarMap[`tch_${tchId}`]);

      return {
        name: fullName,
        initials,
        image: getProfileImageUrl(rawImg),
        specialization:
          tchProfile?.specialization || tch?.specialization || null,
      };
    },
    [t, getProfileImageUrl]
  );

  const availableCourses = useMemo(() => {
    const map = new Map();
    enrichedGrades.forEach((row) => {
      const c = row.course;
      const cid = c?.id || row.course_id;
      if (cid && !map.has(String(cid))) {
        map.set(String(cid), {
          id: String(cid),
          name: c?.course_name || row.course_name || t('មុខវិជ្ជា', 'Course'),
          code: c?.course_code || '',
        });
      }
    });
    return Array.from(map.values());
  }, [enrichedGrades, t]);

  const filteredGrades = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();

    return enrichedGrades.filter((row) => {
      if (selectedCourse !== 'all') {
        const cid = row.course?.id || row.course_id;
        if (String(cid) !== String(selectedCourse)) return false;
      }

      if (!q) return true;
      const courseName = (
        row.course?.course_name ||
        row.course_name ||
        ''
      ).toLowerCase();
      const courseCode = (row.course?.course_code || '').toLowerCase();
      const teacherMeta = resolveGradeTeacherMeta(row);
      const teacherName = (teacherMeta.name || '').toLowerCase();

      return (
        courseName.includes(q) ||
        courseCode.includes(q) ||
        teacherName.includes(q)
      );
    });
  }, [enrichedGrades, selectedCourse, searchTerm, resolveGradeTeacherMeta]);

  const componentAverages = useMemo(() => {
    const targetList =
      selectedCourse !== 'all' ? filteredGrades : enrichedGrades;

    const calcAvg = (field) => {
      const valid = targetList.filter(
        (item) => item[field] !== null && item[field] !== undefined
      );
      if (valid.length === 0) return null;
      const sum = valid.reduce((acc, item) => acc + Number(item[field]), 0);
      return Math.round((sum / valid.length) * 100) / 100;
    };

    const totalGradedParts = targetList.reduce(
      (acc, item) => acc + (item.gradedPartsCount || 0),
      0
    );
    const maxPossibleParts = targetList.length * 4;

    return {
      assignAvg: calcAvg('cleanAssign'),
      quizAvg: calcAvg('cleanQuiz'),
      midtermAvg: calcAvg('cleanMidterm'),
      examAvg: calcAvg('cleanExam'),
      totalGradedParts,
      maxPossibleParts,
    };
  }, [enrichedGrades, filteredGrades, selectedCourse]);

  const scoredGrades = useMemo(
    () => enrichedGrades.filter((g) => g.cleanFinal !== null),
    [enrichedGrades]
  );

  const averageFinalScore = useMemo(() => {
    if (scoredGrades.length === 0) return 0;
    const sum = scoredGrades.reduce((acc, g) => acc + Number(g.cleanFinal), 0);
    return Math.round((sum / scoredGrades.length) * 10) / 10;
  }, [scoredGrades]);

  const passedCoursesCount = useMemo(
    () => scoredGrades.filter((g) => g.resultStatus === 'passed').length,
    [scoredGrades]
  );

  const activeCourseObj = useMemo(() => {
    if (selectedCourse === 'all') return null;
    return (
      availableCourses.find((c) => String(c.id) === String(selectedCourse)) ||
      null
    );
  }, [selectedCourse, availableCourses]);

  const getResultBadge = (row) => {
    if (row.resultStatus === 'passed') {
      return (
        <span className="std-scr-badge-emerald inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
          <CheckCircleIcon className="w-4 h-4 mr-1.5 shrink-0" />
          {t('ប្រឡងជាប់', 'Passed')}
        </span>
      );
    }
    if (row.resultStatus === 'failed') {
      return (
        <span className="std-scr-badge-rose inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
          <XCircleIcon className="w-4 h-4 mr-1.5 shrink-0" />
          {t('ប្រឡងធ្លាក់', 'Failed')}
        </span>
      );
    }
    return (
      <span className="std-scr-code-pill inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200">
        <ClockIcon className="w-3.5 h-3.5 mr-1.5 shrink-0 text-amber-500" />
        {t('រង់ចាំពិន្ទុ', 'Pending')}
      </span>
    );
  };

  const scoreComponentCards = [
    {
      id: 'assign',
      title: t('កិច្ចការ', 'Assignment'),
      maxPoints: 20,
      weightLabel: '20%',
      value: componentAverages.assignAvg,
      icon: ClipboardDocumentListIcon,
      iconStyle:
        'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
      valueBadgeStyle:
        componentAverages.assignAvg !== null
          ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30'
          : 'bg-white text-gray-400 border-gray-200/80 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
    },
    {
      id: 'quiz',
      title: t('សំណួរខ្លី', 'Quiz'),
      maxPoints: 20,
      weightLabel: '20%',
      value: componentAverages.quizAvg,
      icon: AcademicCapIcon,
      iconStyle:
        'bg-purple-100 text-purple-600 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30',
      valueBadgeStyle:
        componentAverages.quizAvg !== null
          ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30'
          : 'bg-white text-gray-400 border-gray-200/80 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
    },
    {
      id: 'midterm',
      title: t('ពាក់កណ្ដាលឆមាស', 'Midterm'),
      maxPoints: 25,
      weightLabel: '25%',
      value: componentAverages.midtermAvg,
      icon: DocumentTextIcon,
      iconStyle:
        'bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
      valueBadgeStyle:
        componentAverages.midtermAvg !== null
          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
          : 'bg-white text-gray-400 border-gray-200/80 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
    },
    {
      id: 'exam',
      title: t('ប្រឡងបញ្ចប់', 'Final Exam'),
      maxPoints: 35,
      weightLabel: '35%',
      value: componentAverages.examAvg,
      icon: CheckBadgeIcon,
      iconStyle:
        'bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
      valueBadgeStyle:
        componentAverages.examAvg !== null
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
          : 'bg-white text-gray-400 border-gray-200/80 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
    },
  ];

  return (
    <div className="std-scr-page max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 pb-28 lg:pb-12 mt-2 md:mt-0 animate-fadeIn">
      
      {/* ================================================================== */}
      {/* 📌 1. MODERN BENTO HERO SECTION                                    */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
        
        {/* ១.១. ប្រអប់ធំខាងឆ្វេង (8 Columns) */}
        <div className="lg:col-span-8 relative overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] bg-gradient-to-br from-blue-950 via-indigo-900 to-violet-950 p-6 sm:p-8 text-white shadow-xl border border-indigo-500/30 flex flex-col justify-between">
          <div className="std-scr-grid-pattern absolute inset-0 opacity-15 pointer-events-none"></div>
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
                <span>{t('លទ្ធផលពិន្ទុសិក្សា,', 'My Scores,')}</span>
                <span className="bg-gradient-to-r from-yellow-300 via-amber-200 to-white bg-clip-text text-transparent">
                  {activeCourseObj
                    ? activeCourseObj.name
                    : t('គ្រប់មុខវិជ្ជា', 'All Courses')}
                </span>
                <CheckBadgeIcon className="h-6 w-6 sm:h-7 sm:w-7 text-yellow-400 shrink-0" />
              </h1>

              <p className="text-xs sm:text-sm text-blue-100/80 max-w-2xl leading-relaxed font-medium">
                {t(
                  'ពិនិត្យមើលពិន្ទុរបស់អ្នកដែលលោកគ្រូ/អ្នកគ្រូបានកែ និងដាក់ឱ្យ តាមផ្នែកនីមួយៗ (កិច្ចការ 20%, សំណួរខ្លី 20%, ពាក់កណ្តាលឆមាស 25%, និងប្រឡងបញ្ចប់ 35%)។',
                  'View your scores graded by your instructors across assignments (20%), quizzes (20%), midterm exams (25%), and final exams (35%).'
                )}
              </p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-3 sm:gap-4 mt-6 pt-5 border-t border-white/15">
            <div className="bg-white/[0.08] hover:bg-white/[0.12] backdrop-blur-md border border-white/15 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5 transition-all">
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-yellow-300 shrink-0">
                <ChartBarIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl font-black text-white leading-none">
                  {averageFinalScore} {t('ពិន្ទុ', 'pts')}
                </span>
                <span className="block text-[11px] sm:text-xs font-bold text-blue-200/90 truncate mt-1">
                  {t('ពិន្ទុមធ្យមភាគរួម', 'Average Score')}
                </span>
              </div>
            </div>

            <div className="bg-white/[0.08] hover:bg-white/[0.12] backdrop-blur-md border border-white/15 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5 transition-all">
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-emerald-500/25 border border-emerald-300/30 flex items-center justify-center text-emerald-300 shrink-0">
                <CheckCircleIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-lg sm:text-xl font-black text-white leading-none">
                  {passedCoursesCount} / {enrichedGrades.length}
                </span>
                <span className="block text-[11px] sm:text-xs font-bold text-blue-200/90 truncate mt-1">
                  {t('មុខវិជ្ជាប្រឡងជាប់ (≥ 50)', 'Passed Courses (≥ 50)')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ១.២. ប្រអប់ពណ៌សខាងស្ដាំ (4 Columns) */}
        <div className="lg:col-span-4 std-scr-surface bg-white rounded-[1.75rem] sm:rounded-[2rem] p-6 border border-gray-200/80 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/30 flex items-center justify-center shrink-0">
                  <ChartBarIcon className="h-5 w-5 stroke-[2.2]" />
                </div>
                <div>
                  <h2 className="std-scr-text-primary text-base sm:text-lg font-extrabold text-gray-900 leading-tight">
                    {t('ពិន្ទុតាមផ្នែកដែលគ្រូបានកែ', 'Graded Components')}
                  </h2>
                  <p className="std-scr-text-secondary text-[11px] font-medium text-gray-500 mt-0.5">
                    {activeCourseObj
                      ? activeCourseObj.name
                      : t('ពិន្ទុទទួលបានធៀបនឹងពិន្ទុពេញតាមផ្នែក', 'Earned points across 4 components')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              {scoreComponentCards.map((item) => {
                const CompIcon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="std-scr-subbox p-3.5 rounded-2xl border bg-gray-50/80 border-gray-200/80 flex items-center justify-between gap-2 transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${item.iconStyle}`}
                      >
                        <CompIcon className="h-5 w-5 stroke-[2.2]" />
                      </div>
                      <div className="min-w-0">
                        <span className="std-scr-text-primary block text-xs font-extrabold text-gray-900 truncate">
                          {item.title}
                        </span>
                        <span className="std-scr-text-secondary block text-[10px] font-bold text-gray-400 mt-0.5">
                          {t('ពិន្ទុពេញ', 'Full Marks')} {item.weightLabel}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-black border shrink-0 ${item.valueBadgeStyle}`}
                    >
                      {item.value !== null ? item.value : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="std-scr-divider pt-4 mt-4 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="std-scr-text-secondary font-bold text-gray-500">
              {t('មុខវិជ្ជាសរុប៖', 'Courses:')}{' '}
              <strong className="std-scr-text-primary text-gray-800">
                {enrichedGrades.length}
              </strong>{' '}
              • {t('ជាប់៖', 'Passed:')}{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">
                {passedCoursesCount}
              </strong>
            </span>

            <span className="font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              <CheckCircleIcon className="h-3.5 w-3.5" />
              <span>
                {t('គ្រូដាក់ពិន្ទុ៖', 'Graded:')}{' '}
                {componentAverages.totalGradedParts}/
                {componentAverages.maxPossibleParts || 4} {t('ផ្នែក', 'parts')}
              </span>
            </span>
          </div>
        </div>

      </div>

      {/* ================================================================== */}
      {/* 📌 2. SEARCH & COURSE FILTER BAR                                   */}
      {/* ================================================================== */}
      <div className="std-scr-surface bg-white rounded-2xl border border-gray-200/80 shadow-xs p-4 flex flex-col sm:flex-row gap-3.5 items-center justify-between">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:max-w-xs lg:max-w-sm flex-1">
            <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t(
                'ស្វែងរកមុខវិជ្ជា កូដ ឬឈ្មោះគ្រូបង្រៀន...',
                'Search course, code, or instructor...'
              )}
              className="std-scr-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-gray-50/60 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all"
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
                className="std-scr-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white font-medium text-gray-700 appearance-none cursor-pointer transition-all"
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
      {/* 📌 3. DETAILED SCORES TABLE                                        */}
      {/* ================================================================== */}
      <div className="std-scr-surface bg-white rounded-[1.5rem] border border-gray-200 shadow-sm overflow-hidden">
        <div className="std-scr-bar px-6 py-5 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h3 className="std-scr-text-primary text-base sm:text-lg font-extrabold text-gray-900">
              {t('តារាងពិន្ទុលម្អិតតាមមុខវិជ្ជា', 'Detailed Course Scores')}
            </h3>
            <span className="std-scr-badge-blue px-3 py-1 rounded-lg text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-100">
              {filteredGrades.length} {t('មុខវិជ្ជា', 'Courses')}
            </span>
          </div>

          {(selectedCourse !== 'all' || searchTerm !== '') && (
            <button
              type="button"
              onClick={() => {
                setSelectedCourse('all');
                setSearchTerm('');
              }}
              className="std-scr-badge-blue text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
            >
              {t('សម្អាតតម្រងស្វែងរក', 'Reset Filters')}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="std-scr-thead bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-4 text-center text-[11px] font-extrabold text-gray-500 uppercase tracking-wider w-14">
                  {t('ល.រ', 'No')}
                </th>
                <th className="px-6 py-4 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('មុខវិជ្ជាសិក្សា', 'Course')}
                </th>
                <th className="px-6 py-4 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('គ្រូបង្រៀន', 'Instructor')}
                </th>
                <th className="px-4 py-4 text-center text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('កិច្ចការ (20%)', 'Assignment (20%)')}
                </th>
                <th className="px-4 py-4 text-center text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('សំណួរខ្លី (20%)', 'Quiz (20%)')}
                </th>
                <th className="px-4 py-4 text-center text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('ពាក់កណ្តាលឆមាស (25%)', 'Midterm (25%)')}
                </th>
                <th className="px-4 py-4 text-center text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('ប្រឡងបញ្ចប់ (35%)', 'Final Exam (35%)')}
                </th>
                <th className="px-5 py-4 text-center text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('ពិន្ទុសរុប', 'Total Score')}
                </th>
                <th className="px-6 py-4 text-center text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                  {t('លទ្ធផល', 'Result')}
                </th>
              </tr>
            </thead>
            <tbody className="std-scr-tbody bg-white">
              {filteredGrades.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-6 py-20 text-center text-gray-400">
                    <div className="flex flex-col items-center">
                      <ChartBarIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="std-scr-text-primary font-extrabold text-gray-700 text-base">
                        {searchTerm || selectedCourse !== 'all'
                          ? t(
                              'មិនឃើញមានទិន្នន័យពិន្ទុតាមការស្វែងរកនេះទេ',
                              'No matching score records found'
                            )
                          : t(
                              'មិនទាន់មានទិន្នន័យពិន្ទុនៅឡើយទេ',
                              'No score records found'
                            )}
                      </p>
                      <p className="std-scr-text-secondary text-xs text-gray-400 mt-1">
                        {t(
                          'តារាងពិន្ទុនឹងបង្ហាញនៅទីនេះ នៅពេលគ្រូបង្រៀនបញ្ចូលពិន្ទុតាមមុខវិជ្ជា។',
                          'Scores will appear here once recorded by your instructor.'
                        )}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredGrades.map((grade, idx) => {
                  const teacherMeta = resolveGradeTeacherMeta(grade);
                  const avatarKey = `scr_t_${grade.course?.id || grade.course_id || idx}`;
                  const hasTeacherAvatar = Boolean(
                    teacherMeta.image && !failedAvatars[avatarKey]
                  );

                  const courseName =
                    grade.course?.course_name ||
                    grade.course_name ||
                    t('មុខវិជ្ជាសិក្សា', 'Course');
                  const courseCode = grade.course?.course_code || '';
                  const credit = grade.course?.credit || 3;

                  return (
                    <tr
                      key={grade.course?.id || grade.course_id || idx}
                      className="std-scr-row hover:bg-blue-50/30 transition-colors duration-200 group"
                    >
                      <td className="std-scr-text-secondary px-4 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-400">
                        {idx + 1}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap align-middle">
                        <div className="flex items-center gap-3">
                          <div className="std-scr-badge-indigo h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
                            <BookOpenIcon className="h-4 w-4 stroke-[2.2]" />
                          </div>
                          <div>
                            <div className="std-scr-text-primary text-sm font-extrabold text-gray-900">
                              {courseName}
                            </div>
                            <span className="std-scr-text-secondary text-[11px] font-bold text-gray-400 uppercase">
                              {courseCode ? `${courseCode} • ` : ''}
                              {credit} {t('ក្រេឌីត', 'Credits')}
                            </span>
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
                          <div className="min-w-0">
                            <span className="std-scr-text-primary block text-sm font-bold text-gray-800 truncate max-w-[160px]">
                              {teacherMeta.name}
                            </span>
                            {teacherMeta.specialization && (
                              <span className="std-scr-text-secondary block text-[10px] font-medium text-gray-400 truncate max-w-[160px]">
                                {teacherMeta.specialization}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* ✅ កិច្ចការ (20%) */}
                      <td className="px-4 py-4 whitespace-nowrap text-center align-middle">
                        {grade.cleanAssign !== null ? (
                          <span
                            className="std-scr-code-pill inline-block px-3 py-1 rounded-lg text-xs font-extrabold text-gray-800 bg-gray-50 border border-gray-200"
                            title={`${t('សមាមាត្រ៖', 'Ratio:')} ${grade.rawAssign100}%`}
                          >
                            {grade.cleanAssign}
                          </span>
                        ) : (
                          <span className="std-scr-text-secondary text-xs font-bold text-gray-300">
                            —
                          </span>
                        )}
                      </td>

                      {/* ✅ សំណួរខ្លី (20%) */}
                      <td className="px-4 py-4 whitespace-nowrap text-center align-middle">
                        {grade.cleanQuiz !== null ? (
                          <span
                            className="std-scr-code-pill inline-block px-3 py-1 rounded-lg text-xs font-extrabold text-gray-800 bg-gray-50 border border-gray-200"
                            title={`${t('សមាមាត្រ៖', 'Ratio:')} ${grade.rawQuiz100}%`}
                          >
                            {grade.cleanQuiz}
                          </span>
                        ) : (
                          <span className="std-scr-text-secondary text-xs font-bold text-gray-300">
                            —
                          </span>
                        )}
                      </td>

                      {/* ✅ ពាក់កណ្តាលឆមាស (25%) */}
                      <td className="px-4 py-4 whitespace-nowrap text-center align-middle">
                        {grade.cleanMidterm !== null ? (
                          <span
                            className="std-scr-code-pill inline-block px-3 py-1 rounded-lg text-xs font-extrabold text-gray-800 bg-gray-50 border border-gray-200"
                            title={`${t('សមាមាត្រ៖', 'Ratio:')} ${grade.rawMidterm100}%`}
                          >
                            {grade.cleanMidterm}
                          </span>
                        ) : (
                          <span className="std-scr-text-secondary text-xs font-bold text-gray-300">
                            —
                          </span>
                        )}
                      </td>

                      {/* ✅ ប្រឡងបញ្ចប់ (35%) */}
                      <td className="px-4 py-4 whitespace-nowrap text-center align-middle">
                        {grade.cleanExam !== null ? (
                          <span
                            className="std-scr-code-pill inline-block px-3 py-1 rounded-lg text-xs font-extrabold text-gray-800 bg-gray-50 border border-gray-200"
                            title={`${t('សមាមាត្រ៖', 'Ratio:')} ${grade.rawExam100}%`}
                          >
                            {grade.cleanExam}
                          </span>
                        ) : (
                          <span className="std-scr-text-secondary text-xs font-bold text-gray-300">
                            —
                          </span>
                        )}
                      </td>

                      {/* ✅ ពិន្ទុសរុប */}
                      <td className="px-5 py-4 whitespace-nowrap text-center align-middle">
                        {grade.cleanFinal !== null ? (
                          <span className="std-scr-badge-indigo inline-block px-3 py-1.5 rounded-xl text-sm font-black text-indigo-700 bg-indigo-50 border border-indigo-200/80">
                            {grade.cleanFinal} {t('ពិន្ទុ', 'pts')}
                          </span>
                        ) : (
                          <span className="std-scr-text-secondary text-xs font-bold text-gray-300">
                            —
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-center align-middle">
                        {getResultBadge(grade)}
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
      {/* 📌 4. CSS សម្រាប់កំណត់ពណ៌ក្នុងទម្រង់យប់ (DARK MODE STYLING)            */}
      {/* ================================================================== */}
      <style>{`
        .std-scr-grid-pattern {
          background-image: radial-gradient(rgba(255, 255, 255, 0.25) 1px, transparent 1px);
          background-size: 20px 20px;
        }

        .std-scr-row + .std-scr-row > td {
          border-top: 1px solid #f1f5f9;
        }

        html.dark .std-scr-page {
          background-color: transparent !important;
        }
        html.dark .std-scr-surface,
        html.dark .std-scr-bar {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .std-scr-subbox {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .std-scr-divider {
          border-color: #334155 !important;
        }
        html.dark .std-scr-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        html.dark .std-scr-input::placeholder {
          color: #64748b !important;
        }
        html.dark .std-scr-thead {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .std-scr-thead th {
          color: #94a3b8 !important;
        }
        html.dark .std-scr-tbody {
          background-color: #1e293b !important;
        }
        html.dark .std-scr-row + .std-scr-row > td {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .std-scr-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }
        html.dark .std-scr-text-primary {
          color: #f8fafc !important;
        }
        html.dark .std-scr-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .std-scr-code-pill {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .std-scr-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .std-scr-badge-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .std-scr-badge-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .std-scr-badge-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          color: #818cf8 !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .std-scr-badge-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
      `}</style>
    </div>
  );
};

export default ViewScores;
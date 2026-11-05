// src/components/teacher/TeacherManageGrades.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import XLSX from 'xlsx-js-style';
import {
  BookOpenIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  SparklesIcon,
  ChevronDownIcon,
  XMarkIcon,
  DocumentIcon,
  ChartBarIcon,
  UserGroupIcon,
  AcademicCapIcon,
  CheckBadgeIcon,
  Squares2X2Icon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនីគ្រូម្នាក់ៗ (User-Scoped 0ms Cache)
// ============================================================================
const CACHE_KEY_SHARED_COURSES = 'cached_teacher_courses_list_v6';
const CACHE_KEY_SHARED_STUDENTS = 'cached_teacher_students_list_v6';
const CACHE_KEY_SHARED_MAP = 'cached_teacher_course_map_v6';

const getCoursesCacheKey = (uid) => `cached_teacher_courses_list_v8_${uid}`;
const getStudentsCacheKey = (uid) => `cached_teacher_students_list_v8_${uid}`;
const getCourseMapCacheKey = (uid) => `cached_teacher_course_map_v8_${uid}`;
const getExamScoresMapKey = (uid) => `cached_teacher_exam_scores_map_v3_${uid}`;
const getSelectedYearKey = (uid) => `cached_teacher_grades_selected_year_${uid}`;
const getSelectedCourseKey = (uid) => `cached_teacher_grades_selected_course_${uid}`;
const getSelectedShiftKey = (uid) => `cached_teacher_grades_selected_shift_${uid}`;
const getCourseScoresCacheKey = (uid, courseId) =>
  `cached_teacher_course_scores_v9_${uid}_${courseId}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់គ្រូម្នាក់ៗ (គាំទ្រទាំងពេលមានសិស្ស និងពេល 0 នាក់)
const GRADES_MEM_CACHE = {
  uid: null,
  courses: null,
  allStudents: null,
  courseMap: null,
  examScoresMap: null,
  scoresByCourse: {},
  lastSyncedMasterAt: 0,
  lastSyncedScoresAt: {},
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

// ✅ អនុគមន៍កាត់ .00 ចេញពីពិន្ទុ (ឧ. 85.00 -> 85)
const cleanScoreVal = (val) => {
  if (val === '' || val === null || val === undefined) return '';
  const num = Number(val);
  if (isNaN(num)) return '';
  return Math.round(num * 100) / 100;
};

// ✅ មាត្រដ្ឋានពិន្ទុពេញតាមផ្នែកនីមួយៗ (កិច្ចការ 20, សំណួរខ្លី 20, ពាក់កណ្តាលឆមាស 25, ប្រឡងបញ្ចប់ 35)
const FIELD_MAX_WEIGHTS = {
  assignment_score: 20,
  quiz_score: 20,
  midterm_score: 25,
  exam_score: 35,
};

// ✅ បម្លែងពិន្ទុឆៅលើ 100 ពី Backend មកជាពិន្ទុតាមទម្ងន់ (20, 20, 25, 35)
// ឧទាហរណ៍៖ សំណួរខ្លី 50% (50/100) -> 50 * 20 / 100 = 10
const toWeightedScore = (rawVal100, maxWeight) => {
  if (rawVal100 === '' || rawVal100 === null || rawVal100 === undefined) return '';
  const num = Number(rawVal100);
  if (isNaN(num)) return '';
  const scaled = (num * maxWeight) / 100;
  return Math.min(maxWeight, Math.max(0, Math.round(scaled * 100) / 100));
};

// ✅ បម្លែងពិន្ទុពីទម្ងន់ (20, 20, 25, 35) ត្រឡប់ទៅមាត្រដ្ឋាន 100 វិញ សម្រាប់រក្សាទុកក្នុង Backend
const toRaw100Score = (weightedVal, maxWeight) => {
  if (weightedVal === '' || weightedVal === null || weightedVal === undefined) return null;
  const num = Number(weightedVal);
  if (isNaN(num)) return null;
  const raw100 = (num / maxWeight) * 100;
  return Math.min(100, Math.max(0, Math.round(raw100 * 100) / 100));
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
      id: `local_grade_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
    return (
      (Number(a.student_record_id || a.student_id || a.id) || 0) -
      (Number(b.student_record_id || b.student_id || b.id) || 0)
    );
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
    const recId = student.student_record_id || student.id;
    return (
      mappedIds.includes(Number(recId)) ||
      mappedIds.includes(String(recId)) ||
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
    const recId = student.student_record_id || student.id;
    return Object.values(courseMap).some(
      (arr) =>
        Array.isArray(arr) &&
        (arr.includes(Number(recId)) ||
          arr.includes(String(recId)) ||
          arr.includes(Number(student.id)) ||
          arr.includes(String(student.id)))
    );
  }
  return false;
};

// ✅ គណនាពិន្ទុសរុបជាផលបូកពិន្ទុពិតប្រាកដ (កិច្ចការ 20 + សំណួរខ្លី 20 + ពាក់កណ្តាលឆមាស 25 + ប្រឡងបញ្ចប់ 35 = 100 ពិន្ទុ)
const calculateRowMetrics = (assignPts, quizPts, midtermPts, examPts) => {
  const a =
    assignPts !== '' && assignPts !== null && assignPts !== undefined
      ? parseFloat(assignPts)
      : null;
  const q =
    quizPts !== '' && quizPts !== null && quizPts !== undefined
      ? parseFloat(quizPts)
      : null;
  const m =
    midtermPts !== '' && midtermPts !== null && midtermPts !== undefined
      ? parseFloat(midtermPts)
      : null;
  const e =
    examPts !== '' && examPts !== null && examPts !== undefined
      ? parseFloat(examPts)
      : null;

  let pointsSum = 0;
  let weightTotal = 0;

  if (a !== null && !isNaN(a)) {
    pointsSum += a;
    weightTotal += 20;
  }
  if (q !== null && !isNaN(q)) {
    pointsSum += q;
    weightTotal += 20;
  }
  if (m !== null && !isNaN(m)) {
    pointsSum += m;
    weightTotal += 25;
  }
  if (e !== null && !isNaN(e)) {
    pointsSum += e;
    weightTotal += 35;
  }

  if (weightTotal === 0) {
    return { total: null, backendFinal: null, letter: '', isPassed: null };
  }

  // ផលបូកពិន្ទុសរុបដែលបង្ហាញលើតារាង (ឧ. 10 ពិន្ទុ) ដូចក្នុង ViewScores.jsx របស់សិស្ស
  const totalPoints = Math.round(pointsSum * 100) / 100;

  // ពិន្ទុសមាមាត្រលើ 100 សម្រាប់គណនានិទ្ទេស និងស្ថានភាព ជាប់/ធ្លាក់
  const normalizedScore = Math.round(((pointsSum / weightTotal) * 100) * 100) / 100;

  let letter = '';
  if (normalizedScore >= 90) letter = 'A';
  else if (normalizedScore >= 85) letter = 'B+';
  else if (normalizedScore >= 80) letter = 'B';
  else if (normalizedScore >= 70) letter = 'C+';
  else if (normalizedScore >= 65) letter = 'C';
  else if (normalizedScore >= 50) letter = 'D';
  else letter = 'F';

  return {
    total: totalPoints,
    backendFinal: normalizedScore,
    letter,
    isPassed: normalizedScore >= 50,
  };
};

// ✅ រៀបចំទម្រង់ទិន្នន័យពិន្ទុសិស្ស (បម្លែងពិន្ទុពីមាត្រដ្ឋាន 100 មកជាមាត្រដ្ឋាន 20/20/25/35)
const formatScoresList = (scoresData, courseId = '') => {
  if (!Array.isArray(scoresData)) return [];
  const formatted = scoresData.map((s, idx) => {
    const resolvedUserId =
      s.user_id || s.student?.user_id || s.student_id || s.id;
    const cid = String(courseId || s.course_id || '');
    const examKey = `${cid}_${resolvedUserId}`;

    const studentName =
      s.student?.name ||
      (s.student?.first_name
        ? `${s.student.first_name} ${s.student.last_name || ''}`.trim()
        : '') ||
      s.student_name ||
      (s.first_name ? `${s.first_name} ${s.last_name || ''}`.trim() : '') ||
      s.name ||
      `Student #${resolvedUserId || idx + 1}`;

    const stuCode =
      s.student_code ||
      s.student?.student_code ||
      s.student?.code ||
      `STU${String(resolvedUserId || idx + 1).padStart(3, '0')}`;

    const autoAssignRaw100 = cleanScoreVal(s.auto_assignment_score);
    const autoQuizRaw100 = cleanScoreVal(s.auto_quiz_score);

    const assignRaw100 =
      s.assignment_score !== null &&
      s.assignment_score !== undefined &&
      s.assignment_score !== ''
        ? cleanScoreVal(s.assignment_score)
        : autoAssignRaw100;
    const quizRaw100 =
      s.quiz_score !== null &&
      s.quiz_score !== undefined &&
      s.quiz_score !== ''
        ? cleanScoreVal(s.quiz_score)
        : autoQuizRaw100;
    const midtermRaw100 = cleanScoreVal(s.midterm_score);
    const finalTotalRaw100 = cleanScoreVal(s.final_score);

    let examRaw100 = cleanScoreVal(s.exam_score);

    if (
      examRaw100 === '' &&
      GRADES_MEM_CACHE.examScoresMap?.[examKey] !== undefined &&
      GRADES_MEM_CACHE.examScoresMap?.[examKey] !== ''
    ) {
      // ក្នុង examScoresMap v3 រក្សាទុកជាពិន្ទុក្នុងចំណោម 35 រួចហើយ -> បម្លែងមក 100 សិន
      const cachedExam35 = cleanScoreVal(GRADES_MEM_CACHE.examScoresMap[examKey]);
      if (cachedExam35 !== '') {
        examRaw100 = toRaw100Score(cachedExam35, 35) ?? '';
      }
    }

    if (examRaw100 === '' && finalTotalRaw100 !== '') {
      let partialWeightedSum = 0;
      let partialWeightTotal = 0;

      if (assignRaw100 !== '') {
        partialWeightedSum += Number(assignRaw100) * 0.2;
        partialWeightTotal += 0.2;
      }
      if (quizRaw100 !== '') {
        partialWeightedSum += Number(quizRaw100) * 0.2;
        partialWeightTotal += 0.2;
      }
      if (midtermRaw100 !== '') {
        partialWeightedSum += Number(midtermRaw100) * 0.25;
        partialWeightTotal += 0.25;
      }

      const partialOnlyAvg =
        partialWeightTotal > 0
          ? Math.round((partialWeightedSum / partialWeightTotal) * 100) / 100
          : null;

      if (partialWeightTotal === 0) {
        examRaw100 = finalTotalRaw100;
      } else if (
        partialOnlyAvg !== null &&
        Math.abs(Number(finalTotalRaw100) - partialOnlyAvg) > 0.05
      ) {
        const totalWeightWithExam = partialWeightTotal + 0.35;
        const calcExam =
          (Number(finalTotalRaw100) * totalWeightWithExam - partialWeightedSum) /
          0.35;
        if (!isNaN(calcExam) && calcExam >= 0 && calcExam <= 100) {
          examRaw100 = Math.round(calcExam * 100) / 100;
        }
      }
    }

    // ✅ បម្លែងមកជាពិន្ទុតាមទម្ងន់នៃផ្នែកនីមួយៗ (20, 20, 25, 35)
    const assignPts20 = toWeightedScore(assignRaw100, 20);
    const autoAssignPts20 = toWeightedScore(autoAssignRaw100, 20);
    const quizPts20 = toWeightedScore(quizRaw100, 20);
    const autoQuizPts20 = toWeightedScore(autoQuizRaw100, 20);
    const midtermPts25 = toWeightedScore(midtermRaw100, 25);
    const examPts35 = toWeightedScore(examRaw100, 35);

    const { total, letter } = calculateRowMetrics(
      assignPts20,
      quizPts20,
      midtermPts25,
      examPts35
    );

    return {
      ...s,
      student_id: resolvedUserId,
      student_record_id: s.student_record_id || s.id,
      student_name: studentName,
      student_code: stuCode,
      gender: s.gender || s.student?.gender || '',
      batch_year: s.batch_year || s.student?.batch_year || '',
      study_shift: s.study_shift || s.student?.study_shift || 'Monday-Friday',
      enrolled_course_ids: s.enrolled_course_ids || s.course_ids || [],
      is_enrolled_with_teacher: s.is_enrolled_with_teacher,
      assignment_score: assignPts20,
      auto_assignment_score: autoAssignPts20,
      quiz_score: quizPts20,
      auto_quiz_score: autoQuizPts20,
      midterm_score: midtermPts25,
      exam_score: examPts35,
      final_score: total !== null ? total : finalTotalRaw100,
      grade_letter: letter || s.grade_letter || '',
    };
  });

  return sortStudentsOldestFirst(formatted);
};

// ✅ អនុគមន៍បង្កើតតារាងពិន្ទុភ្លាមៗក្នុង 0 វិនាទី តាម «កាតឆ្នាំសិក្សា» និងតាម «មុខវិជ្ជា»
const buildInstantCourseScores = (
  selectedYear,
  courseId,
  allStudents,
  courseMap,
  cachedScoresList
) => {
  const yKey = String(selectedYear || 'all');
  const cid = yKey !== 'all' ? String(courseId || '') : '';

  if (Array.isArray(allStudents) && allStudents.length > 0) {
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

    const scoreLookup =
      cid !== '' && Array.isArray(cachedScoresList) ? cachedScoresList : [];

    const merged = targetStudents.map((std) => {
      const targetUserId = std.user_id || std.user?.id || std.id;
      const isEnrolledAny = isStudentEnrolledInAnyTeacherCourse(std, courseMap);
      const matchedScore = scoreLookup.find(
        (sc) =>
          String(sc.student_id) === String(targetUserId) ||
          String(sc.student_id) === String(std.id) ||
          (sc.student_code &&
            std.student_code &&
            sc.student_code === std.student_code)
      );

      if (matchedScore) {
        return {
          ...matchedScore,
          student_id: targetUserId,
          student_record_id: std.id,
          enrolled_course_ids: std.enrolled_course_ids || [],
          is_enrolled_with_teacher: isEnrolledAny,
          student_name:
            `${std.first_name || ''} ${std.last_name || ''}`.trim() ||
            matchedScore.student_name,
          student_code: std.student_code || matchedScore.student_code,
          batch_year: std.batch_year || matchedScore.batch_year || '',
          gender: std.gender || matchedScore.gender || '',
          study_shift:
            std.study_shift || matchedScore.study_shift || 'Monday-Friday',
          student: {
            ...(matchedScore.student || {}),
            id: targetUserId,
            first_name: std.first_name,
            last_name: std.last_name,
            gender: std.gender,
            study_shift: std.study_shift,
            profile_image:
              std.profile_image || matchedScore.student?.profile_image,
          },
        };
      }

      return formatScoresList(
        [
          {
            id: std.id,
            student_record_id: std.id,
            student_id: targetUserId,
            user_id: targetUserId,
            student_code: std.student_code,
            first_name: std.first_name,
            last_name: std.last_name,
            batch_year: std.batch_year,
            gender: std.gender,
            study_shift: std.study_shift || 'Monday-Friday',
            enrolled_course_ids: std.enrolled_course_ids || [],
            is_enrolled_with_teacher: isEnrolledAny,
            student: {
              id: targetUserId,
              first_name: std.first_name,
              last_name: std.last_name,
              gender: std.gender,
              study_shift: std.study_shift,
              profile_image: std.profile_image,
            },
            assignment_score: null,
            quiz_score: null,
            midterm_score: null,
            final_score: null,
            grade_letter: null,
          },
        ],
        cid
      )[0];
    });

    return sortStudentsOldestFirst(merged);
  }

  return Array.isArray(cachedScoresList) ? cachedScoresList : [];
};

const TeacherManageGrades = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialRouteCourseId =
    searchParams.get('course_id') || location.state?.courseId || '';

  // ✅ កំណត់អត្តសញ្ញាណគ្រូបច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentTeacherId = useMemo(() => resolveTeacherUid(user), [user]);

  // បើប្ដូរគណនីគ្រូ ឱ្យសម្អាត RAM Cache ចាស់ចោលភ្លាមៗ
  if (GRADES_MEM_CACHE.uid && GRADES_MEM_CACHE.uid !== currentTeacherId) {
    GRADES_MEM_CACHE.courses = null;
    GRADES_MEM_CACHE.allStudents = null;
    GRADES_MEM_CACHE.courseMap = null;
    GRADES_MEM_CACHE.examScoresMap = null;
    GRADES_MEM_CACHE.scoresByCourse = {};
    GRADES_MEM_CACHE.lastSyncedMasterAt = 0;
    GRADES_MEM_CACHE.lastSyncedScoresAt = {};
  }
  GRADES_MEM_CACHE.uid = currentTeacherId;

  if (!GRADES_MEM_CACHE.examScoresMap) {
    GRADES_MEM_CACHE.examScoresMap = readStorageJson(
      getExamScoresMapKey(currentTeacherId),
      {}
    );
  }

  // ✅ ១. អានពី Cache ភ្លាមៗក្នុង 0 វិនាទី
  const [allStudents, setAllStudents] = useState(() => {
    if (Array.isArray(GRADES_MEM_CACHE.allStudents)) {
      return GRADES_MEM_CACHE.allStudents;
    }
    const fromUserKey = readStorageJson(
      getStudentsCacheKey(currentTeacherId),
      null
    );
    if (Array.isArray(fromUserKey)) {
      GRADES_MEM_CACHE.allStudents = fromUserKey;
      return fromUserKey;
    }
    return readStorageJson(CACHE_KEY_SHARED_STUDENTS, []);
  });

  const [courses, setCourses] = useState(() => {
    if (Array.isArray(GRADES_MEM_CACHE.courses)) return GRADES_MEM_CACHE.courses;
    const cached =
      readStorageJson(getCoursesCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES, []);
    GRADES_MEM_CACHE.courses = cached;
    return cached;
  });

  const [courseMap, setCourseMap] = useState(() => {
    if (GRADES_MEM_CACHE.courseMap) return GRADES_MEM_CACHE.courseMap;
    const cached =
      readStorageJson(getCourseMapCacheKey(currentTeacherId), null) ||
      readStorageJson(CACHE_KEY_SHARED_MAP, {});
    GRADES_MEM_CACHE.courseMap = cached;
    return cached;
  });

  // ✅ កាតឆ្នាំសិក្សា៖ 'all' | '1' | '2' | '3' | '4'
  const [selectedYear, setSelectedYear] = useState(() => {
    if (initialRouteCourseId) {
      const enrolledInRouteCourse = (GRADES_MEM_CACHE.allStudents || []).find(
        (s) =>
          isStudentEnrolledInCourse(
            s,
            initialRouteCourseId,
            GRADES_MEM_CACHE.courseMap
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

  const [studentScores, setStudentScores] = useState(() => {
    const cid = selectedYear !== 'all' ? String(selectedCourse || '') : '';
    const cachedScores = cid
      ? GRADES_MEM_CACHE.scoresByCourse[cid] ||
        readStorageJson(getCourseScoresCacheKey(currentTeacherId, cid), [])
      : [];
    return buildInstantCourseScores(
      selectedYear,
      cid,
      GRADES_MEM_CACHE.allStudents,
      GRADES_MEM_CACHE.courseMap,
      cachedScores
    );
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [savingRowId, setSavingRowId] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const abortControllerRef = useRef(null);

  const getProfileImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http') || imagePath.startsWith('data:'))
      return imagePath;
    const baseUrl = (
      import.meta.env.VITE_API_URL || 'http://localhost:8000'
    ).replace(/\/api\/?$/, '');
    const cleanPath = imagePath.replace(/^\/?storage\//, '').replace(/^\/+/, '');
    return `${baseUrl}/storage/${cleanPath}`;
  };

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

    if (Array.isArray(cachedStd)) {
      setAllStudents(cachedStd);
      GRADES_MEM_CACHE.allStudents = cachedStd;
    }
    if (Array.isArray(cachedCrs)) {
      setCourses(cachedCrs);
      GRADES_MEM_CACHE.courses = cachedCrs;
    }
    if (cachedMap) {
      setCourseMap(cachedMap);
      GRADES_MEM_CACHE.courseMap = cachedMap;
    }

    const now = Date.now();
    if (
      GRADES_MEM_CACHE.uid === currentTeacherId &&
      Array.isArray(GRADES_MEM_CACHE.allStudents) &&
      Array.isArray(GRADES_MEM_CACHE.courses) &&
      now - GRADES_MEM_CACHE.lastSyncedMasterAt < 30000
    ) {
      return;
    }

    // ១. ទាញបញ្ជីសិស្សមុនគេ
    api
      .get('/teacher/students')
      .then((stdRes) => {
        if (!isMounted) return;
        const rawStd = stdRes.data?.data || stdRes.data || [];
        const latestStudents = Array.isArray(rawStd) ? rawStd : [];
        setAllStudents(latestStudents);
        GRADES_MEM_CACHE.allStudents = latestStudents;
        GRADES_MEM_CACHE.lastSyncedMasterAt = Date.now();
        try {
          localStorage.setItem(
            getStudentsCacheKey(currentTeacherId),
            JSON.stringify(latestStudents)
          );
          localStorage.setItem(
            CACHE_KEY_SHARED_STUDENTS,
            JSON.stringify(latestStudents)
          );
        } catch {}

        if (stdRes.data?.course_students_map) {
          setCourseMap(stdRes.data.course_students_map);
          GRADES_MEM_CACHE.courseMap = stdRes.data.course_students_map;
          try {
            localStorage.setItem(
              getCourseMapCacheKey(currentTeacherId),
              JSON.stringify(stdRes.data.course_students_map)
            );
            localStorage.setItem(
              CACHE_KEY_SHARED_MAP,
              JSON.stringify(stdRes.data.course_students_map)
            );
          } catch {}
        }
      })
      .catch(() => {});

    // ២. ទាញមុខវិជ្ជានៅផ្ទៃខាងក្រោយដោយឯករាជ្យ
    api
      .get('/teacher/courses')
      .then((crsRes) => {
        if (!isMounted) return;
        const rawCrs = crsRes.data?.data || crsRes.data || [];
        const latestCourses = Array.isArray(rawCrs) ? rawCrs : [];
        setCourses(latestCourses);
        GRADES_MEM_CACHE.courses = latestCourses;
        try {
          localStorage.setItem(
            getCoursesCacheKey(currentTeacherId),
            JSON.stringify(latestCourses)
          );
          localStorage.setItem(
            CACHE_KEY_SHARED_COURSES,
            JSON.stringify(latestCourses)
          );
        } catch {}
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [currentTeacherId]);

  // ពេលជ្រើសរើសកាតឆ្នាំសិក្សា ឬមុខវិជ្ជា៖ បង្ហាញសិស្សភ្លាមៗក្នុង 0 វិនាទី
  useEffect(() => {
    const cid = selectedYear !== 'all' ? String(selectedCourse || '') : '';

    if (!cid) {
      const rowsForYear = buildInstantCourseScores(
        selectedYear,
        '',
        allStudents,
        courseMap,
        []
      );
      setStudentScores(rowsForYear);
      return;
    }

    const cachedScores =
      GRADES_MEM_CACHE.scoresByCourse[cid] ||
      readStorageJson(getCourseScoresCacheKey(currentTeacherId, cid), []);

    const instantScores = buildInstantCourseScores(
      selectedYear,
      cid,
      allStudents,
      courseMap,
      cachedScores
    );
    setStudentScores(instantScores);

    fetchScoresInBackground(selectedYear, cid);
  }, [selectedYear, selectedCourse, allStudents, courseMap, currentTeacherId]);

  const fetchScoresInBackground = async (yearKey, courseId) => {
    if (!courseId) return;
    const cid = String(courseId);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await api.get(`/teacher/courses/${cid}/scores`, {
        signal: controller.signal,
      });
      const scoresData = response.data?.data || response.data || [];
      const formattedFromApi = formatScoresList(scoresData, cid);

      GRADES_MEM_CACHE.scoresByCourse[cid] = formattedFromApi;
      GRADES_MEM_CACHE.lastSyncedScoresAt[cid] = Date.now();

      const mergedWithEnrolled = buildInstantCourseScores(
        yearKey,
        cid,
        GRADES_MEM_CACHE.allStudents || allStudents,
        GRADES_MEM_CACHE.courseMap || courseMap,
        formattedFromApi
      );

      setStudentScores(mergedWithEnrolled);
      try {
        localStorage.setItem(
          getCourseScoresCacheKey(currentTeacherId, cid),
          JSON.stringify(mergedWithEnrolled)
        );
      } catch (e) {}
    } catch (error) {
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED')
        return;
      console.error('Error fetching scores:', error);
    }
  };

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ ការគណនាចំនួនសិស្សតាមវេនសិក្សា និងមុខងារកែប្រែពិន្ទុ
  // ============================================================================
  const isCourseSelected = selectedYear !== 'all' && selectedCourse !== '';
  const isSpecificShiftSelected =
    selectedShift !== 'all' && selectedShift !== '';

  const activeCourseObj = useMemo(() => {
    if (!isCourseSelected) return null;
    return (
      enrichedCourses.find((c) => String(c.id) === String(selectedCourse)) ||
      null
    );
  }, [isCourseSelected, selectedCourse, enrichedCourses]);

  // ✅ គណនាចំនួនសិស្សតាមវេនសិក្សា (គ្រប់វេន, ចន្ទ-សុក្រ, សៅរ៍-អាទិត្យ)
  const shiftCounts = useMemo(() => {
    let monFri = 0;
    let satSun = 0;

    studentScores.forEach((item) => {
      const rawShift = item.study_shift || item.student?.study_shift;
      const norm = normalizeShiftKey(rawShift);
      if (norm === 'Saturday-Sunday') satSun += 1;
      else monFri += 1;
    });

    return {
      all: studentScores.length,
      'Monday-Friday': monFri,
      'Saturday-Sunday': satSun,
    };
  }, [studentScores]);

  // ✅ ច្រោះបញ្ជីពិន្ទុសិស្សតាមវេនសិក្សា និងតាមពាក្យស្វែងរក
  const filteredScores = useMemo(() => {
    const s = searchTerm.toLowerCase().trim();

    return studentScores.filter((item) => {
      const rawShift = item.study_shift || item.student?.study_shift;
      const matchesShift =
        !isSpecificShiftSelected ||
        normalizeShiftKey(rawShift) === selectedShift;
      if (!matchesShift) return false;

      if (!s) return true;
      const name = (item.student?.name || item.student_name || '').toLowerCase();
      const code = (item.student_code || '').toLowerCase();
      return name.includes(s) || code.includes(s);
    });
  }, [studentScores, selectedShift, isSpecificShiftSelected, searchTerm]);

  const handleScoreChange = (studentId, field, rawValue) => {
    if (!isCourseSelected) {
      toast.info(
        t(
          'សូមជ្រើសរើសមុខវិជ្ជាជាមុនសិន ដើម្បីបញ្ចូលពិន្ទុឱ្យសិស្ស',
          'Please select a course first to input student scores'
        )
      );
      return;
    }

    const maxAllowed = FIELD_MAX_WEIGHTS[field] || 100;
    let value = rawValue;
    if (value !== '') {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        if (num > maxAllowed) value = String(maxAllowed);
        else if (num < 0) value = '0';
      }
    }

    if (field === 'exam_score' && selectedCourse) {
      const examKey = `${selectedCourse}_${studentId}`;
      GRADES_MEM_CACHE.examScoresMap = {
        ...(GRADES_MEM_CACHE.examScoresMap || {}),
        [examKey]: value,
      };
      try {
        localStorage.setItem(
          getExamScoresMapKey(currentTeacherId),
          JSON.stringify(GRADES_MEM_CACHE.examScoresMap)
        );
      } catch {}
    }

    setStudentScores((prev) =>
      prev.map((item) => {
        if (item.student_id === studentId) {
          const updated = { ...item, [field]: value };
          const { total, letter } = calculateRowMetrics(
            updated.assignment_score,
            updated.quiz_score,
            updated.midterm_score,
            updated.exam_score
          );
          updated.final_score = total;
          updated.grade_letter = letter;
          return updated;
        }
        return item;
      })
    );
  };

  const handleAutoFill = () => {
    if (!isCourseSelected) {
      toast.warning(
        t('សូមជ្រើសរើសមុខវិជ្ជាជាមុនសិន', 'Please select a course first')
      );
      return;
    }
    if (filteredScores.length === 0) return;

    const visibleIds = new Set(
      filteredScores.map((item) => String(item.student_id))
    );

    setStudentScores((prev) => {
      const updatedList = prev.map((item) => {
        if (!visibleIds.has(String(item.student_id))) return item;

        const assign =
          item.auto_assignment_score !== '' &&
          item.auto_assignment_score !== null &&
          item.auto_assignment_score !== undefined
            ? cleanScoreVal(item.auto_assignment_score)
            : cleanScoreVal(item.assignment_score);
        const quiz =
          item.auto_quiz_score !== '' &&
          item.auto_quiz_score !== null &&
          item.auto_quiz_score !== undefined
            ? cleanScoreVal(item.auto_quiz_score)
            : cleanScoreVal(item.quiz_score);
        const midterm = cleanScoreVal(item.midterm_score);
        const exam = cleanScoreVal(item.exam_score);

        const { total, letter } = calculateRowMetrics(
          assign,
          quiz,
          midterm,
          exam
        );
        return {
          ...item,
          assignment_score: assign,
          quiz_score: quiz,
          final_score: total,
          grade_letter: letter,
        };
      });

      const cid = String(selectedCourse);
      GRADES_MEM_CACHE.scoresByCourse[cid] = updatedList;
      try {
        localStorage.setItem(
          getCourseScoresCacheKey(currentTeacherId, cid),
          JSON.stringify(updatedList)
        );
      } catch (e) {}
      return updatedList;
    });

    toast.info(
      t(
        'បានគណនា និងបំពេញពិន្ទុកិច្ចការ (20%) និងសំណួរខ្លី (20%) ដោយស្វ័យប្រវត្តិ!',
        'Auto-filled assignment (20%) and quiz (20%) scores successfully!'
      )
    );
  };

  // ✅ រក្សាទុកពិន្ទុសិស្សម្នាក់ៗ + បម្លែងត្រឡប់ទៅមាត្រដ្ឋាន 100 សម្រាប់ Backend
  const saveSingleRow = async (item) => {
    if (!isCourseSelected) {
      toast.warning(
        t(
          'សូមជ្រើសរើសមុខវិជ្ជាជាមុនសិន មុននឹងរក្សាទុកពិន្ទុ',
          'Please select a course before saving grades'
        )
      );
      return;
    }

    setSavingRowId(item.student_id);
    try {
      const { total, backendFinal, letter, isPassed } = calculateRowMetrics(
        item.assignment_score,
        item.quiz_score,
        item.midterm_score,
        item.exam_score
      );

      const payload = {
        student_id: item.student_id,
        course_id: parseInt(selectedCourse, 10),
        assignment_score: toRaw100Score(item.assignment_score, 20),
        quiz_score: toRaw100Score(item.quiz_score, 20),
        midterm_score: toRaw100Score(item.midterm_score, 25),
        exam_score: toRaw100Score(item.exam_score, 35),
        final_score: backendFinal !== null ? backendFinal : null,
        grade_letter: letter || null,
      };

      await api.post('/teacher/scores', payload);

      const cid = String(selectedCourse);
      GRADES_MEM_CACHE.scoresByCourse[cid] = studentScores;
      try {
        localStorage.setItem(
          getCourseScoresCacheKey(currentTeacherId, cid),
          JSON.stringify(studentScores)
        );
      } catch (e) {}

      toast.success(
        t(
          `បានរក្សាទុកពិន្ទុរបស់សិស្ស «${item.student_name}» ដោយជោគជ័យ!`,
          `Saved grades for "${item.student_name}" successfully!`
        )
      );

      const passResultKm =
        total === null ? 'រង់ចាំពិន្ទុ' : isPassed ? 'ជាប់' : 'ធ្លាក់';

      pushLocalNotification({
        titleKm: 'បានរក្សាទុកពិន្ទុសិស្ស',
        titleEn: 'Student Grade Saved',
        descKm: `ពិន្ទុរបស់សិស្ស «${item.student_name}» ក្នុងមុខវិជ្ជា «${activeCourseObj?.course_name || ''}» ត្រូវបានរក្សាទុក (${total !== null ? total + ' ពិន្ទុ' : '—'} | លទ្ធផល៖ ${passResultKm})។`,
        descEn: `Saved grade for "${item.student_name}" in "${activeCourseObj?.course_name || ''}" (${total !== null ? total + ' pts' : '—'}).`,
        category: 'grade',
        link: '/teacher/grades',
      });
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message ||
          t(
            'បរាជ័យក្នុងការរក្សាទុកពិន្ទុសិស្ស',
            'Failed to save student grade'
          )
      );
    } finally {
      setSavingRowId(null);
    }
  };

  // ✅ រក្សាទុកពិន្ទុសិស្សទាំងអស់ + បម្លែងត្រឡប់ទៅមាត្រដ្ឋាន 100 សម្រាប់ Backend
  const handleSaveAll = async (e) => {
    if (e) e.preventDefault();
    if (!isCourseSelected) {
      toast.warning(
        t(
          'សូមជ្រើសរើសមុខវិជ្ជាជាមុនសិន មុននឹងរក្សាទុកពិន្ទុ',
          'Please select a course before saving grades'
        )
      );
      return;
    }
    if (filteredScores.length === 0) return;

    setSavingAll(true);
    try {
      const scoresPayload = filteredScores.map((item) => {
        const { backendFinal, letter } = calculateRowMetrics(
          item.assignment_score,
          item.quiz_score,
          item.midterm_score,
          item.exam_score
        );
        return {
          student_id: item.student_id,
          course_id: parseInt(selectedCourse, 10),
          assignment_score: toRaw100Score(item.assignment_score, 20),
          quiz_score: toRaw100Score(item.quiz_score, 20),
          midterm_score: toRaw100Score(item.midterm_score, 25),
          exam_score: toRaw100Score(item.exam_score, 35),
          final_score: backendFinal !== null ? backendFinal : null,
          grade_letter: letter || null,
        };
      });

      await api.put('/teacher/scores', { scores: scoresPayload });

      const cid = String(selectedCourse);
      GRADES_MEM_CACHE.scoresByCourse[cid] = studentScores;
      try {
        localStorage.setItem(
          getCourseScoresCacheKey(currentTeacherId, cid),
          JSON.stringify(studentScores)
        );
      } catch (e) {}

      toast.success(
        t(
          `បានរក្សាទុកពិន្ទុសិស្សទាំង ${filteredScores.length} នាក់ដោយជោគជ័យ!`,
          `Successfully saved grades for ${filteredScores.length} students!`
        )
      );

      pushLocalNotification({
        titleKm: 'បានរក្សាទុកពិន្ទុសិស្សទាំងអស់ជោគជ័យ',
        titleEn: 'All Student Grades Saved',
        descKm: `បានរក្សាទុកតារាងពិន្ទុសិស្សចំនួន ${filteredScores.length} នាក់ សម្រាប់មុខវិជ្ជា «${activeCourseObj?.course_name || ''}»។`,
        descEn: `Saved grades for ${filteredScores.length} students in "${activeCourseObj?.course_name || ''}".`,
        category: 'grade',
        link: '/teacher/grades',
      });
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message ||
          t(
            'មានបញ្ហាក្នុងការរក្សាទុកពិន្ទុសិស្សទាំងអស់',
            'Failed to save all grades'
          )
      );
    } finally {
      setSavingAll(false);
    }
  };

  // ============================================================================
  // 📌 ផ្នែកទី៤៖ មុខងារនាំចេញតារាងពិន្ទុទៅជាឯកសារ Excel (.xlsx)
  // ============================================================================
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
    if (!filteredScores || filteredScores.length === 0) {
      toast.warning(
        t('គ្មានទិន្នន័យពិន្ទុសិស្សសម្រាប់នាំចេញទេ', 'No grades data to export')
      );
      return;
    }

    const exportData = filteredScores.map((item, idx) => {
      const { total, isPassed } = calculateRowMetrics(
        item.assignment_score,
        item.quiz_score,
        item.midterm_score,
        item.exam_score
      );
      const isEnrolledWithTeacher = isStudentEnrolledInAnyTeacherCourse(
        item,
        courseMap
      );
      const resultText =
        !isCourseSelected || total === null
          ? isEnrolledWithTeacher
            ? '—'
            : t('មិនទាន់ចុះឈ្មោះមុខវិជ្ជា', 'Not enrolled in course')
          : isPassed
          ? t('ជាប់ (Passed)', 'Passed')
          : t('ធ្លាក់ (Failed)', 'Failed');

      return {
        'ល.រ': idx + 1,
        'អត្តលេខសិស្ស': item.student_code || '—',
        'ឈ្មោះសិស្ស': item.student_name || '—',
        'ភេទ': getGenderLabel(item.gender || item.student?.gender),
        'ជំនាន់/ឆ្នាំសិក្សា': item.batch_year || '—',
        'វេនសិក្សា': getStudyShiftLabel(
          item.study_shift || item.student?.study_shift
        ),
        'កិច្ចការ (20%)':
          isCourseSelected &&
          item.assignment_score !== '' &&
          item.assignment_score !== null
            ? cleanScoreVal(item.assignment_score)
            : '—',
        'សំណួរខ្លី (20%)':
          isCourseSelected &&
          item.quiz_score !== '' &&
          item.quiz_score !== null
            ? cleanScoreVal(item.quiz_score)
            : '—',
        'ពាក់កណ្តាលឆមាស (25%)':
          isCourseSelected &&
          item.midterm_score !== '' &&
          item.midterm_score !== null
            ? cleanScoreVal(item.midterm_score)
            : '—',
        'ប្រឡងបញ្ចប់ (35%)':
          isCourseSelected &&
          item.exam_score !== '' &&
          item.exam_score !== null
            ? cleanScoreVal(item.exam_score)
            : '—',
        'ពិន្ទុសរុប':
          isCourseSelected && total !== null
            ? `${total} ${t('ពិន្ទុ', 'pts')}`
            : '—',
        'លទ្ធផល': resultText,
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
      { wch: 16 },
      { wch: 16 },
      { wch: 22 },
      { wch: 18 },
      { wch: 16 },
      { wch: 22 },
    ];
    applyExcelStyling(worksheet, colWidths, [1]);

    const yearSuffix = selectedYear !== 'all' ? `_Year${selectedYear}` : '';
    const courseSuffix = activeCourseObj?.course_code
      ? `_${activeCourseObj.course_code}`
      : '';
    const shiftSuffix = isSpecificShiftSelected ? `_${selectedShift}` : '';
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Student_Grades');
    XLSX.writeFile(
      workbook,
      `Grades${yearSuffix}${courseSuffix}${shiftSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    toast.success(
      t(
        'បាននាំចេញតារាងពិន្ទុទៅជា Excel ដោយជោគជ័យ!',
        'Grades exported to Excel successfully!'
      )
    );

    const exportScopeKm = activeCourseObj
      ? `មុខវិជ្ជា «${activeCourseObj.course_name}»`
      : selectedYear !== 'all'
      ? getYearTextLabel(selectedYear)
      : 'ទាំងអស់';

    pushLocalNotification({
      titleKm: 'បាននាំចេញតារាងពិន្ទុទៅ Excel',
      titleEn: 'Grades Exported to Excel',
      descKm: `តារាងពិន្ទុសិស្ស (${exportScopeKm} - ${filteredScores.length} នាក់) ត្រូវបានទាញយកជា Excel ជោគជ័យ។`,
      descEn: `Exported grades for ${filteredScores.length} students to Excel.`,
      category: 'export',
      link: '/teacher/grades',
    });
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
      iconBgInactive: 'bg-blue-50 text-blue-600 border-blue-100 grd-pill-blue',
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
        'bg-emerald-50 text-emerald-600 border-emerald-100 grd-btn-emerald',
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
        'bg-indigo-50 text-indigo-600 border-indigo-100 grd-pill-indigo',
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
        'bg-amber-50 text-amber-600 border-amber-100 grd-pill-amber',
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
      iconBgInactive: 'bg-rose-50 text-rose-600 border-rose-100 grd-pill-rose',
    },
  ];

  // ✅ បង្ហាញប៊ូតុង Excel នៅពេលចុចលើកាតឆ្នាំ (១-៤) ឬពេលជ្រើសរើសមុខវិជ្ជាណាមួយ
  const canShowExportExcel =
    (selectedYear !== 'all' || selectedCourse !== '') &&
    filteredScores.length > 0;

  // ============================================================================
  // 📌 ផ្នែកទី៥៖ ការបង្ហាញផ្ទៃមុខកម្មវិធី (JSX UI Rendering)
  // ============================================================================
  return (
    <div className="grd-page-bg p-4 sm:p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6 pb-28 lg:pb-10">
      
      {/* ================================================================== */}
      {/* 1. HEADER BANNER (Dark Blue Gradient)                              */}
      {/* ================================================================== */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-6 sm:p-8 shadow-xl border border-blue-900">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-[28px] lg:text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shrink-0">
                <ChartBarIcon className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-400" />
              </div>
              <span>{t('បញ្ជីពិន្ទុសិស្សសរុប', 'Student Grades Management')}</span>
            </h1>
            <p className="text-blue-200/80 text-xs sm:text-sm max-w-xl font-medium leading-relaxed">
              {selectedYear === 'all'
                ? t(
                    'សូមចុចជ្រើសរើសកាតឆ្នាំសិក្សា (ឆ្នាំទី១-ទី៤) ខាងក្រោម ដើម្បីមើលមុខវិជ្ជា និងបញ្ចូលពិន្ទុសិស្ស។',
                    'Please select an academic year card (Year 1–4) below to choose a course and input student grades.'
                  )
                : t(
                    'គ្រប់គ្រង កែប្រែ និងបញ្ចូលពិន្ទុសម្រាប់សិស្ស (កិច្ចការ 20%, សំណួរខ្លី 20%, ពាក់កណ្តាលឆមាស 25%, ប្រឡងបញ្ចប់ 35%) តាមមុខវិជ្ជា និងវេនសិក្សានីមួយៗ។',
                    'Manage, edit, and input student scores (assignments 20%, quizzes 20%, midterm 25%, final 35%) by course and study shift.'
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
      {/* 2. INTERACTIVE YEAR CARDS (សិស្សសរុប និង ឆ្នាំទី១ ដល់ ឆ្នាំទី៤)       */}
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
                  : 'grd-year-card bg-white hover:bg-gray-50/80 border-gray-200/80 text-gray-800 shadow-xs hover:-translate-y-0.5'
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
                      isSelected ? 'text-white' : 'grd-text-primary text-gray-900'
                    }`}
                  >
                    {card.count}
                  </span>
                  <span
                    className={`block text-[10px] font-bold mt-0.5 ${
                      isSelected ? 'text-white/80' : 'grd-text-secondary text-gray-400'
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
                      isSelected ? 'text-white' : 'grd-text-primary text-gray-800'
                    }`}
                  >
                    {t(card.titleKm, card.titleEn)}
                  </h3>
                  <p
                    className={`text-[10px] font-medium mt-0.5 ${
                      isSelected ? 'text-white/75' : 'grd-text-secondary text-gray-400'
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
      {/* 3. FILTERS, COURSE SELECTOR & STUDY SHIFT TABS                     */}
      {/* ================================================================== */}
      <div className="grd-surface-card bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col xl:flex-row gap-4 items-center justify-between">
        {/* ផ្នែកខាងឆ្វេង៖ Search Input + ប្រអប់ជ្រើសរើសមុខវិជ្ជា */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto flex-1">
          {/* ប្រអប់ស្វែងរកសិស្ស */}
          <div className="relative w-full sm:max-w-xs lg:max-w-sm flex-1">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder={t(
                'ស្វែងរកសិស្ស (ឈ្មោះ ឬអត្តលេខ)...',
                'Search student by name or code...'
              )}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="grd-input w-full pl-11 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-2xs"
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

          {/* ✅ ជ្រើសរើសមុខវិជ្ជា (បង្ហាញតែពេលចុចចូលកាតឆ្នាំណាមួយ ១-៤ និងប្រើ font-medium ស្អាត) */}
          {selectedYear !== 'all' && visibleCoursesForSelectedYear.length > 0 && (
            <div className="relative w-full sm:w-64 lg:w-72 shrink-0 animate-fadeIn">
              <BookOpenIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedCourse}
                onChange={handleCourseChange}
                className="grd-input w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white font-medium text-gray-700 appearance-none cursor-pointer shadow-2xs transition-all"
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
        <div className="grd-shift-tabs flex flex-wrap items-center gap-1.5 bg-gray-100/80 p-1.5 rounded-xl border border-gray-200/60 w-full xl:w-auto justify-center sm:justify-start shrink-0">
          <button
            type="button"
            onClick={() => handleSelectShiftTab('all')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
              !isSpecificShiftSelected
                ? 'bg-blue-600 text-white shadow-xs'
                : 'grd-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <Squares2X2Icon className="h-4 w-4" />
            <span>{t('គ្រប់វេនសិក្សា', 'All Shifts')}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                !isSpecificShiftSelected
                  ? 'bg-white/20 text-white'
                  : 'grd-shift-count bg-gray-200/80 text-gray-700'
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
                : 'grd-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <CalendarDaysIcon className="h-4 w-4" />
            <span>{t('ចន្ទ-សុក្រ', 'Mon-Fri')}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                selectedShift === 'Monday-Friday'
                  ? 'bg-white/20 text-white'
                  : 'grd-shift-count bg-indigo-50 text-indigo-700'
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
                : 'grd-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <CalendarDaysIcon className="h-4 w-4" />
            <span>{t('សៅរ៍-អាទិត្យ', 'Sat-Sun')}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                selectedShift === 'Saturday-Sunday'
                  ? 'bg-white/20 text-white'
                  : 'grd-shift-count bg-amber-50 text-amber-700'
              }`}
            >
              {shiftCounts['Saturday-Sunday']}
            </span>
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 4. MAIN TABLE CARD                                                 */}
      {/* ================================================================== */}
      <div className="grd-surface-card bg-white rounded-[1.5rem] border border-gray-200 shadow-sm overflow-hidden">
        {/* Table Header Controls */}
        <div className="grd-table-bar px-6 py-5 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="grd-text-primary text-lg sm:text-xl font-extrabold text-gray-900">
              {activeCourseObj
                ? `${t('ពិន្ទុសិស្ស', 'Student Grades')} - ${activeCourseObj.course_name}`
                : t('បញ្ជីសិស្សទាំងអស់', 'All Students List')}
            </h2>

            <span className="grd-pill-blue px-3 py-1 bg-blue-50 text-blue-700 text-xs font-extrabold rounded-lg border border-blue-100">
              {filteredScores.length} {t('នាក់', 'Students')}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isSpecificShiftSelected && (
              <button
                type="button"
                onClick={() => handleSelectShiftTab('all')}
                className="grd-pill-indigo text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition-all cursor-pointer"
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
                className="grd-pill-blue text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
              >
                {t('សម្អាតតម្រងស្វែងរក', 'Reset Filters')}
              </button>
            )}

            {/* ✅ បង្ហាញប៊ូតុងសកម្មភាពតែនៅពេលជ្រើសរើសមុខវិជ្ជារួចប៉ុណ្ណោះ */}
            {isCourseSelected && (
              <div className="flex flex-wrap items-center gap-2.5 animate-fadeIn">
                <button
                  type="button"
                  onClick={handleAutoFill}
                  disabled={filteredScores.length === 0}
                  className="grd-btn-emerald flex items-center gap-1.5 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs sm:text-sm font-extrabold transition border border-emerald-200 disabled:opacity-50 cursor-pointer"
                >
                  <SparklesIcon className="w-4 h-4" />
                  <span>{t('បញ្ចូលស្វ័យប្រវត្តិ', 'Auto Fill')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={savingAll || filteredScores.length === 0}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-extrabold transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {savingAll ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckIcon className="w-4 h-4 stroke-[2.5]" />
                  )}
                  <span>{t('រក្សាទុកទាំងអស់', 'Save All Grades')}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="grd-table min-w-full text-left border-collapse">
            <thead className="grd-table-head bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="py-4 px-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-14">
                  {t('ល.រ', 'No')}
                </th>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('សិស្ស', 'Student')}
                </th>
                <th className="py-4 px-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('អត្តលេខ', 'Code')}
                </th>
                <th className="py-4 px-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('កិច្ចការ (20%)', 'Assignment (20%)')}
                </th>
                <th className="py-4 px-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('សំណួរខ្លី (20%)', 'Quiz (20%)')}
                </th>
                <th className="py-4 px-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('ពាក់កណ្តាលឆមាស (25%)', 'Midterm (25%)')}
                </th>
                <th className="py-4 px-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('ប្រឡងបញ្ចប់ (35%)', 'Final Exam (35%)')}
                </th>
                <th className="py-4 px-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('ពិន្ទុសរុប', 'Total Score')}
                </th>
                <th className="py-4 px-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('លទ្ធផល', 'Result')}
                </th>
                <th className="py-4 px-6 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {t('សកម្មភាព', 'Action')}
                </th>
              </tr>
            </thead>
            <tbody className="grd-table-body bg-white">
              {filteredScores.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-16 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <UserGroupIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="grd-text-primary font-extrabold text-gray-800 text-base">
                        {searchTerm || isSpecificShiftSelected
                          ? t(
                              'មិនឃើញឈ្មោះសិស្សតាមការស្វែងរកនេះទេ',
                              'No matching students found'
                            )
                          : isCourseSelected
                          ? t(
                              `មិនទាន់មានសិស្សចុះឈ្មោះក្នុងមុខវិជ្ជា «${activeCourseObj?.course_name || ''}» ទេ`,
                              'No student enrollments found for this course'
                            )
                          : selectedYear !== 'all'
                          ? t(
                              `មិនទាន់មាននិស្សិតក្នុង ${getYearTextLabel(selectedYear)} នៅឡើយទេ`,
                              `No students found in ${getYearTextLabel(selectedYear)}`
                            )
                          : t('មិនទាន់មានសិស្សនៅឡើយទេ', 'No students available yet')}
                      </p>
                      <p className="grd-text-secondary text-sm text-gray-500 mt-1">
                        {selectedYear === 'all'
                          ? t(
                              'សូមចុចជ្រើសរើសកាតឆ្នាំសិក្សាខាងលើ ដើម្បីច្រោះមើលមុខវិជ្ជា និងបញ្ចូលពិន្ទុ',
                              'Select an academic year card above to filter courses and input grades'
                            )
                          : t(
                              'សូមសាកល្បងជ្រើសរើសមុខវិជ្ជា ឬវេនសិក្សាផ្សេងទៀតនៅខាងលើ។',
                              'Please select another course or study shift from the filters above.'
                            )}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredScores.map((item, idx) => {
                  const studentName = item.student_name || 'N/A';
                  const studentCode = item.student_code;
                  const studentGender =
                    item.gender || item.student?.gender || '';
                  const isFemale = isFemaleGender(studentGender);
                  const rawShift =
                    item.study_shift ||
                    item.student?.study_shift ||
                    'Monday-Friday';
                  const isWeekend =
                    normalizeShiftKey(rawShift) === 'Saturday-Sunday';
                  const isEnrolledWithTeacher =
                    isStudentEnrolledInAnyTeacherCourse(item, courseMap);

                  const nameParts = studentName.trim().split(' ');
                  const initial =
                    nameParts.length > 1
                      ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
                      : (studentName[0] || 'S').toUpperCase();

                  const { total, isPassed } = calculateRowMetrics(
                    item.assignment_score,
                    item.quiz_score,
                    item.midterm_score,
                    item.exam_score
                  );

                  return (
                    <tr
                      key={`${item.student_id}-${idx}`}
                      className="grd-table-row hover:bg-blue-50/30 transition-colors"
                    >
                      <td className="grd-text-secondary py-4 px-4 text-center text-sm font-bold text-gray-500">
                        {idx + 1}
                      </td>

                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-3.5">
                          {item.student?.profile_image ? (
                            <img
                              src={getProfileImageUrl(item.student.profile_image)}
                              alt={studentName}
                              className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-10 h-10 rounded-full bg-indigo-500 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs ${
                              item.student?.profile_image ? 'hidden' : ''
                            }`}
                          >
                            {initial}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="grd-text-primary font-extrabold text-gray-900 text-sm">
                                {studentName}
                              </span>
                              {/* ✅ បង្ហាញស្លាកតែចំពោះសិស្សណាដែលមិនទាន់បានចុះឈ្មោះមុខវិជ្ជារបស់គ្រូដែល Login ប៉ុណ្ណោះ */}
                              {!isEnrolledWithTeacher && (
                                <span className="grd-pill-unassigned inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-50/90 text-amber-700 border border-dashed border-amber-300">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                  {t(
                                    'មិនទាន់ចុះឈ្មោះមុខវិជ្ជា',
                                    'Not enrolled in course'
                                  )}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                  isFemale
                                    ? 'grd-pill-rose bg-rose-50 text-rose-600 border-rose-200'
                                    : 'grd-pill-blue bg-blue-50 text-blue-600 border-blue-200'
                                }`}
                              >
                                {getGenderLabel(studentGender)}
                              </span>
                              {/* ✅ បង្ហាញផ្លាកវេនសិក្សាតែនៅពេលស្ថិតក្នុង «គ្រប់វេនសិក្សា» ប៉ុណ្ណោះ */}
                              {!isSpecificShiftSelected && (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                    isWeekend
                                      ? 'grd-pill-amber bg-amber-50 text-amber-700 border-amber-200'
                                      : 'grd-pill-indigo bg-indigo-50 text-indigo-700 border-indigo-100'
                                  }`}
                                >
                                  {getStudyShiftLabel(rawShift)}
                                </span>
                              )}
                              <span className="grd-text-secondary text-xs text-gray-400 font-bold">
                                &bull;
                              </span>
                              <span className="grd-text-secondary text-xs text-gray-500 font-medium">
                                {item.batch_year ||
                                  t('មិនទាន់កំណត់ឆ្នាំ', 'No Year')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <span className="grd-code-pill text-xs font-bold text-gray-700 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
                          {studentCode}
                        </span>
                      </td>

                      {/* ✅ កិច្ចការ (20%) - ពិន្ទុអតិបរមា 20 */}
                      <td className="py-4 px-4 text-center">
                        <input
                          type="number"
                          min="0"
                          max="20"
                          step="0.5"
                          disabled={!isCourseSelected}
                          placeholder="—"
                          value={
                            isCourseSelected &&
                            item.assignment_score !== null &&
                            item.assignment_score !== ''
                              ? item.assignment_score
                              : ''
                          }
                          onChange={(e) =>
                            handleScoreChange(
                              item.student_id,
                              'assignment_score',
                              e.target.value
                            )
                          }
                          className="grd-score-input w-20 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-center text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-2xs"
                          title={
                            item.auto_assignment_score !== ''
                              ? `${t('ពិន្ទុស្វ័យប្រវត្តិ (20%)៖', 'Auto Score (20%):')} ${item.auto_assignment_score}`
                              : t('ពិន្ទុកិច្ចការ (អតិបរមា 20)', 'Assignment score (Max 20)')
                          }
                        />
                      </td>

                      {/* ✅ សំណួរខ្លី (20%) - ពិន្ទុអតិបរមា 20 */}
                      <td className="py-4 px-4 text-center">
                        <input
                          type="number"
                          min="0"
                          max="20"
                          step="0.5"
                          disabled={!isCourseSelected}
                          placeholder="—"
                          value={
                            isCourseSelected &&
                            item.quiz_score !== null &&
                            item.quiz_score !== ''
                              ? item.quiz_score
                              : ''
                          }
                          onChange={(e) =>
                            handleScoreChange(
                              item.student_id,
                              'quiz_score',
                              e.target.value
                            )
                          }
                          className="grd-score-input w-20 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-center text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-2xs"
                          title={
                            item.auto_quiz_score !== ''
                              ? `${t('ពិន្ទុស្វ័យប្រវត្តិ (20%)៖', 'Auto Score (20%):')} ${item.auto_quiz_score}`
                              : t('ពិន្ទុសំណួរខ្លី (អតិបរមា 20)', 'Quiz score (Max 20)')
                          }
                        />
                      </td>

                      {/* ✅ ពាក់កណ្តាលឆមាស (25%) - ពិន្ទុអតិបរមា 25 */}
                      <td className="py-4 px-4 text-center">
                        <input
                          type="number"
                          min="0"
                          max="25"
                          step="0.5"
                          disabled={!isCourseSelected}
                          placeholder="—"
                          value={
                            isCourseSelected &&
                            item.midterm_score !== null &&
                            item.midterm_score !== ''
                              ? item.midterm_score
                              : ''
                          }
                          onChange={(e) =>
                            handleScoreChange(
                              item.student_id,
                              'midterm_score',
                              e.target.value
                            )
                          }
                          className="grd-score-input w-20 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-center text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-2xs"
                          title={t('ពិន្ទុពាក់កណ្តាលឆមាស (អតិបរមា 25)', 'Midterm exam score (Max 25)')}
                        />
                      </td>

                      {/* ✅ ប្រឡងបញ្ចប់ (35%) - ពិន្ទុអតិបរមា 35 */}
                      <td className="py-4 px-4 text-center">
                        <input
                          type="number"
                          min="0"
                          max="35"
                          step="0.5"
                          disabled={!isCourseSelected}
                          placeholder="—"
                          value={
                            isCourseSelected &&
                            item.exam_score !== null &&
                            item.exam_score !== ''
                              ? item.exam_score
                              : ''
                          }
                          onChange={(e) =>
                            handleScoreChange(
                              item.student_id,
                              'exam_score',
                              e.target.value
                            )
                          }
                          className="grd-score-input w-20 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-center text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-2xs"
                          title={t('ពិន្ទុប្រឡងបញ្ចប់ (អតិបរមា 35)', 'Final exam score (Max 35)')}
                        />
                      </td>

                      {/* ✅ ពិន្ទុសរុប (បង្ហាញជាពិន្ទុ ដូចក្នុង ViewScores.jsx) */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {isCourseSelected && total !== null ? (
                          <span className="grd-pill-indigo inline-block px-3 py-1.5 rounded-xl text-sm font-black text-indigo-700 bg-indigo-50 border border-indigo-200/80">
                            {total} {t('ពិន្ទុ', 'pts')}
                          </span>
                        ) : (
                          <span className="grd-text-secondary text-gray-400 font-normal">
                            —
                          </span>
                        )}
                      </td>

                      {/* ✅ បង្ហាញផ្លាក «ជាប់ / ធ្លាក់» */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {isCourseSelected && total !== null ? (
                          isPassed ? (
                            <span className="grd-btn-emerald inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {t('ជាប់ (Passed)', 'Passed')}
                            </span>
                          ) : (
                            <span className="grd-pill-rose inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                              {t('ធ្លាក់ (Failed)', 'Failed')}
                            </span>
                          )
                        ) : (
                          <span className="grd-text-secondary text-gray-300 font-bold">
                            —
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => saveSingleRow(item)}
                          disabled={
                            !isCourseSelected || savingRowId === item.student_id
                          }
                          className="grd-pill-blue inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 text-xs font-extrabold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {savingRowId === item.student_id ? (
                            <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                          )}
                          <span>{t('រក្សាទុក', 'Save')}</span>
                        </button>
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
      {/* 📌 5. CSS សម្រាប់កំណត់ពណ៌ក្នុងទម្រង់យប់ (DARK MODE STYLING)            */}
      {/* ================================================================== */}
      <style>{`
        /* Light mode subtle row dividers */
        .grd-table-row + .grd-table-row > td {
          border-top: 1px solid #f1f5f9;
        }

        html.dark .grd-page-bg {
          background-color: transparent !important;
        }
        html.dark .grd-surface-card,
        html.dark .grd-table-bar,
        html.dark .grd-year-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .grd-year-card:hover {
          background-color: #263449 !important;
        }
        html.dark .grd-text-primary {
          color: #f8fafc !important;
        }
        html.dark .grd-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .grd-shift-tabs {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .grd-shift-btn {
          color: #94a3b8 !important;
        }
        html.dark .grd-shift-btn:hover {
          background-color: #1e293b !important;
          color: #f8fafc !important;
        }
        html.dark .grd-shift-count {
          background-color: #1e293b !important;
          color: #cbd5e1 !important;
        }
        html.dark .grd-input,
        html.dark .grd-score-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        html.dark .grd-input::placeholder,
        html.dark .grd-score-input::placeholder {
          color: #64748b !important;
        }
        html.dark .grd-table-head {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .grd-table-head th {
          color: #94a3b8 !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .grd-table-body {
          background-color: #1e293b !important;
        }
        html.dark .grd-table-row + .grd-table-row > td {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .grd-table-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }
        html.dark .grd-code-pill,
        html.dark .grd-pill-muted {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .grd-pill-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .grd-pill-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          color: #818cf8 !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .grd-btn-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .grd-pill-amber,
        html.dark .grd-pill-unassigned {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.35) !important;
        }
        html.dark .grd-pill-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
      `}</style>
    </div>
  );
};

export default TeacherManageGrades;
// src/components/teacher/TeacherDashboard.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  UsersIcon,
  BookOpenIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  AcademicCapIcon,
  CheckBadgeIcon,
  ChartBarIcon,
  CheckCircleIcon,
  BuildingLibraryIcon,
} from '@heroicons/react/24/outline';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យល្បឿនលឿន (0ms Cache & Safe Non-Blocking Prefetcher)
// ============================================================================
const LAST_ACTIVE_TEACHER_UID_KEY = 'lms_last_active_teacher_uid';
const CACHE_KEY_STUDENT_AVATARS = 'cached_teacher_student_avatars_v1';
const getStatsCacheKey = (uid) => `cached_teacher_dashboard_stats_v8_${uid}`;
const getActivitiesCacheKey = (uid) => `cached_teacher_dashboard_activities_v8_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់គ្រូម្នាក់ៗ
const TEACHER_DASH_MEM_CACHE = {
  uid: null,
  stats: null,
  activities: null,
  deptStudentCount: null,
  assignmentsList: null,
  lastSyncedAt: 0,
  prefetchedUid: null,
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

// ✅ បង្រួមរូបភាពសិស្សទុកមុនក្នុង cached_teacher_student_avatars_v1 ដើម្បីឱ្យទំព័រ TeacherManageStudents បើកភ្លាមឃើញរូបភាពក្នុង 0ms
const cacheStudentAvatarsInBackground = (studentsList) => {
  if (!Array.isArray(studentsList) || studentsList.length === 0) return;

  const avatarMap = readStorageJson(CACHE_KEY_STUDENT_AVATARS, {}) || {};
  let pendingCount = 0;

  const persistMap = () => {
    try {
      const str = JSON.stringify(avatarMap);
      sessionStorage.setItem(CACHE_KEY_STUDENT_AVATARS, str);
      localStorage.setItem(CACHE_KEY_STUDENT_AVATARS, str);
    } catch {}
  };

  studentsList.forEach((stu) => {
    if (!stu || typeof stu !== 'object' || !stu.id) return;
    const rawImg = stu.profile_image || stu.user?.profile_image || null;
    if (!rawImg || typeof rawImg !== 'string') return;

    if (!rawImg.startsWith('data:image') || rawImg.length < 12000) {
      avatarMap[stu.id] = rawImg;
      return;
    }

    pendingCount++;
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
          avatarMap[stu.id] =
            tinyWebp.length < rawImg.length ? tinyWebp : rawImg;
        } catch {}
        pendingCount--;
        if (pendingCount <= 0) persistMap();
      };
      img.onerror = () => {
        pendingCount--;
        if (pendingCount <= 0) persistMap();
      };
      img.src = rawImg;
    } catch {
      pendingCount--;
    }
  });

  if (pendingCount === 0) {
    persistMap();
  } else {
    setTimeout(persistMap, 350);
  }
};

// ✅ លុបរូបភាព Base64 ធំៗចេញពីបញ្ជីមុននឹង Save ចូល localStorage ការពារ QuotaExceededError
const stripHeavyBase64FromList = (data) => {
  if (!Array.isArray(data)) return data;
  return data.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const copy = { ...item };

    if (
      typeof copy.profile_image === 'string' &&
      copy.profile_image.startsWith('data:') &&
      copy.profile_image.length > 12000
    ) {
      copy.profile_image = null;
    }
    if (copy.student_image !== undefined) {
      delete copy.student_image;
    }
    if (copy.user && typeof copy.user === 'object') {
      copy.user = {
        id: copy.user.id,
        status: copy.user.status,
        email: copy.user.email,
      };
    }
    if (copy.student && typeof copy.student === 'object') {
      const { profile_image, ...restStudent } = copy.student;
      copy.student = restStudent;
    }
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

const safeWriteTeacherCache = (key, payload) => {
  try {
    const slimPayload = Array.isArray(payload)
      ? stripHeavyBase64FromList(payload)
      : payload;
    const str = JSON.stringify(slimPayload);
    try {
      sessionStorage.setItem(key, str);
    } catch {}
    localStorage.setItem(key, str);
  } catch {}
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

// ✅ អនុគមន៍សម្អាត Cache ចាស់របស់គ្រូមុន នៅពេលមានគ្រូថ្មី Login ចូលលើ Browser តែមួយ
const ensureCleanTeacherSessionCache = (newUid) => {
  if (!newUid || newUid === 'default_teacher') return;
  try {
    const prevUid = localStorage.getItem(LAST_ACTIVE_TEACHER_UID_KEY);
    if (prevUid && prevUid !== String(newUid)) {
      const sharedLocalKeys = [
        'cached_teacher_dashboard_stats',
        'cached_teacher_dashboard_activities',
        'cached_teacher_students_list_v6',
        'cached_teacher_students_list_v5',
        'cached_teacher_courses_list_v6',
        'cached_teacher_courses_list_v5',
        'cached_teacher_courses_list',
        'cached_teacher_course_map_v6',
        'cached_teacher_lessons_list_v6',
        'cached_teacher_lessons_list',
        'cached_teacher_assignments_list_v6',
        'cached_teacher_assignments_list',
        'cached_teacher_quizzes_list_v6',
        'cached_teacher_quizzes_list',
        'cached_teacher_att_history_map_v6',
        'cached_teacher_exam_scores_map_v1',
        CACHE_KEY_STUDENT_AVATARS,
      ];
      sharedLocalKeys.forEach((k) => {
        try {
          sessionStorage.removeItem(k);
          localStorage.removeItem(k);
        } catch {}
      });
    }
    localStorage.setItem(LAST_ACTIVE_TEACHER_UID_KEY, String(newUid));
  } catch (e) {}
};

// ✅ អនុគមន៍ទាញទិន្នន័យទំព័រផ្សេងៗនៅផ្ទៃខាងក្រោយ ដោយពន្យារពេល ១.២ វិនាទី ដើម្បីទុកឱ្យ Dashboard បង្ហាញលឿន 0ms មុនគេ
const prefetchAllTeacherPagesData = (
  uid,
  onStudentsSynced,
  onAssignmentsSynced
) => {
  if (!uid || uid === 'default_teacher') return;
  if (TEACHER_DASH_MEM_CACHE.prefetchedUid === uid) return;
  TEACHER_DASH_MEM_CACHE.prefetchedUid = uid;

  setTimeout(() => {
    api
      .get('/teacher/courses')
      .then((res) => {
        const data = res.data?.data || res.data || [];
        if (Array.isArray(data)) {
          safeWriteTeacherCache(`cached_teacher_courses_list_v8_${uid}`, data);
          safeWriteTeacherCache('cached_teacher_courses_list_v6', data);
        }
      })
      .catch(() => {});

    api
      .get('/teacher/students')
      .then((res) => {
        const data = res.data?.data || res.data || [];
        if (Array.isArray(data)) {
          TEACHER_DASH_MEM_CACHE.deptStudentCount = data.length;
          if (typeof onStudentsSynced === 'function') {
            onStudentsSynced(data.length);
          }
          // ✅ បង្រួមរូបភាពសិស្សទុកមុនក្នុង Avatar Dictionary មុនពេលលុប Base64 ចេញពីបញ្ជីសិស្ស
          cacheStudentAvatarsInBackground(data);
          safeWriteTeacherCache(`cached_teacher_students_list_v8_${uid}`, data);
          safeWriteTeacherCache('cached_teacher_students_list_v6', data);
        }
        if (res.data?.course_students_map) {
          safeWriteTeacherCache(
            `cached_teacher_course_map_v8_${uid}`,
            res.data.course_students_map
          );
          safeWriteTeacherCache(
            'cached_teacher_course_map_v6',
            res.data.course_students_map
          );
        }
      })
      .catch(() => {});

    api
      .get('/teacher/assignments')
      .then((res) => {
        const data = res.data?.data || res.data || [];
        if (Array.isArray(data)) {
          TEACHER_DASH_MEM_CACHE.assignmentsList = data;
          if (typeof onAssignmentsSynced === 'function') {
            onAssignmentsSynced(data);
          }
          safeWriteTeacherCache(`cached_teacher_assignments_list_v8_${uid}`, data);
          safeWriteTeacherCache('cached_teacher_assignments_list_v6', data);
        }
      })
      .catch(() => {});
  }, 1200);

  setTimeout(() => {
    api
      .get('/teacher/lessons')
      .then((res) => {
        const data = res.data?.data || res.data || [];
        if (Array.isArray(data)) {
          safeWriteTeacherCache(`cached_teacher_lessons_list_v8_${uid}`, data);
          safeWriteTeacherCache('cached_teacher_lessons_list_v6', data);
        }
      })
      .catch(() => {});

    api
      .get('/teacher/quizzes')
      .then((res) => {
        const data = res.data?.data || res.data || [];
        if (Array.isArray(data)) {
          safeWriteTeacherCache(`cached_teacher_quizzes_list_v8_${uid}`, data);
          safeWriteTeacherCache('cached_teacher_quizzes_list_v6', data);
        }
      })
      .catch(() => {});
  }, 2400);
};

// ✅ អនុគមន៍ស្រង់យកថ្ងៃខែពិតប្រាកដ
const formatSubmittedDate = (dateStr) => {
  if (!dateStr) return '—';
  const str = String(dateStr).trim();
  const directMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (directMatch) {
    return `${directMatch[3]}-${directMatch[2]}-${directMatch[1]}`;
  }

  let d = new Date(str);
  if (isNaN(d.getTime())) {
    const today = new Date();
    const num = parseInt(str, 10) || 1;
    const strLower = str.toLowerCase();
    if (strLower.includes('day')) today.setDate(today.getDate() - num);
    else if (strLower.includes('week')) today.setDate(today.getDate() - num * 7);
    else if (strLower.includes('month')) today.setMonth(today.getMonth() - num);
    else if (strLower.includes('year')) today.setFullYear(today.getFullYear() - num);
    d = today;
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

export default function TeacherDashboard() {
  const { t, language } = useLanguage();
  const { user, teacher } = useAuth();

  const currentTeacherId = useMemo(() => {
    const uid = resolveTeacherUid(user || teacher);
    ensureCleanTeacherSessionCache(uid);
    return uid;
  }, [user, teacher]);

  if (
    TEACHER_DASH_MEM_CACHE.uid &&
    TEACHER_DASH_MEM_CACHE.uid !== currentTeacherId
  ) {
    TEACHER_DASH_MEM_CACHE.stats = null;
    TEACHER_DASH_MEM_CACHE.activities = null;
    TEACHER_DASH_MEM_CACHE.deptStudentCount = null;
    TEACHER_DASH_MEM_CACHE.assignmentsList = null;
    TEACHER_DASH_MEM_CACHE.lastSyncedAt = 0;
  }
  TEACHER_DASH_MEM_CACHE.uid = currentTeacherId;

  const [stats, setStats] = useState(() => {
    if (TEACHER_DASH_MEM_CACHE.stats) return TEACHER_DASH_MEM_CACHE.stats;
    const cached =
      readStorageJson(getStatsCacheKey(currentTeacherId), null) ||
      readStorageJson('cached_teacher_dashboard_stats', {});
    if (cached) TEACHER_DASH_MEM_CACHE.stats = cached;
    return cached || {};
  });

  const [deptStudentCount, setDeptStudentCount] = useState(() => {
    if (typeof TEACHER_DASH_MEM_CACHE.deptStudentCount === 'number') {
      return TEACHER_DASH_MEM_CACHE.deptStudentCount;
    }
    const cachedStd = readStorageJson(
      `cached_teacher_students_list_v8_${currentTeacherId}`,
      null
    );
    if (Array.isArray(cachedStd)) {
      TEACHER_DASH_MEM_CACHE.deptStudentCount = cachedStd.length;
      return cachedStd.length;
    }
    return null;
  });

  const [assignmentsList, setAssignmentsList] = useState(() => {
    if (Array.isArray(TEACHER_DASH_MEM_CACHE.assignmentsList)) {
      return TEACHER_DASH_MEM_CACHE.assignmentsList;
    }
    const cachedAsg = readStorageJson(
      `cached_teacher_assignments_list_v8_${currentTeacherId}`,
      null
    );
    if (Array.isArray(cachedAsg)) {
      TEACHER_DASH_MEM_CACHE.assignmentsList = cachedAsg;
      return cachedAsg;
    }
    return [];
  });

  const [recentActivities, setRecentActivities] = useState(() => {
    if (TEACHER_DASH_MEM_CACHE.activities)
      return TEACHER_DASH_MEM_CACHE.activities;
    const cached =
      readStorageJson(getActivitiesCacheKey(currentTeacherId), null) ||
      readStorageJson('cached_teacher_dashboard_activities', []);
    TEACHER_DASH_MEM_CACHE.activities = cached;
    return cached || [];
  });

  const getTeacherDisplayName = () => {
    if (user?.first_name || user?.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    if (user?.teacher?.first_name || user?.teacher?.last_name) {
      return `${user.teacher.first_name || ''} ${user.teacher.last_name || ''}`.trim();
    }
    if (teacher?.first_name || teacher?.last_name) {
      return `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim();
    }
    return user?.name || t('លោកគ្រូ/អ្នកគ្រូ', 'Teacher');
  };

  // ============================================================================
  // 📌 ផ្នែកទី២៖ ទាញយកទិន្នន័យ Dashboard ល្បឿនលឿន (0ms)
  // ============================================================================
  const fetchDashboardData = useCallback(async () => {
    const now = Date.now();
    const cachedStatsForUser =
      TEACHER_DASH_MEM_CACHE.stats ||
      readStorageJson(getStatsCacheKey(currentTeacherId), null);
    const cachedActsForUser =
      TEACHER_DASH_MEM_CACHE.activities ||
      readStorageJson(getActivitiesCacheKey(currentTeacherId), []);

    if (cachedStatsForUser && Object.keys(cachedStatsForUser).length > 0) {
      setStats(cachedStatsForUser);
      setRecentActivities(cachedActsForUser);

      if (now - TEACHER_DASH_MEM_CACHE.lastSyncedAt < 25000) {
        prefetchAllTeacherPagesData(
          currentTeacherId,
          (count) => setDeptStudentCount(count),
          (asgData) => setAssignmentsList(asgData)
        );
        return;
      }
    }

    try {
      const response = await api.get('/teacher/dashboard');
      const resData = response.data?.data || response.data || {};
      const newStats = resData?.stats || {};
      const newActivities = Array.isArray(resData?.recent_activities)
        ? resData.recent_activities
        : [];

      setStats(newStats);
      setRecentActivities(newActivities);

      TEACHER_DASH_MEM_CACHE.uid = currentTeacherId;
      TEACHER_DASH_MEM_CACHE.stats = newStats;
      TEACHER_DASH_MEM_CACHE.activities = newActivities;
      TEACHER_DASH_MEM_CACHE.lastSyncedAt = Date.now();

      safeWriteTeacherCache(getStatsCacheKey(currentTeacherId), newStats);
      safeWriteTeacherCache(getActivitiesCacheKey(currentTeacherId), newActivities);
      safeWriteTeacherCache('cached_teacher_dashboard_stats', newStats);
      safeWriteTeacherCache('cached_teacher_dashboard_activities', newActivities);
    } catch (err) {
      console.error('Error fetching teacher dashboard data:', err);
    } finally {
      // ✅ ទាញទិន្នន័យទំព័រផ្សេងៗតាមក្រោយ ដោយមិនរំខានល្បឿនបើកទំព័រដំបូង
      prefetchAllTeacherPagesData(
        currentTeacherId,
        (count) => setDeptStudentCount(count),
        (asgData) => setAssignmentsList(asgData)
      );
    }
  }, [currentTeacherId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ គណនាទិន្នន័យក្រាហ្វបង្គោល
  // ============================================================================
  const resolvedTotalStudents = useMemo(() => {
    if (typeof deptStudentCount === 'number' && deptStudentCount > 0) {
      return deptStudentCount;
    }
    return stats?.total_students ?? 0;
  }, [deptStudentCount, stats]);

  const submissionSummaryChartData = useMemo(() => {
    const chartMonths = Array.isArray(stats?.chart_data) ? stats.chart_data : [];
    const totalFromChart = chartMonths.reduce(
      (sum, item) => sum + Number(item.submissions || 0),
      0
    );
    const totalFromAssignments = Array.isArray(assignmentsList)
      ? assignmentsList.reduce(
          (sum, a) => sum + Number(a.submissions_count || 0),
          0
        )
      : 0;

    const totalSubmitted = Math.max(
      totalFromChart,
      totalFromAssignments,
      recentActivities.length
    );

    const pendingGradingCount = Number(
      stats?.pending_submissions ?? recentActivities.length ?? 0
    );
    const gradedCount = Math.max(0, totalSubmitted - pendingGradingCount);

    const totalStudents = Number(resolvedTotalStudents || 0);
    const activeAssignmentsCount = Math.max(
      1,
      Number(stats?.total_assignments || assignmentsList.length || 1)
    );
    const expectedTotalSubmissions = totalStudents * activeAssignmentsCount;
    const notSubmittedCount = Math.max(
      0,
      expectedTotalSubmissions - totalSubmitted
    );

    return [
      {
        status: t('ដាក់ពិន្ទុរួច', 'Graded'),
        count: gradedCount,
        color: '#10b981',
      },
      {
        status: t('រង់ចាំដាក់ពិន្ទុ', 'Pending Grade'),
        count: pendingGradingCount,
        color: '#f59e0b',
      },
      {
        status: t('មិនទាន់ប្រគល់', 'Not Submitted'),
        count: notSubmittedCount,
        color: '#6366f1',
      },
    ];
  }, [stats, assignmentsList, recentActivities, resolvedTotalStudents, t]);

  const passFailChartData = useMemo(() => {
    const rawGrades = Array.isArray(stats?.grade_data) ? stats.grade_data : [];
    let passedCount = 0;
    let failedCount = 0;

    rawGrades.forEach((item) => {
      const g = (item.grade || '').toString().trim().toUpperCase();
      const count = Number(item.students || 0);
      if (['A', 'A+', 'B+', 'B', 'C+', 'C', 'D', 'PASSED', 'PASS'].includes(g)) {
        passedCount += count;
      } else if (['F', 'FAILED', 'FAIL'].includes(g)) {
        failedCount += count;
      }
    });

    const totalStudents = Number(resolvedTotalStudents || 0);
    const pendingCount = Math.max(0, totalStudents - (passedCount + failedCount));

    return [
      {
        status: t('ប្រឡងជាប់ (≥50%)', 'Passed (≥50%)'),
        students: passedCount,
        color: '#10b981',
      },
      {
        status: t('ប្រឡងធ្លាក់ (<50%)', 'Failed (<50%)'),
        students: failedCount,
        color: '#f43f5e',
      },
      {
        status: t('រង់ចាំពិន្ទុ', 'Pending'),
        students: pendingCount,
        color: '#6366f1',
      },
    ];
  }, [stats, resolvedTotalStudents, t]);

  const statCards = [
    {
      title: t('សិស្សសរុប', 'Students'),
      value: resolvedTotalStudents,
      icon: UsersIcon,
      bgColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
      themeClass: 'tch-stat-blue',
      subtitle: `${t('វត្តមានថ្ងៃនេះ', 'Present Today')}: ${
        stats?.present_today ?? 0
      }`,
      link: '/students',
    },
    {
      title: t('មុខវិជ្ជាបង្រៀន', 'Courses'),
      value: stats?.total_courses ?? 0,
      icon: BookOpenIcon,
      bgColor: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      themeClass: 'tch-stat-emerald',
      subtitle: `${t('មេរៀនសរុប', 'Total Lessons')}: ${
        stats?.total_lessons ?? 0
      }`,
      link: '/courses',
    },
    {
      title: t('អត្រាវត្តមាន', 'Attendance'),
      value: `${stats?.avg_attendance_rate ?? 0}%`,
      icon: CheckCircleIcon,
      bgColor: 'bg-cyan-50',
      iconColor: 'text-cyan-600',
      themeClass: 'tch-stat-cyan',
      subtitle: `${t('អវត្តមានថ្ងៃនេះ', 'Absent Today')}: ${
        stats?.absent_today ?? 0
      }`,
      link: '/attendance',
    },
    {
      title: t('កម្រងសំណួរ', 'Quizzes'),
      value: stats?.total_quizzes ?? 0,
      icon: AcademicCapIcon,
      bgColor: 'bg-purple-50',
      iconColor: 'text-purple-600',
      themeClass: 'tch-stat-purple',
      subtitle: `${t('កិច្ចការសរុប', 'Assignments')}: ${
        stats?.total_assignments ?? assignmentsList.length ?? 0
      }`,
      link: '/quizzes',
    },
  ];

  // ✅ បង្កើតអក្សរកាត់ (Initials) សម្រាប់សិស្សក្នុងតារាង ដោយមិនបាច់ទាញរូបភាព
  const getStudentInitials = (nameStr) => {
    const parts = String(nameStr || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return (parts[0]?.[0] || 'S').toUpperCase();
  };

  return (
    <div className="tch-dash-bg max-w-7xl mx-auto space-y-6 md:space-y-8 pb-28 lg:pb-10 animate-fadeIn px-3 sm:px-6 lg:px-8 mt-2 md:mt-0">
      
      {/* ================================================================== */}
      {/* 📌 1. WELCOME BANNER                                               */}
      {/* ================================================================== */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-blue-950 via-indigo-900 to-slate-950 p-5 sm:p-8 md:p-10 border border-blue-800/30 shadow-xl">
        <div className="absolute top-0 right-0 w-64 sm:w-96 h-64 sm:h-96 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-60 sm:w-80 h-60 sm:h-80 bg-indigo-500/10 rounded-full blur-3xl -ml-24 -mb-24 pointer-events-none"></div>

        <BuildingLibraryIcon className="absolute -right-6 -bottom-10 w-44 sm:w-64 h-44 sm:h-64 text-white/[0.04] -rotate-12 pointer-events-none">
        </BuildingLibraryIcon>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 sm:gap-8">
          <div className="space-y-3.5 sm:space-y-4">
            
            <div className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-200 text-[11px] sm:text-xs font-extrabold tracking-wide shadow-inner max-w-full">
              <BuildingLibraryIcon className="h-4 w-4 text-yellow-400 shrink-0" />
              <span className="truncate">
                {t(
                  'វិទ្យាស្ថានពហុបច្ចេកទេសភូមិភាគតេជោសែនស្វាយរៀង',
                  'Regional Polytechnic Institute Techo Sen Svay Rieng'
                )}
              </span>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <h1 className="text-[22px] sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight flex flex-wrap items-center gap-x-2.5 gap-y-1.5 leading-snug">
                <span>{t('ស្វាគមន៍មកកាន់', 'Welcome,')}</span>
                <span className="inline-flex items-center gap-2 text-yellow-400">
                  <span>{getTeacherDisplayName()}</span>
                  <span className="inline-flex items-center justify-center p-1 sm:p-1.5 rounded-xl sm:rounded-2xl bg-blue-500/15 border border-blue-400/30 shadow-inner shrink-0">
                    <CheckBadgeIcon className="w-5 h-5 sm:w-7 sm:h-7 text-yellow-400 stroke-[2.2]" />
                  </span>
                </span>
              </h1>
              <p className="text-xs sm:text-sm md:text-base text-blue-100/75 max-w-xl leading-relaxed font-medium">
                {t(
                  'នេះជាទិដ្ឋភាពទូទៅនៃការបង្រៀន មុខវិជ្ជា វត្តមាន និងសកម្មភាពសិស្សរបស់អ្នក។',
                  'Overview of your teaching portal, courses, attendance, and student activities.'
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-blue-200/80 font-bold pt-0.5 sm:pt-1">
              <span className="inline-flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl backdrop-blur-sm border border-white/10 shadow-sm">
                <CalendarDaysIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-400 shrink-0" />
                <span>
                  {new Date().toLocaleDateString(
                    language === 'km' ? 'km-KH' : 'en-US',
                    {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    }
                  )}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl backdrop-blur-sm border border-white/10 shadow-sm">
                <ClockIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400 shrink-0" />
                <span>{t('ទិន្នន័យទាន់សម័យ', 'Live Updates')}</span>
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-4 bg-white/[0.06] backdrop-blur-md border border-white/10 p-4 pr-6 rounded-3xl shadow-2xl shrink-0">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center border border-white/20 shadow-lg shrink-0">
              <AcademicCapIcon className="h-9 w-9 text-yellow-300" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-white tracking-wider">
                  RPITSSVR
                </span>
                <span className="text-[10px] font-extrabold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-md">
                  {t('គ្រូបង្រៀន', 'TEACHER')}
                </span>
              </div>
              <p className="text-xs font-bold text-blue-200/80">
                {t('ផ្ទាំងគ្រប់គ្រងការបង្រៀនឌីជីថល', 'Digital Teaching Portal')}
              </p>
              <p className="text-[11px] font-semibold text-blue-300/60">
                {t('ឆ្នាំសិក្សា ២០២៥-២០២៦', 'Academic Year 2025-2026')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 📌 2. KPI STATS GRID                                               */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Link
              key={`stat-${index}`}
              to={stat.link}
              className="tch-surface-card bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-100 hover:border-blue-200 shadow-sm hover:shadow-xl transition-all duration-300 group hover:-translate-y-1 flex flex-col justify-between overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 sm:space-y-1.5 min-w-0">
                  <p className="tch-text-muted text-[11px] sm:text-xs font-black text-gray-400 uppercase tracking-wider truncate">
                    {stat.title}
                  </p>
                  <p className="tch-text-primary text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                    {stat.value}
                  </p>
                </div>
                <div
                  className={`${stat.themeClass} w-10 h-10 sm:w-13 sm:h-13 rounded-xl sm:rounded-2xl ${stat.bgColor} flex items-center justify-center shrink-0 border border-gray-100/60 group-hover:scale-110 transition-transform duration-300`}
                >
                  <Icon
                    className={`w-5 h-5 sm:w-6 sm:h-6 ${stat.iconColor} stroke-[2.2]`}
                  />
                </div>
              </div>

              <div className="tch-card-divider mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-gray-100/80 flex items-center justify-between text-[11px] sm:text-xs">
                <span className="tch-text-secondary font-bold text-gray-500 truncate">
                  {stat.subtitle}
                </span>
                <span className="tch-manage-link font-extrabold text-blue-600 flex items-center gap-0.5 shrink-0 group-hover:translate-x-0.5 transition-transform">
                  <span className="hidden sm:inline">{t('មើល', 'View')}</span>
                  <ChevronRightIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ================================================================== */}
      {/* 📌 3. CHARTS SECTION                                               */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-8">
        
        <div className="tch-surface-card bg-white rounded-2xl sm:rounded-[1.75rem] border border-gray-100 shadow-sm p-4 sm:p-7 flex flex-col">
          <div className="tch-card-divider flex items-center justify-between border-b border-gray-100 pb-3.5 mb-4">
            <div>
              <h3 className="tch-text-primary text-sm sm:text-base font-black text-gray-900 flex items-center gap-2">
                <span className="tch-stat-amber p-1.5 bg-amber-50 border border-amber-100 rounded-lg">
                  <ChartBarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 stroke-[2.2]" />
                </span>
                {t('ស្ថិតិប្រគល់កិច្ចការ', 'Submission Stats')}
              </h3>
              <p className="tch-text-secondary text-[11px] font-medium text-gray-500 mt-0.5">
                {t(
                  'ចំនួនកិច្ចការដែលបានដាក់ពិន្ទុ រង់ចាំដាក់ពិន្ទុ និងមិនទាន់ប្រគល់',
                  'Number of graded, pending grade, and unsubmitted assignments'
                )}
              </p>
            </div>
            <Link
              to="/assignments"
              className="tch-badge-amber text-[11px] font-extrabold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-xl shrink-0 hover:bg-amber-100 transition-colors"
            >
              {t('បញ្ជីកិច្ចការ', 'Assignments')}
            </Link>
          </div>

          <div className="h-[210px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={submissionSummaryChartData}
                margin={{ top: 10, right: 8, left: -24, bottom: 0 }}
              >
                <CartesianGrid
                  className="tch-chart-grid"
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f3f4f6"
                />
                <XAxis
                  dataKey="status"
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  fontWeight="bold"
                />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  fontWeight="bold"
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                  contentStyle={{
                    backgroundColor: '#1E293B',
                    color: '#FFF',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                />
                <Bar
                  dataKey="count"
                  name={t('ចំនួនកិច្ចការ/សិស្ស', 'Submissions')}
                  radius={[6, 6, 0, 0]}
                  barSize={38}
                >
                  {submissionSummaryChartData.map((entry, idx) => (
                    <Cell key={`sub-cell-${idx}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="tch-surface-card bg-white rounded-2xl sm:rounded-[1.75rem] border border-gray-100 shadow-sm p-4 sm:p-7 flex flex-col">
          <div className="tch-card-divider flex items-center justify-between border-b border-gray-100 pb-3.5 mb-4">
            <div>
              <h3 className="tch-text-primary text-sm sm:text-base font-black text-gray-900 flex items-center gap-2">
                <span className="tch-stat-emerald p-1.5 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <AcademicCapIcon className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 stroke-[2.2]" />
                </span>
                {t('ស្ថិតិលទ្ធផលសិក្សាសិស្ស', 'Student Pass / Fail Summary')}
              </h3>
              <p className="tch-text-secondary text-[11px] font-medium text-gray-500 mt-0.5">
                {t(
                  'ចំនួនសិស្សប្រឡងជាប់ (≥50%) ប្រឡងធ្លាក់ និងរង់ចាំពិន្ទុ',
                  'Number of students passed (≥50%), failed, and pending grades'
                )}
              </p>
            </div>
            <Link
              to="/grades"
              className="tch-badge-emerald text-[11px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-xl shrink-0 hover:bg-emerald-100 transition-colors"
            >
              {t('តារាងពិន្ទុ', 'Grades')}
            </Link>
          </div>

          <div className="h-[210px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={passFailChartData}
                margin={{ top: 10, right: 8, left: -24, bottom: 0 }}
              >
                <CartesianGrid
                  className="tch-chart-grid"
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f3f4f6"
                />
                <XAxis
                  dataKey="status"
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  fontWeight="bold"
                />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  fontWeight="bold"
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                  contentStyle={{
                    backgroundColor: '#1E293B',
                    color: '#FFF',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                />
                <Bar
                  dataKey="students"
                  name={t('ចំនួនសិស្ស', 'Students')}
                  radius={[6, 6, 0, 0]}
                  barSize={38}
                >
                  {passFailChartData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 📌 4. RECENT SUBMISSIONS (បង្ហាញតែអក្សរកាត់ មិនទាញរូបភាពឱ្យធ្ងន់)     */}
      {/* ================================================================== */}
      
      {/* 💻 Desktop View: TABLE */}
      <div className="tch-surface-card hidden lg:flex w-full bg-white rounded-[1.75rem] border border-gray-100 shadow-sm overflow-hidden flex-col">
        <div className="tch-table-bar px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-white">
          <div>
            <h2 className="tch-text-primary text-lg font-black text-gray-900 flex items-center gap-2">
              <ClipboardDocumentCheckIcon className="w-6 h-6 text-blue-600 stroke-[2.2]" />
              {t('កិច្ចការរង់ចាំការដាក់ពិន្ទុ', 'Pending Assignments')}
            </h2>
            <p className="tch-text-secondary text-xs font-medium text-gray-500 mt-0.5">
              {t(
                'បញ្ជីកិច្ចការដែលសិស្សទើបបានប្រគល់ថ្មីៗ',
                'List of assignments recently submitted by students'
              )}
            </p>
          </div>
          <Link
            to="/assignments"
            className="tch-badge-blue text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-100 px-4 py-2 rounded-xl transition-all flex items-center gap-1"
          >
            {t('មើលទាំងអស់', 'View All')}
            <ChevronRightIcon className="w-3.5 h-3.5 stroke-[2.5]" />
          </Link>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="min-w-full text-left border-collapse h-full">
            <thead>
              <tr className="tch-table-head bg-gray-50/70 border-b border-gray-100 text-[11px] text-gray-500 font-black uppercase tracking-wider">
                <th className="px-6 py-4 whitespace-nowrap">
                  {t('សិស្ស', 'Student')}
                </th>
                <th className="px-6 py-4 whitespace-nowrap">
                  {t('កិច្ចការ / មុខវិជ្ជា', 'Assignment / Course')}
                </th>
                <th className="px-6 py-4 text-center whitespace-nowrap">
                  {t('ថ្ងៃប្រគល់', 'Submitted At')}
                </th>
                <th className="px-6 py-4 text-right whitespace-nowrap">
                  {t('សកម្មភាព', 'Action')}
                </th>
              </tr>
            </thead>
            <tbody className="tch-table-body text-sm">
              {recentActivities.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-16 text-center">
                    <CheckBadgeIcon className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                    <h3 className="tch-text-primary text-gray-700 font-black text-base">
                      {t('មិនមានកិច្ចការរង់ចាំការដាក់ពិន្ទុទេ', 'All Caught Up!')}
                    </h3>
                    <p className="tch-text-secondary text-xs text-gray-400 font-medium mt-1">
                      {t(
                        'កិច្ចការទាំងអស់ត្រូវបានត្រួតពិនិត្យរួចរាល់ហើយ។',
                        'All submitted assignments have been reviewed.'
                      )}
                    </p>
                  </td>
                </tr>
              ) : (
                recentActivities.map((act, index) => {
                  const initial = getStudentInitials(act.student_name);
                  return (
                    <tr
                      key={`desk-${act.id || index}`}
                      className="tch-table-row hover:bg-blue-50/30 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3.5">
                          <div className="tch-avatar w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
                            <span>{initial}</span>
                          </div>
                          <div>
                            <div className="tch-text-primary font-extrabold text-gray-900">
                              {act.student_name || t('សិស្ស', 'Student')}
                            </div>
                            {act.student_code && (
                              <div className="tch-text-secondary text-xs text-gray-500 font-medium">
                                {act.student_code}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="tch-text-primary font-bold text-gray-800">
                          {act.assignment_title || t('កិច្ចការសិស្ស', 'Assignment')}
                        </div>
                        {act.course_name && (
                          <div className="tch-text-secondary text-xs text-gray-500 font-medium mt-0.5">
                            {act.course_name}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <span className="tch-date-pill text-xs font-extrabold text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl">
                          {formatSubmittedDate(act.submitted_at)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <Link
                          to="/assignments"
                          className="tch-grade-btn inline-flex items-center gap-1.5 text-xs font-extrabold text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-xl border border-blue-200 transition-all shadow-2xs"
                        >
                          {t('ដាក់ពិន្ទុ', 'Grade')}
                          <ChevronRightIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 📱 Mobile & Tablet View: APP-LIKE LIST */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between mb-3.5 px-1">
          <h2 className="tch-text-primary text-sm sm:text-base font-black text-gray-900 flex items-center gap-2">
            <ClipboardDocumentCheckIcon className="w-5 h-5 text-blue-600 stroke-[2.2]" />
            {t('កិច្ចការរង់ចាំការដាក់ពិន្ទុ', 'Pending Submissions')}
          </h2>
          <Link
            to="/assignments"
            className="text-xs font-extrabold text-blue-600 flex items-center gap-0.5"
          >
            {t('មើលទាំងអស់', 'View All')}
            <ChevronRightIcon className="w-3.5 h-3.5 stroke-[2.5]" />
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          {recentActivities.length === 0 ? (
            <div className="tch-surface-card bg-white rounded-2xl border border-gray-100 p-8 text-center shadow-sm">
              <CheckBadgeIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <h3 className="tch-text-primary text-gray-800 font-black text-sm">
                {t('មិនមានកិច្ចការថ្មីទេ', 'All Caught Up!')}
              </h3>
            </div>
          ) : (
            recentActivities.map((act, index) => {
              const initial = getStudentInitials(act.student_name);
              return (
                <Link
                  key={`mob-${act.id || index}`}
                  to="/assignments"
                  className="tch-surface-card bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3.5 active:scale-[0.98] transition-transform"
                >
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                    <span>{initial}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="tch-text-primary font-black text-sm text-gray-900 truncate">
                      {act.student_name || t('សិស្ស', 'Student')}
                    </h4>
                    <p className="tch-text-secondary text-xs font-bold text-gray-500 truncate mt-0.5">
                      {act.assignment_title}
                    </p>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="tch-text-secondary text-[10px] font-bold text-gray-400 mb-1.5">
                      {formatSubmittedDate(act.submitted_at)}
                    </span>
                    <span className="text-[11px] font-black text-white bg-blue-600 px-3 py-1 rounded-xl shadow-xs">
                      {t('ដាក់ពិន្ទុ', 'Grade')}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* 📌 5. CSS សម្រាប់កំណត់ពណ៌ក្នុងទម្រង់យប់ (DARK MODE STYLING)            */}
      {/* ================================================================== */}
      <style>{`
        .tch-table-row + .tch-table-row > td {
          border-top: 1px solid #f1f5f9;
        }

        html.dark .tch-surface-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .tch-surface-card:hover {
          border-color: #3b82f6 !important;
        }
        html.dark .tch-table-bar {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .tch-text-primary {
          color: #f8fafc !important;
        }
        html.dark .tch-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .tch-text-muted {
          color: #64748b !important;
        }
        html.dark .tch-card-divider {
          border-color: #334155 !important;
        }
        html.dark .tch-manage-link {
          color: #60a5fa !important;
        }

        html.dark .tch-stat-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .tch-stat-blue svg { color: #60a5fa !important; }

        html.dark .tch-stat-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .tch-stat-emerald svg { color: #34d399 !important; }

        html.dark .tch-stat-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
        html.dark .tch-stat-amber svg { color: #fbbf24 !important; }

        html.dark .tch-stat-cyan {
          background-color: rgba(6, 182, 212, 0.15) !important;
          border-color: rgba(6, 182, 212, 0.3) !important;
        }
        html.dark .tch-stat-cyan svg { color: #22d3ee !important; }

        html.dark .tch-stat-purple {
          background-color: rgba(168, 85, 247, 0.15) !important;
          border-color: rgba(168, 85, 247, 0.3) !important;
        }
        html.dark .tch-stat-purple svg { color: #c084fc !important; }

        html.dark .tch-chart-grid line {
          stroke: #334155 !important;
        }
        html.dark .tch-empty-box {
          background-color: rgba(15, 23, 42, 0.5) !important;
          border-color: #334155 !important;
        }

        html.dark .tch-table-head {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
          color: #94a3b8 !important;
        }
        html.dark .tch-table-row + .tch-table-row > td {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .tch-table-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }
        html.dark .tch-date-pill {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .tch-grade-btn,
        html.dark .tch-badge-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .tch-grade-btn:hover {
          background-color: #2563eb !important;
          color: #ffffff !important;
        }
        html.dark .tch-badge-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
        html.dark .tch-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
      `}</style>
    </div>
  );
}
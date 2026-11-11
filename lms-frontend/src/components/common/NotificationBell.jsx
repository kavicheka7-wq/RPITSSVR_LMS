// src/components/common/NotificationBell.jsx
import React, {
  useState,
  useEffect,
  Fragment,
  useMemo,
  useCallback,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Menu, Transition } from '@headlessui/react';
import {
  BellIcon,
  CheckIcon,
  TrashIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';

const NOTIFICATION_EXPIRE_DAYS = 30;
const MAX_NOTIFICATIONS_COUNT = 100;
const SYNC_EVENT_NAME = 'lms_notifications_sync_event';

// ✅ Global Memory Cache សម្រាប់រក្សាទុកសារជូនដំណឹងតាមគណនីម្នាក់ៗក្នុងល្បឿន 0ms
const NOTIF_MEM_CACHE = {
  key: null,
  list: null,
  activeInterceptorId: null,
  mountedInstances: 0,
  latestRole: 'guest',
  latestPushFn: null,
};

const filterValidNotifications = (list) => {
  if (!Array.isArray(list)) return [];
  const now = Date.now();
  const maxAgeMs = NOTIFICATION_EXPIRE_DAYS * 24 * 60 * 60 * 1000;

  return list
    .filter((item) => {
      if (!item || !item.time) return true;
      const itemTime = new Date(item.time).getTime();
      return isNaN(itemTime) || now - itemTime <= maxAgeMs;
    })
    .slice(0, MAX_NOTIFICATIONS_COUNT);
};

// ✅ អនុគមន៍បម្លែងតំណភ្ជាប់ចាស់ៗ (/admin/..., /teacher/..., /student/...) មកជា Clean URLs ដោយស្វ័យប្រវត្តិ
const normalizeNotifLink = (rawLink) => {
  if (!rawLink || typeof rawLink !== 'string') return '/dashboard';
  const trimmed = rawLink.trim();
  if (trimmed === '/student/scores') return '/grades';
  const cleaned = trimmed.replace(/^\/(admin|teacher|student)(?=\/)/i, '');
  return cleaned || '/dashboard';
};

// ✅ អនុគមន៍ចាប់យកអត្តសញ្ញាណ និងតួនាទីអ្នកប្រើប្រាស់ឱ្យជាក់លាក់តាំងពីវិនាទីដំបូង (0ms)
const resolveUserIdentitySync = (contextUser, hasRoleFn, pathname = '') => {
  let u = contextUser;
  if (!u || (!u.id && !u.user_id && !u.email)) {
    try {
      const raw =
        localStorage.getItem('user') || localStorage.getItem('auth_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        u = parsed?.user || parsed?.data || parsed;
      }
    } catch {}
  }

  const uid = String(
    u?.id ||
      u?.user_id ||
      u?.teacher?.id ||
      u?.student?.id ||
      u?.email ||
      'default'
  );

  const rawRole =
    u?.role?.role_name ||
    u?.role?.name ||
    u?.role_name ||
    (typeof u?.role === 'string' ? u.role : '') ||
    '';
  const r = rawRole.toString().toLowerCase();
  const roleIdNum = Number(u?.role_id);

  let role = 'guest';
  if (r.includes('admin') || roleIdNum === 1) role = 'admin';
  else if (r.includes('teacher') || roleIdNum === 2) role = 'teacher';
  else if (r.includes('student') || roleIdNum === 3) role = 'student';
  else if (typeof hasRoleFn === 'function') {
    if (hasRoleFn('Admin')) role = 'admin';
    else if (hasRoleFn('Teacher')) role = 'teacher';
    else if (hasRoleFn('Student')) role = 'student';
  }

  if (role === 'guest') {
    const p = (pathname || '').toLowerCase();
    if (p.startsWith('/admin')) role = 'admin';
    else if (p.startsWith('/teacher')) role = 'teacher';
    else if (p.startsWith('/student')) role = 'student';
  }

  return { uid, role };
};

const parseConfigPayload = (configData) => {
  if (!configData) return {};
  if (typeof configData === 'string') {
    try {
      return JSON.parse(configData);
    } catch {
      return {};
    }
  }
  if (typeof FormData !== 'undefined' && configData instanceof FormData) {
    const obj = {};
    configData.forEach((val, key) => {
      obj[key] = val;
    });
    return obj;
  }
  if (typeof configData === 'object') return configData;
  return {};
};

const extractItemTitle = (configData, resData) => {
  try {
    const parsedConfig = parseConfigPayload(configData);
    const rData =
      resData?.lesson ||
      resData?.data ||
      resData?.quiz ||
      resData?.assignment ||
      resData;

    const t =
      rData?.title ||
      rData?.course_name ||
      rData?.department_name ||
      rData?.name ||
      rData?.first_name ||
      parsedConfig?.title ||
      parsedConfig?.question_text ||
      parsedConfig?.course_name ||
      parsedConfig?.department_name ||
      parsedConfig?.name ||
      parsedConfig?.first_name;

    if (t && typeof t === 'string') {
      const cleanStr = t.trim();
      if (!cleanStr) return '';
      const shortTitle =
        cleanStr.length > 35 ? `${cleanStr.slice(0, 35)}...` : cleanStr;
      return ` «${shortTitle}»`;
    }
  } catch {}
  return '';
};

// ============================================================================
// 📌 អនុគមន៍ចាប់យកតែសកម្មភាពសំខាន់ៗខ្លាំង (Admin, Teacher, Student Actions)
// ============================================================================
const buildActionNotification = (method, url, role, configData, resData) => {
  const m = (method || '').toLowerCase();
  const u = (url || '').toLowerCase();

  if (!['post', 'put', 'delete'].includes(m)) return null;
  if (
    u.includes('login') ||
    u.includes('logout') ||
    u.includes('refresh') ||
    u.includes('profile') ||
    u.includes('update-password') ||
    u.includes('forgot-password') ||
    u.includes('two-factor') ||
    u.includes('telegram')
  ) {
    return null;
  }

  const itemTitle = extractItemTitle(configData, resData);

  // --------------------------------------------------------------------------
  // ADMIN ACTIONS (Clean URLs)
  // --------------------------------------------------------------------------
  if (role === 'admin') {
    if (u.includes('students/import')) {
      return {
        titleKm: 'បាននាំចូលទិន្នន័យសិស្សពី Excel',
        titleEn: 'Students Imported from Excel',
        descKm:
          'បញ្ជីសិស្សថ្មីពីឯកសារ Excel ត្រូវបានបញ្ចូលទៅក្នុងប្រព័ន្ធដោយជោគជ័យ។',
        descEn:
          'New students from the Excel file have been successfully imported.',
        link: '/students/year-1',
        category: 'student',
      };
    }
    if (u.includes('students/promote')) {
      return {
        titleKm: 'បានឡើងឆ្នាំសិក្សាសិស្សជោគជ័យ',
        titleEn: 'Students Promoted Successfully',
        descKm:
          'សិស្សដែលបានជ្រើសរើស ត្រូវបានផ្លាស់ប្តូរទៅកាន់ឆ្នាំសិក្សាថ្មីរួចរាល់។',
        descEn:
          'The selected students have been successfully promoted to the new academic year.',
        link: '/students/year-1',
        category: 'student',
      };
    }
    if (u.includes('admin/students')) {
      const isDelete = m === 'delete';
      const isUpdate = m === 'put' || u.match(/admin\/students\/\d+/);
      return {
        titleKm: isDelete
          ? 'បានលុបគណនីសិស្ស'
          : isUpdate
          ? 'បានកែប្រែព័ត៌មានសិស្ស'
          : 'បានបន្ថែមសិស្សថ្មី',
        titleEn: isDelete
          ? 'Student Deleted'
          : isUpdate
          ? 'Student Updated'
          : 'New Student Added',
        descKm: isDelete
          ? 'គណនីសិស្សត្រូវបានលុបចេញពីប្រព័ន្ធ។'
          : `ទិន្នន័យសិស្ស${itemTitle} ត្រូវបានរក្សាទុកក្នុងប្រព័ន្ធ។`,
        descEn: isDelete
          ? 'A student account was removed.'
          : `Student record${itemTitle} was saved.`,
        link: '/students/year-1',
        category: 'student',
      };
    }
    if (u.includes('admin/teachers')) {
      const isDelete = m === 'delete';
      const isUpdate = m === 'put' || u.match(/admin\/teachers\/\d+/);
      return {
        titleKm: isDelete
          ? 'បានលុបគណនីគ្រូបង្រៀន'
          : isUpdate
          ? 'បានកែប្រែព័ត៌មានគ្រូ'
          : 'បានបន្ថែមគ្រូបង្រៀនថ្មី',
        titleEn: isDelete
          ? 'Teacher Deleted'
          : isUpdate
          ? 'Teacher Updated'
          : 'New Teacher Added',
        descKm: `ទិន្នន័យគ្រូបង្រៀន${itemTitle} ក្នុងប្រព័ន្ធត្រូវបានធ្វើបច្ចុប្បន្នភាព។`,
        descEn: `Teacher records${itemTitle} in the system have been updated.`,
        link: '/teachers',
        category: 'teacher',
      };
    }
    if (u.includes('admin/courses')) {
      return {
        titleKm:
          m === 'delete' ? 'បានលុបមុខវិជ្ជា' : 'ធ្វើបច្ចុប្បន្នភាពមុខវិជ្ជា',
        titleEn: m === 'delete' ? 'Course Deleted' : 'Course Updated',
        descKm: `បញ្ជីមុខវិជ្ជា${itemTitle} ក្នុងប្រព័ន្ធត្រូវបានកែប្រែដោយជោគជ័យ។`,
        descEn: `System courses list${itemTitle} has been updated successfully.`,
        link: '/courses',
        category: 'course',
      };
    }
    if (u.includes('admin/departments')) {
      return {
        titleKm:
          m === 'delete' ? 'បានលុបដេប៉ាតឺម៉ង់' : 'ធ្វើបច្ចុប្បន្នភាពដេប៉ាតឺម៉ង់',
        titleEn: m === 'delete' ? 'Department Deleted' : 'Department Updated',
        descKm: `ទិន្នន័យដេប៉ាតឺម៉ង់${itemTitle} ត្រូវបានធ្វើបច្ចុប្បន្នភាព។`,
        descEn: `Department${itemTitle} information has been updated.`,
        link: '/departments',
        category: 'department',
      };
    }
  }

  // --------------------------------------------------------------------------
  // TEACHER ACTIONS (Clean URLs)
  // --------------------------------------------------------------------------
  if (role === 'teacher') {
    if (u.includes('teacher/attendance')) {
      return {
        titleKm: 'បានកត់ត្រាវត្តមានសិស្សជោគជ័យ',
        titleEn: 'Student Attendance Recorded',
        descKm: 'បានរក្សាទុកវត្តមានសិស្សក្នុងប្រព័ន្ធដោយជោគជ័យ។',
        descEn: 'Student attendance has been successfully saved.',
        link: '/attendance',
        category: 'attendance',
      };
    }
    if (
      u.includes('teacher/scores') ||
      (u.includes('/submissions/') && u.includes('/grade'))
    ) {
      return {
        titleKm: 'បានដាក់ពិន្ទុ និងរក្សាទុកពិន្ទុសិស្ស',
        titleEn: 'Student Grades Updated',
        descKm: 'ពិន្ទុរបស់សិស្សត្រូវបានធ្វើបច្ចុប្បន្នភាពក្នុងប្រព័ន្ធរួចរាល់។',
        descEn: 'Student grades have been updated successfully.',
        link: '/grades',
        category: 'grade',
      };
    }
    if (u.includes('teacher/lessons')) {
      const isDelete = m === 'delete';
      return {
        titleKm: isDelete
          ? 'បានលុបមេរៀន/ឯកសារ'
          : `បានធ្វើបច្ចុប្បន្នភាពមេរៀន${itemTitle}`,
        titleEn: isDelete
          ? 'Lesson Item Deleted'
          : `Lesson Updated${itemTitle}`,
        descKm: isDelete
          ? 'មេរៀន ឬឯកសារត្រូវបានលុបចេញពីប្រព័ន្ធ។'
          : `ទិន្នន័យមេរៀន${itemTitle} ត្រូវបានរក្សាទុក។`,
        descEn: isDelete
          ? 'Lesson item was removed.'
          : `Lesson${itemTitle} details saved.`,
        link: '/lessons',
        category: 'lesson',
      };
    }
    if (u.includes('teacher/assignments')) {
      const isDelete = m === 'delete';
      return {
        titleKm: isDelete
          ? 'បានលុបកិច្ចការ'
          : `បានបន្ថែមកិច្ចការថ្មី${itemTitle}`,
        titleEn: isDelete
          ? 'Assignment Deleted'
          : `New Assignment Created${itemTitle}`,
        descKm: isDelete
          ? 'កិច្ចការត្រូវបានលុបចេញពីប្រព័ន្ធ។'
          : `ទិន្នន័យកិច្ចការ${itemTitle} ត្រូវបានរក្សាទុក។`,
        descEn: isDelete
          ? 'Assignment was removed.'
          : `Assignment${itemTitle} details saved.`,
        link: '/assignments',
        category: 'assignment',
      };
    }
    if (u.includes('teacher/quizzes')) {
      const isDelete = m === 'delete';
      return {
        titleKm: isDelete
          ? 'បានលុបកម្រងសំណួរ'
          : `បានបង្កើតកម្រងសំណួរថ្មី${itemTitle}`,
        titleEn: isDelete
          ? 'Quiz Deleted'
          : `New Quiz Created${itemTitle}`,
        descKm: isDelete
          ? 'កម្រងសំណួរត្រូវបានលុបចេញពីប្រព័ន្ធ។'
          : `កម្រងសំណួរ${itemTitle} ត្រូវបានរក្សាទុក។`,
        descEn: isDelete
          ? 'Quiz was deleted.'
          : `Quiz${itemTitle} saved successfully.`,
        link: '/quizzes',
        category: 'quiz',
      };
    }
  }

  // --------------------------------------------------------------------------
  // STUDENT ACTIONS (Clean URLs)
  // --------------------------------------------------------------------------
  if (role === 'student') {
    if (u.includes('assignment') || u.includes('submit')) {
      return {
        titleKm: 'បានប្រគល់កិច្ចការជោគជ័យ',
        titleEn: 'Assignment Submitted',
        descKm: 'កិច្ចការរបស់អ្នកត្រូវបានបញ្ជូនទៅកាន់គ្រូបង្រៀនរួចរាល់។',
        descEn: 'Your assignment has been submitted to the teacher.',
        link: '/assignments',
        category: 'assignment',
      };
    }
    if (u.includes('quiz')) {
      return {
        titleKm: 'បានបញ្ចប់ការប្រឡងកម្រងសំណួរ',
        titleEn: 'Quiz Completed',
        descKm: 'ចម្លើយប្រឡងរបស់អ្នកត្រូវបានរក្សាទុកក្នុងប្រព័ន្ធ។',
        descEn: 'Your quiz attempt has been recorded.',
        link: '/quizzes',
        category: 'quiz',
      };
    }
  }

  return null;
};

// ============================================================================
// 📌 អនុគមន៍ទាញយកតែសកម្មភាពចាំបាច់ពី Dashboard របស់ Teacher
// ============================================================================
const extractTeacherModuleNotifications = (url, resData) => {
  const u = (url || '').toLowerCase();
  const batch = [];

  if (u.includes('/teacher/dashboard')) {
    const dashData = resData?.data || resData || {};
    const pendingCount =
      dashData?.stats?.pending_submissions ??
      dashData?.stats?.pending_assignments ??
      0;
    const activities = Array.isArray(dashData?.recent_activities)
      ? dashData.recent_activities
      : [];

    if (pendingCount > 0) {
      batch.push({
        id: `teacher_pending_assign_${pendingCount}`,
        titleKm: `មានកិច្ចការសិស្សចំនួន ${pendingCount} រង់ចាំការកែ`,
        titleEn: `${pendingCount} Student Submissions Pending Grading`,
        descKm: 'សូមចូលពិនិត្យ និងដាក់ពិន្ទុកិច្ចការដែលសិស្សបានប្រគល់។',
        descEn: 'Click here to review and grade student submissions.',
        link: '/assignments',
        category: 'assignment',
      });
    }

    activities.slice(0, 3).forEach((act, idx) => {
      batch.push({
        id: `teacher_act_${act.id || idx}_${act.assignment_title || ''}`,
        titleKm: `សិស្ស ${act.student_name || ''} បានប្រគល់កិច្ចការ`,
        titleEn: `${act.student_name || 'Student'} submitted an assignment`,
        descKm: `កិច្ចការ៖ ${act.assignment_title || '—'}`,
        descEn: `Assignment: ${act.assignment_title || '—'}`,
        link: '/assignments',
        category: 'submission',
        time: act.submitted_at || new Date().toISOString(),
      });
    });
  }

  return batch;
};

// ============================================================================
// 📌 COMPONENT កណ្ដឹងជូនដំណឹង (NOTIFICATION BELL)
// ============================================================================
const NotificationBell = ({ isMobile = false }) => {
  const { user, hasRole } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [showClearPopover, setShowClearPopover] = useState(false);

  // ✅ កំណត់អត្តសញ្ញាណ និងតួនាទីអ្នកប្រើប្រាស់ភ្លាមៗក្នុង 0ms
  const { uid: currentUid, role: normalizedRole } = useMemo(
    () => resolveUserIdentitySync(user, hasRole, location?.pathname),
    [user, hasRole, location?.pathname]
  );

  const isStudent = normalizedRole === 'student';

  // ✅ យក Key ពី User បច្ចុប្បន្ន ដើម្បីឱ្យត្រូវគ្នា ១០០% ជាមួយ pushLocalNotification គ្រប់ទំព័រ
  const userUniqueKey = useMemo(
    () => `lms_notifs_${normalizedRole}_${currentUid}`,
    [normalizedRole, currentUid]
  );

  // ✅ អានពី RAM Cache ក្នុង 0ms បើគ្មានទើបអានពី LocalStorage
  const [notifications, setNotifications] = useState(() => {
    if (
      NOTIF_MEM_CACHE.key === userUniqueKey &&
      Array.isArray(NOTIF_MEM_CACHE.list)
    ) {
      return NOTIF_MEM_CACHE.list;
    }
    try {
      const saved = localStorage.getItem(userUniqueKey);
      const parsed = saved ? JSON.parse(saved) : [];
      const validList = filterValidNotifications(parsed);
      NOTIF_MEM_CACHE.key = userUniqueKey;
      NOTIF_MEM_CACHE.list = validList;
      if (validList.length !== parsed.length) {
        localStorage.setItem(userUniqueKey, JSON.stringify(validList));
      }
      return validList;
    } catch {
      return [];
    }
  });

  // ✅ ស្ដាប់ Event 'lms_notifications_sync_event' គ្រប់ពេលមានសកម្មភាពថ្មី
  useEffect(() => {
    const loadFromStorage = () => {
      try {
        const saved = localStorage.getItem(userUniqueKey);
        const parsed = saved ? JSON.parse(saved) : [];
        const valid = filterValidNotifications(parsed);
        NOTIF_MEM_CACHE.key = userUniqueKey;
        NOTIF_MEM_CACHE.list = valid;
        setNotifications(valid);
      } catch {
        setNotifications([]);
      }
    };

    loadFromStorage();
    window.addEventListener(SYNC_EVENT_NAME, loadFromStorage);
    window.addEventListener('storage', loadFromStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT_NAME, loadFromStorage);
      window.removeEventListener('storage', loadFromStorage);
    };
  }, [userUniqueKey]);

  const pushNotificationsBatch = useCallback(
    (itemsArray) => {
      if (
        !Array.isArray(itemsArray) ||
        itemsArray.length === 0 ||
        normalizedRole === 'guest'
      ) {
        return;
      }

      try {
        const saved = localStorage.getItem(userUniqueKey);
        const currentList = saved ? JSON.parse(saved) : [];
        const existingIds = new Set(currentList.map((item) => item.id));
        const nowMs = Date.now();
        const newEntries = [];

        itemsArray.forEach((notifObj) => {
          if (!notifObj) return;

          const cleanTargetLink = normalizeNotifLink(notifObj.link);

          // ការពារកុំឱ្យជាន់គ្នាជាមួយ pushLocalNotification ដែលទំព័រនីមួយៗបានហៅរួចហើយ
          const isDuplicateRecentLocal = currentList.some((existing) => {
            if (!existing?.id?.toString().startsWith('local_')) return false;
            const timeDiff = Math.abs(
              nowMs - new Date(existing.time).getTime()
            );
            return (
              timeDiff < 5000 &&
              (existing.category === notifObj.category ||
                normalizeNotifLink(existing.link) === cleanTargetLink)
            );
          });

          if (isDuplicateRecentLocal) return;

          const newId =
            notifObj.id ||
            `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          if (!existingIds.has(newId)) {
            existingIds.add(newId);
            newEntries.push({
              id: newId,
              titleKm: notifObj.titleKm,
              titleEn: notifObj.titleEn,
              descKm: notifObj.descKm,
              descEn: notifObj.descEn,
              link: cleanTargetLink,
              category: notifObj.category || 'general',
              time: notifObj.time || new Date().toISOString(),
              read: false,
            });
          }
        });

        if (newEntries.length === 0) return;

        const updated = filterValidNotifications([
          ...newEntries,
          ...currentList,
        ]);
        NOTIF_MEM_CACHE.key = userUniqueKey;
        NOTIF_MEM_CACHE.list = updated;
        localStorage.setItem(userUniqueKey, JSON.stringify(updated));
        setNotifications(updated);
        window.dispatchEvent(new Event(SYNC_EVENT_NAME));
      } catch (e) {
        console.error('Failed to push notification batch:', e);
      }
    },
    [normalizedRole, userUniqueKey]
  );

  // រក្សាទុកយោង (Reference) នៃតួនាទី និងអនុគមន៍ចុងក្រោយសម្រាប់ប្រើក្នុង Singleton Interceptor
  useEffect(() => {
    NOTIF_MEM_CACHE.latestRole = normalizedRole;
    NOTIF_MEM_CACHE.latestPushFn = pushNotificationsBatch;
  }, [normalizedRole, pushNotificationsBatch]);

  // ✅ ភ្ជាប់ API Interceptor តែ ១ គត់ក្នុងប្រព័ន្ធ (មិនដាច់នៅពេលបិទ/បើកម៉ឺនុយទូរស័ព្ទ)
  useEffect(() => {
    NOTIF_MEM_CACHE.mountedInstances += 1;

    if (NOTIF_MEM_CACHE.activeInterceptorId === null) {
      const interceptorId = api.interceptors.response.use(
        (response) => {
          const activeRole = NOTIF_MEM_CACHE.latestRole;
          const pushFn = NOTIF_MEM_CACHE.latestPushFn;
          if (!pushFn || activeRole === 'guest') return response;

          const method = (response?.config?.method || '').toLowerCase();
          const url = response?.config?.url || '';
          const configData = response?.config?.data;
          const resData = response?.data;

          if (['post', 'put', 'delete'].includes(method)) {
            setTimeout(() => {
              const actionNotif = buildActionNotification(
                method,
                url,
                NOTIF_MEM_CACHE.latestRole,
                configData,
                resData
              );
              if (actionNotif && NOTIF_MEM_CACHE.latestPushFn) {
                NOTIF_MEM_CACHE.latestPushFn([actionNotif]);
              }
            }, 180);
          } else if (method === 'get' && activeRole === 'teacher') {
            const syncedItems = extractTeacherModuleNotifications(url, resData);
            if (syncedItems.length > 0) pushFn(syncedItems);
          }
          return response;
        },
        (error) => Promise.reject(error)
      );

      NOTIF_MEM_CACHE.activeInterceptorId = interceptorId;
    }

    return () => {
      NOTIF_MEM_CACHE.mountedInstances = Math.max(
        0,
        NOTIF_MEM_CACHE.mountedInstances - 1
      );
      if (
        NOTIF_MEM_CACHE.mountedInstances === 0 &&
        NOTIF_MEM_CACHE.activeInterceptorId !== null
      ) {
        api.interceptors.response.eject(NOTIF_MEM_CACHE.activeInterceptorId);
        NOTIF_MEM_CACHE.activeInterceptorId = null;
      }
    };
  }, []);

  // ✅ សមកាលកម្មសារជូនដំណឹងពី Cache `_v8_` របស់ Teacher Dashboard
  useEffect(() => {
    if (normalizedRole !== 'teacher' || currentUid === 'default') return;

    try {
      const cachedStats = JSON.parse(
        localStorage.getItem(`cached_teacher_dashboard_stats_v8_${currentUid}`) ||
          localStorage.getItem('cached_teacher_dashboard_stats') ||
          '{}'
      );
      const cachedActivities = JSON.parse(
        localStorage.getItem(
          `cached_teacher_dashboard_activities_v8_${currentUid}`
        ) ||
          localStorage.getItem('cached_teacher_dashboard_activities') ||
          '[]'
      );
      const initialBatch = extractTeacherModuleNotifications(
        '/teacher/dashboard',
        { stats: cachedStats, recent_activities: cachedActivities }
      );

      if (initialBatch.length > 0) {
        pushNotificationsBatch(initialBatch);
      }
    } catch {}
  }, [normalizedRole, currentUid, pushNotificationsBatch]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const markAllAsRead = useCallback(() => {
    try {
      const updated = notifications.map((n) => ({ ...n, read: true }));
      NOTIF_MEM_CACHE.key = userUniqueKey;
      NOTIF_MEM_CACHE.list = updated;
      setNotifications(updated);
      localStorage.setItem(userUniqueKey, JSON.stringify(updated));
      window.dispatchEvent(new Event(SYNC_EVENT_NAME));
    } catch {}
  }, [notifications, userUniqueKey]);

  const confirmClearAllNotifications = useCallback(
    (e) => {
      if (e) e.stopPropagation();
      NOTIF_MEM_CACHE.key = userUniqueKey;
      NOTIF_MEM_CACHE.list = [];
      setNotifications([]);
      setShowClearPopover(false);
      try {
        localStorage.setItem(userUniqueKey, JSON.stringify([]));
        window.dispatchEvent(new Event(SYNC_EVENT_NAME));
      } catch {}
    },
    [userUniqueKey]
  );

  const handleNotificationClick = useCallback(
    (notif) => {
      try {
        const updated = notifications.map((n) =>
          n.id === notif.id ? { ...n, read: true } : n
        );
        NOTIF_MEM_CACHE.key = userUniqueKey;
        NOTIF_MEM_CACHE.list = updated;
        setNotifications(updated);
        localStorage.setItem(userUniqueKey, JSON.stringify(updated));
        window.dispatchEvent(new Event(SYNC_EVENT_NAME));
      } catch {}
      if (notif.link) {
        navigate(normalizeNotifLink(notif.link));
      }
    },
    [notifications, userUniqueKey, navigate]
  );

  const formatNotifTime = useCallback(
    (timeStr) => {
      if (!timeStr) return '';
      const d = new Date(timeStr);
      if (isNaN(d.getTime())) return String(timeStr).slice(0, 16);
      return d.toLocaleTimeString(language === 'km' ? 'km-KH' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
      });
    },
    [language]
  );

  const roleLabel = useMemo(() => {
    if (language === 'km') {
      if (normalizedRole === 'admin') return 'អ្នកគ្រប់គ្រង';
      if (normalizedRole === 'teacher') return 'គ្រូបង្រៀន';
      if (normalizedRole === 'student') return 'សិស្ស';
    }
    return normalizedRole.toUpperCase();
  }, [language, normalizedRole]);

  return (
    <Menu as="div" className="relative">
      {/* ✅ ប៊ូតុងកណ្ដឹង៖ ពណ៌ និងទំហំស៊ីគ្នា ១០០% ជាមួយប៊ូតុងថ្ងៃ-យប់ និងប៊ូតុងភាសាលើ Navbar */}
      <Menu.Button
        onClick={() => setShowClearPopover(false)}
        className={
          isMobile
            ? `relative p-2 rounded-xl text-yellow-300/80 hover:text-yellow-300 transition-all cursor-pointer focus:outline-none ${
                isStudent ? 'hover:bg-white/10' : 'hover:bg-blue-800/50'
              }`
            : `relative p-2.5 rounded-xl border transition-all text-white cursor-pointer focus:outline-none shadow-sm ${
                isStudent
                  ? 'bg-white/10 hover:bg-white/15 border-indigo-400/35 backdrop-blur-md'
                  : 'bg-blue-800/50 hover:bg-blue-700/60 border-blue-600/30'
              }`
        }
        title={t('សារជូនដំណឹង', 'Notifications')}
      >
        <BellIcon className="h-5 w-5 text-yellow-300" />
        {unreadCount > 0 && (
          <span
            className={
              isMobile
                ? `absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-extrabold flex items-center justify-center border ${
                    isStudent ? 'border-indigo-950' : 'border-blue-900'
                  }`
                : `absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center border-2 shadow-md animate-pulse ${
                    isStudent ? 'border-indigo-950' : 'border-blue-900'
                  }`
            }
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="nbell-dropdown origin-top-right absolute right-0 mt-2.5 w-[calc(100vw-1.5rem)] max-w-[20rem] sm:max-w-[24rem] sm:w-96 rounded-2xl shadow-2xl bg-white ring-1 ring-black/5 focus:outline-none z-50 border border-gray-100">
          <div
            className={`nbell-header relative px-4 py-3.5 border-b border-gray-100 rounded-t-2xl flex items-center justify-between ${
              isStudent
                ? 'bg-gradient-to-r from-indigo-50 to-purple-50'
                : 'bg-gradient-to-r from-blue-50 to-indigo-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <BellIcon
                className={`h-5 w-5 ${
                  isStudent
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-blue-600 dark:text-blue-400'
                }`}
              />
              <div>
                <h3 className="nbell-title text-sm font-extrabold text-gray-900">
                  {t('សារជូនដំណឹង', 'Notifications')}
                </h3>
                <p
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    isStudent
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {roleLabel} {t('ផ្ទាល់ខ្លួន', 'Portal')} •{' '}
                  {NOTIFICATION_EXPIRE_DAYS} {t('ថ្ងៃ', 'Days')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowClearPopover(false);
                    markAllAsRead();
                  }}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                    isStudent
                      ? 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/30'
                      : 'text-blue-600 dark:text-blue-400 hover:bg-blue-100/70 dark:hover:bg-blue-900/30'
                  }`}
                  title={t('កំណត់ថាអានរួចទាំងអស់', 'Mark all as read')}
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                  {t('អានទាំងអស់', 'Mark read')}
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowClearPopover((prev) => !prev);
                  }}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    showClearPopover
                      ? 'bg-rose-600 text-white shadow-xs scale-105'
                      : 'text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                  }`}
                  title={t('សម្អាតទាំងអស់', 'Clear all')}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            <Transition
              show={showClearPopover && notifications.length > 0}
              as={Fragment}
              enter="transition ease-out duration-150"
              enterFrom="transform opacity-0 scale-95 -translate-y-1"
              enterTo="transform opacity-100 scale-100 translate-y-0"
              leave="transition ease-in duration-100"
              leaveFrom="transform opacity-100 scale-100 translate-y-0"
              leaveTo="transform opacity-0 scale-95 -translate-y-1"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="nbell-popover absolute right-3 top-13 z-30 w-60 bg-white rounded-2xl shadow-[0_12px_32px_rgba(15,23,42,0.18)] border border-rose-100 p-3.5"
              >
                <div className="nbell-popover-arrow absolute -top-1.5 right-3 w-3 h-3 bg-white border-t border-l border-rose-100 rotate-45" />

                <div className="relative z-10">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-800/50 shrink-0">
                      <ExclamationTriangleIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="nbell-title text-xs font-extrabold text-gray-900 leading-snug">
                        {t('លុបសារទាំងអស់មែនទេ?', 'Clear all notifications?')}
                      </p>
                      <p className="nbell-desc text-[10px] font-medium text-gray-500 mt-0.5 leading-relaxed">
                        {t(
                          `សារទាំង ${notifications.length} នឹងត្រូវសម្អាតចេញ។`,
                          `All ${notifications.length} items will be removed.`
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 mt-3 pt-2.5 border-t border-gray-100 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowClearPopover(false);
                      }}
                      className="nbell-cancel-btn px-2.5 py-1 text-[11px] font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200/80 rounded-lg transition-colors cursor-pointer"
                    >
                      {t('បោះបង់', 'Cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={confirmClearAllNotifications}
                      className="px-3 py-1 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                    >
                      {t('លុបចោល', 'Delete')}
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <div
            onClick={() => {
              if (showClearPopover) setShowClearPopover(false);
            }}
            className="nbell-list max-h-80 overflow-y-auto rounded-b-2xl"
          >
            {notifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="nbell-empty-icon h-12 w-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-2.5 border border-gray-100">
                  <BellIcon className="h-6 w-6 text-gray-300 dark:text-slate-500" />
                </div>
                <p className="nbell-title text-sm font-bold text-gray-600">
                  {t('មិនទាន់មានសារជូនដំណឹងថ្មីទេ', 'No notifications yet')}
                </p>
                <p className="nbell-desc text-xs text-gray-400 mt-1">
                  {t(
                    'រាល់សកម្មភាពក្នុងផ្ទាំងរបស់អ្នកនឹងបង្ហាញនៅទីនេះ',
                    'Activities in your portal will appear here'
                  )}
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <Menu.Item key={notif.id}>
                  {({ active }) => (
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notif)}
                      className={`nbell-item w-full text-left px-4 py-3.5 transition-colors flex items-start gap-3 cursor-pointer ${
                        active
                          ? isStudent
                            ? 'bg-indigo-50/60 dark:bg-slate-800/90'
                            : 'bg-blue-50/60 dark:bg-slate-800/90'
                          : !notif.read
                          ? isStudent
                            ? 'nbell-item-unread bg-indigo-50/30'
                            : 'nbell-item-unread bg-blue-50/30'
                          : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div
                        className={`mt-0.5 p-2 rounded-xl shrink-0 border ${
                          !notif.read
                            ? isStudent
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'nbell-icon-read bg-gray-100 text-gray-500 border-gray-200'
                        }`}
                      >
                        <SparklesIcon className="h-4 w-4" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-xs truncate ${
                              !notif.read
                                ? 'nbell-title font-extrabold text-gray-900'
                                : 'nbell-title-read font-bold text-gray-700'
                            }`}
                          >
                            {t(notif.titleKm, notif.titleEn)}
                          </p>
                          {!notif.read && (
                            <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0 mt-1"></span>
                          )}
                        </div>
                        <p className="nbell-desc text-[11px] font-medium text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                          {t(notif.descKm, notif.descEn)}
                        </p>
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 mt-1.5 block">
                          {formatNotifTime(notif.time)}
                        </span>
                      </div>
                    </button>
                  )}
                </Menu.Item>
              ))
            )}
          </div>
        </Menu.Items>
      </Transition>

      <style>{`
        .nbell-item + .nbell-item {
          border-top: 1px solid #f1f5f9;
        }

        html.dark .nbell-dropdown,
        html.dark .nbell-popover {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .nbell-popover-arrow {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .nbell-header {
          background: linear-gradient(to right, #1e293b, #0f172a) !important;
          border-color: #334155 !important;
        }
        html.dark .nbell-title {
          color: #f8fafc !important;
        }
        html.dark .nbell-title-read {
          color: #cbd5e1 !important;
        }
        html.dark .nbell-desc {
          color: #94a3b8 !important;
        }
        html.dark .nbell-item + .nbell-item {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .nbell-item-unread {
          background-color: rgba(99, 102, 241, 0.12) !important;
        }
        html.dark .nbell-icon-read,
        html.dark .nbell-empty-icon,
        html.dark .nbell-cancel-btn {
          background-color: #1e293b !important;
          border-color: #334155 !important;
          color: #94a3b8 !important;
        }
      `}</style>
    </Menu>
  );
};

export default React.memo(NotificationBell);
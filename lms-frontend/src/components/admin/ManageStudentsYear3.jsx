// src/components/admin/ManageStudentsYear3.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from '../../services/api';
import { getCachedDepartments, getCachedRoles, getCachedCourses } from '../../services/metadataService';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import XLSX from 'xlsx-js-style'; 
import { 
  PencilSquareIcon, 
  TrashIcon, 
  PlusIcon, 
  UserGroupIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  AcademicCapIcon,
  BookOpenIcon,
  DocumentIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  Squares2X2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleUpIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  SparklesIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី ១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនី Admin ម្នាក់ៗ (User-Scoped 0ms Cache)
// ============================================================================
const CACHE_KEY_LEGACY_STUDENTS = 'cached_admin_students_year3_only';
const CACHE_KEY_LEGACY_META = 'cached_admin_students_year3_only_meta';
const CACHE_KEY_LEGACY_ENROLLED_MAP = 'cached_student_enrolled_depts_map_y3';
const CACHE_KEY_SHARED_STUDENTS = 'cached_admin_students_list';
const CACHE_KEY_SHARED_DEPTS = 'cached_admin_departments_list';
const CACHE_KEY_SHARED_COURSES = 'cached_admin_courses_list';

const getStudentsY3CacheKey = (uid) => `cached_admin_students_year3_v8_${uid}`;
const getStudentsY3MetaCacheKey = (uid) => `cached_admin_students_year3_meta_v8_${uid}`;
const getEnrolledDeptsMapKey = (uid) => `cached_student_enrolled_depts_map_y3_v8_${uid}`;
const getDeptsCacheKey = (uid) => `cached_admin_departments_list_v8_${uid}`;
const getCoursesCacheKey = (uid) => `cached_admin_courses_list_v8_${uid}`;
const getAllStudentsCacheKey = (uid) => `cached_admin_students_list_v8_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់អ្នកគ្រប់គ្រងម្នាក់ៗ + រក្សាទុករូបភាពក្នុង RAM ដើម្បីបង្ហាញលឿន 0ms
const ADMIN_STUDENTS_Y3_MEM_CACHE = {
  uid: null,
  students: null,
  meta: null,
  enrolledDeptsMap: null,
  departments: null,
  courses: null,
  studentRoleId: null,
  lastSyncedAt: 0,
  avatarMap: {},
};

const readStorageJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// ✅ រក្សាទុកទិន្នន័យចូល localStorage ដោយសុវត្ថិភាព (បើរូប Base64 ធំពេកលើសទំហំ localStorage វានឹងរក្សារូបក្នុង RAM ជំនួស)
const safeWriteStudentsStorage = (key, list) => {
  if (!Array.isArray(list)) return;
  list.forEach((sItem) => {
    const img = sItem?.profile_image || sItem?.user?.profile_image;
    if (sItem?.id && img) {
      ADMIN_STUDENTS_Y3_MEM_CACHE.avatarMap[sItem.id] = img;
    }
  });
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    try {
      const lightList = list.map((item) => ({
        ...item,
        profile_image:
          item.profile_image && item.profile_image.startsWith('data:')
            ? null
            : item.profile_image,
        user: item.user
          ? {
              ...item.user,
              profile_image:
                item.user.profile_image &&
                item.user.profile_image.startsWith('data:')
                  ? null
                  : item.user.profile_image,
            }
          : item.user,
      }));
      localStorage.setItem(key, JSON.stringify(lightList));
    } catch {}
  }
};

// ✅ អនុគមន៍បិទបាំងផ្នែកកណ្ដាលនៃអ៊ីមែល (ឧ. "classit830@gmail.com" -> "cla*****30@gmail.com")
const maskEmailAddress = (email) => {
  if (!email || typeof email !== 'string' || !email.includes('@')) return email || '';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) return `${localPart[0] || '*'}***@${domain}`;
  if (localPart.length <= 4) return `${localPart.slice(0, 2)}***@${domain}`;
  return `${localPart.slice(0, 3)}*****${localPart.slice(-2)}@${domain}`;
};

// ✅ អនុគមន៍ចាប់យកអត្តសញ្ញាណអ្នកគ្រប់គ្រងឱ្យជាក់លាក់តាំងពីវិនាទីដំបូង
const resolveAdminUid = (contextUser) => {
  if (contextUser) {
    const id =
      contextUser.id ||
      contextUser.user_id ||
      contextUser.admin?.id ||
      contextUser.email;
    if (id) return String(id);
  }
  try {
    const raw =
      localStorage.getItem('user') || localStorage.getItem('auth_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      const u = parsed?.user || parsed?.data || parsed;
      const id = u?.id || u?.user_id || u?.admin?.id || u?.email;
      if (id) return String(id);
    }
  } catch {}
  return 'default_admin';
};

// ពណ៌សម្រាប់កាតដេប៉ាតឺម៉ង់នីមួយៗ (ទាំងទម្រង់ថ្ងៃ និងទម្រង់យប់ Dark Mode)
const DEPT_CARD_THEMES = [
  { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', darkClass: 'std-dept-emerald' },
  { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', darkClass: 'std-dept-indigo' },
  { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', darkClass: 'std-dept-amber' },
  { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', darkClass: 'std-dept-rose' },
  { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100', darkClass: 'std-dept-purple' },
  { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-100', darkClass: 'std-dept-cyan' },
];

// ✅ អនុគមន៍បម្លែងគ្រប់ទម្រង់ថ្ងៃខែឆ្នាំ (30-04-2005, 30/04/2005, លេខខ្មែរ, ឬលេខ Excel) ទៅជា YYYY-MM-DD
const formatDateOnly = (dateVal) => {
  if (dateVal === null || dateVal === undefined || dateVal === '') return '';
  let str = String(dateVal).trim().replace(/^'+/, '');
  if (!str || str === '-' || str.toLowerCase() === 'null') return '';

  // បម្លែងលេខខ្មែរ (០-៩) ទៅជាលេខសากล (0-9)
  const khmerDigits = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
  khmerDigits.forEach((kd, idx) => {
    str = str.replace(new RegExp(kd, 'g'), String(idx));
  });

  if (str.includes('T')) {
    str = str.split('T')[0];
  } else if (str.includes(' ') && /^\d{4}-\d{2}-\d{2}\s/.test(str)) {
    str = str.split(' ')[0];
  }

  // 1. ករណីជាលេខ Serial Date របស់ Excel (ឧទាហរណ៍ 38472)
  if (/^\d+(\.\d+)?$/.test(str)) {
    const serial = Number(str);
    if (serial > 1000 && serial < 100000) {
      const utcDays = Math.floor(serial - 25569);
      const d = new Date(utcDays * 86400 * 1000);
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
      }
    }
  }

  // 2. ករណីទម្រង់ DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY (ឧទាហរណ៍ 30-04-2005)
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{4})$/);
  if (dmyMatch) {
    const first = parseInt(dmyMatch[1], 10);
    const second = parseInt(dmyMatch[2], 10);
    const year = dmyMatch[3];
    const day = second > 12 && first <= 12 ? second : first;
    const month = second > 12 && first <= 12 ? first : second;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // 3. ករណីទម្រង់ YYYY-MM-DD ឬ YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{1,2})$/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${String(ymdMatch[2]).padStart(2, '0')}-${String(ymdMatch[3]).padStart(2, '0')}`;
  }

  return str;
};

// ✅ អនុគមន៍ទាញយកឈ្មោះពេញរបស់សិស្ស ឬគ្រូ (រក្សាឈ្មោះដើមពី Database)
const getStudentFullName = (person) => {
  if (!person) return '';
  return `${person.first_name || ''} ${person.last_name || ''}`.trim();
};

// ✅ អនុគមន៍ទាញយកឈ្មោះដេប៉ាតឺម៉ង់ (រក្សាឈ្មោះដើមពី Database)
const getDepartmentDisplayName = (deptObjOrName) => {
  if (!deptObjOrName) return '—';
  const rawName = typeof deptObjOrName === 'string'
    ? deptObjOrName
    : (deptObjOrName.department_name || deptObjOrName.name || '');
  return rawName || '—';
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

// ✅ អនុគមន៍បម្លែងកម្រិតសិក្សាពី Excel (ទោះវាយជាខ្មែរ ឬអង់គ្លេស) ឱ្យត្រូវជាមួយប្រព័ន្ធ
const normalizeDegreeLevel = (degVal) => {
  if (!degVal) return '';
  const d = degVal.toString().trim().toLowerCase();
  if (d.includes('រង') || d.includes('associate') || d.includes('ជាន់ខ្ពស់បច្ចេកទេស')) {
    return 'Associate Degree';
  }
  if (d.includes('ជាន់ខ្ពស់') || d.includes('master') || d.includes('អនុបណ្ឌិត')) {
    return 'Master Degree';
  }
  if (d.includes('បរិញ្ញាបត្រ') || d.includes('bachelor')) {
    return 'Bachelor Degree';
  }
  return degVal.toString().trim();
};

// ✅ អនុគមន៍ត្រួតពិនិត្យថា តើសិស្សនោះពិតជានិស្សិត "ឆ្នាំទី៣" មែនឬទេ
const isYear3Student = (student) => {
  if (!student) return false;
  const rawVal = student.batch_year ?? student.year ?? student.academic_year ?? '';
  const raw = rawVal.toString().toLowerCase().trim();
  
  return (
    raw === '3' ||
    raw === '៣' ||
    raw.includes('year 3') ||
    raw.includes('year3') ||
    raw.includes('y3') ||
    raw.includes('ឆ្នាំទី៣') ||
    raw.includes('ឆ្នាំទី ៣') ||
    raw.includes('ឆ្នាំទី3') ||
    raw.includes('ឆ្នាំទី 3')
  );
};

// ✅ អនុគមន៍គណនាដំឡើងឆ្នាំសិក្សាដោយស្វ័យប្រវត្តិ (ពី ឆ្នាំទី៣ -> ឆ្នាំទី៤) ដោយរក្សាឈ្មោះជំនាន់នៅដដែល
const calculateNextBatchYear = (currentVal) => {
  if (!currentVal) return 'ជំនាន់ទី..., ឆ្នាំទី៤'; 
  let nextVal = currentVal.toString().trim();
  
  if (/ឆ្នាំទី\s*៣/i.test(nextVal)) return nextVal.replace(/ឆ្នាំទី\s*៣/i, 'ឆ្នាំទី៤');
  if (/ឆ្នាំទី\s*3/i.test(nextVal)) return nextVal.replace(/ឆ្នាំទី\s*3/i, 'ឆ្នាំទី4');
  if (/year\s*3/i.test(nextVal)) return nextVal.replace(/year\s*3/ig, 'Year 4');
  if (/y3/i.test(nextVal)) return nextVal.replace(/y3/ig, 'Y4');

  if (nextVal === '3') return '4';
  if (nextVal === '៣') return '៤';

  if (nextVal.includes('ជំនាន់') && !nextVal.includes('ឆ្នាំ')) {
    return `${nextVal}, ឆ្នាំទី៤`;
  }

  return nextVal + ' (ទៅឆ្នាំទី៤)';
};

// ✅ អនុគមន៍តម្រៀបសិស្សដែលមានឈ្មោះមុន (លេខរៀងទី 1 ឬអត្តលេខតូច) ឱ្យនៅខាងលើគេដេញចុះមកក្រោម សម្រាប់ទាញយក Excel
const sortStudentsOldestFirst = (list) => {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const codeA = (a.student_code || '').toString().trim();
    const codeB = (b.student_code || '').toString().trim();
    if (codeA && codeB && codeA !== codeB) {
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    }
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
};

// ✅ អនុគមន៍សម្រាប់បញ្ជូនសារជូនដំណឹងចូលទៅកាន់រូបកណ្ដឹង (NotificationBell) នៅលើ Navbar
const pushLocalNotification = (notif) => {
  try {
    const userObjStr = localStorage.getItem('auth_user') || localStorage.getItem('user');
    let uid = 'default';
    let role = 'admin';
    if (userObjStr) {
      const userObj = JSON.parse(userObjStr);
      const u = userObj?.user || userObj?.data || userObj;
      uid = u?.id || u?.user_id || u?.email || 'default';
      if (u?.role) {
        const rName =
          typeof u.role === 'string'
            ? u.role
            : u.role.role_name || u.role.name || 'admin';
        role = rName.toString().toLowerCase();
      }
    }

    const keysToUpdate = Array.from(
      new Set([`lms_notifs_admin_${uid}`, `lms_notifs_${role}_${uid}`])
    );

    const newNotif = {
      id: `local_act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toISOString(),
      read: false,
      ...notif
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

// ============================================================================
// 📌 ផ្នែកទី ២៖ COMPONENT គោលសម្រាប់គ្រប់គ្រងសិស្សឆ្នាំទី៣ (ManageStudentsYear3)
// ============================================================================
const ManageStudentsYear3 = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [failedAvatars, setFailedAvatars] = useState({});

  // ✅ កំណត់អត្តសញ្ញាណ Admin បច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentAdminId = useMemo(() => resolveAdminUid(user), [user]);

  if (
    ADMIN_STUDENTS_Y3_MEM_CACHE.uid &&
    ADMIN_STUDENTS_Y3_MEM_CACHE.uid !== currentAdminId
  ) {
    ADMIN_STUDENTS_Y3_MEM_CACHE.students = null;
    ADMIN_STUDENTS_Y3_MEM_CACHE.meta = null;
    ADMIN_STUDENTS_Y3_MEM_CACHE.enrolledDeptsMap = null;
    ADMIN_STUDENTS_Y3_MEM_CACHE.departments = null;
    ADMIN_STUDENTS_Y3_MEM_CACHE.courses = null;
    ADMIN_STUDENTS_Y3_MEM_CACHE.lastSyncedAt = 0;
    ADMIN_STUDENTS_Y3_MEM_CACHE.avatarMap = {};
  }
  ADMIN_STUDENTS_Y3_MEM_CACHE.uid = currentAdminId;

  // ✅ ១. អានទិន្នន័យពី Cache មកបង្ហាញភ្លាមៗក្នុង 0 វិនាទី (គ្មាន Skeleton Loading)
  const [students, setStudents] = useState(() => {
    if (Array.isArray(ADMIN_STUDENTS_Y3_MEM_CACHE.students)) {
      return ADMIN_STUDENTS_Y3_MEM_CACHE.students;
    }
    const cachedY3 =
      readStorageJson(getStudentsY3CacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_LEGACY_STUDENTS, null);
    if (Array.isArray(cachedY3)) {
      ADMIN_STUDENTS_Y3_MEM_CACHE.students = cachedY3;
      return cachedY3;
    }
    const allPrefetched =
      readStorageJson(getAllStudentsCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_STUDENTS, []);
    if (Array.isArray(allPrefetched)) {
      const filtered = allPrefetched.filter((s) => isYear3Student(s));
      ADMIN_STUDENTS_Y3_MEM_CACHE.students = filtered;
      return filtered;
    }
    return [];
  });

  // ✅ រក្សាទុកបញ្ជីដេប៉ាតឺម៉ង់នៃមុខវិជ្ជាដែលសិស្សនីមួយៗបានចុះឈ្មោះរៀន { [studentId]: ['1', '2'] }
  const [enrolledDeptsMap, setEnrolledDeptsMap] = useState(() => {
    if (ADMIN_STUDENTS_Y3_MEM_CACHE.enrolledDeptsMap) {
      return ADMIN_STUDENTS_Y3_MEM_CACHE.enrolledDeptsMap;
    }
    const cached =
      readStorageJson(getEnrolledDeptsMapKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_LEGACY_ENROLLED_MAP, {});
    ADMIN_STUDENTS_Y3_MEM_CACHE.enrolledDeptsMap = cached;
    return cached;
  });

  const [departments, setDepartments] = useState(() => {
    if (Array.isArray(ADMIN_STUDENTS_Y3_MEM_CACHE.departments)) {
      return ADMIN_STUDENTS_Y3_MEM_CACHE.departments;
    }
    const cached =
      readStorageJson(getDeptsCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_DEPTS, []);
    if (Array.isArray(cached)) {
      ADMIN_STUDENTS_Y3_MEM_CACHE.departments = cached;
      return cached;
    }
    return [];
  });

  const [allCourses, setAllCourses] = useState(() => {
    if (Array.isArray(ADMIN_STUDENTS_Y3_MEM_CACHE.courses)) {
      return ADMIN_STUDENTS_Y3_MEM_CACHE.courses;
    }
    const cached =
      readStorageJson(getCoursesCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES, []);
    if (Array.isArray(cached)) {
      ADMIN_STUDENTS_Y3_MEM_CACHE.courses = cached;
      return cached;
    }
    return [];
  });

  const [studentRoleId, setStudentRoleId] = useState(
    () => ADMIN_STUDENTS_Y3_MEM_CACHE.studentRoleId || null
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError, setFormError] = useState('');
  const [importError, setImportError] = useState('');

  // ២. State និង Ref សម្រាប់គ្រប់គ្រងការជ្រើសរើសដេប៉ាតឺម៉ង់, វេនសិក្សា និងការអូសកាតឆ្វេង-ស្ដាំ
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  // ✅ State សម្រាប់បែងចែកសិស្សតាមវេនសិក្សា ('all' | 'Monday-Friday' | 'Saturday-Sunday')
  const [selectedShift, setSelectedShift] = useState('all');

  const cardsScrollRef = useRef(null);
  const [isDraggingCards, setIsDraggingCards] = useState(false);
  const dragStartXRef = useRef(0);
  const scrollLeftStartRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const prevCountsRef = useRef({ all: 0 });

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // ៣. State សម្រាប់មុខងារស្វែងរក (Search) និងការបើក/បិទ Modal នានា
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const abortControllerRef = useRef(null);
  
  // ៤. State សម្រាប់ការបែងចែកទំព័រ (Pagination)
  const [page, setPage] = useState(1);
  const [perPage] = useState(200);
  const [meta, setMeta] = useState(() => {
    if (ADMIN_STUDENTS_Y3_MEM_CACHE.meta) return ADMIN_STUDENTS_Y3_MEM_CACHE.meta;
    const cached =
      readStorageJson(getStudentsY3MetaCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_LEGACY_META, null);
    if (cached) {
      ADMIN_STUDENTS_Y3_MEM_CACHE.meta = cached;
      return cached;
    }
    return {
      current_page: 1,
      last_page: 1,
      total: students.length,
      per_page: 200,
    };
  });
  
  // ៥. State សម្រាប់ Modal លុបសិស្ស, នាំចូល Excel, ចុះឈ្មោះមុខវិជ្ជា និងដំឡើងឆ្នាំសិក្សា
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [unenrollTarget, setUnenrollTarget] = useState(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState(''); 
  
  // ៦. States សម្រាប់គ្រប់គ្រងការចុះឈ្មោះមុខវិជ្ជា (ទាំងសិស្សម្នាក់ៗ Multi-Select និងជាក្រុម Bulk Enroll)
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentEnrollments, setStudentEnrollments] = useState([]);
  const [selectedCoursesToEnroll, setSelectedCoursesToEnroll] = useState([]);
  const [enrollCourseSearch, setEnrollCourseSearch] = useState('');
  const [enrollDeptFilter, setEnrollDeptFilter] = useState('student_dept');
  const [isEnrollingCourses, setIsEnrollingCourses] = useState(false);

  // State សម្រាប់ចុះឈ្មោះមុខវិជ្ជាជាក្រុម (Bulk Enroll Modal)
  const [showBulkEnrollModal, setShowBulkEnrollModal] = useState(false);
  const [bulkSelectedCourses, setBulkSelectedCourses] = useState([]);
  const [bulkCourseSearch, setBulkCourseSearch] = useState('');
  const [bulkCourseDeptFilter, setBulkCourseDeptFilter] = useState('all');
  const [isBulkEnrolling, setIsBulkEnrolling] = useState(false);
  
  // ៧. State សម្រាប់ទម្រង់បញ្ចូលទិន្នន័យសិស្ស (កំណត់ gender, study_shift, status ជា '' ដើម្បីឱ្យលោតពាក្យ «ជ្រើសរើស...»)
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    status: '',
    gender: '',
    phone: '',
    student_code: '',
    department_id: '',
    batch_year: '',
    degree_level: '',
    study_shift: '',
    date_of_birth: '',
    address: '',
  });

  const [selectedStudents, setSelectedStudents] = useState([]);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteTargetYear, setPromoteTargetYear] = useState(''); 
  const [isPromoting, setIsPromoting] = useState(false);

  // ============================================================================
  // 📌 ផ្នែកទី ៣៖ ការច្រោះទិន្នន័យ និងគណនាចំនួនសិស្សតាមដេប៉ាតឺម៉ង់ និងវេនសិក្សា
  // ============================================================================

  // ✅ អនុគមន៍ទាញយក ID ដេប៉ាតឺម៉ង់ទាំងអស់របស់សិស្សម្នាក់ (ទាំងដេប៉ាតឺម៉ង់គោល + ដេប៉ាតឺម៉ង់នៃមុខវិជ្ជាដែលបានចុះឈ្មោះរៀន)
  const getStudentDepartmentIds = useCallback((student) => {
    if (!student) return [];
    const deptSet = new Set();

    // ១. ដេប៉ាតឺម៉ង់គោលរបស់សិស្ស
    const primaryDeptId = student.department_id || student.department?.id;
    if (primaryDeptId !== undefined && primaryDeptId !== null && primaryDeptId !== '') {
      deptSet.add(String(primaryDeptId));
    }

    // ២. ដេប៉ាតឺម៉ង់ពីទិន្នន័យ enrollments ឬ courses ដែលភ្ជាប់មកជាមួយ API (បើមាន)
    if (Array.isArray(student.enrollments)) {
      student.enrollments.forEach((enr) => {
        const cDeptId = enr.course?.department_id || enr.course?.department?.id || enr.department_id;
        if (cDeptId !== undefined && cDeptId !== null && cDeptId !== '') {
          deptSet.add(String(cDeptId));
        } else if (enr.course_id && allCourses.length > 0) {
          const matchedCourse = allCourses.find((c) => Number(c.id) === Number(enr.course_id));
          const mDeptId = matchedCourse?.department_id || matchedCourse?.department?.id;
          if (mDeptId) deptSet.add(String(mDeptId));
        }
      });
    }

    if (Array.isArray(student.courses)) {
      student.courses.forEach((c) => {
        const cDeptId = c.department_id || c.department?.id;
        if (cDeptId !== undefined && cDeptId !== null && cDeptId !== '') {
          deptSet.add(String(cDeptId));
        }
      });
    }

    // ៣. ដេប៉ាតឺម៉ង់ដែលបានកត់ត្រាទុកក្នុង enrolledDeptsMap ពេលចុះឈ្មោះមុខវិជ្ជា
    const mappedDepts = enrolledDeptsMap[student.id];
    if (Array.isArray(mappedDepts)) {
      mappedDepts.forEach((dId) => {
        if (dId !== undefined && dId !== null && dId !== '') {
          deptSet.add(String(dId));
        }
      });
    }

    return Array.from(deptSet);
  }, [allCourses, enrolledDeptsMap]);

  // ✅ អនុគមន៍ធ្វើបច្ចុប្បន្នភាពបញ្ជីដេប៉ាតឺម៉ង់របស់សិស្សភ្លាមៗនៅពេលចុះឈ្មោះ ឬលុបមុខវិជ្ជា
  const syncStudentEnrolledDepts = useCallback((studentId, enrollmentsList, coursesCatalog = allCourses) => {
    if (!studentId) return;
    const deptIds = new Set();
    (enrollmentsList || []).forEach((enr) => {
      let dId = enr.course?.department_id || enr.course?.department?.id;
      if (!dId && enr.course_id && coursesCatalog.length > 0) {
        const foundCourse = coursesCatalog.find((c) => Number(c.id) === Number(enr.course_id));
        dId = foundCourse?.department_id || foundCourse?.department?.id;
      }
      if (dId !== undefined && dId !== null && dId !== '') {
        deptIds.add(String(dId));
      }
    });

    setEnrolledDeptsMap((prev) => {
      const next = { ...prev, [studentId]: Array.from(deptIds) };
      ADMIN_STUDENTS_Y3_MEM_CACHE.enrolledDeptsMap = next;
      try {
        localStorage.setItem(getEnrolledDeptsMapKey(currentAdminId), JSON.stringify(next));
        localStorage.setItem(CACHE_KEY_LEGACY_ENROLLED_MAP, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }, [allCourses, currentAdminId]);

  // ច្រោះយកតែសិស្សណាដែលស្ថិតក្នុងឆ្នាំទី៣ ពិតប្រាកដ
  const year3StudentsAll = useMemo(() => {
    return (students || []).filter((student) => isYear3Student(student));
  }, [students]);

  // ✅ គណនាចំនួនសិស្សតាមដេប៉ាតឺម៉ង់ (បើសិស្សរៀនមុខវិជ្ជាក្នុង ២ ដេប៉ាតឺម៉ង់ នឹងរាប់បញ្ចូលក្នុងកាតដេប៉ាតឺម៉ង់ទាំង ២)
  const departmentCounts = useMemo(() => {
    if (debouncedSearch.trim() !== '') {
      return prevCountsRef.current;
    }

    const counts = { all: year3StudentsAll.length };
    departments.forEach((dept) => { counts[dept.id] = 0; });
    year3StudentsAll.forEach((student) => {
      const studentDeptIds = getStudentDepartmentIds(student);
      studentDeptIds.forEach((dId) => {
        departments.forEach((dept) => {
          if (String(dept.id) === String(dId)) {
            counts[dept.id] = (counts[dept.id] || 0) + 1;
          }
        });
      });
    });

    prevCountsRef.current = counts;
    return counts;
  }, [year3StudentsAll, departments, debouncedSearch, getStudentDepartmentIds]);

  // ✅ គណនាចំនួនសិស្សតាមវេនសិក្សា (ចន្ទ-សុក្រ vs សៅរ៍-អាទិត្យ) នៅក្នុងដេប៉ាតឺម៉ង់ដែលបានជ្រើសរើស
  const shiftCounts = useMemo(() => {
    const baseList = selectedDepartment === 'all'
      ? year3StudentsAll
      : year3StudentsAll.filter((student) => getStudentDepartmentIds(student).includes(String(selectedDepartment)));

    let monFri = 0;
    let satSun = 0;
    baseList.forEach((s) => {
      const norm = normalizeShiftKey(s.study_shift);
      if (norm === 'Saturday-Sunday') satSun += 1;
      else monFri += 1;
    });

    return {
      all: baseList.length,
      'Monday-Friday': monFri,
      'Saturday-Sunday': satSun,
    };
  }, [year3StudentsAll, selectedDepartment, getStudentDepartmentIds]);

  // ច្រោះបញ្ជីសិស្សតាមដេប៉ាតឺម៉ង់, តាមវេនសិក្សា និងតាមពាក្យស្វែងរក
  const displayedStudents = useMemo(() => {
    const filteredByDept = selectedDepartment === 'all'
      ? year3StudentsAll
      : year3StudentsAll.filter((student) => getStudentDepartmentIds(student).includes(String(selectedDepartment)));

    // ✅ ច្រោះតាមវេនសិក្សា (ចន្ទ-សុក្រ ឬ សៅរ៍-អាទិត្យ)
    const filteredByShift = selectedShift === 'all'
      ? filteredByDept
      : filteredByDept.filter((student) => normalizeShiftKey(student.study_shift) === selectedShift);

    if (!searchTerm.trim()) return filteredByShift;
    const q = searchTerm.toLowerCase().trim();
    return filteredByShift.filter((student) => {
      const fullName = `${student.first_name || ''} ${student.last_name || ''}`.toLowerCase();
      const reverseName = `${student.last_name || ''} ${student.first_name || ''}`.toLowerCase();

      return (
        fullName.includes(q) ||
        reverseName.includes(q) ||
        student.first_name?.toLowerCase().includes(q) ||
        student.last_name?.toLowerCase().includes(q) ||
        student.email?.toLowerCase().includes(q) ||
        student.phone?.toLowerCase().includes(q) ||
        student.student_code?.toLowerCase().includes(q) ||
        student.batch_year?.toLowerCase().includes(q)
      );
    });
  }, [year3StudentsAll, selectedDepartment, selectedShift, searchTerm, getStudentDepartmentIds]);

  // ✅ គណនាលេខទំព័រសម្រាប់ Sliding Window Pagination
  const paginationPages = useMemo(() => {
    const current = Number(meta.current_page || 1);
    const last = Number(meta.last_page || 1);
    const maxButtons = 5;
    let startPage = Math.max(1, current - Math.floor(maxButtons / 2));
    let endPage = Math.min(last, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }
    const pages = [];
    for (let p = startPage; p <= endPage; p++) {
      pages.push(p);
    }
    return pages;
  }, [meta.current_page, meta.last_page]);

  // ============================================================================
  // 📌 ផ្នែកទី ៤៖ មុខងារត្រួតពិនិត្យប៊ូតុងព្រួញអូសឆ្វេង-ស្ដាំ (SCROLL BUTTONS LOGIC)
  // ============================================================================

  const checkCardsScroll = useCallback(() => {
    const el = cardsScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    checkCardsScroll();
    window.addEventListener('resize', checkCardsScroll);
    return () => window.removeEventListener('resize', checkCardsScroll);
  }, [departments, checkCardsScroll]);

  const scrollDepartmentCards = (direction) => {
    if (!cardsScrollRef.current) return;
    const scrollAmount = 480;
    cardsScrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  const handleCardsMouseDown = (e) => {
    if (!cardsScrollRef.current) return;
    setIsDraggingCards(true);
    hasDraggedRef.current = false;
    dragStartXRef.current = e.pageX - cardsScrollRef.current.offsetLeft;
    scrollLeftStartRef.current = cardsScrollRef.current.scrollLeft;
  };

  const handleCardsMouseMove = (e) => {
    if (!isDraggingCards || !cardsScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - cardsScrollRef.current.offsetLeft;
    const walk = (x - dragStartXRef.current) * 1.4;
    if (Math.abs(walk) > 6) hasDraggedRef.current = true;
    cardsScrollRef.current.scrollLeft = scrollLeftStartRef.current - walk;
    checkCardsScroll();
  };

  const handleCardsMouseUpOrLeave = () => {
    setIsDraggingCards(false);
    checkCardsScroll();
  };

  const handleSelectDepartmentCard = (deptId) => {
    if (hasDraggedRef.current) return;
    setSelectedDepartment(deptId);
    setPage(1);
    setSelectedStudents([]);
  };

  // ============================================================================
  // 📌 ផ្នែកទី ៥៖ មុខងារជ្រើសរើសសិស្ស និងដំឡើងឆ្នាំសិក្សា (PROMOTE STUDENTS)
  // ============================================================================

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedStudents(displayedStudents.map(s => s.id));
    } else {
      setSelectedStudents([]);
    }
  };

  const handleSelectStudent = (id) => {
    setSelectedStudents(prev => 
      prev.includes(id) ? prev.filter(studentId => studentId !== id) : [...prev, id]
    );
  };

  const handleOpenPromoteModal = () => {
    if (selectedStudents.length > 0) {
      const firstStudent = students.find(s => s.id === selectedStudents[0]);
      if (firstStudent && firstStudent.batch_year) {
        const nextYear = calculateNextBatchYear(firstStudent.batch_year);
        setPromoteTargetYear(nextYear);
      } else {
        setPromoteTargetYear('ជំនាន់ទី..., ឆ្នាំទី៤');
      }
    }
    setShowPromoteModal(true);
  };

  const handlePromoteSubmit = async (e) => {
    e.preventDefault();
    if (selectedStudents.length === 0 || !promoteTargetYear.trim()) {
      return;
    }
    setIsPromoting(true);

    try {
      const countPromoted = selectedStudents.length;
      const targetStr = promoteTargetYear.trim();

      await api.post('/admin/students/promote', {
        student_ids: selectedStudents,
        target_year: targetStr
      });

      setStudents(prev => {
        const newList = prev.filter(s => !selectedStudents.includes(s.id));
        ADMIN_STUDENTS_Y3_MEM_CACHE.students = newList;
        safeWriteStudentsStorage(getStudentsY3CacheKey(currentAdminId), newList);
        safeWriteStudentsStorage(CACHE_KEY_LEGACY_STUDENTS, newList);
        return newList;
      });

      // សម្អាត Cache របស់ទំព័រឆ្នាំទី៤ ដើម្បីឱ្យពេលចូលទៅទំព័រឆ្នាំទី៤ ឃើញសិស្សដែលទើបឡើងភ្លាមៗ
      try {
        localStorage.removeItem(`cached_admin_students_year4_v8_${currentAdminId}`);
        localStorage.removeItem(`cached_admin_students_year4_meta_v8_${currentAdminId}`);
        localStorage.removeItem('cached_admin_students_year4_only');
        localStorage.removeItem('cached_admin_students_year4_only_meta');
        localStorage.removeItem(getAllStudentsCacheKey(currentAdminId));
        localStorage.removeItem(CACHE_KEY_SHARED_STUDENTS);
      } catch (e) {}

      pushLocalNotification({
        titleKm: 'បានឡើងឆ្នាំសិក្សាសិស្សជោគជ័យ',
        titleEn: 'Students Promoted Successfully',
        descKm: `សិស្សចំនួន ${countPromoted} នាក់ ត្រូវបានផ្លាស់ប្តូរទៅកាន់ «${targetStr}» ដោយជោគជ័យ។`,
        descEn: `${countPromoted} students have been successfully promoted to "${targetStr}".`,
        category: 'student',
        link: '/students/year-4'
      });

      setSelectedStudents([]);
      setShowPromoteModal(false);
      setPromoteTargetYear('');
    } catch (error) {
      console.error('Promotion error:', error);
    } finally {
      setIsPromoting(false);
    }
  };

  const activeDepartmentObj = useMemo(() => {
    if (selectedDepartment === 'all') return null;
    return departments.find((d) => String(d.id) === String(selectedDepartment)) || null;
  }, [selectedDepartment, departments]);

  // ============================================================================
  // 📌 ផ្នែកទី ៦៖ ការទាញទិន្នន័យពី BACKEND API ដោយមិនរាំងស្ទះ UI (Non-Blocking 0ms Sync)
  // ============================================================================

  useEffect(() => {
    if (!searchTerm.trim()) {
      setDebouncedSearch('');
      setPage(1);
      if (Array.isArray(ADMIN_STUDENTS_Y3_MEM_CACHE.students)) {
        setStudents(ADMIN_STUDENTS_Y3_MEM_CACHE.students);
        if (ADMIN_STUDENTS_Y3_MEM_CACHE.meta) {
          setMeta(ADMIN_STUDENTS_Y3_MEM_CACHE.meta);
        }
      }
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchDepartments = useCallback(async () => {
    try {
      const data = await getCachedDepartments();
      if (Array.isArray(data)) {
        setDepartments(data);
        ADMIN_STUDENTS_Y3_MEM_CACHE.departments = data;
        try {
          localStorage.setItem(getDeptsCacheKey(currentAdminId), JSON.stringify(data));
          localStorage.setItem(CACHE_KEY_SHARED_DEPTS, JSON.stringify(data));
        } catch {}
      }
    } catch (error) {}
  }, [currentAdminId]);

  const fetchStudentRole = useCallback(async () => {
    try {
      const rolesData = await getCachedRoles();
      const studentRole = (rolesData || []).find(
        (r) => r.role_name === 'Student' || r.name === 'Student'
      );
      if (studentRole) {
        setStudentRoleId(studentRole.id);
        ADMIN_STUDENTS_Y3_MEM_CACHE.studentRoleId = studentRole.id;
      }
    } catch (error) {}
  }, []);

  const fetchCoursesList = useCallback(async () => {
    try {
      const coursesData = await getCachedCourses();
      if (Array.isArray(coursesData)) {
        setAllCourses(coursesData);
        ADMIN_STUDENTS_Y3_MEM_CACHE.courses = coursesData;
        try {
          localStorage.setItem(getCoursesCacheKey(currentAdminId), JSON.stringify(coursesData));
          localStorage.setItem(CACHE_KEY_SHARED_COURSES, JSON.stringify(coursesData));
        } catch {}
      }
    } catch (error) {}
  }, [currentAdminId]);

  useEffect(() => {
    fetchDepartments();
    fetchStudentRole();
    fetchCoursesList();
  }, [fetchDepartments, fetchStudentRole, fetchCoursesList]);

  const fetchStudents = useCallback(
    async (forceRefresh = false) => {
      if (page === 1 && !debouncedSearch && !forceRefresh) {
        const cachedList = readStorageJson(getStudentsY3CacheKey(currentAdminId), null);
        if (Array.isArray(cachedList)) {
          const hydratedCached = cachedList.map((item) => {
            const memImg = ADMIN_STUDENTS_Y3_MEM_CACHE.avatarMap[item.id];
            if (memImg && !item.profile_image) {
              return { ...item, profile_image: memImg };
            }
            return item;
          });
          setStudents(hydratedCached);
          ADMIN_STUDENTS_Y3_MEM_CACHE.students = hydratedCached;
        }
        const now = Date.now();
        if (
          ADMIN_STUDENTS_Y3_MEM_CACHE.uid === currentAdminId &&
          Array.isArray(ADMIN_STUDENTS_Y3_MEM_CACHE.students) &&
          ADMIN_STUDENTS_Y3_MEM_CACHE.students.length > 0 &&
          now - ADMIN_STUDENTS_Y3_MEM_CACHE.lastSyncedAt < 25000
        ) {
          return;
        }
      }

      if (abortControllerRef.current) abortControllerRef.current.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await api.get('/admin/students', {
          params: { page, per_page: perPage, search: debouncedSearch, year: '3' },
          signal: controller.signal,
        });
        const rawList = Array.isArray(response.data?.data)
          ? response.data.data
          : response.data?.data?.data || response.data || [];
        const validRaw = Array.isArray(rawList) ? rawList : [];
        const year3StudentList = validRaw.filter((student) => isYear3Student(student));

        // ✅ រក្សាទុករូបភាពសិស្សក្នុង RAM ភ្លាមៗដើម្បីឱ្យការបង្ហាញរូបភាពលឿនបំផុត (0ms)
        year3StudentList.forEach((sItem) => {
          const img = sItem?.profile_image || sItem?.user?.profile_image;
          if (sItem?.id && img) {
            ADMIN_STUDENTS_Y3_MEM_CACHE.avatarMap[sItem.id] = img;
          }
        });

        const studentMeta = {
          ...(response.data?.meta || { current_page: 1, last_page: 1, per_page: perPage }),
          total: year3StudentList.length,
        };

        setStudents(year3StudentList);
        setMeta(studentMeta);

        if (page === 1 && !debouncedSearch) {
          ADMIN_STUDENTS_Y3_MEM_CACHE.uid = currentAdminId;
          ADMIN_STUDENTS_Y3_MEM_CACHE.students = year3StudentList;
          ADMIN_STUDENTS_Y3_MEM_CACHE.meta = studentMeta;
          ADMIN_STUDENTS_Y3_MEM_CACHE.lastSyncedAt = Date.now();
          safeWriteStudentsStorage(getStudentsY3CacheKey(currentAdminId), year3StudentList);
          safeWriteStudentsStorage(CACHE_KEY_LEGACY_STUDENTS, year3StudentList);
          try {
            localStorage.setItem(
              getStudentsY3MetaCacheKey(currentAdminId),
              JSON.stringify(studentMeta)
            );
            localStorage.setItem(
              CACHE_KEY_LEGACY_META,
              JSON.stringify(studentMeta)
            );
          } catch (e) {}
        }
      } catch (error) {
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return;
        console.error(error);
      }
    },
    [page, perPage, debouncedSearch, currentAdminId]
  );

  useEffect(() => {
    fetchStudents(false);
    setSelectedStudents([]);
  }, [fetchStudents]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (formError) setFormError('');
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');

    const effectiveRoleId = studentRoleId || 3;
    const finalDepartmentId = formData.department_id || (selectedDepartment !== 'all' ? selectedDepartment : '');
    const fullName = `${formData.first_name || ''} ${formData.last_name || ''}`.trim();

    setIsSubmitting(true);
    try {
      if (editingStudent) {
        // ✅ ប្រសិនបើពេល Edit អ៊ីមែលនៅជាទម្រង់បិទបាំង (មានសញ្ញា *) ឱ្យប្រើអ៊ីមែលដើមរបស់សិស្សនោះវិញដោយស្វ័យប្រវត្តិ
        const resolvedEmail =
          !formData.email || formData.email.includes('*')
            ? editingStudent.email
            : formData.email.trim();

        const payload = {};
        const dataToUpdate = {
          ...formData,
          email: resolvedEmail,
          department_id: finalDepartmentId,
        };
        Object.keys(dataToUpdate).forEach((key) => {
          if (dataToUpdate[key] !== null && dataToUpdate[key] !== undefined && dataToUpdate[key] !== '') {
            payload[key] = dataToUpdate[key];
          }
        });
        payload.role_id = effectiveRoleId;
        if (!formData.password) delete payload.password;

        const response = await api.put(`/admin/students/${editingStudent.id}`, payload);
        const serverData = response.data?.data || response.data;
        const updatedStudent = {
          ...editingStudent,
          ...dataToUpdate,
          ...(serverData && typeof serverData === 'object' ? serverData : {}),
          profile_image:
            serverData?.profile_image ||
            editingStudent.profile_image ||
            ADMIN_STUDENTS_Y3_MEM_CACHE.avatarMap[editingStudent.id],
        };

        setStudents(prev => {
          const newList = isYear3Student(updatedStudent)
            ? prev.map(s => s.id === editingStudent.id ? updatedStudent : s)
            : prev.filter(s => s.id !== editingStudent.id);
          if (page === 1 && !debouncedSearch) {
            ADMIN_STUDENTS_Y3_MEM_CACHE.students = newList;
            safeWriteStudentsStorage(getStudentsY3CacheKey(currentAdminId), newList);
            safeWriteStudentsStorage(CACHE_KEY_LEGACY_STUDENTS, newList);
          }
          return newList;
        });

        pushLocalNotification({
          titleKm: 'បានកែប្រែព័ត៌មានសិស្ស',
          titleEn: 'Student Updated',
          descKm: `ព័ត៌មានរបស់សិស្ស «${fullName}» ត្រូវបានកែប្រែដោយជោគជ័យ។`,
          descEn: `Student "${fullName}" has been updated successfully.`,
          category: 'student',
          link: '/students/year-3'
        });
      } else {
        const payload = {};
        const dataWithYear3 = {
          ...formData,
          department_id: finalDepartmentId,
          batch_year: formData.batch_year || 'ឆ្នាំទី3'
        };
        Object.keys(dataWithYear3).forEach((key) => {
          if (dataWithYear3[key] !== null && dataWithYear3[key] !== undefined && dataWithYear3[key] !== '') {
            payload[key] = dataWithYear3[key];
          }
        });
        payload.role_id = effectiveRoleId;

        const response = await api.post('/admin/students', payload);
        const newStudent = response.data?.data || response.data;

        if (isYear3Student(newStudent)) {
          setStudents(prev => {
            const newList = [newStudent, ...prev].slice(0, perPage);
            if (page === 1 && !debouncedSearch) {
              ADMIN_STUDENTS_Y3_MEM_CACHE.students = newList;
              safeWriteStudentsStorage(getStudentsY3CacheKey(currentAdminId), newList);
              safeWriteStudentsStorage(CACHE_KEY_LEGACY_STUDENTS, newList);
            }
            return newList;
          });
        }

        pushLocalNotification({
          titleKm: 'បានបង្កើតគណនីសិស្សថ្មី',
          titleEn: 'New Student Created',
          descKm: `គណនីសិស្សឆ្នាំទី៣ «${fullName}» ត្រូវបានបង្កើតចូលក្នុងប្រព័ន្ធជោគជ័យ។`,
          descEn: `Year 3 student "${fullName}" has been created successfully.`,
          category: 'student',
          link: '/students/year-3'
        });
      }
      setShowModal(false);
      resetForm();
      fetchStudents(true);
    } catch (error) {
      console.error('Submit student error:', error);
      const apiErrors = error.response?.data?.errors;
      const firstValidationMsg = apiErrors ? Object.values(apiErrors).flat()[0] : null;
      const errMsg =
        firstValidationMsg ||
        error.response?.data?.message ||
        t('មិនអាចរក្សាទុកទិន្នន័យសិស្សបានទេ (អ៊ីមែល ឬអត្តលេខអាចស្ទួន)!', 'Could not save student data (email or student code may already exist)!');
      setFormError(String(errMsg));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (student) => {
    setStudentToDelete(student);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!studentToDelete || isDeleting) return;
    const deletedId = studentToDelete.id;
    const deletedName = getStudentFullName(studentToDelete);
    const previousStudents = [...students];
    const previousMeta = { ...meta };

    setIsDeleting(true);
    setShowDeleteModal(false);
    setStudentToDelete(null);

    setStudents(prev => {
      const newList = prev.filter(s => s.id !== deletedId);
      if (page === 1 && !debouncedSearch) {
        ADMIN_STUDENTS_Y3_MEM_CACHE.students = newList;
        safeWriteStudentsStorage(getStudentsY3CacheKey(currentAdminId), newList);
        safeWriteStudentsStorage(CACHE_KEY_LEGACY_STUDENTS, newList);
      }
      return newList;
    });

    try {
      await api.delete(`/admin/students/${deletedId}`);

      pushLocalNotification({
        titleKm: 'បានលុបគណនីសិស្ស',
        titleEn: 'Student Deleted',
        descKm: `គណនីសិស្ស «${deletedName}» ត្រូវបានលុបចេញពីប្រព័ន្ធរួចរាល់។`,
        descEn: `Student "${deletedName}" has been removed.`,
        category: 'student',
        link: '/students/year-3'
      });
    } catch (error) {
      console.error('Failed to delete student:', error);
      setStudents(previousStudents);
      setMeta(previousMeta);
      ADMIN_STUDENTS_Y3_MEM_CACHE.students = previousStudents;
      ADMIN_STUDENTS_Y3_MEM_CACHE.meta = previousMeta;
    } finally {
      setIsDeleting(false);
    }
  };

  // ✅ ចាប់យកដេប៉ាតឺម៉ង់ និងវេនសិក្សាដែលកំពុងជ្រើសរើសជាស្រេចនៅពេលបើកទម្រង់បន្ថែមសិស្សថ្មី
  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      status: '',
      gender: '',
      phone: '',
      student_code: '',
      department_id: selectedDepartment !== 'all' ? String(selectedDepartment) : '',
      batch_year: '',
      degree_level: '',
      study_shift: selectedShift !== 'all' ? selectedShift : '',
      date_of_birth: '',
      address: '',
    });
    setEditingStudent(null);
    setFormError('');
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  // ✅ នៅពេលចុចកែប្រែ (Edit) បង្ហាញអ៊ីមែលជាទម្រង់បិទបាំង (ឧ. cla*****30@gmail.com) ដើម្បីការពារឯកជនភាព
  const openEditModal = (student) => {
    setFormError('');
    setEditingStudent(student);
    setFormData({
      first_name: student.first_name || '',
      last_name: student.last_name || '',
      email: maskEmailAddress(student.email || ''),
      password: '',
      status: student.user?.status || student.status || 'active',
      gender: student.gender || 'Male',
      phone: student.phone || '',
      student_code: student.student_code || '',
      department_id: student.department_id || student.department?.id || '',
      batch_year: student.batch_year || '',
      degree_level: normalizeDegreeLevel(student.degree_level),
      study_shift: normalizeShiftKey(student.study_shift),
      date_of_birth: formatDateOnly(student.date_of_birth),
      address: student.address || '',
    });
    setShowModal(true);
  };

  // ============================================================================
  // 📌 ផ្នែកទី ៧៖ មុខងារចុះឈ្មោះមុខវិជ្ជាឱ្យសិស្ស (SINGLE MULTI-SELECT & BULK ENROLLMENT)
  // ============================================================================

  const openEnrollmentModal = async (student) => {
    setSelectedStudent(student);
    setSelectedCoursesToEnroll([]);
    setEnrollCourseSearch('');
    const studentDeptId = student.department_id || student.department?.id;
    setEnrollDeptFilter(studentDeptId ? 'student_dept' : 'all');
    setShowEnrollmentModal(true);
    try {
      const [enrollmentsRes, coursesData] = await Promise.all([
        api.get(`/admin/students/${student.id}/enrollments`),
        getCachedCourses()
      ]);
      const fetchedEnrollments = enrollmentsRes.data.data || [];
      const fetchedCourses = coursesData || [];
      setStudentEnrollments(fetchedEnrollments);
      setAllCourses(fetchedCourses);
      // ✅ កត់ត្រាដេប៉ាតឺម៉ង់នៃមុខវិជ្ជាដែលសិស្សកំពុងរៀនភ្លាមៗ
      syncStudentEnrolledDepts(student.id, fetchedEnrollments, fetchedCourses);
    } catch (error) {
      console.error('Cannot fetch enrollment details:', error);
    }
  };

  // បញ្ជីមុខវិជ្ជាដែលសិស្សមិនទាន់បានចុះឈ្មោះ (ច្រោះតាមដេប៉ាតឺម៉ង់ និងពាក្យស្វែងរក)
  const availableCoursesForSingleStudent = useMemo(() => {
    if (!selectedStudent) return [];
    const unenrolled = allCourses.filter(
      (c) => !studentEnrollments.some((e) => Number(e.course_id) === Number(c.id))
    );
    const studentDeptId = selectedStudent.department_id || selectedStudent.department?.id;

    const filteredByDept = unenrolled.filter((c) => {
      if (enrollDeptFilter === 'all') return true;
      if (enrollDeptFilter === 'student_dept') {
        if (!studentDeptId) return true;
        return String(c.department_id || c.department?.id) === String(studentDeptId);
      }
      return String(c.department_id || c.department?.id) === String(enrollDeptFilter);
    });

    if (!enrollCourseSearch.trim()) return filteredByDept;
    const q = enrollCourseSearch.toLowerCase().trim();
    return filteredByDept.filter(
      (c) =>
        c.course_name?.toLowerCase().includes(q) ||
        c.course_code?.toLowerCase().includes(q)
    );
  }, [allCourses, studentEnrollments, selectedStudent, enrollDeptFilter, enrollCourseSearch]);

  const toggleCourseInSingleModal = (courseId) => {
    const idNum = Number(courseId);
    setSelectedCoursesToEnroll((prev) =>
      prev.includes(idNum) ? prev.filter((id) => id !== idNum) : [...prev, idNum]
    );
  };

  const handleSelectAllAvailableSingle = () => {
    const visibleIds = availableCoursesForSingleStudent.map((c) => Number(c.id));
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedCoursesToEnroll.includes(id));
    if (allSelected) {
      setSelectedCoursesToEnroll((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedCoursesToEnroll((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleEnrollSelectedCourses = async (e) => {
    if (e) e.preventDefault();
    if (!selectedStudent || selectedCoursesToEnroll.length === 0) return;
    setIsEnrollingCourses(true);
    try {
      const countToEnroll = selectedCoursesToEnroll.length;
      const studentName = getStudentFullName(selectedStudent);

      await api.post(`/admin/students/${selectedStudent.id}/enrollments`, {
        course_ids: selectedCoursesToEnroll,
      });
      const enrollmentsRes = await api.get(`/admin/students/${selectedStudent.id}/enrollments`);
      const updatedEnrollments = enrollmentsRes.data.data || [];
      setStudentEnrollments(updatedEnrollments);
      // ✅ ធ្វើបច្ចុប្បន្នភាពដេប៉ាតឺម៉ង់របស់សិស្សភ្លាមៗ (បើរៀនមុខវិជ្ជាដេប៉ាតឺម៉ង់ទី ២ នឹងបង្ហាញឈ្មោះក្នុងដេប៉ាតឺម៉ង់ទី ២ ភ្លាម)
      syncStudentEnrolledDepts(selectedStudent.id, updatedEnrollments, allCourses);
      setSelectedCoursesToEnroll([]);

      pushLocalNotification({
        titleKm: 'បានចុះឈ្មោះមុខវិជ្ជាជូនសិស្ស',
        titleEn: 'Student Courses Enrolled',
        descKm: `បានចុះឈ្មោះមុខវិជ្ជាចំនួន ${countToEnroll} មុខវិជ្ជាជូនសិស្ស «${studentName}» ដោយជោគជ័យ។`,
        descEn: `Enrolled "${studentName}" in ${countToEnroll} courses successfully.`,
        category: 'student',
        link: '/students/year-3'
      });
    } catch (error) {
      console.error('Failed to enroll courses:', error);
    } finally {
      setIsEnrollingCourses(false);
    }
  };

  const handleQuickEnrollAllDeptCourses = async () => {
    if (!selectedStudent) return;
    const studentDeptId = selectedStudent.department_id || selectedStudent.department?.id;
    const deptUnenrolled = allCourses.filter(
      (c) =>
        (!studentDeptId || String(c.department_id || c.department?.id) === String(studentDeptId)) &&
        !studentEnrollments.some((e) => Number(e.course_id) === Number(c.id))
    );

    if (deptUnenrolled.length === 0) {
      return;
    }

    setIsEnrollingCourses(true);
    try {
      const courseIds = deptUnenrolled.map((c) => Number(c.id));
      const studentName = getStudentFullName(selectedStudent);

      await api.post(`/admin/students/${selectedStudent.id}/enrollments`, { course_ids: courseIds });
      const enrollmentsRes = await api.get(`/admin/students/${selectedStudent.id}/enrollments`);
      const updatedEnrollments = enrollmentsRes.data.data || [];
      setStudentEnrollments(updatedEnrollments);
      syncStudentEnrolledDepts(selectedStudent.id, updatedEnrollments, allCourses);
      setSelectedCoursesToEnroll([]);

      pushLocalNotification({
        titleKm: 'បានដាក់បញ្ចូលគ្រប់មុខវិជ្ជាក្នុងដេប៉ាតឺម៉ង់',
        titleEn: 'Enrolled All Department Courses',
        descKm: `បានដាក់បញ្ចូលមុខវិជ្ជាក្នុងដេប៉ាតឺម៉ង់ទាំង ${courseIds.length} មុខវិជ្ជាជូនសិស្ស «${studentName}» ជោគជ័យ។`,
        descEn: `Enrolled all ${courseIds.length} department courses for "${studentName}".`,
        category: 'student',
        link: '/students/year-3'
      });
    } catch (error) {
      console.error('Failed to enroll courses:', error);
    } finally {
      setIsEnrollingCourses(false);
    }
  };

  // មុខងារបើកផ្ទាំងចុះឈ្មោះមុខវិជ្ជាជាក្រុម (Bulk Enroll Courses សម្រាប់សិស្សច្រើននាក់)
  const handleOpenBulkEnrollModal = async () => {
    if (selectedStudents.length === 0) return;
    setBulkSelectedCourses([]);
    setBulkCourseSearch('');

    let defaultDept = selectedDepartment !== 'all' ? String(selectedDepartment) : 'all';
    if (defaultDept === 'all') {
      const firstStd = students.find((s) => s.id === selectedStudents[0]);
      const dId = firstStd?.department_id || firstStd?.department?.id;
      if (dId) defaultDept = String(dId);
    }
    setBulkCourseDeptFilter(defaultDept);
    setShowBulkEnrollModal(true);

    if (!allCourses || allCourses.length === 0) {
      try {
        const coursesData = await getCachedCourses();
        setAllCourses(coursesData || []);
      } catch (e) {}
    }
  };

  const filteredBulkCourses = useMemo(() => {
    const byDept = allCourses.filter((c) => {
      if (bulkCourseDeptFilter === 'all') return true;
      return String(c.department_id || c.department?.id) === String(bulkCourseDeptFilter);
    });
    if (!bulkCourseSearch.trim()) return byDept;
    const q = bulkCourseSearch.toLowerCase().trim();
    return byDept.filter(
      (c) =>
        c.course_name?.toLowerCase().includes(q) ||
        c.course_code?.toLowerCase().includes(q)
    );
  }, [allCourses, bulkCourseDeptFilter, bulkCourseSearch]);

  const toggleBulkCourseSelection = (courseId) => {
    const idNum = Number(courseId);
    setBulkSelectedCourses((prev) =>
      prev.includes(idNum) ? prev.filter((id) => id !== idNum) : [...prev, idNum]
    );
  };

  const handleSelectAllBulkCourses = () => {
    const visibleIds = filteredBulkCourses.map((c) => Number(c.id));
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => bulkSelectedCourses.includes(id));
    if (allSelected) {
      setBulkSelectedCourses((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setBulkSelectedCourses((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleConfirmBulkEnroll = async (e) => {
    e.preventDefault();
    if (selectedStudents.length === 0 || bulkSelectedCourses.length === 0) {
      return;
    }

    setIsBulkEnrolling(true);
    try {
      await Promise.allSettled(
        selectedStudents.map((studentId) =>
          api.post(`/admin/students/${studentId}/enrollments`, {
            course_ids: bulkSelectedCourses,
          })
        )
      );

      // ✅ ធ្វើបច្ចុប្បន្នភាពដេប៉ាតឺម៉ង់របស់សិស្សទាំងអស់ដែលបានចុះឈ្មោះជាក្រុមភ្លាមៗ
      const newlyAddedDeptIds = allCourses
        .filter((c) => bulkSelectedCourses.includes(Number(c.id)))
        .map((c) => String(c.department_id || c.department?.id || ''))
        .filter(Boolean);

      if (newlyAddedDeptIds.length > 0) {
        setEnrolledDeptsMap((prev) => {
          const next = { ...prev };
          selectedStudents.forEach((studentId) => {
            const existing = Array.isArray(next[studentId]) ? next[studentId] : [];
            next[studentId] = Array.from(new Set([...existing, ...newlyAddedDeptIds]));
          });
          ADMIN_STUDENTS_Y3_MEM_CACHE.enrolledDeptsMap = next;
          try {
            localStorage.setItem(getEnrolledDeptsMapKey(currentAdminId), JSON.stringify(next));
            localStorage.setItem(CACHE_KEY_LEGACY_ENROLLED_MAP, JSON.stringify(next));
          } catch (e) {}
          return next;
        });
      }

      pushLocalNotification({
        titleKm: 'បានចុះឈ្មោះមុខវិជ្ជាជាក្រុមជោគជ័យ',
        titleEn: 'Bulk Course Enrollment Completed',
        descKm: `បានដាក់មុខវិជ្ជាចំនួន ${bulkSelectedCourses.length} ជូនសិស្សឆ្នាំទី៣ ចំនួន ${selectedStudents.length} នាក់។`,
        descEn: `Assigned ${bulkSelectedCourses.length} courses to ${selectedStudents.length} Year 3 students.`,
        category: 'student',
        link: '/students/year-3',
      });

      setShowBulkEnrollModal(false);
      setBulkSelectedCourses([]);
      setSelectedStudents([]);
    } catch (error) {
      console.error('Failed to bulk enroll courses:', error);
    } finally {
      setIsBulkEnrolling(false);
    }
  };

  const confirmUnenrollCourse = async () => {
    if (!unenrollTarget) return;
    try {
      await api.delete(`/admin/students/${selectedStudent.id}/enrollments/${unenrollTarget}`);
      const enrollmentsRes = await api.get(`/admin/students/${selectedStudent.id}/enrollments`);
      const updatedEnrollments = enrollmentsRes.data.data || [];
      setStudentEnrollments(updatedEnrollments);
      // ✅ ធ្វើបច្ចុប្បន្នភាពដេប៉ាតឺម៉ង់របស់សិស្សឡើងវិញពេលលុបមុខវិជ្ជាចេញ
      syncStudentEnrolledDepts(selectedStudent.id, updatedEnrollments, allCourses);
    } catch (error) {
      console.error('Failed to unenroll:', error);
    } finally {
      setUnenrollTarget(null);
    }
  };

  // ============================================================================
  // 📌 ផ្នែកទី ៨៖ មុខងារនាំចេញ និងនាំចូលទិន្នន័យសិស្សតាមរយៈឯកសារ EXCEL (.XLSX)
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
          if (worksheet[cellAddress].v !== undefined && worksheet[cellAddress].v !== null) {
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
            fgColor: { rgb: isHeader ? '1E3A8A' : (R % 2 === 1 ? 'FFFFFF' : 'F8FAFC') },
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

  // ✅ នាំចេញ Excel ដោយដាក់សិស្សដែលមានឈ្មោះមុន (លេខរៀងទី 1 ដំបូងគេ) ឱ្យនៅខាងលើគេដេញចុះមកក្រោម និងបិទបាំងអ៊ីមែល
  const handleExportExcel = () => {
    if (displayedStudents.length === 0) {
      return;
    }
    const currentDeptName = activeDepartmentObj ? getDepartmentDisplayName(activeDepartmentObj) : '';
    const sortedStudentsForExport = sortStudentsOldestFirst(displayedStudents);

    const exportData = sortedStudentsForExport.map((s, idx) => {
      const allDeptNames = getStudentDepartmentIds(s)
        .map((dId) => {
          const dObj = departments.find((d) => String(d.id) === String(dId));
          return dObj ? getDepartmentDisplayName(dObj) : null;
        })
        .filter(Boolean);
      const deptDisplay = allDeptNames.length > 0
        ? allDeptNames.join(' + ')
        : getDepartmentDisplayName(s.department || activeDepartmentObj);

      return {
        'ល.រ': idx + 1,
        'អត្តលេខសិស្ស': s.student_code || '',
        'នាមខ្លួន': s.first_name || '',
        'នាមត្រកូល': s.last_name || '',
        'ភេទ': s.gender || '',
        'អ៊ីមែល': maskEmailAddress(s.email || ''),
        'លេខទូរស័ព្ទ': s.phone || '',
        'ដេប៉ាតឺម៉ង់': deptDisplay,
        'ឆ្នាំសិក្សា': s.batch_year || 'ជំនាន់ទី , ឆ្នាំទី3',
        'កម្រិតសិក្សា': s.degree_level || '',
        'វេនសិក្សា': s.study_shift || '',
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    const colWidths = [
      { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 10 }, { wch: 28 }, { wch: 16 }, { wch: 26 },
      { wch: 22 }, { wch: 20 }, { wch: 18 }
    ];
    applyExcelStyling(worksheet, colWidths, [1, 6]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Year_3_Students');
    const safeDeptSuffix = currentDeptName ? `_${currentDeptName.replace(/[\\/:*?"<>|\s]+/g, '_')}` : '';
    const safeShiftSuffix = selectedShift !== 'all' ? `_${selectedShift}` : '';
    XLSX.writeFile(workbook, `Students_Year3${safeDeptSuffix}${safeShiftSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    
    pushLocalNotification({
      titleKm: 'បាននាំចេញទិន្នន័យសិស្សទៅ Excel',
      titleEn: 'Students Exported to Excel',
      descKm: `ទិន្នន័យសិស្សឆ្នាំទី៣ (${currentDeptName || 'ទាំងអស់'}) ត្រូវបានទាញយកជា Excel ជោគជ័យ។`,
      descEn: 'Year 3 students data was successfully exported to Excel.',
      category: 'export',
      link: '/students/year-3'
    });
  };

  // ✅ ទាញយកទម្រង់គំរូ Excel ដោយមិនយកទិន្នន័យសិស្សពិតប្រាកដដាក់ចូលឡើយ (ការពារឯកជនភាព និងការពារកំហុសស្ទួនអ៊ីមែលពេល Import)
  const handleDownloadTemplate = () => {
    const defaultDeptName = activeDepartmentObj ? getDepartmentDisplayName(activeDepartmentObj) : '';
    const defaultShift = selectedShift !== 'all' ? selectedShift : 'Monday-Friday';

    const blankRow = () => ({
      'first_name': '',
      'last_name': '',
      'email': '',
      'phone': '',
      'gender': '',
      'student_code': '',
      'department': defaultDeptName,
      'batch_year': 'ជំនាន់ទី , ឆ្នាំទី3',
      'degree_level': 'Bachelor Degree',
      'study_shift': defaultShift,
      'address': '',
      'date_of_birth': '',
      'password': ''
    });

    // បង្កើតជួរទំនេរដែលកំណត់ជា Text Format ('@') ចំនួន 50 ជួរទុកជាស្រេច (មិនបញ្ចេញឈ្មោះ អ៊ីមែល ឬពាក្យសម្ងាត់ពិតឡើយ)
    const templateData = Array.from({ length: 50 }, () => blankRow());

    const worksheet = XLSX.utils.json_to_sheet(templateData);

    const colWidths = [
      { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 10 },
      { wch: 18 }, { wch: 25 }, { wch: 24 }, { wch: 20 }, { wch: 18 },
      { wch: 20 }, { wch: 15 }, { wch: 15 }
    ];
    applyExcelStyling(worksheet, colWidths, [3, 5, 7, 11, 12]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    const safeDeptSuffix = defaultDeptName ? `_${defaultDeptName.replace(/[\\/:*?"<>|\s]+/g, '_')}` : '';
    XLSX.writeFile(workbook, `student_year3_template${safeDeptSuffix}.xlsx`);

    pushLocalNotification({
      titleKm: 'បានទាញយកទម្រង់គំរូ Excel',
      titleEn: 'Excel Template Downloaded',
      descKm: 'ទម្រង់គំរូសម្រាប់នាំចូលទិន្នន័យសិស្សត្រូវបានទាញយកជោគជ័យ។',
      descEn: 'The Excel template for student import was downloaded successfully.',
      category: 'download',
      link: '/students/year-3'
    });
  };

  // ✅ ប្រសិនបើយើងបានចុចចូលកាតដេប៉ាតឺម៉ង់ណាមួយហើយ ពេលនាំចូល Excel វានឹងចាប់យកដេប៉ាតឺម៉ង់នោះឱ្យសិស្សគ្រប់រូបដោយស្វ័យប្រវត្តិ
  const findDepartmentId = (deptNameOrCode) => {
    if (selectedDepartment !== 'all') {
      return selectedDepartment;
    }
    if (!deptNameOrCode) return null;
    const search = deptNameOrCode.toString().trim().toLowerCase();
    const found = departments.find(d => {
      const rawName = (d.department_name || d.name || '').toLowerCase();
      return (
        rawName === search ||
        (d.department_code && d.department_code.toLowerCase() === search) ||
        (d.id && d.id.toString() === search)
      );
    });
    return found ? found.id : null;
  };

  const normalizeHeaderKey = (key) => {
    const k = key.toString().trim().toLowerCase();
    if (k.includes('first') || k.includes('នាមខ្លួន')) return 'first_name';
    if (k.includes('last') || k.includes('នាមត្រកូល')) return 'last_name';
    if (k.includes('email') || k.includes('អ៊ីមែល')) return 'email';
    if (k.includes('phone') || k.includes('ទូរស័ព្ទ')) return 'phone';
    if (k.includes('code') || k.includes('អត្តលេខ')) return 'student_code';
    if (k.includes('gender') || k.includes('ភេទ')) return 'gender';
    if (k.includes('department') || k.includes('ដេប៉ាតឺម៉ង់')) return 'department';
    if (k.includes('batch') || k.includes('ជំនាន់') || k.includes('ឆ្នាំ')) return 'batch_year';
    if (k.includes('degree') || k.includes('កម្រិត')) return 'degree_level';
    if (k.includes('shift') || k.includes('វេន')) return 'study_shift';
    if (k.includes('address') || k.includes('អាសយដ្ឋាន')) return 'address';
    if (k.includes('birth') || k.includes('កំណើត') || k.includes('dob')) return 'date_of_birth';
    if (k.includes('password') || k.includes('ពាក្យសម្ងាត់')) return 'password';
    if (k.includes('status') || k.includes('ស្ថានភាព')) return 'status';
    return key;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setImportError('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

        const nonEmptyRows = rawJson
          .map((row, index) => ({ row, excelRowNumber: index + 2 }))
          .filter(({ row }) => {
            const item = {};
            Object.keys(row).forEach((k) => {
              item[normalizeHeaderKey(k)] = row[k]?.toString().trim();
            });
            return Boolean(
              item.first_name ||
              item.last_name ||
              item.email ||
              item.student_code ||
              item.phone
            );
          });

        if (!nonEmptyRows || nonEmptyRows.length === 0) {
          setImportPreview([]);
          setImportError(t('រកមិនឃើញទិន្នន័យសិស្សក្នុងឯកសារនេះទេ!', 'No student data found in this file!'));
          return;
        }

        const existingEmails = new Set(students.map((sItem) => sItem.email?.toLowerCase()).filter(Boolean));
        const fileEmails = new Set();

        const parsedRows = nonEmptyRows.map(({ row, excelRowNumber }) => {
          const item = {};
          Object.keys(row).forEach(k => { item[normalizeHeaderKey(k)] = row[k]?.toString().trim(); });

          const errors = [];
          if (!item.first_name) errors.push(t('ខ្វះនាមខ្លួន', 'Missing First Name'));
          if (!item.last_name) errors.push(t('ខ្វះនាមត្រកូល', 'Missing Last Name'));
          
          if (!item.email) {
            errors.push(t('ត្រូវមានអ៊ីមែល (ចាំបាច់)', 'Email is required'));
          } else {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(item.email)) {
              errors.push(t('អ៊ីមែលមិនត្រឹមត្រូវ', 'Invalid Email Format'));
            } else if (existingEmails.has(item.email.toLowerCase())) {
              errors.push(t('អ៊ីមែលនេះមានក្នុងប្រព័ន្ធរួចហើយ', 'Email already exists'));
            } else if (fileEmails.has(item.email.toLowerCase())) {
              errors.push(t('អ៊ីមែលស្ទួនក្នុងឯកសារនេះ', 'Duplicate email in file'));
            } else {
              fileEmails.add(item.email.toLowerCase());
            }
          }

          let gender = item.gender;
          if (gender === 'ប្រុស' || gender === 'Male' || gender === 'M') gender = 'Male';
          else if (gender === 'ស្រី' || gender === 'Female' || gender === 'F') gender = 'Female';
          else if (gender) gender = 'Other'; else gender = 'Male';

          let studyShift = item.study_shift
            ? normalizeShiftKey(item.study_shift)
            : (selectedShift !== 'all' ? selectedShift : 'Monday-Friday');

          let cleanPhone = (item.phone || '').replace(/^'+/, '').trim();
          if (/^[1-9]\d{7,8}$/.test(cleanPhone)) {
            cleanPhone = '0' + cleanPhone;
          }

          let cleanPassword = (item.password || '').replace(/^'+/, '').trim();
          if (!cleanPassword) {
            cleanPassword = '12345678';
          }

          let cleanBatchYear = (item.batch_year || '').trim();
          if (!cleanBatchYear || /^ជំនាន់ទី\s*,\s*ឆ្នាំទី[៣3]$/.test(cleanBatchYear)) {
            cleanBatchYear = 'ឆ្នាំទី3';
          }

          const normalizedDob = formatDateOnly(item.date_of_birth);

          return {
            rowIndex: excelRowNumber,
            raw: row,
            data: {
              first_name: item.first_name || '',
              last_name: item.last_name || '',
              email: item.email || '',
              phone: cleanPhone,
              gender: gender,
              student_code: (item.student_code || '').replace(/^'+/, '').trim(),
              department_id: findDepartmentId(item.department),
              batch_year: cleanBatchYear,
              degree_level: normalizeDegreeLevel(item.degree_level) || 'Bachelor Degree',
              study_shift: studyShift,
              address: item.address || '',
              date_of_birth: normalizedDob || null,
              password: cleanPassword,
              status: item.status || 'active'
            },
            isValid: errors.length === 0,
            errors
          };
        });

        setImportPreview(parsedRows);
      } catch (err) {
        console.error('File parsing error:', err);
        setImportError(t('មិនអាចអានឯកសារ Excel នេះបានទេ!', 'Failed to read Excel file!'));
      } finally {
        e.target.value = null;
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.length === 0 || isImporting) return;
    const validItems = importPreview.filter(r => r.isValid).map(r => r.data);
    if (validItems.length === 0) {
      return;
    }

    setIsImporting(true);
    setImportError('');
    try {
      await api.post('/admin/students/import', { students: validItems });
      try {
        localStorage.removeItem(getStudentsY3CacheKey(currentAdminId));
        localStorage.removeItem(getStudentsY3MetaCacheKey(currentAdminId));
        localStorage.removeItem(CACHE_KEY_LEGACY_STUDENTS);
        localStorage.removeItem(CACHE_KEY_LEGACY_META);
      } catch (e) {}
      
      pushLocalNotification({
        titleKm: 'បាននាំចូលទិន្នន័យសិស្សពី Excel',
        titleEn: 'Students Imported from Excel',
        descKm: `ទិន្នន័យសិស្សចំនួន ${validItems.length} នាក់ត្រូវបាននាំចូល និងធ្វើបច្ចុប្បន្នភាពរួចរាល់។`,
        descEn: `${validItems.length} students were successfully imported/updated.`,
        category: 'import',
        link: '/students/year-3'
      });

      setShowImportModal(false);
      setImportPreview([]);
      setSelectedFileName('');
      fetchStudents(true);
    } catch (error) {
      console.error('Import Error:', error);
      const errMsg =
        error.response?.data?.message ||
        t('មានបញ្ហាក្នុងការនាំចូលទិន្នន័យសិស្ស!', 'Error importing students!');
      setImportError(String(errMsg));
    } finally {
      setIsImporting(false);
    }
  };

  const getStudyShiftLabel = (shift) => {
    const norm = normalizeShiftKey(shift);
    if (language === 'km') {
      const shifts = { 'Monday-Friday': 'ចន្ទ-សុក្រ', 'Saturday-Sunday': 'សៅរ៍-អាទិត្យ' };
      return shifts[norm] || shift || '—';
    }
    return norm || shift || '—';
  };

  const getDegreeLevelLabel = (level) => {
    const norm = normalizeDegreeLevel(level);
    if (language === 'km') {
      const levels = { 'Associate Degree': 'បរិញ្ញាបត្ររង', 'Bachelor Degree': 'បរិញ្ញាបត្រ', 'Master Degree': 'បរិញ្ញាបត្រជាន់ខ្ពស់' };
      return levels[norm] || level || '—';
    }
    return norm || level || '—';
  };

  // ✅ អនុគមន៍បង្ហាញឈ្មោះភេទជាភាសាខ្មែរ ឬអង់គ្លេស
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

  // ============================================================================
  // 📌 ផ្នែកទី ៩៖ ការបង្ហាញទម្រង់ផ្ទៃមុខកម្មវិធី (JSX UI RENDERING)
  // ============================================================================
  return (
    <div className="std-page-bg p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6 animate-fadeIn">
      
      {/* ------------------------------------------------------------------ */}
      {/* 9.1. ផ្ទាំងក្បាលខាងលើ (Header Banner) និងប៊ូតុងសកម្មភាពគោល           */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-8 shadow-xl border border-blue-900">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-[28px] sm:text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                <UserGroupIcon className="h-8 w-8 text-yellow-400" />
              </div>
              {t('គ្រប់គ្រងសិស្ស - ឆ្នាំទី៣', 'Manage Students - Year 3')}
            </h1>
            <p className={`text-blue-200/80 text-sm font-medium ${selectedDepartment === 'all' ? 'max-w-none' : 'max-w-xl'}`}>
              {selectedDepartment === 'all'
                ? t('សូមចុចជ្រើសរើសកាតដេប៉ាតឺម៉ង់ខាងក្រោម ដើម្បីបន្ថែមសិស្សថ្មី នាំចូល ឬនាំចេញទិន្នន័យ Excel តាមដេប៉ាតឺម៉ង់។', 'Please select a department card below to add students, import, or export Excel data by department.')
                : t('បន្ថែម និងគ្រប់គ្រងគណនីសិស្សឆ្នាំទី៣ តាមដេប៉ាតឺម៉ង់ និងវេនសិក្សា លុប កែប្រែ ឬនាំចូលពី Excel ។', 'Add and manage Year 3 student accounts by department and study shift, edit, delete, or import from Excel.')}
            </p>
          </div>

          {/* ✅ ជម្រើសទី ១៖ បិទ/លាក់ប៊ូតុងទាំង ៣ នៅពេលឈរលើ «សិស្សទាំងអស់» (បង្ហាញតែពេលចុចលើកាតដេប៉ាតឺម៉ង់ណាមួយប៉ុណ្ណោះ) */}
          {selectedDepartment !== 'all' && (
            <div className="flex flex-wrap items-center gap-3 shrink-0 animate-fadeIn">
              <button
                onClick={handleExportExcel}
                className="inline-flex items-center justify-center px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <DocumentIcon className="h-5 w-5 mr-2" />
                {t('នាំចេញ Excel', 'Export Excel')}
              </button>
              <button
                onClick={() => { setImportPreview([]); setSelectedFileName(''); setImportError(''); setShowImportModal(true); }}
                className="inline-flex items-center justify-center px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <DocumentIcon className="h-5 w-5 mr-2" />
                {t('នាំចូល Excel', 'Import Excel')}
              </button>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                {t('បន្ថែមសិស្ស', 'Add Student')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 9.2. ផ្នែកកាតដេប៉ាតឺម៉ង់ (Department Filter Cards)                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative flex items-center group/cards">
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollDepartmentCards('left')}
            className="std-scroll-arrow absolute -left-3 z-20 h-9 w-9 rounded-full bg-white/90 hover:bg-white backdrop-blur-md border border-gray-200/90 text-gray-700 hover:text-blue-600 shadow-[0_4px_12px_rgba(0,0,0,0.12)] flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer"
            title={t('អូសទៅឆ្វេង', 'Scroll Left')}
          >
            <ChevronLeftIcon className="h-4 w-4 stroke-[2.5]" />
          </button>
        )}

        <div
          ref={cardsScrollRef}
          onScroll={checkCardsScroll}
          onMouseDown={handleCardsMouseDown}
          onMouseMove={handleCardsMouseMove}
          onMouseUp={handleCardsMouseUpOrLeave}
          onMouseLeave={handleCardsMouseUpOrLeave}
          className={`hide-scrollbar flex items-stretch gap-4 overflow-x-auto py-1 px-1 w-full select-none ${isDraggingCards ? 'cursor-grabbing' : 'cursor-grab scroll-smooth'}`}
        >
          <button
            type="button"
            onClick={() => handleSelectDepartmentCard('all')}
            className={`shrink-0 w-[220px] sm:w-[235px] text-left p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between min-h-[125px] ${isDraggingCards ? 'cursor-grabbing' : 'cursor-pointer'} ${
              selectedDepartment === 'all' ? 'bg-gradient-to-br from-blue-900 to-indigo-950 text-white border-blue-800 shadow-lg -translate-y-0.5' : 'std-dept-card bg-white text-gray-900 border-gray-100 hover:border-blue-200 hover:shadow-md shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between w-full">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${selectedDepartment === 'all' ? 'bg-white/15 text-white border-white/20' : 'std-dept-blue bg-blue-50 text-blue-600 border-blue-100'}`}>
                <Squares2X2Icon className="h-5 w-5" />
              </div>
              <span className={`text-2xl font-extrabold ${selectedDepartment === 'all' ? 'text-white' : 'std-text-primary text-gray-900'}`}>
                {departmentCounts.all || 0}
              </span>
            </div>
            <div className="mt-4">
              <p className={`text-sm font-extrabold truncate ${selectedDepartment === 'all' ? 'text-white' : 'std-text-primary text-gray-900'}`}>
                {t('សិស្សសរុប', 'Total Students')}
              </p>
              <p className={`text-xs font-medium mt-0.5 truncate ${selectedDepartment === 'all' ? 'text-blue-200/80' : 'std-text-secondary text-gray-500'}`}>
                {t('គ្រប់ដេប៉ាតឺម៉ង់', 'All Departments')}
              </p>
            </div>
          </button>

          {departments.map((dept, index) => {
            const isSelected = String(selectedDepartment) === String(dept.id);
            const theme = DEPT_CARD_THEMES[index % DEPT_CARD_THEMES.length];
            const count = departmentCounts[dept.id] || 0;
            const deptName = getDepartmentDisplayName(dept);
            return (
              <button
                key={dept.id}
                type="button"
                onClick={() => handleSelectDepartmentCard(dept.id)}
                className={`shrink-0 w-[220px] sm:w-[235px] text-left p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between min-h-[125px] ${isDraggingCards ? 'cursor-grabbing' : 'cursor-pointer'} ${
                  isSelected ? 'bg-gradient-to-br from-blue-900 to-indigo-950 text-white border-blue-800 shadow-lg -translate-y-0.5' : 'std-dept-card bg-white text-gray-900 border-gray-100 hover:border-blue-200 hover:shadow-md shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between w-full">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${isSelected ? 'bg-white/15 text-white border-white/20' : `${theme.darkClass} ${theme.bg} ${theme.text} ${theme.border}`}`}>
                    <AcademicCapIcon className="h-5 w-5" />
                  </div>
                  <span className={`text-2xl font-extrabold ${isSelected ? 'text-white' : 'std-text-primary text-gray-900'}`}>
                    {count}
                  </span>
                </div>
                <div className="mt-4">
                  <p className={`text-sm font-extrabold truncate ${isSelected ? 'text-white' : 'std-text-primary text-gray-900'}`} title={deptName}>
                    {deptName}
                  </p>
                  <p className={`text-xs font-medium mt-0.5 truncate ${isSelected ? 'text-blue-200/80' : 'std-text-secondary text-gray-500'}`}>
                    {t('និស្សិតឆ្នាំទី៣', 'Year 3 Students')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollDepartmentCards('right')}
            className="std-scroll-arrow absolute -right-3 z-20 h-9 w-9 rounded-full bg-white/90 hover:bg-white backdrop-blur-md border border-gray-200/90 text-gray-700 hover:text-blue-600 shadow-[0_4px_12px_rgba(0,0,0,0.12)] flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer"
            title={t('អូសទៅស្ដាំ', 'Scroll Right')}
          >
            <ChevronRightIcon className="h-4 w-4 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 9.3. ប្រអប់ស្វែងរកសិស្ស + ប្តូររវាង «វេនសិក្សា» និង «សកម្មភាពជាក្រុម» ក្នុងជួរតែមួយ */}
      {/* ------------------------------------------------------------------ */}
      <div className="std-surface-card bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col lg:flex-row gap-4 items-center justify-between">
        {/* ប្រអប់ Search នៅខាងឆ្វេង */}
        <div className="relative w-full lg:max-w-md shrink-0">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder=""
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="std-input w-full pl-11 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-sm"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ✅ ផ្នែកខាងស្ដាំ៖ បើមានធីកសិស្ស លាក់កន្លែងវេនសិន ហើយបង្ហាញប៊ូតុងសកម្មភាពជាក្រុមជំនួសវិញក្នុងជួរតែមួយ */}
        {selectedStudents.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-end animate-fadeIn">
            <button
              type="button"
              onClick={handleOpenBulkEnrollModal}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition-all shrink-0 cursor-pointer"
            >
              <BookOpenIcon className="h-5 w-5 mr-2" />
              {t(`ចុះឈ្មោះមុខវិជ្ជាជាក្រុម (${selectedStudents.length})`, `Bulk Enroll Courses (${selectedStudents.length})`)}
            </button>

            <button
              type="button"
              onClick={handleOpenPromoteModal}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition-all shrink-0 cursor-pointer"
            >
              <ChevronDoubleUpIcon className="h-5 w-5 mr-2" />
              {t(`ដំឡើងឆ្នាំសិក្សាសិស្ស (${selectedStudents.length})`, `Promote Students (${selectedStudents.length})`)}
            </button>
          </div>
        ) : (
          /* នៅពេលមិនទាន់ធីកសិស្ស បង្ហាញប៊ូតុងវេនសិក្សាធម្មតា */
          <div className="std-shift-tabs flex flex-wrap items-center gap-1.5 bg-gray-100/80 p-1.5 rounded-xl border border-gray-200/60 w-full lg:w-auto justify-center sm:justify-start animate-fadeIn">
            <button
              type="button"
              onClick={() => setSelectedShift('all')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                selectedShift === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'std-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              <Squares2X2Icon className="h-4 w-4" />
              <span>{t('គ្រប់វេនសិក្សា', 'All Shifts')}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                selectedShift === 'all' ? 'bg-white/20 text-white' : 'std-shift-count bg-gray-200/80 text-gray-700'
              }`}>
                {shiftCounts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedShift('Monday-Friday')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                selectedShift === 'Monday-Friday'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'std-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              <CalendarDaysIcon className="h-4 w-4" />
              <span>{t('ចន្ទ-សុក្រ', 'Mon-Fri')}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                selectedShift === 'Monday-Friday' ? 'bg-white/20 text-white' : 'std-shift-count bg-indigo-50 text-indigo-700'
              }`}>
                {shiftCounts['Monday-Friday']}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedShift('Saturday-Sunday')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                selectedShift === 'Saturday-Sunday'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'std-shift-btn text-gray-600 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              <CalendarDaysIcon className="h-4 w-4" />
              <span>{t('សៅរ៍-អាទិត្យ', 'Sat-Sun')}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                selectedShift === 'Saturday-Sunday' ? 'bg-white/20 text-white' : 'std-shift-count bg-amber-50 text-amber-700'
              }`}>
                {shiftCounts['Saturday-Sunday']}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 9.4. តារាងបង្ហាញបញ្ជីឈ្មោះសិស្សឆ្នាំទី៣ (Students Data Table - គ្មាន Skeleton) */}
      {/* ------------------------------------------------------------------ */}
      <div className="w-full">
        <div className="std-surface-card bg-white rounded-[1.5rem] border border-gray-200 shadow-sm overflow-hidden">
          <div className="std-table-bar px-6 py-5 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="std-text-primary text-[18px] font-extrabold text-gray-900">
                {activeDepartmentObj
                  ? `${t('បញ្ជីសិស្សឆ្នាំទី៣', 'Year 3 Students')} - ${getDepartmentDisplayName(activeDepartmentObj)}`
                  : t('បញ្ជីសិស្សឆ្នាំទី៣ ទាំងអស់', 'All Year 3 Students List')}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {selectedShift !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedShift('all')}
                  className="std-badge-indigo text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                >
                  {t('បង្ហាញគ្រប់វេនវិញ', 'Show All Shifts')}
                </button>
              )}
              {selectedDepartment !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedDepartment('all')}
                  className="std-badge-blue text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                >
                  {t('បង្ហាញគ្រប់ដេប៉ាតឺម៉ង់វិញ', 'Show All Departments')}
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="std-table-head bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-4 text-left whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {/* ✅ លាក់ប្រអប់ធីក Select All សិន ទាល់តែមានធីកសិស្សណាមួយហើយទើបលោតចេញមក */}
                      {selectedStudents.length > 0 && (
                        <div title={t('ជ្រើសរើសទាំងអស់', 'Select All')} className="animate-fadeIn flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedStudents.length === displayedStudents.length && displayedStudents.length > 0}
                            onChange={handleSelectAll}
                            className="std-checkbox w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                          />
                        </div>
                      )}
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        {t('សិស្ស', 'Student')}
                      </span>
                    </div>
                  </th>
                  <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('អត្តលេខ', 'Code')}
                  </th>
                  <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('កម្រិតសិក្សា', 'Degree Level')}
                  </th>
                  <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('អ៊ីមែល / ទូរស័ព្ទ', 'Email / Phone')}
                  </th>
                  <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('ដេប៉ាតឺម៉ង់', 'Department')}
                  </th>
                  <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('វេនសិក្សា', 'Study Shift')}
                  </th>
                  <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('ស្ថានភាព', 'Status')}
                  </th>
                  <th className="px-4 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('សកម្មភាព', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="std-table-body bg-white">
                {displayedStudents.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-16 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <UserGroupIcon className="h-16 w-16 text-gray-300 mb-3" />
                        <p className="std-text-primary font-bold text-gray-600 text-base">
                          {searchTerm
                            ? t('មិនឃើញលទ្ធផលស្វែងរក', 'No search results found')
                            : selectedShift !== 'all'
                            ? t(`មិនទាន់មានសិស្សឆ្នាំទី៣ ក្នុងវេន «${getStudyShiftLabel(selectedShift)}» នៅឡើយទេ`, 'No Year 3 students in this study shift yet')
                            : activeDepartmentObj
                            ? t(`មិនទាន់មានសិស្សឆ្នាំទី៣ ក្នុងដេប៉ាតឺម៉ង់ «${getDepartmentDisplayName(activeDepartmentObj)}» នៅឡើយទេ`, 'No Year 3 students in this department yet')
                            : t('មិនទាន់មានសិស្សឆ្នាំទី៣ នៅឡើយទេ', 'No Year 3 students available yet')}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedStudents.map((student) => {
                    const primaryDeptId = student.department_id || student.department?.id;
                    const matchedDeptObj = student.department || departments.find(d => String(d.id) === String(primaryDeptId));
                    const extraDeptNames = getStudentDepartmentIds(student)
                      .filter((dId) => String(dId) !== String(primaryDeptId))
                      .map((dId) => {
                        const dObj = departments.find((d) => String(d.id) === String(dId));
                        return dObj ? getDepartmentDisplayName(dObj) : null;
                      })
                      .filter(Boolean);

                    const isFemale = isFemaleGender(student.gender);
                    const isWeekend = normalizeShiftKey(student.study_shift) === 'Saturday-Sunday';
                    const rawAvatar =
                      student.profile_image ||
                      student.user?.profile_image ||
                      ADMIN_STUDENTS_Y3_MEM_CACHE.avatarMap[student.id];
                    const avatarUrl = getProfileImageUrl(rawAvatar);
                    const avatarKey = `std_${student.id}`;
                    const hasAvatar = Boolean(avatarUrl && !failedAvatars[avatarKey]);
                    const isActive = String(student.user?.status || student.status || 'active').toLowerCase() === 'active';

                    return (
                      <tr key={student.id} className="std-table-row hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3.5">
                            <div 
                              className="relative h-10 w-10 shrink-0 cursor-pointer group/avatar"
                              onClick={() => handleSelectStudent(student.id)}
                            >
                              <div className={`absolute inset-0 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold overflow-hidden shadow-sm transition-opacity duration-200 ${selectedStudents.includes(student.id) ? 'opacity-0' : 'opacity-100 group-hover/avatar:opacity-0'}`}>
                                {hasAvatar ? (
                                  <img
                                    src={avatarUrl}
                                    alt={getStudentFullName(student)}
                                    loading="eager"
                                    decoding="async"
                                    fetchpriority="high"
                                    className="h-full w-full object-cover rounded-full"
                                    onError={() =>
                                      setFailedAvatars((prev) => ({
                                        ...prev,
                                        [avatarKey]: true,
                                      }))
                                    }
                                  />
                                ) : (
                                  <span>{student.first_name?.charAt(0) || ''}{student.last_name?.charAt(0) || ''}</span>
                                )}
                              </div>
                              
                              <div className={`std-avatar-check absolute inset-0 rounded-full flex items-center justify-center transition-all duration-200 ${selectedStudents.includes(student.id) ? 'opacity-100 bg-blue-100 scale-100' : 'opacity-0 group-hover/avatar:opacity-100 bg-gray-100 scale-95 group-hover/avatar:scale-100'}`}>
                                <input 
                                  type="checkbox" 
                                  checked={selectedStudents.includes(student.id)}
                                  readOnly
                                  className="std-checkbox w-4 h-4 text-blue-600 border-gray-400 rounded focus:ring-blue-500 cursor-pointer pointer-events-none" 
                                />
                              </div>
                            </div>
                            <div className="ml-0">
                              <div className="std-text-primary text-sm font-extrabold text-gray-900">
                                {getStudentFullName(student)}
                              </div>
                              {/* ✅ បង្ហាញផ្លាកភេទ (ប្រុស/ស្រី) អមជាមួយជំនាន់សិក្សា (batch_year) នៅខាងក្រោមឈ្មោះសិស្ស */}
                              <div className="flex items-center gap-1.5 mt-1">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                    isFemale
                                      ? 'std-badge-rose bg-rose-50 text-rose-600 border-rose-200'
                                      : 'std-badge-blue bg-blue-50 text-blue-600 border-blue-200'
                                  }`}
                                >
                                  {getGenderLabel(student.gender)}
                                </span>
                                <span className="std-text-secondary text-xs text-gray-400 font-bold">&bull;</span>
                                <span className="std-text-secondary text-xs text-gray-500 font-medium">
                                  {student.batch_year || t('ឆ្នាំទី៣', 'Year 3')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="std-text-secondary px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-600">
                          {student.student_code || '—'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="std-badge-amber inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-100">
                            {getDegreeLevelLabel(student.degree_level)}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {/* ✅ បង្ហាញតែអ៊ីមែលដែលបានបិទបាំងដោយគ្មានប៊ូតុងភ្នែក */}
                          <div className="std-text-secondary text-sm font-medium text-gray-600 font-mono tracking-tight">
                            {maskEmailAddress(student.email)}
                          </div>
                          {student.phone && (
                            <div className="std-text-secondary text-xs text-gray-400 font-medium mt-0.5">
                              {student.phone}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="std-text-secondary text-sm font-medium text-gray-600">
                            {getDepartmentDisplayName(matchedDeptObj)}
                          </div>
                          {extraDeptNames.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {extraDeptNames.map((dName, idx) => (
                                <span
                                  key={idx}
                                  className="std-badge-indigo inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-50 text-indigo-600 border border-indigo-200"
                                >
                                  + {dName}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold border ${
                            isWeekend
                              ? 'std-badge-amber bg-amber-50 text-amber-700 border-amber-200'
                              : 'std-badge-indigo bg-indigo-50 text-indigo-700 border-indigo-100'
                          }`}>
                            {getStudyShiftLabel(student.study_shift)}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold border ${isActive ? 'std-badge-emerald bg-emerald-50 text-emerald-700 border-emerald-100' : 'std-badge-rose bg-rose-50 text-rose-700 border-rose-100'}`}>
                            {isActive ? t('សកម្ម', 'Active') : t('អសកម្ម', 'Inactive')}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              onClick={() => openEnrollmentModal(student)}
                              className="std-action-enroll p-2 text-emerald-600 hover:text-emerald-900 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 rounded-xl transition-all cursor-pointer"
                              title={t('ចុះឈ្មោះមុខវិជ្ជា', 'Manage Courses')}
                            >
                              <BookOpenIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => openEditModal(student)}
                              className="std-action-edit p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-xl transition-all cursor-pointer"
                              title={t('កែប្រែ', 'Edit')}
                            >
                              <PencilSquareIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(student)}
                              className="std-action-delete p-2 text-rose-600 hover:text-rose-900 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition-all cursor-pointer"
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

        {/* ---------------------------------------------------------------- */}
        {/* 9.5. របារប្តូរទំព័រ (Pagination)                                  */}
        {/* ---------------------------------------------------------------- */}
        {meta.last_page > 1 && (
          <div className="std-pagination-bar px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50 rounded-2xl mt-4">
            <p className="std-text-secondary text-xs font-bold text-gray-600">
              {t('ទំព័រ', 'Page')} {meta.current_page} / {meta.last_page} ({displayedStudents.length} {t('នាក់', 'total')})
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={meta.current_page === 1}
                className="std-page-btn px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {t('មុន', 'Previous')}
              </button>
              {paginationPages.map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`px-3 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    meta.current_page === pageNum
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'std-page-btn bg-white border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(meta.last_page, p + 1))}
                disabled={meta.current_page === meta.last_page}
                className="std-page-btn px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {t('បន្ទាប់', 'Next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 9.6. ផ្ទាំង Modal បន្ថែម ឬកែប្រែព័ត៌មានសិស្ស                         */}
      {/* ------------------------------------------------------------------ */}
      {showModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="std-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            <div className="std-modal-bar flex justify-between items-center p-6 sm:p-8 border-b border-gray-100">
              <div>
                <h2 className="std-text-primary text-xl font-extrabold text-gray-900 flex items-center gap-2">
                  <span className="std-badge-indigo bg-indigo-100 text-indigo-600 p-2.5 rounded-xl border border-indigo-200">
                    <UserGroupIcon className="h-6 w-6" />
                  </span>
                  {editingStudent ? t('កែប្រែសិស្សឆ្នាំទី៣', 'Edit Year 3 Student') : t('បន្ថែមសិស្សឆ្នាំទី៣ ថ្មី', 'Add New Year 3 Student')}
                </h2>
                {!editingStudent && activeDepartmentObj && (
                  <p className="std-text-secondary text-xs text-gray-500 font-bold mt-1 ml-12">
                    {t('ដេប៉ាតឺម៉ង់៖', 'Department:')}{' '}
                    <span className="text-indigo-600 dark:text-indigo-400">
                      {getDepartmentDisplayName(activeDepartmentObj)}
                    </span>
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowModal(false); setFormError(''); }}
                className="std-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 sm:p-8 overflow-y-auto flex-1">
              <form id="studentForm" onSubmit={handleSubmit} className="space-y-5">
                {formError && (
                  <div className="std-warning-box p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-600">
                    <ExclamationCircleIcon className="h-5 w-5 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold leading-relaxed">{formError}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('នាមខ្លួន', 'First Name')} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="first_name"
                      required
                      value={formData.first_name}
                      onChange={handleInputChange}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                      placeholder=""
                    />
                  </div>

                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('នាមត្រកូល', 'Last Name')} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="last_name"
                      required
                      value={formData.last_name}
                      onChange={handleInputChange}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                      placeholder=""
                    />
                  </div>

                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('អ៊ីមែល', 'Email')} <span className="text-rose-500">*</span>
                    </label>
                    {/* ✅ ពេល Edit បង្ហាញអ៊ីមែលបិទបាំង ហើយបើចុចដើម្បីវាយអ៊ីមែលថ្មី វាជម្រះសញ្ញា * ឱ្យភ្លាម (បើមិនកែទេ ពេល Blur ត្រឡប់មកបិទបាំងដដែល) */}
                    <input
                      type={editingStudent && formData.email.includes('*') ? 'text' : 'email'}
                      name="email"
                      required={!editingStudent}
                      value={formData.email}
                      onFocus={() => {
                        if (editingStudent && formData.email.includes('*')) {
                          setFormData((prev) => ({ ...prev, email: '' }));
                        }
                      }}
                      onBlur={() => {
                        if (editingStudent && !formData.email.trim()) {
                          setFormData((prev) => ({
                            ...prev,
                            email: maskEmailAddress(editingStudent.email || ''),
                          }));
                        }
                      }}
                      onChange={handleInputChange}
                      placeholder={editingStudent ? maskEmailAddress(editingStudent.email || '') : ''}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('លេខទូរស័ព្ទ', 'Phone Number')}
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                      placeholder=""
                    />
                  </div>

                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('អត្តលេខសិស្ស', 'Student Code')}
                    </label>
                    <input
                      type="text"
                      name="student_code"
                      value={formData.student_code}
                      onChange={handleInputChange}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                      placeholder=""
                    />
                  </div>

                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ភេទ', 'Gender')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="gender"
                      required
                      value={formData.gender}
                      onChange={handleInputChange}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white"
                    >
                      <option value="" disabled>{t('ជ្រើសរើសភេទ', 'Select Gender')}</option>
                      <option value="Male">{t('ប្រុស', 'Male')}</option>
                      <option value="Female">{t('ស្រី', 'Female')}</option>
                      <option value="Other">{t('ផ្សេងៗ', 'Other')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ថ្ងៃខែឆ្នាំកំណើត', 'Date of Birth')}
                    </label>
                    <input
                      type="date"
                      name="date_of_birth"
                      value={formData.date_of_birth}
                      onChange={handleInputChange}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                    />
                  </div>

                  {/* ✅ បិទកន្លែងដេប៉ាតឺម៉ង់ទាំងពេលបន្ថែមសិស្សថ្មី និងពេលកែប្រែ (Edit) */}
                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ដេប៉ាតឺម៉ង់', 'Department')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="department_id"
                      required
                      disabled={Boolean(editingStudent) || selectedDepartment !== 'all'}
                      value={formData.department_id}
                      onChange={handleInputChange}
                      className={`std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white ${
                        Boolean(editingStudent) || selectedDepartment !== 'all' ? 'opacity-80 cursor-not-allowed bg-gray-100 font-bold text-indigo-900' : ''
                      }`}
                    >
                      <option value="" disabled>{t('ជ្រើសរើសដេប៉ាតឺម៉ង់', 'Select Department')}</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {getDepartmentDisplayName(dept)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ជំនាន់/ឆ្នាំសិក្សា', 'Batch / Academic Year')}
                    </label>
                    <input
                      type="text"
                      name="batch_year"
                      value={formData.batch_year}
                      onChange={handleInputChange}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                      placeholder=""
                    />
                  </div>

                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('កម្រិតសិក្សា', 'Degree Level')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="degree_level"
                      required
                      value={formData.degree_level}
                      onChange={handleInputChange}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white"
                    >
                      <option value="" disabled>{t('ជ្រើសរើសកម្រិត', 'Select Level')}</option>
                      <option value="Associate Degree">{t('បរិញ្ញាបត្ររង', 'Associate Degree')}</option>
                      <option value="Bachelor Degree">{t('បរិញ្ញាបត្រ', 'Bachelor Degree')}</option>
                      <option value="Master Degree">{t('បរិញ្ញាបត្រជាន់ខ្ពស់', 'Master Degree')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('វេនសិក្សា', 'Study Shift')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="study_shift"
                      required
                      value={formData.study_shift}
                      onChange={handleInputChange}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white"
                    >
                      <option value="" disabled>{t('ជ្រើសរើសវេនសិក្សា', 'Select Study Shift')}</option>
                      <option value="Monday-Friday">{t('ចន្ទ-សុក្រ', 'Monday-Friday')}</option>
                      <option value="Saturday-Sunday">{t('សៅរ៍-អាទិត្យ', 'Saturday-Sunday')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('អាសយដ្ឋាន', 'Address')}
                    </label>
                    <textarea
                      rows="1"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all resize-none shadow-sm"
                      placeholder={t('អាសយដ្ឋានបច្ចុប្បន្ន...', 'Current address...')}
                    />
                  </div>

                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {editingStudent
                        ? t('ពាក្យសម្ងាត់ (ទុកឲ្យទទេ ដើម្បីរក្សាដដែល)', 'Password (Leave blank to keep)')
                        : t('ពាក្យសម្ងាត់', 'Password')}{' '}
                      {!editingStudent && <span className="text-rose-500">*</span>}
                    </label>
                    {/* ✅ បិទជិតជា password ជានិច្ចដោយគ្មានប៊ូតុងភ្នែក */}
                    <input
                      type="password"
                      name="password"
                      required={!editingStudent}
                      value={formData.password}
                      onChange={handleInputChange}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="std-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ស្ថានភាព', 'Status')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="status"
                      required
                      value={formData.status}
                      onChange={handleInputChange}
                      className="std-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white"
                    >
                      <option value="" disabled>{t('ជ្រើសរើសស្ថានភាព', 'Select Status')}</option>
                      <option value="active">{t('សកម្ម', 'Active')}</option>
                      <option value="inactive">{t('អសកម្ម', 'Inactive')}</option>
                    </select>
                  </div>
                </div>
              </form>
            </div>
              
            <div className="std-modal-bar p-6 sm:p-8 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50 shrink-0">
              <button
                type="button"
                onClick={() => { setShowModal(false); setFormError(''); }}
                className="std-cancel-btn px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                type="submit"
                form="studentForm"
                disabled={isSubmitting}
                className="px-6 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                ) : (
                  <UserGroupIcon className="h-5 w-5" />
                )}
                {editingStudent ? t('រក្សាទុកការកែប្រែ', 'Save Changes') : t('បង្កើតសិស្ស', 'Create Student')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 9.7. ផ្ទាំង Modal ចុះឈ្មោះមុខវិជ្ជាឱ្យសិស្សម្នាក់ៗ                      */}
      {/* ------------------------------------------------------------------ */}
      {showEnrollmentModal && selectedStudent && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="std-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            <div className="std-modal-bar flex justify-between items-center p-6 sm:p-7 border-b border-gray-100">
              <div>
                <h2 className="std-text-primary text-xl font-extrabold text-gray-900 flex items-center gap-2">
                  <span className="std-badge-emerald bg-emerald-100 text-emerald-600 p-2.5 rounded-xl border border-emerald-200">
                    <BookOpenIcon className="h-6 w-6" />
                  </span>
                  {t('ចុះឈ្មោះមុខវិជ្ជា', 'Manage Courses')}
                </h2>
                <p className="std-text-secondary text-xs text-gray-500 font-medium mt-1">
                  {t('សិស្ស៖', 'Student:')}{' '}
                  <span className="std-text-primary font-extrabold text-gray-800">
                    {getStudentFullName(selectedStudent)}
                  </span>{' '}
                  ({selectedStudent.student_code || t('គ្មានអត្តលេខ', 'No Code')})
                </p>
              </div>
              <button
                onClick={() => setShowEnrollmentModal(false)}
                className="std-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 sm:p-7 overflow-y-auto flex-1 space-y-6">
              <div className="std-enroll-box bg-gray-50 border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="std-text-primary text-sm font-extrabold text-gray-800 flex items-center gap-1.5">
                    <PlusIcon className="h-4 w-4 text-emerald-500 stroke-[2.5]" />
                    {t('ចុះឈ្មោះមុខវិជ្ជាថ្មី (អាចធីកបានច្រើន)', 'Enroll New Courses (Multi-Select)')}
                  </h3>

                  {(selectedStudent.department_id || selectedStudent.department?.id) && (
                    <button
                      type="button"
                      disabled={isEnrollingCourses}
                      onClick={handleQuickEnrollAllDeptCourses}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                    >
                      <SparklesIcon className="h-4 w-4 text-yellow-300" />
                      {t('ដាក់គ្រប់មុខវិជ្ជាក្នុងដេប៉ាតឺម៉ង់នេះទាំងអស់', 'Enroll All Dept Courses')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={enrollDeptFilter}
                    onChange={(e) => setEnrollDeptFilter(e.target.value)}
                    className="std-input w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="student_dept">
                      {t('មុខវិជ្ជាក្នុងដេប៉ាតឺម៉ង់របស់សិស្ស', "Student's Department Courses")}
                    </option>
                    <option value="all">{t('បង្ហាញគ្រប់មុខវិជ្ជាទាំងអស់', 'All Departments Courses')}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {getDepartmentDisplayName(d)}
                      </option>
                    ))}
                  </select>

                  <div className="relative">
                    <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={enrollCourseSearch}
                      onChange={(e) => setEnrollCourseSearch(e.target.value)}
                      placeholder=""
                      className="std-input w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                {availableCoursesForSingleStudent.length === 0 ? (
                  <p className="std-surface-card std-text-secondary text-xs font-bold text-gray-400 italic bg-white border border-gray-200 rounded-xl p-4 text-center">
                    {t('សិស្សបានចុះឈ្មោះគ្រប់មុខវិជ្ជាក្នុងផ្នែកនេះរួចរាល់ហើយ។', 'All available courses in this filter are enrolled.')}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-1">
                      <button
                        type="button"
                        onClick={handleSelectAllAvailableSingle}
                        className="text-xs font-extrabold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                      >
                        {availableCoursesForSingleStudent.every((c) => selectedCoursesToEnroll.includes(Number(c.id)))
                          ? t('ដកការជ្រើសរើសទាំងអស់', 'Deselect All')
                          : t(`ជ្រើសរើសទាំងអស់ (${availableCoursesForSingleStudent.length})`, `Select All (${availableCoursesForSingleStudent.length})`)}
                      </button>
                      <span className="std-text-secondary text-xs font-bold text-gray-500">
                        {t('បានជ្រើសរើស៖', 'Selected:')} <strong className="text-emerald-600">{selectedCoursesToEnroll.length}</strong>
                      </span>
                    </div>

                    <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                      {availableCoursesForSingleStudent.map((course) => {
                        const isChecked = selectedCoursesToEnroll.includes(Number(course.id));
                        return (
                          <div
                            key={course.id}
                            onClick={() => toggleCourseInSingleModal(course.id)}
                            className={`std-enroll-item flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                              isChecked
                                ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 shadow-2xs'
                                : 'border-gray-200 bg-white hover:border-emerald-300'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                readOnly
                                className="std-checkbox w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 pointer-events-none"
                              />
                              <div className="min-w-0">
                                <p className="std-text-primary text-xs font-extrabold text-gray-900 truncate">
                                  {course.course_code} - {course.course_name}
                                </p>
                                <p className="std-text-secondary text-[11px] text-gray-500 font-medium">
                                  {course.credit || 3} {t('ក្រេឌីត', 'Credits')}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={isEnrollingCourses || selectedCoursesToEnroll.length === 0}
                        onClick={handleEnrollSelectedCourses}
                        className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isEnrollingCourses ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          <PlusIcon className="h-4 w-4 stroke-[2.5]" />
                        )}
                        {t(`ចុះឈ្មោះចូលរៀន (${selectedCoursesToEnroll.length})`, `Enroll Selected (${selectedCoursesToEnroll.length})`)}
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div>
                <h3 className="std-text-primary text-sm font-extrabold text-gray-800 mb-3 flex items-center gap-1.5">
                  <AcademicCapIcon className="h-4 w-4 text-indigo-500" />
                  {t('មុខវិជ្ជាកំពុងសិក្សា', 'Enrolled Courses')} ({studentEnrollments.length})
                </h3>
                
                {studentEnrollments.length === 0 ? (
                  <div className="std-enroll-box text-center py-8 bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
                    <BookOpenIcon className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                    <p className="std-text-secondary text-sm text-gray-500 font-bold">
                      {t('មិនទាន់បានចុះឈ្មោះមុខវិជ្ជាណាមួយនៅឡើយទេ', 'No courses enrolled yet')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                    {studentEnrollments.map((enrollment) => {
                      const teacher = enrollment.course?.teacher;
                      const teacherImage = teacher?.profile_image || teacher?.avatar || teacher?.user?.profile_image;
                      const teacherAvatarUrl = getProfileImageUrl(teacherImage);
                      const teacherAvatarKey = `enr_t_${enrollment.id}`;
                      const hasTeacherAvatar = Boolean(teacherAvatarUrl && !failedAvatars[teacherAvatarKey]);
                      const teacherInitials = teacher ? `${teacher.first_name?.charAt(0) || ''}${teacher.last_name?.charAt(0) || ''}` : 'T';

                      return (
                        <div key={enrollment.id} className="std-enroll-item flex items-center justify-between p-3.5 bg-white border border-gray-200 rounded-2xl hover:border-indigo-300 transition-all shadow-sm">
                          <div className="flex items-start gap-3">
                            <div className="h-9 w-9 rounded-full bg-indigo-500 text-white flex items-center justify-center shrink-0 font-extrabold text-xs overflow-hidden shadow-sm">
                              {hasTeacherAvatar ? (
                                <img
                                  src={teacherAvatarUrl}
                                  alt="Teacher"
                                  loading="eager"
                                  decoding="async"
                                  className="h-full w-full object-cover rounded-full"
                                  onError={() =>
                                    setFailedAvatars((prev) => ({
                                      ...prev,
                                      [teacherAvatarKey]: true,
                                    }))
                                  }
                                />
                              ) : (
                                <span>{teacherInitials}</span>
                              )}
                            </div>
                            <div>
                              <h4 className="std-text-primary text-xs font-extrabold text-gray-900 leading-snug">
                                {enrollment.course?.course_name || t('ឈ្មោះមុខវិជ្ជា', 'Course Name')}
                              </h4>
                              <p className="std-text-secondary text-[11px] font-medium text-gray-500 mt-0.5">
                                {t('គ្រូ៖', 'Teacher:')}{' '}
                                <span className="std-text-primary text-gray-700 font-bold">
                                  {teacher ? getStudentFullName(teacher) : '—'}
                                </span>{' '}
                                &bull; {enrollment.course?.credit || 3} {t('ក្រេឌីត', 'Credits')}
                              </p>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => setUnenrollTarget(enrollment.course_id)}
                            className="std-action-delete p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                            title={t('លុបមុខវិជ្ជាចេញ', 'Remove Course')}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="std-modal-bar p-5 sm:p-6 border-t border-gray-100 flex justify-end bg-gray-50/50 shrink-0">
              <button
                onClick={() => setShowEnrollmentModal(false)}
                className="std-cancel-btn px-6 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បិទផ្ទាំង', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 9.8. ផ្ទាំង Modal ចុះឈ្មោះមុខវិជ្ជាជាក្រុម (Bulk Course Enrollment)   */}
      {/* ------------------------------------------------------------------ */}
      {showBulkEnrollModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="std-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent animate-fadeIn">
            <div className="std-modal-bar flex justify-between items-center p-6 border-b border-gray-100">
              <div>
                <h2 className="std-text-primary text-xl font-extrabold text-gray-900 flex items-center gap-2.5">
                  <span className="std-badge-emerald bg-emerald-100 text-emerald-600 p-2.5 rounded-xl border border-emerald-200">
                    <BookOpenIcon className="h-6 w-6" />
                  </span>
                  {t('ចុះឈ្មោះមុខវិជ្ជាជាក្រុម', 'Bulk Course Enrollment')}
                </h2>
                <p className="std-text-secondary text-xs text-gray-500 font-bold mt-1">
                  {t(`កំពុងជ្រើសរើសសិស្សចំនួន ${selectedStudents.length} នាក់ ដើម្បីដាក់មុខវិជ្ជារួមគ្នា`, `Enrolling ${selectedStudents.length} selected students into courses at once`)}
                </p>
              </div>
              <button
                onClick={() => setShowBulkEnrollModal(false)}
                className="std-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleConfirmBulkEnroll} className="p-6 overflow-y-auto flex-1 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="std-label block text-xs font-bold text-gray-700 mb-1.5">
                    {t('ច្រោះមុខវិជ្ជាតាមដេប៉ាតឺម៉ង់', 'Filter Courses by Department')}
                  </label>
                  <select
                    value={bulkCourseDeptFilter}
                    onChange={(e) => setBulkCourseDeptFilter(e.target.value)}
                    className="std-input w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="all">{t('-- គ្រប់ដេប៉ាតឺម៉ង់ទាំងអស់ --', '-- All Departments --')}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {getDepartmentDisplayName(d)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="std-label block text-xs font-bold text-gray-700 mb-1.5">
                    {t('ស្វែងរកមុខវិជ្ជា', 'Search Course')}
                  </label>
                  <div className="relative">
                    <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={bulkCourseSearch}
                      onChange={(e) => setBulkCourseSearch(e.target.value)}
                      placeholder=""
                      className="std-input w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleSelectAllBulkCourses}
                  className="text-xs font-extrabold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                >
                  {filteredBulkCourses.length > 0 && filteredBulkCourses.every((c) => bulkSelectedCourses.includes(Number(c.id)))
                    ? t('ដកការជ្រើសរើសទាំងអស់', 'Deselect All Visible')
                    : t(`ជ្រើសរើសមុខវិជ្ជាទាំងអស់ក្នុងបញ្ជី (${filteredBulkCourses.length})`, `Select All Visible (${filteredBulkCourses.length})`)}
                </button>
                <span className="std-badge-emerald px-3 py-1 rounded-lg text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {t('បានធីក៖', 'Selected:')} {bulkSelectedCourses.length} {t('មុខវិជ្ជា', 'Courses')}
                </span>
              </div>

              {filteredBulkCourses.length === 0 ? (
                <div className="std-enroll-box text-center py-10 bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
                  <BookOpenIcon className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                  <p className="std-text-secondary text-sm text-gray-500 font-bold">
                    {t('មិនឃើញមានមុខវិជ្ជាក្នុងផ្នែកនេះទេ', 'No courses found for this filter')}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {filteredBulkCourses.map((course) => {
                    const isChecked = bulkSelectedCourses.includes(Number(course.id));
                    const teacher = course.teacher;
                    return (
                      <div
                        key={course.id}
                        onClick={() => toggleBulkCourseSelection(course.id)}
                        className={`std-enroll-item flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                          isChecked
                            ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 shadow-xs'
                            : 'border-gray-200 bg-white hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            readOnly
                            className="std-checkbox w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 pointer-events-none"
                          />
                          <div className="min-w-0">
                            <p className="std-text-primary text-sm font-extrabold text-gray-900 truncate">
                              {course.course_code} - {course.course_name}
                            </p>
                            <p className="std-text-secondary text-xs text-gray-500 font-medium mt-0.5">
                              {t('គ្រូ៖', 'Teacher:')} <span className="font-bold">{teacher ? getStudentFullName(teacher) : '—'}</span> &bull; {course.credit || 3} {t('ក្រេឌីត', 'Credits')}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="std-modal-bar pt-4 border-t border-gray-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowBulkEnrollModal(false)}
                  className="std-cancel-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
                >
                  {t('បោះបង់', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isBulkEnrolling || bulkSelectedCourses.length === 0}
                  className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  {isBulkEnrolling ? (
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  ) : (
                    <CheckCircleIcon className="h-5 w-5" />
                  )}
                  {isBulkEnrolling
                    ? t('កំពុងចុះឈ្មោះ...', 'Enrolling...')
                    : t(`ដាក់មុខវិជ្ជាឱ្យសិស្សទាំង ${selectedStudents.length} នាក់`, `Enroll ${selectedStudents.length} Students`)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 9.9. ផ្ទាំង Modal សម្រាប់នាំចូលទិន្នន័យសិស្សពី Excel                 */}
      {/* ------------------------------------------------------------------ */}
      {showImportModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="std-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            <div className="std-modal-bar flex justify-between items-center p-5 border-b border-gray-100">
              <div>
                <h2 className="std-text-primary text-lg font-extrabold text-gray-900 flex items-center gap-2">
                  <span className="std-badge-emerald bg-emerald-100 text-emerald-600 p-2 rounded-xl border border-emerald-200">
                    <DocumentIcon className="h-5 w-5" />
                  </span>
                  {t('នាំចូលទិន្នន័យសិស្សឆ្នាំទី៣ ពី Excel', 'Import Year 3 Students from Excel')}
                </h2>
                {activeDepartmentObj && (
                  <p className="std-text-secondary text-xs text-gray-500 font-bold mt-1 ml-11">
                    {t('ដេប៉ាតឺម៉ង់គោលដៅ៖', 'Target Department:')}{' '}
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {getDepartmentDisplayName(activeDepartmentObj)}
                    </span>
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowImportModal(false); setImportPreview([]); setSelectedFileName(''); setImportError(''); }}
                className="std-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              {importError && (
                <div className="std-warning-box p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-600">
                  <ExclamationCircleIcon className="h-5 w-5 shrink-0 mt-0.5" />
                  <p className="text-xs font-bold leading-relaxed">{importError}</p>
                </div>
              )}

              <div className="std-import-info bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="std-import-title font-extrabold text-emerald-900 text-sm">
                    {t('ណែនាំសម្រាប់ការនាំចូល៖', 'Import Instructions:')}
                  </h4>
                  <p className="std-import-desc text-xs font-medium text-emerald-700 mt-1">
                    {activeDepartmentObj
                      ? t(`សិស្សទាំងអស់ក្នុងឯកសារនេះ នឹងត្រូវដាក់បញ្ចូលទៅក្នុងដេប៉ាតឺម៉ង់ «${getDepartmentDisplayName(activeDepartmentObj)}» ដោយស្វ័យប្រវត្តិ។`, `All students in this file will be automatically assigned to "${getDepartmentDisplayName(activeDepartmentObj)}".`)
                      : t('សូមទាញយកទម្រង់គំរូ Excel ហើយបំពេញព័ត៌មានឱ្យបានត្រឹមត្រូវ។', 'Please download the template and fill in correctly.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="std-template-btn inline-flex items-center px-4 py-2 bg-white border border-emerald-300 text-emerald-800 text-xs font-bold rounded-lg hover:bg-emerald-100 transition-all shrink-0 shadow-sm cursor-pointer"
                >
                  <DocumentIcon className="h-4 w-4 mr-1.5 text-emerald-600" />
                  {t('ទាញយកគំរូ', 'Template')}
                </button>
              </div>

              <div>
                <label className="std-label block text-sm font-bold text-gray-700 mb-2">
                  {t('ជ្រើសរើស ឬទម្លាក់ឯកសារ Excel (.xlsx, .xls)', 'Select or drop Excel file')}
                </label>
                <div className="relative group">
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    title={t('ចុចទីនេះដើម្បីជ្រើសរើសឯកសារ', 'Click here to select file')}
                  />
                  
                  <div className={`std-dropzone border-2 border-dashed rounded-xl py-6 px-4 flex flex-col items-center justify-center text-center transition-all duration-300 shadow-sm ${selectedFileName ? 'border-emerald-500 bg-emerald-50' : 'border-emerald-300 bg-emerald-50/40 group-hover:bg-emerald-50 group-hover:border-emerald-500'}`}>
                    {selectedFileName ? (
                      <>
                        <div className="p-2.5 bg-emerald-500 rounded-full mb-3 shadow-sm border border-emerald-600">
                          <DocumentTextIcon className="h-6 w-6 text-white" />
                        </div>
                        <h3 className="std-import-title text-sm font-extrabold text-emerald-900 mb-1.5">
                          {selectedFileName}
                        </h3>
                        <p className="std-import-desc text-xs text-emerald-600 font-medium">
                          {t('ចុចដើម្បីផ្លាស់ប្តូរឯកសារ', 'Click to change file')}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="std-badge-emerald p-2.5 bg-emerald-100 rounded-full mb-3 group-hover:scale-110 transition-transform duration-300 shadow-sm border border-emerald-200">
                          <DocumentIcon className="h-6 w-6 text-emerald-600" />
                        </div>
                        <h3 className="std-import-title text-sm font-extrabold text-emerald-900 mb-1.5">
                          {t('ចុចទីនេះ ឬទាញឯកសារទម្លាក់ទីនេះ', 'Click to upload or drag and drop')}
                        </h3>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {importPreview.length > 0 && importPreview.some(r => !r.isValid) && (
                <div className="std-warning-box mt-4 p-4 bg-rose-50/50 border border-rose-200 rounded-xl flex items-center justify-between gap-4 animate-fadeIn">
                  <div>
                    <p className="std-text-primary text-sm font-bold text-gray-800">
                      {t('មានទិន្នន័យខុសក្នុងបញ្ជី', 'Errors in Parsed Data')}
                    </p>
                    <p className="std-text-secondary text-xs text-gray-500">
                      {importPreview.length} {t('ជួរ', 'rows')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="std-badge-emerald bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-transparent">
                      <CheckCircleIcon className="h-4 w-4" />
                      {importPreview.filter(r => r.isValid).length} {t('ត្រឹមត្រូវ', 'Valid')}
                    </span>
                    <span
                      className="std-badge-rose bg-rose-100 text-rose-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-transparent"
                      title={importPreview.filter(r => !r.isValid).map(r => `ជួរទី ${r.rowIndex}: ${r.errors[0]}`).join('\n')}
                    >
                      <ExclamationCircleIcon className="h-4 w-4" />
                      {importPreview.filter(r => !r.isValid).length} {t('មានកំហុស', 'Error')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="std-modal-bar p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50 shrink-0">
              <button
                type="button"
                onClick={() => { setShowImportModal(false); setImportPreview([]); setSelectedFileName(''); setImportError(''); }}
                className="std-cancel-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={isImporting || importPreview.filter(r => r.isValid).length === 0}
                onClick={handleConfirmImport}
                className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {isImporting ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                ) : (
                  <DocumentIcon className="h-5 w-5" />
                )}
                {isImporting ? t('កំពុងនាំចូល...', 'Importing...') : `${t('នាំចូលទិន្នន័យ', 'Import Data')} (${importPreview.filter(r => r.isValid).length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 9.10. ផ្ទាំង Modal បញ្ជាក់ការលុបគណនីសិស្ស                           */}
      {/* ------------------------------------------------------------------ */}
      {showDeleteModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="std-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fadeIn border border-transparent">
            <div className="std-delete-title flex items-center text-rose-600 mb-5">
              <div className="std-badge-rose p-2 bg-rose-100 rounded-full mr-3 border border-rose-200">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-extrabold">{t('បញ្ជាក់ការលុប', 'Confirm Deletion')}</h3>
            </div>
            <p className="std-text-secondary text-sm font-medium text-gray-600 mb-6 leading-relaxed">
              {t('តើលោកអ្នកប្រាកដជាចង់លុបគណនីសិស្សឈ្មោះ', 'Are you sure you want to delete student')} «
              <span className="std-text-primary font-extrabold text-gray-900">
                {getStudentFullName(studentToDelete)}
              </span>
              » {t('នេះមែនទេ?', 'this student?')}
              <br /><br />
              <span className="std-warning-box text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100 block">
                {t('* ទិន្នន័យ ការចុះឈ្មោះ និងប្រវត្តិរបស់សិស្សនេះនឹងត្រូវបាត់បង់ពីប្រព័ន្ធ។', '* Data, enrollments, and history of this student will be lost.')}
              </span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowDeleteModal(false); setStudentToDelete(null); }}
                disabled={isDeleting}
                className="std-cancel-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer disabled:opacity-50"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {t('លុបចោល', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 9.11. ផ្ទាំង Modal បញ្ជាក់ការលុបមុខវិជ្ជាចេញពីសិស្ស (Unenroll)       */}
      {/* ------------------------------------------------------------------ */}
      {unenrollTarget && (
        <div className="fixed inset-0 m-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="std-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fadeIn border border-transparent">
            <div className="std-delete-title flex items-center text-rose-600 mb-5">
              <div className="std-badge-rose p-2 bg-rose-100 rounded-full mr-3 border border-rose-200">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-extrabold">{t('បញ្ជាក់ការលុបមុខវិជ្ជា', 'Confirm Unenroll')}</h3>
            </div>
            <p className="std-text-secondary text-sm font-medium text-gray-600 mb-6 leading-relaxed">
              {t('តើអ្នកប្រាកដថាចង់លុបមុខវិជ្ជានេះចេញពីសិស្សនេះមែនទេ?', 'Are you sure you want to unenroll student from this course?')}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setUnenrollTarget(null)}
                className="std-cancel-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                onClick={confirmUnenrollCourse}
                className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-all shadow-md cursor-pointer"
              >
                {t('លុបចោល', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 9.12. ផ្ទាំង Modal បញ្ជាក់ការដំឡើងឆ្នាំសិក្សាសិស្ស (ពីឆ្នាំទី៣ ទៅឆ្នាំទី៤) */}
      {/* ------------------------------------------------------------------ */}
      {showPromoteModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="std-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fadeIn border border-transparent">
            <div className="std-promote-title flex items-center text-blue-600 mb-5">
              <div className="std-badge-blue p-2 bg-blue-100 rounded-full mr-3 border border-blue-200">
                <ChevronDoubleUpIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-extrabold">{t('បញ្ជាក់ការឡើងឆ្នាំសិក្សា', 'Confirm Promotion')}</h3>
            </div>
            
            <form onSubmit={handlePromoteSubmit}>
              <p className="std-text-secondary text-sm font-medium text-gray-600 mb-4 leading-relaxed">
                {t(`តើអ្នកចង់ដំឡើងឆ្នាំសិក្សាសិស្សចំនួន ${selectedStudents.length} នាក់នេះមែនទេ?`, `Promote ${selectedStudents.length} selected students?`)}
              </p>
              
              <div className="mb-6">
                <label className="std-label block text-sm font-bold text-gray-700 mb-2">
                  {t('ឡើងទៅកាន់ឆ្នាំសិក្សាថ្មី៖', 'Promote to New Year:')}
                </label>
                <input
                  type="text"
                  value={promoteTargetYear}
                  onChange={(e) => setPromoteTargetYear(e.target.value)}
                  className="std-input w-full bg-gray-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm font-bold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm"
                  placeholder=""
                  required
                />
                <p className="std-text-secondary text-[11px] text-gray-500 mt-2 font-medium">
                  {t('* ប្រព័ន្ធបានទាញយកជំនាន់ និងកំណត់ឆ្នាំបន្ទាប់ដោយស្វ័យប្រវត្តិ។ លោកអ្នកអាចកែប្រែបាន។', '* The system automatically determined the next year. You can edit it if needed.')}
                </p>
              </div>

              <span className="std-amber-warning text-amber-600 text-xs font-bold bg-amber-50 p-3 rounded-lg border border-amber-100 block mb-6">
                {t('* សិស្សដែលត្រូវបានដំឡើងឆ្នាំ នឹងត្រូវផ្ទេរចេញពីតារាង «ឆ្នាំទី៣» ទៅកាន់តារាង «ឆ្នាំទី៤» ដោយស្វ័យប្រវត្តិ។', '* Students promoted to the next year will be automatically moved from the "Year 3" list to the "Year 4" list.')}
              </span>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowPromoteModal(false)}
                  className="std-cancel-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
                >
                  {t('បោះបង់', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isPromoting}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md cursor-pointer flex items-center"
                >
                  {isPromoting ? (
                    <ArrowPathIcon className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <ChevronDoubleUpIcon className="h-5 w-5 mr-2" />
                  )}
                  {isPromoting ? t('កំពុងដំណើរការ...', 'Processing...') : t('យល់ព្រម', 'Confirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 📌 ផ្នែកទី ១០៖ CSS សម្រាប់កំណត់ពណ៌ទម្រង់យប់ (DARK MODE STYLING)         */}
      {/* ==================================================================== */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* ✅ បន្ទាត់ខណ្ឌចែកជួរក្នុងតារាងពេលថ្ងៃ (Light mode subtle row dividers) */
        .std-table-row + .std-table-row > td {
          border-top: 1px solid #f1f5f9;
        }

        html.dark .std-page-bg {
          background-color: transparent !important;
        }
        html.dark .std-surface-card,
        html.dark .std-dept-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .std-dept-card:hover {
          border-color: #3b82f6 !important;
        }
        html.dark .std-table-bar {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .std-text-primary {
          color: #f8fafc !important;
        }
        html.dark .std-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .std-label {
          color: #cbd5e1 !important;
        }

        html.dark .std-shift-tabs {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .std-shift-btn {
          color: #94a3b8 !important;
        }
        html.dark .std-shift-btn:hover {
          background-color: #1e293b !important;
          color: #f8fafc !important;
        }
        html.dark .std-shift-count {
          background-color: #1e293b !important;
          color: #cbd5e1 !important;
        }

        /* ប៊ូតុងព្រួញអូសកាតដេប៉ាតឺម៉ង់ */
        html.dark .std-scroll-arrow {
          background-color: rgba(30, 41, 59, 0.9) !important;
          border-color: #475569 !important;
          color: #e2e8f0 !important;
        }
        html.dark .std-scroll-arrow:hover {
          background-color: #2563eb !important;
          border-color: #3b82f6 !important;
          color: #ffffff !important;
        }

        /* ប្រអប់ Icon លើកាតដេប៉ាតឺម៉ង់ក្នុងទម្រង់យប់ */
        html.dark .std-dept-blue { background-color: rgba(59, 130, 246, 0.15) !important; color: #60a5fa !important; border-color: rgba(59, 130, 246, 0.3) !important; }
        html.dark .std-dept-emerald { background-color: rgba(16, 185, 129, 0.15) !important; color: #34d399 !important; border-color: rgba(16, 185, 129, 0.3) !important; }
        html.dark .std-dept-indigo { background-color: rgba(99, 102, 241, 0.15) !important; color: #818cf8 !important; border-color: rgba(99, 102, 241, 0.3) !important; }
        html.dark .std-dept-amber { background-color: rgba(245, 158, 11, 0.15) !important; color: #fbbf24 !important; border-color: rgba(245, 158, 11, 0.3) !important; }
        html.dark .std-dept-rose { background-color: rgba(244, 63, 94, 0.15) !important; color: #fb7185 !important; border-color: rgba(244, 63, 94, 0.3) !important; }
        html.dark .std-dept-purple { background-color: rgba(168, 85, 247, 0.15) !important; color: #c084fc !important; border-color: rgba(168, 85, 247, 0.3) !important; }
        html.dark .std-dept-cyan { background-color: rgba(6, 182, 212, 0.15) !important; color: #22d3ee !important; border-color: rgba(6, 182, 212, 0.3) !important; }

        /* ប្រអប់ Input, Select, Textarea និង Checkbox */
        html.dark .std-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
          color-scheme: dark;
        }
        html.dark .std-input::placeholder {
          color: #64748b !important;
        }
        html.dark .std-input:focus {
          border-color: #6366f1 !important;
          background-color: #0f172a !important;
        }
        html.dark input[type="date"].std-input::-webkit-calendar-picker-indicator {
          filter: invert(1);
          opacity: 0.6;
        }

        html.dark .std-checkbox {
          background-color: #0f172a !important;
          border-color: #475569 !important;
        }
        html.dark .std-avatar-check {
          background-color: #334155 !important;
        }

        /* ✅ តារាងសិស្ស និងបន្ទាត់ខណ្ឌចែកស្រទន់ស្អាតភ្នែកក្នុងទម្រង់យប់ */
        html.dark .std-table-head {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .std-table-head th,
        html.dark .std-table-head span {
          color: #94a3b8 !important;
        }
        html.dark .std-table-body {
          background-color: #1e293b !important;
        }
        html.dark .std-table-row + .std-table-row > td {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .std-table-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }

        /* ផ្លាកសញ្ញា (Badges) ក្នុងទម្រង់យប់ */
        html.dark .std-badge-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .std-badge-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          color: #818cf8 !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .std-badge-indigo span,
        html.dark .std-badge-indigo svg {
          color: #818cf8 !important;
        }
        html.dark .std-badge-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
        html.dark .std-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .std-badge-emerald svg {
          color: #34d399 !important;
        }
        html.dark .std-badge-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .std-badge-rose svg {
          color: #fb7185 !important;
        }

        /* ប៊ូតុងសកម្មភាព និង Pagination */
        html.dark .std-action-enroll {
          color: #34d399 !important;
        }
        html.dark .std-action-enroll:hover {
          background-color: rgba(16, 185, 129, 0.18) !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
          color: #6ee7b7 !important;
        }
        html.dark .std-action-edit {
          color: #818cf8 !important;
        }
        html.dark .std-action-edit:hover {
          background-color: rgba(99, 102, 241, 0.18) !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
          color: #a5b4fc !important;
        }
        html.dark .std-action-delete {
          color: #fb7185 !important;
        }
        html.dark .std-action-delete:hover {
          background-color: rgba(244, 63, 94, 0.18) !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
          color: #fda4af !important;
        }
        html.dark .std-pagination-bar {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .std-page-btn {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .std-page-btn:hover:not(:disabled) {
          background-color: #334155 !important;
          color: #ffffff !important;
        }

        /* ផ្ទាំង Modal ទាំងអស់ */
        html.dark .std-modal-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .std-modal-bar {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
        }
        html.dark .std-close-btn,
        html.dark .std-cancel-btn {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .std-close-btn:hover,
        html.dark .std-cancel-btn:hover {
          background-color: #334155 !important;
          color: #ffffff !important;
        }

        /* ផ្ទាំងចុះឈ្មោះមុខវិជ្ជា (Enrollment Modal) */
        html.dark .std-enroll-box {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
        }
        html.dark .std-enroll-item {
          background-color: #0f172a !important;
          border-color: #334155 !important;
        }
        html.dark .std-enroll-item:hover {
          border-color: #10b981 !important;
        }

        /* ផ្ទាំង Import Excel */
        html.dark .std-import-info {
          background-color: rgba(16, 185, 129, 0.1) !important;
          border-color: rgba(16, 185, 129, 0.25) !important;
        }
        html.dark .std-import-title {
          color: #34d399 !important;
        }
        html.dark .std-import-desc {
          color: #a7f3d0 !important;
        }
        html.dark .std-template-btn {
          background-color: #0f172a !important;
          border-color: rgba(16, 185, 129, 0.4) !important;
          color: #34d399 !important;
        }
        html.dark .std-template-btn:hover {
          background-color: rgba(16, 185, 129, 0.2) !important;
        }
        html.dark .std-dropzone {
          background-color: rgba(16, 185, 129, 0.06) !important;
          border-color: rgba(16, 185, 129, 0.35) !important;
        }
        html.dark .group:hover .std-dropzone {
          background-color: rgba(16, 185, 129, 0.12) !important;
          border-color: #10b981 !important;
        }

        /* ផ្ទាំងលុប និងឡើងឆ្នាំសិក្សា */
        html.dark .std-delete-title {
          color: #fb7185 !important;
        }
        html.dark .std-promote-title {
          color: #60a5fa !important;
        }
        html.dark .std-warning-box {
          background-color: rgba(244, 63, 94, 0.12) !important;
          border-color: rgba(244, 63, 94, 0.25) !important;
          color: #fda4af !important;
        }
        html.dark .std-amber-warning {
          background-color: rgba(245, 158, 11, 0.12) !important;
          border-color: rgba(245, 158, 11, 0.25) !important;
          color: #fcd34d !important;
        }
      `}</style>
    </div>
  );
};

export default ManageStudentsYear3;
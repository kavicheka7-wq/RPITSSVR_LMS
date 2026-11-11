// src/components/admin/ManageTeachers.jsx
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
  AcademicCapIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  DocumentIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  Squares2X2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនី Admin ម្នាក់ៗ (User-Scoped 0ms Cache)
// ============================================================================
const CACHE_KEY_SHARED_TEACHERS = 'cached_admin_teachers_list';
const CACHE_KEY_LEGACY_TEACHERS = 'cached_admin_teachers_page1';
const CACHE_KEY_LEGACY_META = 'cached_admin_teachers_meta';
const CACHE_KEY_SHARED_DEPTS = 'cached_admin_departments_list';
const CACHE_KEY_SHARED_COURSES = 'cached_admin_courses_list';

const getTeachersCacheKey = (uid) => `cached_admin_teachers_list_v8_${uid}`;
const getTeachersMetaCacheKey = (uid) => `cached_admin_teachers_meta_v8_${uid}`;
const getDeptsCacheKey = (uid) => `cached_admin_departments_list_v8_${uid}`;
const getCoursesCacheKey = (uid) => `cached_admin_courses_list_v8_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់អ្នកគ្រប់គ្រងម្នាក់ៗ
const ADMIN_TEACHERS_MEM_CACHE = {
  uid: null,
  teachers: null,
  meta: null,
  departments: null,
  courses: null,
  teacherRoleId: null,
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
  { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', darkClass: 'tch-dept-emerald' },
  { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', darkClass: 'tch-dept-indigo' },
  { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', darkClass: 'tch-dept-amber' },
  { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', darkClass: 'tch-dept-rose' },
  { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100', darkClass: 'tch-dept-purple' },
  { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-100', darkClass: 'tch-dept-cyan' },
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

// ✅ អនុគមន៍ទាញយកឈ្មោះពេញរបស់គ្រូបង្រៀន
const getTeacherFullName = (person) => {
  if (!person) return '';
  return `${person.first_name || ''} ${person.last_name || ''}`.trim();
};

// ✅ អនុគមន៍ទាញយកឈ្មោះដេប៉ាតឺម៉ង់
const getDepartmentDisplayName = (deptObjOrName) => {
  if (!deptObjOrName) return '—';
  const rawName = typeof deptObjOrName === 'string'
    ? deptObjOrName
    : (deptObjOrName.department_name || deptObjOrName.name || '');
  return rawName || '—';
};

// ✅ អនុគមន៍តម្រៀបគ្រូបង្រៀនដែលមានឈ្មោះមុន (លេខរៀងទី 1 ឬអត្តលេខតូច) ឱ្យនៅខាងលើគេដេញចុះមកក្រោម សម្រាប់ទាញយក Excel
const sortTeachersOldestFirst = (list) => {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const codeA = (a.teacher_code || '').toString().trim();
    const codeB = (b.teacher_code || '').toString().trim();
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
// 📌 ផ្នែកទី២៖ Component គោលសម្រាប់គ្រប់គ្រងគ្រូបង្រៀន (ManageTeachers)
// ============================================================================
const ManageTeachers = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [failedAvatars, setFailedAvatars] = useState({});
  const [revealedEmails, setRevealedEmails] = useState({});
  const [showPasswordInput, setShowPasswordInput] = useState(false);

  const toggleEmailVisibility = useCallback((teacherId) => {
    setRevealedEmails((prev) => ({
      ...prev,
      [teacherId]: !prev[teacherId],
    }));
  }, []);

  // ✅ កំណត់អត្តសញ្ញាណ Admin បច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentAdminId = useMemo(() => resolveAdminUid(user), [user]);

  if (
    ADMIN_TEACHERS_MEM_CACHE.uid &&
    ADMIN_TEACHERS_MEM_CACHE.uid !== currentAdminId
  ) {
    ADMIN_TEACHERS_MEM_CACHE.teachers = null;
    ADMIN_TEACHERS_MEM_CACHE.meta = null;
    ADMIN_TEACHERS_MEM_CACHE.departments = null;
    ADMIN_TEACHERS_MEM_CACHE.courses = null;
    ADMIN_TEACHERS_MEM_CACHE.lastSyncedAt = 0;
  }
  ADMIN_TEACHERS_MEM_CACHE.uid = currentAdminId;

  // ✅ ១. State សម្រាប់ផ្ទុកបញ្ជីគ្រូបង្រៀន ដេប៉ាតឺម៉ង់ និងមុខវិជ្ជា (អានទិន្នន័យពី Cache មកបង្ហាញភ្លាមៗក្នុង 0 វិនាទី)
  const [teachers, setTeachers] = useState(() => {
    if (Array.isArray(ADMIN_TEACHERS_MEM_CACHE.teachers)) {
      return ADMIN_TEACHERS_MEM_CACHE.teachers;
    }
    const cached =
      readStorageJson(getTeachersCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_TEACHERS, null) ||
      readStorageJson(CACHE_KEY_LEGACY_TEACHERS, []);
    if (Array.isArray(cached)) {
      ADMIN_TEACHERS_MEM_CACHE.teachers = cached;
      return cached;
    }
    return [];
  });

  const [departments, setDepartments] = useState(() => {
    if (Array.isArray(ADMIN_TEACHERS_MEM_CACHE.departments)) {
      return ADMIN_TEACHERS_MEM_CACHE.departments;
    }
    const cached =
      readStorageJson(getDeptsCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_DEPTS, []);
    if (Array.isArray(cached)) {
      ADMIN_TEACHERS_MEM_CACHE.departments = cached;
      return cached;
    }
    return [];
  });

  const [allCourses, setAllCourses] = useState(() => {
    if (Array.isArray(ADMIN_TEACHERS_MEM_CACHE.courses)) {
      return ADMIN_TEACHERS_MEM_CACHE.courses;
    }
    const cached =
      readStorageJson(getCoursesCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES, []);
    if (Array.isArray(cached)) {
      ADMIN_TEACHERS_MEM_CACHE.courses = cached;
      return cached;
    }
    return [];
  });

  const [teacherRoleId, setTeacherRoleId] = useState(
    () => ADMIN_TEACHERS_MEM_CACHE.teacherRoleId || null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError, setFormError] = useState('');
  const [importError, setImportError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // ២. State និង Ref សម្រាប់គ្រប់គ្រងកាតដេប៉ាតឺម៉ង់ និងការអូសកាតឆ្វេង-ស្ដាំ
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const cardsScrollRef = useRef(null);
  const [isDraggingCards, setIsDraggingCards] = useState(false);
  const dragStartXRef = useRef(0);
  const scrollLeftStartRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const prevCountsRef = useRef({ all: 0 });

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // ៣. Ref សម្រាប់ផ្តាច់ API Request ចាស់ៗពេលអ្នកប្រើវាយអក្សរ Search លឿនៗ (AbortController)
  const abortControllerRef = useRef(null);

  // ៤. State សម្រាប់ការបែងចែកទំព័រ (Pagination - ដំឡើង perPage ទៅ 200 ដូចទំព័រសិស្ស)
  const [page, setPage] = useState(1);
  const [perPage] = useState(200);
  const [meta, setMeta] = useState(() => {
    if (ADMIN_TEACHERS_MEM_CACHE.meta) return ADMIN_TEACHERS_MEM_CACHE.meta;
    const cached =
      readStorageJson(getTeachersMetaCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_LEGACY_META, null);
    if (cached) {
      ADMIN_TEACHERS_MEM_CACHE.meta = cached;
      return cached;
    }
    return {
      current_page: 1,
      last_page: 1,
      total: teachers.length,
      per_page: 200,
    };
  });

  // ៥. State សម្រាប់ Modal បញ្ជាក់ការលុបគ្រូបង្រៀន និងនាំចូល Excel
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('');

  // ✅ ៦. កំណត់ gender, employment_type និង status ជា '' នៅពេលដំបូង ដើម្បីឱ្យលោតពាក្យ «ជ្រើសរើស...»
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    status: '',
    gender: '',
    phone: '',
    teacher_code: '',
    department_id: '',
    specialization: '',
    employment_type: '',
    date_of_birth: '',
  });

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ ការច្រោះទិន្នន័យ គណនាចំនួនគ្រូតាមដេប៉ាតឺម៉ង់ និងមុខងារស្វែងរករហ័ស
  // ============================================================================

  // ✅ អនុគមន៍ទាញយក ID ដេប៉ាតឺម៉ង់ទាំងអស់របស់គ្រូម្នាក់ (ទាំងដេប៉ាតឺម៉ង់គោល + ដេប៉ាតឺម៉ង់នៃមុខវិជ្ជាដែលគ្រូទទួលបន្ទុកបង្រៀន)
  const getTeacherDepartmentIds = useCallback((teacher) => {
    if (!teacher) return [];
    const deptSet = new Set();

    // ១. ដេប៉ាតឺម៉ង់គោលរបស់គ្រូ
    const primaryDeptId = teacher.department_id || teacher.department?.id;
    if (primaryDeptId !== undefined && primaryDeptId !== null && primaryDeptId !== '') {
      deptSet.add(String(primaryDeptId));
    }

    // ២. ដេប៉ាតឺម៉ង់ពីទិន្នន័យ courses ដែលភ្ជាប់មកជាមួយ API (បើមាន)
    if (Array.isArray(teacher.courses)) {
      teacher.courses.forEach((c) => {
        const cDeptId = c.department_id || c.department?.id;
        if (cDeptId !== undefined && cDeptId !== null && cDeptId !== '') {
          deptSet.add(String(cDeptId));
        }
      });
    }

    // ៣. ដេប៉ាតឺម៉ង់ពីបញ្ជីមុខវិជ្ជាសរុប (allCourses) ដោយផ្គូផ្គងទាំង teacher.id និង teacher.user_id
    if (Array.isArray(allCourses) && allCourses.length > 0) {
      const tId = teacher.id ? String(teacher.id) : null;
      const tUserId = teacher.user_id ? String(teacher.user_id) : null;

      allCourses.forEach((c) => {
        const cTeacherId = c.teacher_id ? String(c.teacher_id) : null;
        const cNestedId = c.teacher?.id ? String(c.teacher.id) : null;
        const cNestedUserId = c.teacher?.user_id ? String(c.teacher.user_id) : null;

        const isMatched =
          (tId && (cTeacherId === tId || cNestedId === tId)) ||
          (tUserId && (cTeacherId === tUserId || cNestedUserId === tUserId));

        if (isMatched) {
          const cDeptId = c.department_id || c.department?.id;
          if (cDeptId !== undefined && cDeptId !== null && cDeptId !== '') {
            deptSet.add(String(cDeptId));
          }
        }
      });
    }

    return Array.from(deptSet);
  }, [allCourses]);

  // កែសម្រួល Debounce សម្រាប់ Search ឱ្យដើរលឿន (150ms) និងទាញ Cache មកវិញភ្លាមពេលលុបអក្សរអស់
  useEffect(() => {
    if (!searchTerm.trim()) {
      setDebouncedSearch('');
      setPage(1);
      if (Array.isArray(ADMIN_TEACHERS_MEM_CACHE.teachers)) {
        setTeachers(ADMIN_TEACHERS_MEM_CACHE.teachers);
        if (ADMIN_TEACHERS_MEM_CACHE.meta) {
          setMeta(ADMIN_TEACHERS_MEM_CACHE.meta);
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

  // ✅ គណនាចំនួនគ្រូសរុប និងតាមដេប៉ាតឺម៉ង់នីមួយៗ (បើគ្រូម្នាក់បង្រៀនមុខវិជ្ជាក្នុង ២ ដេប៉ាតឺម៉ង់ នឹងរាប់បញ្ចូលក្នុងកាតដេប៉ាតឺម៉ង់ទាំង ២)
  const departmentCounts = useMemo(() => {
    if (debouncedSearch.trim() !== '') {
      return prevCountsRef.current;
    }

    const list = Array.isArray(teachers) ? teachers : [];
    const counts = { all: list.length };
    departments.forEach((dept) => { counts[dept.id] = 0; });
    list.forEach((teacher) => {
      const teacherDeptIds = getTeacherDepartmentIds(teacher);
      teacherDeptIds.forEach((dId) => {
        departments.forEach((dept) => {
          if (String(dept.id) === String(dId)) {
            counts[dept.id] = (counts[dept.id] || 0) + 1;
          }
        });
      });
    });

    prevCountsRef.current = counts;
    return counts;
  }, [teachers, departments, debouncedSearch, getTeacherDepartmentIds]);

  // ច្រោះបញ្ជីគ្រូបង្រៀនតាមដេប៉ាតឺម៉ង់ដែលបានចុចជ្រើសរើស និងតាមពាក្យស្វែងរក
  const displayedTeachers = useMemo(() => {
    const list = Array.isArray(teachers) ? teachers : [];
    const filteredByDept = selectedDepartment === 'all'
      ? list
      : list.filter((teacher) => getTeacherDepartmentIds(teacher).includes(String(selectedDepartment)));

    if (!searchTerm.trim()) return filteredByDept;
    const q = searchTerm.toLowerCase().trim();
    return filteredByDept.filter((teacher) => {
      const fullName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.toLowerCase();
      const reverseName = `${teacher.last_name || ''} ${teacher.first_name || ''}`.toLowerCase();
      return (
        fullName.includes(q) ||
        reverseName.includes(q) ||
        teacher.first_name?.toLowerCase().includes(q) ||
        teacher.last_name?.toLowerCase().includes(q) ||
        teacher.email?.toLowerCase().includes(q) ||
        teacher.phone?.toLowerCase().includes(q) ||
        teacher.teacher_code?.toLowerCase().includes(q) ||
        teacher.specialization?.toLowerCase().includes(q)
      );
    });
  }, [teachers, selectedDepartment, searchTerm, getTeacherDepartmentIds]);

  const activeDepartmentObj = useMemo(() => {
    if (selectedDepartment === 'all') return null;
    return departments.find((d) => String(d.id) === String(selectedDepartment)) || null;
  }, [selectedDepartment, departments]);

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
  // 📌 ផ្នែកទី៤៖ មុខងារត្រួតពិនិត្យប៊ូតុងព្រួញអូសកាតដេប៉ាតឺម៉ង់ឆ្វេង-ស្ដាំ
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
  };

  // ============================================================================
  // 📌 ផ្នែកទី៥៖ ការទាញទិន្នន័យពី Backend API ដោយមិនរាំងស្ទះ UI (Non-Blocking 0ms Sync)
  // ============================================================================

  const fetchDepartments = useCallback(async () => {
    try {
      const data = await getCachedDepartments();
      if (Array.isArray(data)) {
        setDepartments(data);
        ADMIN_TEACHERS_MEM_CACHE.departments = data;
        try {
          localStorage.setItem(getDeptsCacheKey(currentAdminId), JSON.stringify(data));
          localStorage.setItem(CACHE_KEY_SHARED_DEPTS, JSON.stringify(data));
        } catch {}
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  }, [currentAdminId]);

  const fetchTeacherRole = useCallback(async () => {
    try {
      const rolesData = await getCachedRoles();
      const teacherRole = (rolesData || []).find(
        (r) => r.role_name === 'Teacher' || r.name === 'Teacher'
      );
      if (teacherRole) {
        setTeacherRoleId(teacherRole.id);
        ADMIN_TEACHERS_MEM_CACHE.teacherRoleId = teacherRole.id;
      }
    } catch (error) {
      console.error('Error fetching teacher role:', error);
    }
  }, []);

  const fetchCoursesList = useCallback(async () => {
    try {
      const coursesData = await getCachedCourses();
      if (Array.isArray(coursesData)) {
        setAllCourses(coursesData);
        ADMIN_TEACHERS_MEM_CACHE.courses = coursesData;
        try {
          localStorage.setItem(
            getCoursesCacheKey(currentAdminId),
            JSON.stringify(coursesData)
          );
          localStorage.setItem(
            CACHE_KEY_SHARED_COURSES,
            JSON.stringify(coursesData)
          );
        } catch {}
      }
    } catch (error) {}
  }, [currentAdminId]);

  useEffect(() => {
    fetchDepartments();
    fetchTeacherRole();
    fetchCoursesList();
  }, [fetchDepartments, fetchTeacherRole, fetchCoursesList]);

  // អនុគមន៍ទាញបញ្ជីគ្រូបង្រៀនពី API `/admin/teachers`
  const fetchTeachers = useCallback(
    async (forceRefresh = false) => {
      if (page === 1 && !debouncedSearch && !forceRefresh) {
        const cachedList = readStorageJson(getTeachersCacheKey(currentAdminId), null);
        if (Array.isArray(cachedList)) {
          setTeachers(cachedList);
          ADMIN_TEACHERS_MEM_CACHE.teachers = cachedList;
        }
        const now = Date.now();
        if (
          ADMIN_TEACHERS_MEM_CACHE.uid === currentAdminId &&
          Array.isArray(ADMIN_TEACHERS_MEM_CACHE.teachers) &&
          ADMIN_TEACHERS_MEM_CACHE.teachers.length > 0 &&
          now - ADMIN_TEACHERS_MEM_CACHE.lastSyncedAt < 25000
        ) {
          return;
        }
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await api.get('/admin/teachers', {
          params: {
            page,
            per_page: perPage,
            search: debouncedSearch,
          },
          signal: controller.signal,
        });
        const teacherList = Array.isArray(response.data?.data)
          ? response.data.data
          : response.data?.data?.data || response.data || [];
        const validList = Array.isArray(teacherList) ? teacherList : [];

        const teacherMeta = response.data?.meta || {
          current_page:
            response.data?.data?.current_page ||
            response.data?.current_page ||
            1,
          last_page:
            response.data?.data?.last_page || response.data?.last_page || 1,
          total:
            response.data?.data?.total ??
            response.data?.total ??
            validList.length,
          per_page:
            response.data?.data?.per_page || response.data?.per_page || perPage,
        };

        setTeachers(validList);
        setMeta(teacherMeta);

        // រក្សាទុកទិន្នន័យទំព័រទី១ ក្នុង Cache នៅពេលមិនមានការ Search
        if (page === 1 && !debouncedSearch) {
          ADMIN_TEACHERS_MEM_CACHE.uid = currentAdminId;
          ADMIN_TEACHERS_MEM_CACHE.teachers = validList;
          ADMIN_TEACHERS_MEM_CACHE.meta = teacherMeta;
          ADMIN_TEACHERS_MEM_CACHE.lastSyncedAt = Date.now();
          try {
            localStorage.setItem(
              getTeachersCacheKey(currentAdminId),
              JSON.stringify(validList)
            );
            localStorage.setItem(
              getTeachersMetaCacheKey(currentAdminId),
              JSON.stringify(teacherMeta)
            );
            localStorage.setItem(
              CACHE_KEY_SHARED_TEACHERS,
              JSON.stringify(validList)
            );
            localStorage.setItem(
              CACHE_KEY_LEGACY_TEACHERS,
              JSON.stringify(validList)
            );
            localStorage.setItem(
              CACHE_KEY_LEGACY_META,
              JSON.stringify(teacherMeta)
            );
          } catch (e) {
            console.warn('Failed to cache teachers:', e);
          }
        }
      } catch (error) {
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
          return;
        }
        console.error('Error fetching teachers:', error);
      }
    },
    [page, perPage, debouncedSearch, currentAdminId]
  );

  useEffect(() => {
    fetchTeachers(false);
  }, [fetchTeachers]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (formError) setFormError('');
    setFormData({
      ...formData,
      [name]: value
    });
  };

  // បង្កើតគណនីគ្រូថ្មី និងកែប្រែព័ត៌មានគ្រូដោយ Update State លើអេក្រង់ភ្លាមៗ
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');

    const effectiveRoleId = teacherRoleId || 2;
    const finalDepartmentId = formData.department_id || (selectedDepartment !== 'all' ? selectedDepartment : '');
    const matchedDept = departments.find(d => String(d.id) === String(finalDepartmentId));

    setIsSubmitting(true);
    try {
      if (editingTeacher) {
        const dataToUpdate = { ...formData, department_id: finalDepartmentId };
        const payload = { ...dataToUpdate, role_id: effectiveRoleId };
        if (!payload.password) delete payload.password;
        const response = await api.put(`/admin/teachers/${editingTeacher.id}`, payload);

        const serverData = response.data?.data || response.data;
        const updatedTeacher = {
          ...editingTeacher,
          ...dataToUpdate,
          ...(serverData && typeof serverData === 'object' ? serverData : {}),
          profile_image: serverData?.profile_image || editingTeacher.profile_image,
          department: serverData?.department || matchedDept || editingTeacher.department,
          user: { ...(editingTeacher.user || {}), status: dataToUpdate.status },
        };

        setTeachers(prev => {
          const newList = prev.map(item => item.id === editingTeacher.id ? updatedTeacher : item);
          if (page === 1 && !debouncedSearch) {
            ADMIN_TEACHERS_MEM_CACHE.teachers = newList;
            try {
              localStorage.setItem(getTeachersCacheKey(currentAdminId), JSON.stringify(newList));
              localStorage.setItem(CACHE_KEY_SHARED_TEACHERS, JSON.stringify(newList));
              localStorage.setItem(CACHE_KEY_LEGACY_TEACHERS, JSON.stringify(newList));
            } catch (e) {}
          }
          return newList;
        });

        pushLocalNotification({
          titleKm: 'បានកែប្រែព័ត៌មានគ្រូបង្រៀនជោគជ័យ',
          titleEn: 'Teacher Updated Successfully',
          descKm: `ព័ត៌មានរបស់គ្រូបង្រៀន «${getTeacherFullName(dataToUpdate)}» ត្រូវបានធ្វើបច្ចុប្បន្នភាព។`,
          descEn: `Profile of teacher "${getTeacherFullName(dataToUpdate)}" has been updated.`,
          category: 'teacher',
          link: '/teachers'
        });
      } else {
        const dataToCreate = {
          ...formData,
          department_id: finalDepartmentId,
          employment_type: formData.employment_type || 'Full-time',
          status: formData.status || 'active',
        };
        const payload = { ...dataToCreate, role_id: effectiveRoleId };
        const response = await api.post('/admin/teachers', payload);

        const serverData = response.data?.data || response.data;
        const newTeacher = {
          ...dataToCreate,
          ...(serverData && typeof serverData === 'object' ? serverData : { id: Date.now() }),
          profile_image: serverData?.profile_image || null,
          department: serverData?.department || matchedDept || null,
          user: { status: dataToCreate.status },
        };

        setTeachers(prev => {
          const newList = [newTeacher, ...prev].slice(0, perPage);
          if (page === 1 && !debouncedSearch) {
            ADMIN_TEACHERS_MEM_CACHE.teachers = newList;
            try {
              localStorage.setItem(getTeachersCacheKey(currentAdminId), JSON.stringify(newList));
              localStorage.setItem(CACHE_KEY_SHARED_TEACHERS, JSON.stringify(newList));
              localStorage.setItem(CACHE_KEY_LEGACY_TEACHERS, JSON.stringify(newList));
            } catch (e) {}
          }
          return newList;
        });
        setMeta(prev => {
          const newMeta = { ...prev, total: (prev.total || 0) + 1 };
          ADMIN_TEACHERS_MEM_CACHE.meta = newMeta;
          try {
            localStorage.setItem(getTeachersMetaCacheKey(currentAdminId), JSON.stringify(newMeta));
            localStorage.setItem(CACHE_KEY_LEGACY_META, JSON.stringify(newMeta));
          } catch (e) {}
          return newMeta;
        });

        pushLocalNotification({
          titleKm: 'បានបង្កើតគណនីគ្រូបង្រៀនថ្មីជោគជ័យ',
          titleEn: 'New Teacher Created',
          descKm: `គណនីគ្រូបង្រៀន «${getTeacherFullName(dataToCreate)}» ត្រូវបានបង្កើតថ្មី។`,
          descEn: `Teacher account "${getTeacherFullName(dataToCreate)}" was created.`,
          category: 'teacher',
          link: '/teachers'
        });
      }
      setShowModal(false);
      resetForm();
      fetchTeachers(true);
    } catch (error) {
      console.error('Submit error:', error.response?.data || error);
      const apiErrors = error.response?.data?.errors;
      const firstValidationMsg = apiErrors ? Object.values(apiErrors).flat()[0] : null;
      const errMsg =
        firstValidationMsg ||
        error.response?.data?.message ||
        t('មិនអាចរក្សាទុកទិន្នន័យគ្រូបង្រៀនបានទេ (អ៊ីមែល ឬអត្តលេខអាចស្ទួន)!', 'Could not save teacher data (email or teacher code may already exist)!');
      setFormError(String(errMsg));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (teacher) => {
    setTeacherToDelete(teacher);
    setShowDeleteModal(true);
  };

  // លុបឈ្មោះគ្រូចេញពីអេក្រង់ និងបិទ Modal ភ្លាមៗក្នុង 0 វិនាទី (Optimistic UI)
  const confirmDelete = async () => {
    if (!teacherToDelete || isDeleting) return;

    const deletedId = teacherToDelete.id;
    const deletedName = getTeacherFullName(teacherToDelete);
    const previousTeachers = [...teachers];
    const previousMeta = { ...meta };

    setIsDeleting(true);
    setShowDeleteModal(false);
    setTeacherToDelete(null);

    setTeachers(prev => {
      const newList = prev.filter(item => item.id !== deletedId);
      if (page === 1 && !debouncedSearch) {
        ADMIN_TEACHERS_MEM_CACHE.teachers = newList;
        try {
          localStorage.setItem(getTeachersCacheKey(currentAdminId), JSON.stringify(newList));
          localStorage.setItem(CACHE_KEY_SHARED_TEACHERS, JSON.stringify(newList));
          localStorage.setItem(CACHE_KEY_LEGACY_TEACHERS, JSON.stringify(newList));
        } catch (e) {}
      }
      return newList;
    });
    setMeta(prev => {
      const newMeta = { ...prev, total: Math.max(0, (prev.total || 1) - 1) };
      ADMIN_TEACHERS_MEM_CACHE.meta = newMeta;
      try {
        localStorage.setItem(getTeachersMetaCacheKey(currentAdminId), JSON.stringify(newMeta));
        localStorage.setItem(CACHE_KEY_LEGACY_META, JSON.stringify(newMeta));
      } catch (e) {}
      return newMeta;
    });

    try {
      await api.delete(`/admin/teachers/${deletedId}`);
      pushLocalNotification({
        titleKm: 'បានលុបគណនីគ្រូបង្រៀនចេញពីប្រព័ន្ធ',
        titleEn: 'Teacher Account Deleted',
        descKm: `គណនីគ្រូបង្រៀន «${deletedName}» ត្រូវបានលុបចេញពីប្រព័ន្ធ។`,
        descEn: `Teacher "${deletedName}" was deleted from the system.`,
        category: 'teacher',
        link: '/teachers'
      });
    } catch (error) {
      console.error('Failed to delete teacher:', error);
      setTeachers(previousTeachers);
      setMeta(previousMeta);
      ADMIN_TEACHERS_MEM_CACHE.teachers = previousTeachers;
      ADMIN_TEACHERS_MEM_CACHE.meta = previousMeta;
    } finally {
      setIsDeleting(false);
    }
  };

  // ✅ កំណត់ gender: '', employment_type: '', និង status: '' នៅពេលបើកទម្រង់បន្ថែមគ្រូថ្មី ដើម្បីឱ្យលោតពាក្យ «ជ្រើសរើស...»
  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      status: '',
      gender: '',
      phone: '',
      teacher_code: '',
      department_id: selectedDepartment !== 'all' ? String(selectedDepartment) : '',
      specialization: '',
      employment_type: '',
      date_of_birth: '',
    });
    setEditingTeacher(null);
    setFormError('');
    setShowPasswordInput(false);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (teacher) => {
    setFormError('');
    setShowPasswordInput(false);
    setEditingTeacher(teacher);
    setFormData({
      first_name: teacher.first_name || '',
      last_name: teacher.last_name || '',
      email: teacher.email || '',
      password: '',
      status: teacher.user?.status || teacher.status || 'active',
      gender: teacher.gender || 'Male',
      phone: teacher.phone || '',
      teacher_code: teacher.teacher_code || '',
      department_id: teacher.department_id || teacher.department?.id || '',
      specialization: teacher.specialization || '',
      employment_type: teacher.employment_type || 'Full-time',
      date_of_birth: formatDateOnly(teacher.date_of_birth),
    });
    setShowModal(true);
  };

  // ============================================================================
  // 📌 ផ្នែកទី៦៖ មុខងារនាំចេញ និងនាំចូលទិន្នន័យគ្រូបង្រៀនតាមរយៈឯកសារ Excel (.xlsx)
  // ============================================================================

  // ✅ មុខងារកំណត់ Font អក្សរខ្មែរ (Khmer OS Siemreap) ពណ៌ក្បាលតារាង ស៊ុម និង Text Format ('@') ការពារកុំឱ្យដាច់លេខ 0 ខាងមុខ
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

        // បង្ខំឱ្យក្រឡាជាប្រភេទ Text ('s') និងទម្រង់ '@' ដើម្បីកុំឱ្យដាច់លេខ 0 ខាងមុខក្នុង Excel
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

    // កំណត់កម្ពស់ជួរ (Row Height) ដើម្បីកុំឱ្យដាច់ជើងអក្សរខ្មែរ
    const rows = [];
    for (let R = range.s.r; R <= range.e.r; ++R) {
      rows.push({ hpt: R === 0 ? 28 : 22 });
    }
    worksheet['!rows'] = rows;
  };

  // ✅ នាំចេញបញ្ជីគ្រូបង្រៀនតាមដេប៉ាតឺម៉ង់ ដោយដាក់គ្រូដែលមានឈ្មោះមុន (លេខរៀងទី 1) ឱ្យនៅខាងលើគេដេញចុះមកក្រោម
  const handleExportExcel = () => {
    if (!displayedTeachers || displayedTeachers.length === 0) {
      return;
    }

    const currentDeptName = activeDepartmentObj ? getDepartmentDisplayName(activeDepartmentObj) : '';
    const sortedTeachersForExport = sortTeachersOldestFirst(displayedTeachers);

    const exportData = sortedTeachersForExport.map((teacher, idx) => {
      const allDeptNames = getTeacherDepartmentIds(teacher)
        .map((dId) => {
          const dObj = departments.find((d) => String(d.id) === String(dId));
          return dObj ? getDepartmentDisplayName(dObj) : null;
        })
        .filter(Boolean);
      const deptDisplay = allDeptNames.length > 0
        ? allDeptNames.join(' + ')
        : getDepartmentDisplayName(teacher.department || activeDepartmentObj);

      return {
        'ល.រ': idx + 1,
        'អត្តលេខគ្រូ': teacher.teacher_code || '',
        'នាមខ្លួន': teacher.first_name || '',
        'នាមត្រកូល': teacher.last_name || '',
        'ភេទ': teacher.gender || '',
        'អ៊ីមែល': teacher.email || '',
        'លេខទូរស័ព្ទ': teacher.phone || '',
        'ដេប៉ាតឺម៉ង់': deptDisplay,
        'ឯកទេស': teacher.specialization || '',
        'ប្រភេទការងារ': teacher.employment_type || 'Full-time',
        'ស្ថានភាព': teacher.user?.status || teacher.status || 'active',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const colWidths = [
      { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 10 }, { wch: 28 }, { wch: 16 }, { wch: 26 },
      { wch: 22 }, { wch: 16 }, { wch: 14 }
    ];
    applyExcelStyling(worksheet, colWidths, [1, 6]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Teachers_List');
    const safeDeptSuffix = currentDeptName ? `_${currentDeptName.replace(/[\\/:*?"<>|\s]+/g, '_')}` : '';
    XLSX.writeFile(workbook, `Teachers_List${safeDeptSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);

    pushLocalNotification({
      titleKm: 'បាននាំចេញទិន្នន័យគ្រូបង្រៀនទៅ Excel',
      titleEn: 'Teachers Exported to Excel',
      descKm: `ទិន្នន័យគ្រូបង្រៀន (${currentDeptName || 'ទាំងអស់'}) ត្រូវបានទាញយកជា Excel ជោគជ័យ។`,
      descEn: 'Teachers data was successfully exported to Excel.',
      category: 'export',
      link: '/teachers'
    });
  };

  // ✅ ទាញយកទម្រង់គំរូ Excel ដោយមិនយកទិន្នន័យគ្រូបង្រៀនពិតប្រាកដដាក់ចូលឡើយ (ការពារឯកជនភាព និងការពារកំហុសស្ទួនអ៊ីមែលពេល Import)
  const handleDownloadTemplate = () => {
    const defaultDeptName = activeDepartmentObj ? getDepartmentDisplayName(activeDepartmentObj) : '';

    const blankRow = () => ({
      'first_name': '',
      'last_name': '',
      'email': '',
      'phone': '',
      'gender': '',
      'teacher_code': '',
      'department': defaultDeptName,
      'specialization': '',
      'employment_type': 'Full-time',
      'date_of_birth': '',
      'password': ''
    });

    // បង្កើតជួរទំនេរដែលកំណត់ជា Text Format ('@') ចំនួន 50 ជួរទុកជាស្រេច (មិនបញ្ចេញឈ្មោះ អ៊ីមែល ឬពាក្យសម្ងាត់ពិតឡើយ)
    const templateData = Array.from({ length: 50 }, () => blankRow());

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const colWidths = [
      { wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 16 },
      { wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 22 },
      { wch: 18 }, { wch: 16 }, { wch: 16 }
    ];
    // ជួរឈរទី 3 (phone), ទី 5 (teacher_code), ទី 8 (employment_type), ទី 9 (date_of_birth) និងទី 10 (password) ត្រូវកំណត់ជា Text Format ('@')
    applyExcelStyling(worksheet, colWidths, [3, 5, 8, 9, 10]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    const safeDeptSuffix = defaultDeptName ? `_${defaultDeptName.replace(/[\\/:*?"<>|\s]+/g, '_')}` : '';
    XLSX.writeFile(workbook, `teacher_import_template${safeDeptSuffix}.xlsx`);

    pushLocalNotification({
      titleKm: 'បានទាញយកទម្រង់គំរូ Excel គ្រូបង្រៀន',
      titleEn: 'Teacher Excel Template Downloaded',
      descKm: 'ទម្រង់គំរូសម្រាប់នាំចូលទិន្នន័យគ្រូបង្រៀនត្រូវបានទាញយកជោគជ័យ។',
      descEn: 'The Excel template for teacher import was downloaded successfully.',
      category: 'download',
      link: '/teachers'
    });
  };

  // ✅ ប្រសិនបើយើងបានចុចចូលកាតដេប៉ាតឺម៉ង់ណាមួយហើយ ពេលនាំចូល Excel វានឹងចាប់យកដេប៉ាតឺម៉ង់នោះឱ្យគ្រូគ្រប់រូបដោយស្វ័យប្រវត្តិ
  const findDepartmentId = (deptNameOrCode) => {
    if (selectedDepartment !== 'all') {
      return selectedDepartment;
    }
    if (!deptNameOrCode) return null;
    const search = deptNameOrCode.toString().trim().toLowerCase();
    const found = departments.find(d => 
      (d.department_name && d.department_name.toLowerCase() === search) ||
      (d.department_code && d.department_code.toLowerCase() === search) ||
      (d.name && d.name.toLowerCase() === search) ||
      (d.id && d.id.toString() === search)
    );
    return found ? found.id : null;
  };

  // អនុគមន៍បម្លែងឈ្មោះក្បាលជួរឈរក្នុង Excel ឱ្យត្រូវជាមួយ Key របស់ប្រព័ន្ធ
  const normalizeHeaderKey = (key) => {
    const k = key.toString().trim().toLowerCase();
    if (k.includes('first') || k.includes('នាមខ្លួន')) return 'first_name';
    if (k.includes('last') || k.includes('នាមត្រកូល')) return 'last_name';
    if (k.includes('email') || k.includes('អ៊ីមែល')) return 'email';
    if (k.includes('phone') || k.includes('ទូរស័ព្ទ')) return 'phone';
    if (k.includes('code') || k.includes('អត្តលេខ')) return 'teacher_code';
    if (k.includes('gender') || k.includes('ភេទ')) return 'gender';
    if (k.includes('department') || k.includes('ដេប៉ាតឺម៉ង់')) return 'department';
    if (k.includes('specialization') || k.includes('ឯកទេស')) return 'specialization';
    if (k.includes('employment') || k.includes('ការងារ')) return 'employment_type';
    if (k.includes('birth') || k.includes('កំណើត') || k.includes('dob')) return 'date_of_birth';
    if (k.includes('password') || k.includes('ពាក្យសម្ងាត់')) return 'password';
    if (k.includes('status') || k.includes('ស្ថានភាព')) return 'status';
    return key;
  };

  // ✅ អាន និងពិនិត្យទិន្នន័យពីឯកសារ Excel សម្រាប់នាំចូល (Import)
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setImportError('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      setTimeout(() => {
        try {
          const data = evt.target.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
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
                item.teacher_code ||
                item.phone
              );
            });

          if (!nonEmptyRows || nonEmptyRows.length === 0) {
            setImportPreview([]);
            setImportError(t('រកមិនឃើញទិន្នន័យគ្រូបង្រៀនក្នុងឯកសារនេះទេ!', 'No teacher data found in this file!'));
            return;
          }

          const existingEmails = new Set(teachers.map(tItem => tItem.email?.toLowerCase()));
          const fileEmails = new Set();

          const parsedRows = nonEmptyRows.map(({ row, excelRowNumber }) => {
            const item = {};
            Object.keys(row).forEach(k => {
              const normalizedKey = normalizeHeaderKey(k);
              item[normalizedKey] = row[k]?.toString().trim();
            });

            const errors = [];
            if (!item.first_name) errors.push(t('ខ្វះនាមខ្លួន', 'Missing First Name'));
            if (!item.last_name) errors.push(t('ខ្វះនាមត្រកូល', 'Missing Last Name'));
            if (!item.email) {
              errors.push(t('ខ្វះអ៊ីមែល', 'Missing Email'));
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
            else if (gender) gender = 'Other';
            else gender = 'Male';

            let empRaw = (item.employment_type || '').toLowerCase().trim();
            let cleanEmploymentType = 'Full-time';
            if (empRaw.includes('part') || empRaw.includes('ក្រៅម៉ោង')) {
              cleanEmploymentType = 'Part-time';
            } else if (empRaw.includes('contract') || empRaw.includes('កិច្ចសន្យា')) {
              cleanEmploymentType = 'Contract';
            } else if (empRaw.includes('full') || empRaw.includes('ពេញម៉ោង')) {
              cleanEmploymentType = 'Full-time';
            } else if (item.employment_type) {
              cleanEmploymentType = item.employment_type;
            }

            let cleanPhone = (item.phone || '').replace(/^'+/, '').trim();
            if (/^[1-9]\d{7,8}$/.test(cleanPhone)) {
              cleanPhone = '0' + cleanPhone;
            }

            let cleanPassword = (item.password || '').replace(/^'+/, '').trim();
            if (!cleanPassword) {
              cleanPassword = '12345678';
            }

            const deptId = findDepartmentId(item.department);
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
                teacher_code: (item.teacher_code || '').replace(/^'+/, '').trim(),
                department_id: deptId,
                department_name: item.department || '',
                specialization: item.specialization || '',
                employment_type: cleanEmploymentType,
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
      }, 0);
    };
    reader.readAsArrayBuffer(file);
  };

  // បញ្ជូនទិន្នន័យគ្រូដែលត្រឹមត្រូវទៅកាន់ Backend API `/admin/teachers/import`
  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.length === 0 || isImporting) return;
    const validItems = importPreview.filter(r => r.isValid).map(r => r.data);

    if (validItems.length === 0) {
      return;
    }

    setIsImporting(true);
    setImportError('');
    try {
      await api.post('/admin/teachers/import', { teachers: validItems });
      try {
        localStorage.removeItem(getTeachersCacheKey(currentAdminId));
        localStorage.removeItem(getTeachersMetaCacheKey(currentAdminId));
        localStorage.removeItem(CACHE_KEY_SHARED_TEACHERS);
        localStorage.removeItem(CACHE_KEY_LEGACY_TEACHERS);
        localStorage.removeItem(CACHE_KEY_LEGACY_META);
      } catch (e) {}

      pushLocalNotification({
        titleKm: 'បាននាំចូលទិន្នន័យគ្រូបង្រៀនពី Excel',
        titleEn: 'Teachers Imported from Excel',
        descKm: `ទិន្នន័យគ្រូបង្រៀនចំនួន ${validItems.length} នាក់ត្រូវបាននាំចូល និងធ្វើបច្ចុប្បន្នភាពរួចរាល់។`,
        descEn: `${validItems.length} teachers were successfully imported/updated.`,
        category: 'import',
        link: '/teachers'
      });

      setShowImportModal(false);
      setImportPreview([]);
      setSelectedFileName('');
      fetchTeachers(true);
    } catch (error) {
      console.error('Import submit error:', error);
      const errMsg =
        error.response?.data?.message ||
        t('មានបញ្ហាក្នុងការនាំចូលទិន្នន័យគ្រូបង្រៀន!', 'Error importing teachers!');
      setImportError(String(errMsg));
    } finally {
      setIsImporting(false);
    }
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

  // ✅ អនុគមន៍បង្ហាញប្រភេទការងារជាភាសាខ្មែរ ឬអង់គ្លេស
  const getEmploymentTypeLabel = (type) => {
    if (language === 'km') {
      const types = {
        'Full-time': 'ពេញម៉ោង',
        'Part-time': 'ក្រៅម៉ោង',
        'Contract': 'កិច្ចសន្យា',
      };
      return types[type] || type || 'ពេញម៉ោង';
    }
    return type || 'Full-time';
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
  // 📌 ផ្នែកទី៧៖ ការបង្ហាញទម្រង់ផ្ទៃមុខកម្មវិធី (JSX UI Rendering)
  // ============================================================================
  return (
    <div className="tch-page-bg p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6 animate-fadeIn">
      
      {/* ------------------------------------------------------------------ */}
      {/* 7.1. ផ្ទាំងក្បាលខាងលើ (Header Banner) និងប៊ូតុងសកម្មភាពគោល           */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-8 shadow-xl border border-blue-900">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-[28px] sm:text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                <AcademicCapIcon className="h-8 w-8 text-yellow-400" />
              </div>
              {t('គ្រប់គ្រងគ្រូបង្រៀន', 'Manage Teachers')}
            </h1>
            <p className={`text-blue-200/80 text-sm font-medium ${selectedDepartment === 'all' ? 'max-w-none' : 'max-w-xl'}`}>
              {selectedDepartment === 'all'
                ? t('សូមចុចជ្រើសរើសកាតដេប៉ាតឺម៉ង់ខាងក្រោម ដើម្បីបន្ថែមគ្រូបង្រៀនថ្មី នាំចូល ឬនាំចេញទិន្នន័យ Excel តាមដេប៉ាតឺម៉ង់។', 'Please select a department card below to add teachers, import, or export Excel data by department.')
                : t('បន្ថែម និងគ្រប់គ្រងគណនីគ្រូបង្រៀនតាមដេប៉ាតឺម៉ង់ លុប កែប្រែ ឬនាំចូលពី Excel ។', 'Add and manage teacher accounts by department, edit, delete, or import from Excel.')}
            </p>
          </div>

          {/* ✅ បិទ/លាក់ប៊ូតុងទាំង ៣ នៅពេលឈរលើ «គ្រូបង្រៀនទាំងអស់» (បង្ហាញតែពេលចុចលើកាតដេប៉ាតឺម៉ង់ណាមួយប៉ុណ្ណោះ) */}
          {selectedDepartment !== 'all' && (
            <div className="flex flex-wrap items-center gap-3 shrink-0 animate-fadeIn">
              <button
                onClick={handleExportExcel}
                className="inline-flex items-center justify-center px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer"
                title={t('នាំចេញបញ្ជីគ្រូបង្រៀនជា Excel', 'Export teacher list to Excel')}
              >
                <DocumentIcon className="h-5 w-5 mr-2" />
                {t('នាំចេញ Excel', 'Export Excel')}
              </button>
              
              <button
                onClick={() => {
                  setImportPreview([]);
                  setSelectedFileName('');
                  setImportError('');
                  setShowImportModal(true);
                }}
                className="inline-flex items-center justify-center px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer"
                title={t('នាំចូលទិន្នន័យគ្រូបង្រៀនពី Excel', 'Import teacher data from Excel')}
              >
                <DocumentIcon className="h-5 w-5 mr-2" />
                {t('នាំចូល Excel', 'Import Excel')}
              </button>
              
              <button
                onClick={openCreateModal}
                className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                {t('បន្ថែមគ្រូបង្រៀន', 'Add Teacher')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 7.2. ផ្នែកកាតដេប៉ាតឺម៉ង់ (Department Filter Cards)                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative flex items-center group/cards">
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollDepartmentCards('left')}
            className="tch-scroll-arrow absolute -left-3 z-20 h-9 w-9 rounded-full bg-white/90 hover:bg-white backdrop-blur-md border border-gray-200/90 text-gray-700 hover:text-blue-600 shadow-[0_4px_12px_rgba(0,0,0,0.12)] flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer"
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
              selectedDepartment === 'all' ? 'bg-gradient-to-br from-blue-900 to-indigo-950 text-white border-blue-800 shadow-lg -translate-y-0.5' : 'tch-dept-card bg-white text-gray-900 border-gray-100 hover:border-blue-200 hover:shadow-md shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between w-full">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${selectedDepartment === 'all' ? 'bg-white/15 text-white border-white/20' : 'tch-dept-blue bg-blue-50 text-blue-600 border-blue-100'}`}>
                <Squares2X2Icon className="h-5 w-5" />
              </div>
              <span className={`text-2xl font-extrabold ${selectedDepartment === 'all' ? 'text-white' : 'tch-text-primary text-gray-900'}`}>
                {departmentCounts.all || 0}
              </span>
            </div>
            <div className="mt-4">
              <p className={`text-sm font-extrabold truncate ${selectedDepartment === 'all' ? 'text-white' : 'tch-text-primary text-gray-900'}`}>
                {t('គ្រូបង្រៀនសរុប', ' Total Teachers')}
              </p>
              <p className={`text-xs font-medium mt-0.5 truncate ${selectedDepartment === 'all' ? 'text-blue-200/80' : 'tch-text-secondary text-gray-500'}`}>
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
                  isSelected ? 'bg-gradient-to-br from-blue-900 to-indigo-950 text-white border-blue-800 shadow-lg -translate-y-0.5' : 'tch-dept-card bg-white text-gray-900 border-gray-100 hover:border-blue-200 hover:shadow-md shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between w-full">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${isSelected ? 'bg-white/15 text-white border-white/20' : `${theme.darkClass} ${theme.bg} ${theme.text} ${theme.border}`}`}>
                    <AcademicCapIcon className="h-5 w-5" />
                  </div>
                  <span className={`text-2xl font-extrabold ${isSelected ? 'text-white' : 'tch-text-primary text-gray-900'}`}>
                    {count}
                  </span>
                </div>
                <div className="mt-4">
                  <p className={`text-sm font-extrabold truncate ${isSelected ? 'text-white' : 'tch-text-primary text-gray-900'}`} title={deptName}>
                    {deptName}
                  </p>
                  <p className={`text-xs font-medium mt-0.5 truncate ${isSelected ? 'text-blue-200/80' : 'tch-text-secondary text-gray-500'}`}>
                    {t('គ្រូបង្រៀនក្នុងដេប៉ាតឺម៉ង់', 'Department Teachers')}
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
            className="tch-scroll-arrow absolute -right-3 z-20 h-9 w-9 rounded-full bg-white/90 hover:bg-white backdrop-blur-md border border-gray-200/90 text-gray-700 hover:text-blue-600 shadow-[0_4px_12px_rgba(0,0,0,0.12)] flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer"
            title={t('អូសទៅស្ដាំ', 'Scroll Right')}
          >
            <ChevronRightIcon className="h-4 w-4 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 7.3. ប្រអប់ស្វែងរកគ្រូបង្រៀន (Search & Filters Box)                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="tch-surface-card bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md shrink-0">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder=""
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="tch-input w-full pl-11 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-sm"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')} 
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 7.4. តារាងបង្ហាញបញ្ជីឈ្មោះគ្រូបង្រៀន (Main Table Content - បន្ទាត់ស្រទន់ស្អាត) */}
      {/* ------------------------------------------------------------------ */}
      <div className="tch-surface-card bg-white rounded-[1.5rem] border border-gray-200 shadow-sm overflow-hidden">
        <div className="tch-table-bar px-6 py-5 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="tch-text-primary text-[18px] font-extrabold text-gray-900">
              {activeDepartmentObj
                ? `${t('បញ្ជីគ្រូបង្រៀន', 'Teachers List')} - ${getDepartmentDisplayName(activeDepartmentObj)}`
                : t('បញ្ជីគ្រូបង្រៀនទាំងអស់', 'All Teachers List')}
            </h2>
          </div>
          {selectedDepartment !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedDepartment('all')}
              className="tch-badge-blue text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
            >
              {t('បង្ហាញគ្រប់ដេប៉ាតឺម៉ង់វិញ', 'Show All Departments')}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="tch-table-head bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('គ្រូបង្រៀន', 'Teacher')}
                </th>
                <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('អត្តលេខ', 'Teacher Code')}
                </th>
                <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('ប្រភេទការងារ', 'Employment Type')}
                </th>
                <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('អ៊ីមែល / ទូរស័ព្ទ', 'Email / Phone')}
                </th>
                <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('ដេប៉ាតឺម៉ង់', 'Department')}
                </th>
                <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('ស្ថានភាព', 'Status')}
                </th>
                <th className="px-4 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('សកម្មភាព', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="tch-table-body bg-white">
              {displayedTeachers?.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-16 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <AcademicCapIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="tch-text-primary font-bold text-gray-600 text-base">
                        {searchTerm
                          ? t('មិនឃើញលទ្ធផលស្វែងរក', 'No search results found')
                          : activeDepartmentObj
                          ? t(`មិនទាន់មានគ្រូបង្រៀនក្នុងដេប៉ាតឺម៉ង់ «${getDepartmentDisplayName(activeDepartmentObj)}» នៅឡើយទេ`, 'No teachers in this department yet')
                          : t('មិនទាន់មានគ្រូបង្រៀននៅឡើយទេ', 'No teachers available yet')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedTeachers?.map((teacher) => {
                  const primaryDeptId = teacher.department_id || teacher.department?.id;
                  const matchedDeptObj = teacher.department || departments.find(d => String(d.id) === String(primaryDeptId));
                  const extraDeptNames = getTeacherDepartmentIds(teacher)
                    .filter((dId) => String(dId) !== String(primaryDeptId))
                    .map((dId) => {
                      const dObj = departments.find((d) => String(d.id) === String(dId));
                      return dObj ? getDepartmentDisplayName(dObj) : null;
                    })
                    .filter(Boolean);

                  const isFemale = isFemaleGender(teacher.gender);
                  const rawAvatar = teacher.profile_image || teacher.user?.profile_image;
                  const avatarUrl = getProfileImageUrl(rawAvatar);
                  const avatarKey = `tch_${teacher.id}`;
                  const hasAvatar = Boolean(avatarUrl && !failedAvatars[avatarKey]);
                  const isActive = String(teacher.user?.status || teacher.status || 'active').toLowerCase() === 'active';
                  const isEmailRevealed = Boolean(revealedEmails[teacher.id]);

                  return (
                    <tr key={teacher.id} className="tch-table-row hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold overflow-hidden shrink-0 shadow-sm">
                            {hasAvatar ? (
                              <img 
                                src={avatarUrl} 
                                alt="Profile" 
                                className="h-full w-full object-cover rounded-full"
                                onError={() =>
                                  setFailedAvatars((prev) => ({
                                    ...prev,
                                    [avatarKey]: true,
                                  }))
                                }
                              />
                            ) : (
                              <span>{teacher.first_name?.[0] || ''}{teacher.last_name?.[0] || ''}</span>
                            )}
                          </div>
                          <div className="ml-3">
                            <div className="tch-text-primary text-sm font-extrabold text-gray-900">
                              {getTeacherFullName(teacher)}
                            </div>
                            {/* ✅ បង្ហាញផ្លាកភេទ (ប្រុស/ស្រី) អមជាមួយឯកទេស (specialization) នៅខាងក្រោមឈ្មោះគ្រូ */}
                            <div className="flex items-center gap-1.5 mt-1">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                  isFemale
                                    ? 'tch-badge-rose bg-rose-50 text-rose-600 border-rose-200'
                                    : 'tch-badge-blue bg-blue-50 text-blue-600 border-blue-200'
                                }`}
                              >
                                {getGenderLabel(teacher.gender)}
                              </span>
                              <span className="tch-text-secondary text-xs text-gray-400 font-bold">&bull;</span>
                              <span className="tch-text-secondary text-xs text-gray-500 font-medium">
                                {teacher.specialization || t('មិនទាន់កំណត់ឯកទេស', 'No Specialization')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="tch-text-secondary px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-600">
                        {teacher.teacher_code || '—'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="tch-badge-indigo inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {getEmploymentTypeLabel(teacher.employment_type)}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="tch-text-secondary text-sm font-medium text-gray-600 flex items-center gap-1.5">
                          <span className="font-mono tracking-tight">
                            {isEmailRevealed ? teacher.email : maskEmailAddress(teacher.email)}
                          </span>
                          {teacher.email && (
                            <button
                              type="button"
                              onClick={() => toggleEmailVisibility(teacher.id)}
                              title={isEmailRevealed ? t('លាក់អ៊ីមែល', 'Hide email') : t('បង្ហាញអ៊ីមែលពេញ', 'Show full email')}
                              className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-gray-100/80 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                            >
                              {isEmailRevealed ? (
                                <EyeSlashIcon className="w-4 h-4" />
                              ) : (
                                <EyeIcon className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                        {teacher.phone && (
                          <div className="tch-text-secondary text-xs text-gray-400 font-medium mt-0.5">
                            {teacher.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="tch-text-secondary text-sm font-medium text-gray-600">
                          {getDepartmentDisplayName(matchedDeptObj)}
                        </div>
                        {extraDeptNames.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {extraDeptNames.map((dName, idx) => (
                              <span
                                key={idx}
                                className="tch-badge-indigo inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-50 text-indigo-600 border border-indigo-200"
                              >
                                + {dName}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold border ${
                          isActive
                            ? 'tch-badge-emerald bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : 'tch-badge-rose bg-rose-50 text-rose-700 border-rose-100'
                        }`}>
                          {isActive ? t('សកម្ម', 'Active') : t('អសកម្ម', 'Inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => openEditModal(teacher)}
                            className="tch-action-edit p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-xl transition-all cursor-pointer"
                            title={t('កែប្រែ', 'Edit')}
                          >
                            <PencilSquareIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(teacher)}
                            className="tch-action-delete p-2 text-rose-600 hover:text-rose-900 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition-all cursor-pointer"
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

        {/* ---------------------------------------------------------------- */}
        {/* 7.5. របារប្តូរទំព័រ (Sliding Window Pagination)                   */}
        {/* ---------------------------------------------------------------- */}
        {meta.last_page > 1 && (
          <div className="tch-pagination-bar px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
            <p className="tch-text-secondary text-xs font-bold text-gray-600">
              {t('ទំព័រ', 'Page')} {meta.current_page} / {meta.last_page} ({displayedTeachers.length} {t('នាក់', 'total')})
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={meta.current_page === 1}
                className="tch-page-btn px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
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
                      : 'tch-page-btn bg-white border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(meta.last_page, p + 1))}
                disabled={meta.current_page === meta.last_page}
                className="tch-page-btn px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {t('បន្ទាប់', 'Next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 7.6. ផ្ទាំង Modal សម្រាប់បន្ថែម ឬកែប្រែព័ត៌មានគ្រូបង្រៀន               */}
      {/* ------------------------------------------------------------------ */}
      {showModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="tch-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            <div className="tch-modal-bar flex justify-between items-center p-6 sm:p-8 border-b border-gray-100">
              <div>
                <h2 className="tch-text-primary text-xl font-extrabold text-gray-900 flex items-center gap-2">
                  <span className="tch-badge-indigo bg-indigo-100 text-indigo-600 p-2.5 rounded-xl border border-indigo-200">
                    <AcademicCapIcon className="h-6 w-6" />
                  </span>
                  {editingTeacher ? t('កែប្រែគ្រូបង្រៀន', 'Edit Teacher') : t('បន្ថែមគ្រូបង្រៀនថ្មី', 'Add New Teacher')}
                </h2>
                {!editingTeacher && activeDepartmentObj && (
                  <p className="tch-text-secondary text-xs text-gray-500 font-bold mt-1 ml-12">
                    {t('ដេប៉ាតឺម៉ង់៖', 'Department:')}{' '}
                    <span className="text-indigo-600 dark:text-indigo-400">
                      {getDepartmentDisplayName(activeDepartmentObj)}
                    </span>
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowModal(false); setFormError(''); }}
                className="tch-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 sm:p-8 overflow-y-auto flex-1">
              <form id="teacherForm" onSubmit={handleSubmit} className="space-y-5">
                {formError && (
                  <div className="tch-warning-box p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-600">
                    <ExclamationCircleIcon className="h-5 w-5 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold leading-relaxed">{formError}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="tch-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('នាមខ្លួន', 'First Name')} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="first_name"
                      required
                      value={formData.first_name}
                      onChange={handleInputChange}
                      className="tch-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="tch-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('នាមត្រកូល', 'Last Name')} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="last_name"
                      required
                      value={formData.last_name}
                      onChange={handleInputChange}
                      className="tch-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="tch-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('អ៊ីមែល', 'Email')} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      className="tch-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="tch-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('លេខទូរស័ព្ទ', 'Phone Number')}
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="tch-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                      placeholder=""
                    />
                  </div>

                  <div>
                    <label className="tch-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('អត្តលេខគ្រូ', 'Teacher Code')}
                    </label>
                    <input
                      type="text"
                      name="teacher_code"
                      value={formData.teacher_code}
                      onChange={handleInputChange}
                      className="tch-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                      placeholder=""
                    />
                  </div>
                  <div>
                    <label className="tch-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ភេទ', 'Gender')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="gender"
                      required
                      value={formData.gender}
                      onChange={handleInputChange}
                      className="tch-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white"
                    >
                      <option value="" disabled>{t('ជ្រើសរើសភេទ', 'Select Gender')}</option>
                      <option value="Male">{t('ប្រុស', 'Male')}</option>
                      <option value="Female">{t('ស្រី', 'Female')}</option>
                      <option value="Other">{t('ផ្សេងៗ', 'Other')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="tch-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ថ្ងៃខែឆ្នាំកំណើត', 'Date of Birth')}
                    </label>
                    <input
                      type="date"
                      name="date_of_birth"
                      value={formData.date_of_birth}
                      onChange={handleInputChange}
                      className="tch-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                    />
                  </div>

                  {/* ✅ បិទកន្លែងដេប៉ាតឺម៉ង់ទាំងពេលបន្ថែមគ្រូបង្រៀនថ្មី និងពេលកែប្រែ (Edit) */}
                  <div>
                    <label className="tch-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ដេប៉ាតឺម៉ង់', 'Department')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="department_id"
                      required
                      disabled={Boolean(editingTeacher) || selectedDepartment !== 'all'}
                      value={formData.department_id}
                      onChange={handleInputChange}
                      className={`tch-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white ${
                        Boolean(editingTeacher) || selectedDepartment !== 'all' ? 'opacity-80 cursor-not-allowed bg-gray-100 font-bold text-indigo-900' : ''
                      }`}
                    >
                      <option value="" disabled>{t('ជ្រើសរើសដេប៉ាតឺម៉ង់', 'Select Department')}</option>
                      {departments?.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {getDepartmentDisplayName(dept)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="tch-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ឯកទេស', 'Specialization')}
                    </label>
                    <input
                      type="text"
                      name="specialization"
                      value={formData.specialization}
                      onChange={handleInputChange}
                      className="tch-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                      placeholder=""
                    />
                  </div>

                  <div>
                    <label className="tch-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ប្រភេទការងារ', 'Employment Type')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="employment_type"
                      required
                      value={formData.employment_type}
                      onChange={handleInputChange}
                      className="tch-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white"
                    >
                      <option value="" disabled>{t('ជ្រើសរើសប្រភេទការងារ', 'Select Employment Type')}</option>
                      <option value="Full-time">{t('ពេញម៉ោង', 'Full-time')}</option>
                      <option value="Part-time">{t('ក្រៅម៉ោង', 'Part-time')}</option>
                      <option value="Contract">{t('កិច្ចសន្យា', 'Contract')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="tch-label block text-sm font-bold text-gray-700 mb-1.5">
                      {editingTeacher ? t('ពាក្យសម្ងាត់ (ទុកឲ្យទទេ ដើម្បីរក្សាដដែល)', 'Password (Leave blank to keep)') : t('ពាក្យសម្ងាត់', 'Password')} {!editingTeacher && <span className="text-rose-500">*</span>}
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswordInput ? 'text' : 'password'}
                        name="password"
                        required={!editingTeacher}
                        value={formData.password}
                        onChange={handleInputChange}
                        className="tch-input w-full pl-4 pr-11 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordInput((prev) => !prev)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors cursor-pointer"
                        title={showPasswordInput ? t('លាក់ពាក្យសម្ងាត់', 'Hide password') : t('បង្ហាញពាក្យសម្ងាត់', 'Show password')}
                      >
                        {showPasswordInput ? (
                          <EyeSlashIcon className="h-5 w-5" />
                        ) : (
                          <EyeIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="tch-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ស្ថានភាព', 'Status')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="status"
                      required
                      value={formData.status}
                      onChange={handleInputChange}
                      className="tch-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white"
                    >
                      <option value="" disabled>{t('ជ្រើសរើសស្ថានភាព', 'Select Status')}</option>
                      <option value="active">{t('សកម្ម', 'Active')}</option>
                      <option value="inactive">{t('អសកម្ម', 'Inactive')}</option>
                    </select>
                  </div>
                </div>
              </form>
            </div>
              
            <div className="tch-modal-bar p-6 sm:p-8 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50 shrink-0">
              <button
                type="button"
                onClick={() => { setShowModal(false); setFormError(''); }}
                className="tch-cancel-btn px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                type="submit"
                form="teacherForm"
                disabled={isSubmitting}
                className="px-6 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                ) : (
                  <AcademicCapIcon className="h-5 w-5" />
                )}
                {editingTeacher ? t('រក្សាទុកការកែប្រែ', 'Save Changes') : t('បង្កើតគ្រូបង្រៀន', 'Create Teacher')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 7.7. ផ្ទាំង Modal សម្រាប់នាំចូលទិន្នន័យគ្រូបង្រៀនពី Excel               */}
      {/* ------------------------------------------------------------------ */}
      {showImportModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="tch-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            <div className="tch-modal-bar flex justify-between items-center p-5 border-b border-gray-100">
              <div>
                <h2 className="tch-text-primary text-lg font-extrabold text-gray-900 flex items-center gap-2">
                  <span className="tch-badge-emerald bg-emerald-100 text-emerald-600 p-2 rounded-xl border border-emerald-200">
                    <DocumentIcon className="h-5 w-5" />
                  </span>
                  {t('នាំចូលទិន្នន័យគ្រូបង្រៀនពី Excel', 'Import Teachers from Excel')}
                </h2>
                {activeDepartmentObj && (
                  <p className="tch-text-secondary text-xs text-gray-500 font-bold mt-1 ml-11">
                    {t('ដេប៉ាតឺម៉ង់គោលដៅ៖', 'Target Department:')}{' '}
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {getDepartmentDisplayName(activeDepartmentObj)}
                    </span>
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportPreview([]);
                  setSelectedFileName('');
                  setImportError('');
                }}
                className="tch-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              {importError && (
                <div className="tch-warning-box p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-600">
                  <ExclamationCircleIcon className="h-5 w-5 shrink-0 mt-0.5" />
                  <p className="text-xs font-bold leading-relaxed">{importError}</p>
                </div>
              )}

              <div className="tch-import-info bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="tch-import-title font-extrabold text-emerald-900 text-sm">{t('ណែនាំសម្រាប់ការនាំចូល៖', 'Import Instructions:')}</h4>
                  <p className="tch-import-desc text-xs font-medium text-emerald-700 mt-1">
                    {activeDepartmentObj
                      ? t(`គ្រូបង្រៀនទាំងអស់ក្នុងឯកសារនេះ នឹងត្រូវដាក់បញ្ចូលទៅក្នុងដេប៉ាតឺម៉ង់ «${getDepartmentDisplayName(activeDepartmentObj)}» ដោយស្វ័យប្រវត្តិ។`, `All teachers in this file will be automatically assigned to "${getDepartmentDisplayName(activeDepartmentObj)}".`)
                      : t('សូមទាញយកទម្រង់គំរូ Excel ហើយបំពេញព័ត៌មានឱ្យបានត្រឹមត្រូវ។', 'Please download the template and fill in correctly.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="tch-template-btn inline-flex items-center px-4 py-2 bg-white border border-emerald-300 text-emerald-800 text-xs font-bold rounded-lg hover:bg-emerald-100 transition-all shrink-0 shadow-sm cursor-pointer"
                >
                  <DocumentIcon className="h-4 w-4 mr-1.5 text-emerald-600" />
                  {t('ទាញយកគំរូ', 'Template')}
                </button>
              </div>

              <div>
                <label className="tch-label block text-sm font-bold text-gray-700 mb-2">
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
                  
                  <div className={`tch-dropzone border-2 border-dashed rounded-xl py-6 px-4 flex flex-col items-center justify-center text-center transition-all duration-300 shadow-sm ${selectedFileName ? 'border-emerald-500 bg-emerald-50' : 'border-emerald-300 bg-emerald-50/40 group-hover:bg-emerald-50 group-hover:border-emerald-500 group-hover:shadow-md'}`}>
                    {selectedFileName ? (
                      <>
                        <div className="p-2.5 bg-emerald-500 rounded-full mb-3 shadow-sm border border-emerald-600">
                          <DocumentTextIcon className="h-6 w-6 text-white" />
                        </div>
                        <h3 className="tch-import-title text-sm font-extrabold text-emerald-900 mb-1.5">{selectedFileName}</h3>
                        <p className="tch-import-desc text-xs text-emerald-600 font-medium">{t('ចុចដើម្បីផ្លាស់ប្តូរឯកសារ', 'Click to change file')}</p>
                      </>
                    ) : (
                      <>
                        <div className="tch-badge-emerald p-2.5 bg-emerald-100 rounded-full mb-3 group-hover:scale-110 transition-transform duration-300 shadow-sm border border-emerald-200">
                          <DocumentIcon className="h-6 w-6 text-emerald-600" />
                        </div>
                        <h3 className="tch-import-title text-sm font-extrabold text-emerald-900 mb-1.5">
                          {t('ចុចទីនេះ ឬទាញឯកសារទម្លាក់ទីនេះ', 'Click to upload or drag and drop')}
                        </h3>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {importPreview.length > 0 && importPreview.some(r => !r.isValid) && (
                <div className="tch-warning-box mt-4 p-4 bg-rose-50/50 border border-rose-200 rounded-xl flex items-center justify-between gap-4 animate-fadeIn">
                  <div>
                    <p className="tch-text-primary text-sm font-bold text-gray-800">
                      {t('មានទិន្នន័យខុសក្នុងបញ្ជី', 'Errors in Parsed Data')}
                    </p>
                    <p className="tch-text-secondary text-xs text-gray-500">
                      {importPreview.length} {t('ជួរ', 'rows')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="tch-badge-emerald bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-transparent">
                      <CheckCircleIcon className="h-4 w-4" />
                      {importPreview.filter(r => r.isValid).length} {t('ត្រឹមត្រូវ', 'Valid')}
                    </span>
                    <span
                      className="tch-badge-rose bg-rose-100 text-rose-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-transparent"
                      title={importPreview.filter(r => !r.isValid).map(r => `ជួរទី ${r.rowIndex}: ${r.errors[0]}`).join('\n')}
                    >
                      <ExclamationCircleIcon className="h-4 w-4" />
                      {importPreview.filter(r => !r.isValid).length} {t('មានកំហុស', 'Error')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="tch-modal-bar p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportPreview([]);
                  setSelectedFileName('');
                  setImportError('');
                }}
                className="tch-cancel-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
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
      {/* 7.8. ផ្ទាំង Modal បញ្ជាក់ការលុបគណនីគ្រូបង្រៀន                         */}
      {/* ------------------------------------------------------------------ */}
      {showDeleteModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="tch-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fadeIn border border-transparent">
            <div className="tch-delete-title flex items-center text-rose-600 mb-5">
              <div className="tch-badge-rose p-2 bg-rose-100 rounded-full mr-3 border border-rose-200">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-extrabold">{t('បញ្ជាក់ការលុប', 'Confirm Deletion')}</h3>
            </div>
            <p className="tch-text-secondary text-sm font-medium text-gray-600 mb-6 leading-relaxed">
              {t('តើលោកអ្នកប្រាកដជាចង់លុបគណនីគ្រូបង្រៀនឈ្មោះ', 'Are you sure you want to delete teacher')} «<span className="tch-text-primary font-extrabold text-gray-900">{getTeacherFullName(teacherToDelete)}</span>» {t('នេះមែនទេ?', 'this teacher?')}
              <br /><br />
              <span className="tch-warning-box text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100 block">
                {t('* ទិន្នន័យ និងប្រវត្តិរបស់គ្រូបង្រៀននេះអាចនឹងបាត់បង់ពីប្រព័ន្ធ។', '* Data and history of this teacher may be lost from the system.')}
              </span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setTeacherToDelete(null);
                }}
                disabled={isDeleting}
                className="tch-cancel-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer disabled:opacity-50"
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

      {/* ==================================================================== */}
      {/* 📌 ផ្នែកទី៨៖ CSS សម្រាប់កំណត់ពណ៌ទម្រង់យប់ (Dark Mode Styling)          */}
      {/* ==================================================================== */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* ✅ បន្ទាត់ខណ្ឌចែកជួរក្នុងតារាងពេលថ្ងៃ (Light mode subtle row dividers) */
        .tch-table-row + .tch-table-row > td {
          border-top: 1px solid #f1f5f9;
        }

        html.dark .tch-page-bg {
          background-color: transparent !important;
        }
        html.dark .tch-surface-card,
        html.dark .tch-dept-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .tch-dept-card:hover {
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
        html.dark .tch-label {
          color: #cbd5e1 !important;
        }

        /* ប៊ូតុងព្រួញអូសកាតដេប៉ាតឺម៉ង់ */
        html.dark .tch-scroll-arrow {
          background-color: rgba(30, 41, 59, 0.9) !important;
          border-color: #475569 !important;
          color: #e2e8f0 !important;
        }
        html.dark .tch-scroll-arrow:hover {
          background-color: #2563eb !important;
          border-color: #3b82f6 !important;
          color: #ffffff !important;
        }

        /* ប្រអប់ Icon លើកាតដេប៉ាតឺម៉ង់ក្នុងទម្រង់យប់ */
        html.dark .tch-dept-blue { background-color: rgba(59, 130, 246, 0.15) !important; color: #60a5fa !important; border-color: rgba(59, 130, 246, 0.3) !important; }
        html.dark .tch-dept-emerald { background-color: rgba(16, 185, 129, 0.15) !important; color: #34d399 !important; border-color: rgba(16, 185, 129, 0.3) !important; }
        html.dark .tch-dept-indigo { background-color: rgba(99, 102, 241, 0.15) !important; color: #818cf8 !important; border-color: rgba(99, 102, 241, 0.3) !important; }
        html.dark .tch-dept-amber { background-color: rgba(245, 158, 11, 0.15) !important; color: #fbbf24 !important; border-color: rgba(245, 158, 11, 0.3) !important; }
        html.dark .tch-dept-rose { background-color: rgba(244, 63, 94, 0.15) !important; color: #fb7185 !important; border-color: rgba(244, 63, 94, 0.3) !important; }
        html.dark .tch-dept-purple { background-color: rgba(168, 85, 247, 0.15) !important; color: #c084fc !important; border-color: rgba(168, 85, 247, 0.3) !important; }
        html.dark .tch-dept-cyan { background-color: rgba(6, 182, 212, 0.15) !important; color: #22d3ee !important; border-color: rgba(6, 182, 212, 0.3) !important; }

        /* ប្រអប់ Input និង Select ក្នុងទម្រង់យប់ */
        html.dark .tch-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
          color-scheme: dark;
        }
        html.dark .tch-input::placeholder {
          color: #64748b !important;
        }
        html.dark .tch-input:focus {
          border-color: #6366f1 !important;
          background-color: #0f172a !important;
        }
        html.dark input[type="date"].tch-input::-webkit-calendar-picker-indicator {
          filter: invert(1);
          opacity: 0.6;
        }

        /* ✅ តារាងគ្រូបង្រៀន និងបន្ទាត់ខណ្ឌចែកស្រទន់ស្អាតភ្នែកក្នុងទម្រង់យប់ */
        html.dark .tch-table-head {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .tch-table-head th {
          color: #94a3b8 !important;
        }
        html.dark .tch-table-body {
          background-color: #1e293b !important;
        }
        html.dark .tch-table-row + .tch-table-row > td {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .tch-table-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }
        html.dark .tch-row-error {
          background-color: rgba(244, 63, 94, 0.12) !important;
        }

        /* ផ្លាកសញ្ញា (Badges) ក្នុងទម្រង់យប់ */
        html.dark .tch-badge-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .tch-badge-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          color: #818cf8 !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .tch-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .tch-badge-emerald svg {
          color: #34d399 !important;
        }
        html.dark .tch-badge-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .tch-badge-rose svg {
          color: #fb7185 !important;
        }

        /* ប៊ូតុងសកម្មភាព និង Pagination */
        html.dark .tch-action-edit {
          color: #818cf8 !important;
        }
        html.dark .tch-action-edit:hover {
          background-color: rgba(99, 102, 241, 0.18) !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
          color: #a5b4fc !important;
        }
        html.dark .tch-action-delete {
          color: #fb7185 !important;
        }
        html.dark .tch-action-delete:hover {
          background-color: rgba(244, 63, 94, 0.18) !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
          color: #fda4af !important;
        }
        html.dark .tch-pagination-bar {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
        }
        html.dark .tch-page-btn {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .tch-page-btn:hover:not(:disabled) {
          background-color: #334155 !important;
          color: #ffffff !important;
        }

        /* ផ្ទាំង Modal បន្ថែម/កែប្រែ, Import Excel និងលុប */
        html.dark .tch-modal-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .tch-modal-bar {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
        }
        html.dark .tch-close-btn,
        html.dark .tch-cancel-btn {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .tch-close-btn:hover,
        html.dark .tch-cancel-btn:hover {
          background-color: #334155 !important;
          color: #ffffff !important;
        }

        /* ប្រអប់ Import Excel ក្នុង Modal */
        html.dark .tch-import-info {
          background-color: rgba(16, 185, 129, 0.1) !important;
          border-color: rgba(16, 185, 129, 0.25) !important;
        }
        html.dark .tch-import-title {
          color: #34d399 !important;
        }
        html.dark .tch-import-desc {
          color: #a7f3d0 !important;
        }
        html.dark .tch-template-btn {
          background-color: #0f172a !important;
          border-color: rgba(16, 185, 129, 0.4) !important;
          color: #34d399 !important;
        }
        html.dark .tch-template-btn:hover {
          background-color: rgba(16, 185, 129, 0.2) !important;
        }
        html.dark .tch-dropzone {
          background-color: rgba(16, 185, 129, 0.06) !important;
          border-color: rgba(16, 185, 129, 0.35) !important;
        }
        html.dark .group:hover .tch-dropzone {
          background-color: rgba(16, 185, 129, 0.12) !important;
          border-color: #10b981 !important;
        }

        /* Modal បញ្ជាក់ការលុប */
        html.dark .tch-delete-title {
          color: #fb7185 !important;
        }
        html.dark .tch-warning-box {
          background-color: rgba(244, 63, 94, 0.12) !important;
          border-color: rgba(244, 63, 94, 0.25) !important;
          color: #fda4af !important;
        }
      `}</style>
    </div>
  );
};

export default ManageTeachers;
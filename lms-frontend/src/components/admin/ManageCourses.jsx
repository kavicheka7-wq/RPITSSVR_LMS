// src/components/admin/ManageCourses.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from '../../services/api';
import { getCachedDepartments, clearCoursesCache } from '../../services/metadataService';
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
  ExclamationTriangleIcon,
  AcademicCapIcon,
  Squares2X2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី ១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនី Admin ម្នាក់ៗ (User-Scoped 0ms Cache)
// ============================================================================
const CACHE_KEY_SHARED_COURSES = 'cached_admin_courses_list';
const CACHE_KEY_LEGACY_COURSES = 'cached_admin_courses_page1';
const CACHE_KEY_LEGACY_META = 'cached_admin_courses_meta';
const CACHE_KEY_SHARED_DEPTS = 'cached_admin_departments_list';
const CACHE_KEY_SHARED_TEACHERS = 'cached_admin_teachers_list';

const getCoursesCacheKey = (uid) => `cached_admin_courses_list_v8_${uid}`;
const getCoursesMetaCacheKey = (uid) => `cached_admin_courses_meta_v8_${uid}`;
const getDeptsCacheKey = (uid) => `cached_admin_departments_list_v8_${uid}`;
const getTeachersCacheKey = (uid) => `cached_admin_teachers_list_v8_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់អ្នកគ្រប់គ្រងម្នាក់ៗ
const ADMIN_COURSES_MEM_CACHE = {
  uid: null,
  courses: null,
  meta: null,
  departments: null,
  teachers: null,
  lastSyncedAt: 0,
  lastTeachersSyncedAt: 0,
};

const readStorageJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// ✅ សម្អាតរូបភាព Base64 ចេញមុនពេលរក្សាទុកក្នុង localStorage ដើម្បីឱ្យលឿន 0ms និងមិនពេញទំហំផ្ទុក
const stripHeavyImages = (list) => {
  if (!Array.isArray(list)) return list;
  return list.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const copy = { ...item };
    if (copy.profile_image && String(copy.profile_image).startsWith('data:')) {
      delete copy.profile_image;
    }
    if (copy.teacher && typeof copy.teacher === 'object') {
      copy.teacher = { ...copy.teacher };
      if (copy.teacher.profile_image && String(copy.teacher.profile_image).startsWith('data:')) {
        delete copy.teacher.profile_image;
      }
    }
    if (copy.teacher_profile && typeof copy.teacher_profile === 'object') {
      copy.teacher_profile = { ...copy.teacher_profile };
      if (copy.teacher_profile.profile_image && String(copy.teacher_profile.profile_image).startsWith('data:')) {
        delete copy.teacher_profile.profile_image;
      }
    }
    return copy;
  });
};

const safeWriteStorage = (key, value) => {
  try {
    const cleanVal = Array.isArray(value) ? stripHeavyImages(value) : value;
    localStorage.setItem(key, JSON.stringify(cleanVal));
  } catch {}
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

const DEPT_CARD_THEMES = [
  { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', darkClass: 'crs-dept-emerald' },
  { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', darkClass: 'crs-dept-indigo' },
  { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', darkClass: 'crs-dept-amber' },
  { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', darkClass: 'crs-dept-rose' },
  { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100', darkClass: 'crs-dept-purple' },
  { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-100', darkClass: 'crs-dept-cyan' },
];

const getDepartmentDisplayName = (deptObjOrName) => {
  if (!deptObjOrName) return '—';
  const rawName = typeof deptObjOrName === 'string'
    ? deptObjOrName
    : (deptObjOrName.department_name || deptObjOrName.name || '');
  return rawName || '—';
};

const getTeacherFullName = (teacher) => {
  if (!teacher) return '';
  return `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim();
};

// ✅ ផ្គូផ្គងគ្រូបង្រៀនពីមុខវិជ្ជា ទោះបីជា course.teacher_id រក្សាទុកជា teachers.id ឬ users.id ក៏ដោយ
const resolveCourseTeacher = (course, teachersList = []) => {
  if (!course) return null;
  if (course.teacher_profile && (course.teacher_profile.first_name || course.teacher_profile.last_name)) {
    return course.teacher_profile;
  }
  if (course.teacher && (course.teacher.first_name || course.teacher.last_name)) {
    return course.teacher;
  }
  const rawTid = course.teacher_id || course.teacher?.id || course.teacher?.user_id;
  if (rawTid && Array.isArray(teachersList) && teachersList.length > 0) {
    const found = teachersList.find(
      (tItem) =>
        String(tItem.id) === String(rawTid) ||
        (tItem.user_id && String(tItem.user_id) === String(rawTid))
    );
    if (found) return found;
  }
  return null;
};

// ✅ តម្រៀបមុខវិជ្ជាដែលមានឈ្មោះមុន (លេខកូដតូច ឬ ID តូច) ឱ្យនៅខាងលើគេដេញចុះមកក្រោម
const sortCoursesOldestFirst = (list) => {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const codeA = (a.course_code || '').toString().trim();
    const codeB = (b.course_code || '').toString().trim();
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
// 📌 ផ្នែកទី ២៖ COMPONENT គោលសម្រាប់គ្រប់គ្រងមុខវិជ្ជា (ManageCourses)
// ============================================================================
const ManageCourses = () => {
  const { t } = useLanguage();
  const { user } = useAuth();

  // ✅ កំណត់អត្តសញ្ញាណ Admin បច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentAdminId = useMemo(() => resolveAdminUid(user), [user]);

  if (
    ADMIN_COURSES_MEM_CACHE.uid &&
    ADMIN_COURSES_MEM_CACHE.uid !== currentAdminId
  ) {
    ADMIN_COURSES_MEM_CACHE.courses = null;
    ADMIN_COURSES_MEM_CACHE.meta = null;
    ADMIN_COURSES_MEM_CACHE.departments = null;
    ADMIN_COURSES_MEM_CACHE.teachers = null;
    ADMIN_COURSES_MEM_CACHE.lastSyncedAt = 0;
    ADMIN_COURSES_MEM_CACHE.lastTeachersSyncedAt = 0;
  }
  ADMIN_COURSES_MEM_CACHE.uid = currentAdminId;

  // ✅ ១. អានទិន្នន័យពី Cache មកបង្ហាញភ្លាមៗក្នុង 0 វិនាទី (គ្មាន Skeleton Loading)
  const [courses, setCourses] = useState(() => {
    if (Array.isArray(ADMIN_COURSES_MEM_CACHE.courses)) {
      return ADMIN_COURSES_MEM_CACHE.courses;
    }
    const cached =
      readStorageJson(getCoursesCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_COURSES, null) ||
      readStorageJson(CACHE_KEY_LEGACY_COURSES, []);
    if (Array.isArray(cached)) {
      ADMIN_COURSES_MEM_CACHE.courses = cached;
      return cached;
    }
    return [];
  });

  const [departments, setDepartments] = useState(() => {
    if (Array.isArray(ADMIN_COURSES_MEM_CACHE.departments)) {
      return ADMIN_COURSES_MEM_CACHE.departments;
    }
    const cached =
      readStorageJson(getDeptsCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_DEPTS, []);
    if (Array.isArray(cached)) {
      ADMIN_COURSES_MEM_CACHE.departments = cached;
      return cached;
    }
    return [];
  });

  const [teachers, setTeachers] = useState(() => {
    if (Array.isArray(ADMIN_COURSES_MEM_CACHE.teachers)) {
      return ADMIN_COURSES_MEM_CACHE.teachers;
    }
    const cached =
      readStorageJson(getTeachersCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_SHARED_TEACHERS, []);
    if (Array.isArray(cached)) {
      ADMIN_COURSES_MEM_CACHE.teachers = cached;
      return cached;
    }
    return [];
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError, setFormError] = useState('');
  const [importError, setImportError] = useState('');

  // State និង Ref សម្រាប់កាតដេប៉ាតឺម៉ង់ខាងលើ
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const cardsScrollRef = useRef(null);
  const [isDraggingCards, setIsDraggingCards] = useState(false);
  const dragStartXRef = useRef(0);
  const scrollLeftStartRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const prevCountsRef = useRef({ all: 0 });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  const abortControllerRef = useRef(null);

  const [page, setPage] = useState(1);
  const [perPage] = useState(200);
  const [meta, setMeta] = useState(() => {
    if (ADMIN_COURSES_MEM_CACHE.meta) return ADMIN_COURSES_MEM_CACHE.meta;
    const cached =
      readStorageJson(getCoursesMetaCacheKey(currentAdminId), null) ||
      readStorageJson(CACHE_KEY_LEGACY_META, null);
    if (cached) {
      ADMIN_COURSES_MEM_CACHE.meta = cached;
      return cached;
    }
    return {
      current_page: 1,
      last_page: 1,
      total: courses.length,
      per_page: 200,
    };
  });
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState(null);

  // State សម្រាប់នាំចូលមុខវិជ្ជាពី Excel
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('');

  // ✅ កំណត់ credit: '' នៅពេលដំបូង ដើម្បីឱ្យលោតពាក្យ «ជ្រើសរើសក្រេឌីត»
  const [formData, setFormData] = useState({
    course_code: '',
    course_name: '',
    credit: '',
    description: '',
    department_id: '',
    teacher_id: '',
  });

  // ============================================================================
  // 📌 ផ្នែកទី ៣៖ ការគណនាចំនួនមុខវិជ្ជាតាមដេប៉ាតឺម៉ង់ និងការច្រោះទិន្នន័យ
  // ============================================================================

  const departmentCounts = useMemo(() => {
    if (debouncedSearch.trim() !== '') {
      return prevCountsRef.current;
    }

    const list = Array.isArray(courses) ? courses : [];
    const counts = { all: list.length };
    departments.forEach((dept) => { counts[dept.id] = 0; });
    list.forEach((course) => {
      const deptId = course.department_id || course.department?.id;
      if (deptId !== undefined && deptId !== null) {
        counts[deptId] = (counts[deptId] || 0) + 1;
      }
    });

    prevCountsRef.current = counts;
    return counts;
  }, [courses, departments, debouncedSearch]);

  const displayedCourses = useMemo(() => {
    const filteredByDept = selectedDepartment === 'all'
      ? (courses || [])
      : (courses || []).filter((course) => String(course.department_id || course.department?.id) === String(selectedDepartment));

    if (!searchTerm.trim()) return filteredByDept;
    const q = searchTerm.toLowerCase().trim();
    return filteredByDept.filter((course) => {
      const courseName = course.course_name?.toLowerCase() || '';
      const courseCode = course.course_code?.toLowerCase() || '';
      const matchedDeptObj = course.department || departments.find(d => String(d.id) === String(course.department_id));
      const deptName = getDepartmentDisplayName(matchedDeptObj).toLowerCase();
      const matchedTeacher = resolveCourseTeacher(course, teachers);
      const teacherName = matchedTeacher ? getTeacherFullName(matchedTeacher).toLowerCase() : '';

      return (
        courseName.includes(q) ||
        courseCode.includes(q) ||
        deptName.includes(q) ||
        teacherName.includes(q)
      );
    });
  }, [courses, departments, teachers, selectedDepartment, searchTerm]);

  const activeDepartmentObj = useMemo(() => {
    if (selectedDepartment === 'all') return null;
    return departments.find((d) => String(d.id) === String(selectedDepartment)) || null;
  }, [selectedDepartment, departments]);

  // ✅ ច្រោះគ្រូបង្រៀនតាមដេប៉ាតឺម៉ង់ និងរក្សាទុកគ្រូបច្ចុប្បន្នជានិច្ចពេលកែប្រែ (Edit Mode)
  const availableTeachersForModal = useMemo(() => {
    if (!formData.department_id) return teachers;
    const deptTeachers = teachers.filter(
      (tItem) =>
        String(tItem.department_id || tItem.department?.id) ===
          String(formData.department_id) ||
        (formData.teacher_id &&
          (String(tItem.id) === String(formData.teacher_id) ||
            (tItem.user_id && String(tItem.user_id) === String(formData.teacher_id))))
    );
    return deptTeachers.length > 0 ? deptTeachers : teachers;
  }, [teachers, formData.department_id, formData.teacher_id]);

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
  // 📌 ផ្នែកទី ៤៖ មុខងារត្រួតពិនិត្យប៊ូតុងព្រួញអូសឆ្វេង-ស្ដាំលើកាតដេប៉ាតឺម៉ង់
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
  // 📌 ផ្នែកទី ៥៖ ការទាញទិន្នន័យពី BACKEND API ដោយមិនរាំងស្ទះ UI (Non-Blocking 0ms Sync)
  // ============================================================================

  useEffect(() => {
    if (!searchTerm.trim()) {
      setDebouncedSearch('');
      setPage(1);
      if (Array.isArray(ADMIN_COURSES_MEM_CACHE.courses)) {
        setCourses(ADMIN_COURSES_MEM_CACHE.courses);
        if (ADMIN_COURSES_MEM_CACHE.meta) {
          setMeta(ADMIN_COURSES_MEM_CACHE.meta);
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
        ADMIN_COURSES_MEM_CACHE.departments = data;
        safeWriteStorage(getDeptsCacheKey(currentAdminId), data);
        safeWriteStorage(CACHE_KEY_SHARED_DEPTS, data);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  }, [currentAdminId]);

  const fetchTeachers = useCallback(async (force = false) => {
    const now = Date.now();
    if (
      !force &&
      Array.isArray(ADMIN_COURSES_MEM_CACHE.teachers) &&
      ADMIN_COURSES_MEM_CACHE.teachers.length > 0 &&
      now - ADMIN_COURSES_MEM_CACHE.lastTeachersSyncedAt < 60000
    ) {
      return;
    }

    try {
      const response = await api.get('/admin/teachers', { params: { per_page: 200 } });
      const teachersData = response.data?.data?.data || response.data?.data || response.data || [];
      if (Array.isArray(teachersData)) {
        const lightTeachers = stripHeavyImages(teachersData);
        setTeachers(lightTeachers);
        ADMIN_COURSES_MEM_CACHE.teachers = lightTeachers;
        ADMIN_COURSES_MEM_CACHE.lastTeachersSyncedAt = Date.now();
        safeWriteStorage(getTeachersCacheKey(currentAdminId), lightTeachers);
        safeWriteStorage(CACHE_KEY_SHARED_TEACHERS, lightTeachers);
      }
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  }, [currentAdminId]);

  useEffect(() => {
    fetchDepartments();
    // ✅ ប្រសិនបើមានបញ្ជីគ្រូបង្រៀនក្នុង Cache រួចហើយ ពន្យារពេល 300ms សិន ដើម្បីទុកផ្លូវឱ្យ API /admin/courses ទាញមកដល់មុនក្នុង 0ms!
    if (Array.isArray(ADMIN_COURSES_MEM_CACHE.teachers) && ADMIN_COURSES_MEM_CACHE.teachers.length > 0) {
      const t = setTimeout(() => fetchTeachers(false), 300);
      return () => clearTimeout(t);
    } else {
      fetchTeachers(false);
    }
  }, [fetchDepartments, fetchTeachers]);

  const fetchCourses = useCallback(
    async (forceRefresh = false) => {
      if (page === 1 && !debouncedSearch && !forceRefresh) {
        const cachedList = readStorageJson(getCoursesCacheKey(currentAdminId), null);
        if (Array.isArray(cachedList) && cachedList.length > 0) {
          setCourses(cachedList);
          ADMIN_COURSES_MEM_CACHE.courses = cachedList;
        }
        const now = Date.now();
        if (
          ADMIN_COURSES_MEM_CACHE.uid === currentAdminId &&
          Array.isArray(ADMIN_COURSES_MEM_CACHE.courses) &&
          ADMIN_COURSES_MEM_CACHE.courses.length > 0 &&
          now - ADMIN_COURSES_MEM_CACHE.lastSyncedAt < 25000
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
        const response = await api.get('/admin/courses', {
          params: {
            page,
            per_page: perPage,
            search: debouncedSearch,
          },
          signal: controller.signal,
        });
        const data = response.data?.data || response.data || [];

        let fetchedCourses = [];
        let newMeta = { current_page: 1, last_page: 1, total: 0, per_page: perPage };

        if (data.data && Array.isArray(data.data)) {
          fetchedCourses = data.data;
          newMeta = {
            current_page: data.current_page || 1,
            last_page: data.last_page || 1,
            total: data.total || 0,
            per_page: data.per_page || perPage,
          };
        } else if (Array.isArray(data)) {
          fetchedCourses = data;
          newMeta = {
            current_page: response.data?.meta?.current_page || 1,
            last_page: response.data?.meta?.last_page || 1,
            total: response.data?.meta?.total ?? data.length,
            per_page: response.data?.meta?.per_page || data.length || perPage,
          };
        }

        const lightCourses = stripHeavyImages(fetchedCourses);
        setCourses(lightCourses);
        setMeta(newMeta);

        if (page === 1 && !debouncedSearch) {
          ADMIN_COURSES_MEM_CACHE.uid = currentAdminId;
          ADMIN_COURSES_MEM_CACHE.courses = lightCourses;
          ADMIN_COURSES_MEM_CACHE.meta = newMeta;
          ADMIN_COURSES_MEM_CACHE.lastSyncedAt = Date.now();
          safeWriteStorage(getCoursesCacheKey(currentAdminId), lightCourses);
          safeWriteStorage(CACHE_KEY_SHARED_COURSES, lightCourses);
          safeWriteStorage(getCoursesMetaCacheKey(currentAdminId), newMeta);
        }
      } catch (error) {
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
          return;
        }
        console.error('Error fetching courses:', error);
      }
    },
    [page, perPage, debouncedSearch, currentAdminId]
  );

  useEffect(() => {
    fetchCourses(false);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchCourses]);

  // ✅ ប្រសិនបើប្តូរដេប៉ាតឺម៉ង់ក្នុង Modal ឱ្យសម្អាត teacher_id ចាស់ចេញដើម្បីជ្រើសរើសគ្រូថ្មីឱ្យត្រូវតាមដេប៉ាតឺម៉ង់
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (formError) setFormError('');
    if (name === 'department_id') {
      setFormData(prev => ({ ...prev, department_id: value, teacher_id: '' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // បង្កើត ឬកែប្រែមុខវិជ្ជា ព្រមទាំងបញ្ជូនសារចូលកណ្ដឹងស្វ័យប្រវត្តិ
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');

    const finalDepartmentId = formData.department_id || (selectedDepartment !== 'all' ? selectedDepartment : '');
    const payload = {
      ...formData,
      course_code: formData.course_code.trim(),
      course_name: formData.course_name.trim(),
      credit: Number(formData.credit) || 3,
      department_id: finalDepartmentId,
      description: formData.description ? formData.description.trim() : '',
    };

    if (!payload.course_name || !payload.course_code || !payload.department_id || !payload.teacher_id) {
      setFormError(t('សូមបំពេញព័ត៌មានចាំបាច់ទាំងអស់ឱ្យបានគ្រប់គ្រាន់!', 'Please fill in all required fields!'));
      return;
    }

    const matchedDept = departments.find(d => String(d.id) === String(payload.department_id));
    const matchedTeacher = teachers.find(
      (tItem) =>
        String(tItem.id) === String(payload.teacher_id) ||
        (tItem.user_id && String(tItem.user_id) === String(payload.teacher_id))
    );

    setIsSubmitting(true);
    try {
      if (editingCourse) {
        const response = await api.put(`/admin/courses/${editingCourse.id}`, payload);
        const serverData = response.data?.data || response.data;

        const updatedCourse = {
          ...editingCourse,
          ...payload,
          ...(serverData && typeof serverData === 'object' ? serverData : {}),
          department: serverData?.department || matchedDept || editingCourse.department,
          teacher: serverData?.teacher || matchedTeacher || editingCourse.teacher,
        };

        setCourses(prev => {
          const newList = prev.map(c => c.id === editingCourse.id ? updatedCourse : c);
          if (page === 1 && !debouncedSearch) {
            ADMIN_COURSES_MEM_CACHE.courses = newList;
            safeWriteStorage(getCoursesCacheKey(currentAdminId), newList);
            safeWriteStorage(CACHE_KEY_SHARED_COURSES, newList);
          }
          return newList;
        });

        pushLocalNotification({
          titleKm: 'បានកែប្រែមុខវិជ្ជាជោគជ័យ',
          titleEn: 'Course Updated Successfully',
          descKm: `មុខវិជ្ជា «${payload.course_name}» ត្រូវបានធ្វើបច្ចុប្បន្នភាព។`,
          descEn: `Course "${payload.course_name}" has been updated.`,
          category: 'course',
          link: '/courses'
        });
      } else {
        const response = await api.post('/admin/courses', payload);
        const serverData = response.data?.data || response.data;

        const newCourse = {
          ...payload,
          ...(serverData && typeof serverData === 'object' ? serverData : { id: Date.now() }),
          department: serverData?.department || matchedDept || null,
          teacher: serverData?.teacher || matchedTeacher || null,
        };

        setCourses(prev => {
          const newList = [newCourse, ...prev].slice(0, perPage);
          if (page === 1 && !debouncedSearch) {
            ADMIN_COURSES_MEM_CACHE.courses = newList;
            safeWriteStorage(getCoursesCacheKey(currentAdminId), newList);
            safeWriteStorage(CACHE_KEY_SHARED_COURSES, newList);
          }
          return newList;
        });
        setMeta(prev => {
          const newMeta = { ...prev, total: (prev.total || 0) + 1 };
          ADMIN_COURSES_MEM_CACHE.meta = newMeta;
          safeWriteStorage(getCoursesMetaCacheKey(currentAdminId), newMeta);
          return newMeta;
        });

        pushLocalNotification({
          titleKm: 'បានបង្កើតមុខវិជ្ជាថ្មីជោគជ័យ',
          titleEn: 'New Course Created',
          descKm: `មុខវិជ្ជា «${payload.course_name} (${payload.course_code})» ត្រូវបានបង្កើតថ្មី។`,
          descEn: `Course "${payload.course_name} (${payload.course_code})" was created.`,
          category: 'course',
          link: '/courses'
        });
      }
      
      clearCoursesCache();
      setShowModal(false);
      resetForm();
      fetchCourses(true);
    } catch (error) {
      console.error('Submit error:', error.response?.data || error);
      const apiErrors = error.response?.data?.errors;
      const firstValidationMsg = apiErrors
        ? Object.values(apiErrors).flat()[0]
        : null;
      const errMsg =
        firstValidationMsg ||
        error.response?.data?.message ||
        t(
          'មិនអាចរក្សាទុកទិន្នន័យមុខវិជ្ជាបានទេ (លេខកូដមុខវិជ្ជាអាចស្ទួន)!',
          'Could not save course data (course code may already exist)!'
        );
      setFormError(String(errMsg));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (course) => {
    setCourseToDelete(course);
    setShowDeleteModal(true);
  };

  // លុបមុខវិជ្ជា ព្រមទាំងបញ្ជូនសារចូលកណ្ដឹងស្វ័យប្រវត្តិ
  const confirmDelete = async () => {
    if (!courseToDelete || isDeleting) return;

    const deletedId = courseToDelete.id;
    const deletedName = courseToDelete.course_name;
    const previousCourses = [...courses];
    const previousMeta = { ...meta };

    setIsDeleting(true);
    setShowDeleteModal(false);
    setCourseToDelete(null);

    setCourses(prev => {
      const newList = prev.filter(c => c.id !== deletedId);
      if (page === 1 && !debouncedSearch) {
        ADMIN_COURSES_MEM_CACHE.courses = newList;
        safeWriteStorage(getCoursesCacheKey(currentAdminId), newList);
        safeWriteStorage(CACHE_KEY_SHARED_COURSES, newList);
      }
      return newList;
    });
    setMeta(prev => {
      const newMeta = { ...prev, total: Math.max(0, (prev.total || 1) - 1) };
      ADMIN_COURSES_MEM_CACHE.meta = newMeta;
      safeWriteStorage(getCoursesMetaCacheKey(currentAdminId), newMeta);
      return newMeta;
    });

    try {
      await api.delete(`/admin/courses/${deletedId}`);
      clearCoursesCache();
      pushLocalNotification({
        titleKm: 'បានលុបមុខវិជ្ជាចេញពីប្រព័ន្ធ',
        titleEn: 'Course Deleted',
        descKm: `មុខវិជ្ជា «${deletedName}» ត្រូវបានលុបចេញពីប្រព័ន្ធ។`,
        descEn: `Course "${deletedName}" was deleted from the system.`,
        category: 'course',
        link: '/courses'
      });
    } catch (error) {
      console.error('Delete course error:', error);
      setCourses(previousCourses);
      setMeta(previousMeta);
      ADMIN_COURSES_MEM_CACHE.courses = previousCourses;
      ADMIN_COURSES_MEM_CACHE.meta = previousMeta;
    } finally {
      setIsDeleting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      course_code: '',
      course_name: '',
      credit: '',
      description: '',
      department_id: selectedDepartment !== 'all' ? String(selectedDepartment) : '',
      teacher_id: '',
    });
    setEditingCourse(null);
    setFormError('');
  };

  const openCreateModal = () => {
    resetForm();
    if (!teachers || teachers.length === 0) {
      fetchTeachers(true);
    }
    setShowModal(true);
  };

  // ✅ ផ្គូផ្គងគ្រូបង្រៀនឱ្យត្រូវជាមួយ teacher.id នៅក្នុង Dropdown ទោះបីជា course.teacher_id ជា user_id ក៏ដោយ
  const openEditModal = (course) => {
    setFormError('');
    setEditingCourse(course);
    if (!teachers || teachers.length === 0) {
      fetchTeachers(true);
    }
    const matchedTeacher = resolveCourseTeacher(course, teachers);
    const resolvedDropdownTeacherId =
      matchedTeacher?.id || course.teacher_id || course.teacher?.id || '';

    setFormData({
      course_code: course.course_code || '',
      course_name: course.course_name || '',
      credit: course.credit ?? 3,
      description: course.description || '',
      department_id: course.department_id || course.department?.id || '',
      teacher_id: resolvedDropdownTeacherId,
    });
    setShowModal(true);
  };

  // ============================================================================
  // 📌 ផ្នែកទី ៦៖ មុខងារនាំចេញ និងនាំចូលមុខវិជ្ជាតាមរយៈឯកសារ EXCEL (.XLSX)
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

  // ✅ នាំចេញបញ្ជីមុខវិជ្ជាតាមដេប៉ាតឺម៉ង់ ដោយតម្រៀបមុខវិជ្ជាដែលមានឈ្មោះមុនឱ្យនៅខាងលើគេដេញចុះមកក្រោម
  const handleExportExcel = () => {
    if (!displayedCourses || displayedCourses.length === 0) {
      return;
    }

    const currentDeptName = activeDepartmentObj ? getDepartmentDisplayName(activeDepartmentObj) : '';
    const sortedCoursesForExport = sortCoursesOldestFirst(displayedCourses);

    const exportData = sortedCoursesForExport.map((c, idx) => {
      const matchedDeptObj = c.department || departments.find(d => String(d.id) === String(c.department_id)) || activeDepartmentObj;
      const matchedTeacher = resolveCourseTeacher(c, teachers);
      return {
        'ល.រ': idx + 1,
        'កូដមុខវិជ្ជា': c.course_code || '',
        'ឈ្មោះមុខវិជ្ជា': c.course_name || '',
        'ក្រេឌីត': c.credit ?? 3,
        'ដេប៉ាតឺម៉ង់': getDepartmentDisplayName(matchedDeptObj),
        'គ្រូបង្រៀនទទួលបន្ទុក': matchedTeacher ? getTeacherFullName(matchedTeacher) : '—',
        'ការពិពណ៌នា': c.description || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const colWidths = [
      { wch: 8 }, { wch: 16 }, { wch: 32 }, { wch: 12 }, { wch: 26 }, { wch: 24 }, { wch: 36 }
    ];
    applyExcelStyling(worksheet, colWidths, [1]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Courses_List');
    const safeDeptSuffix = currentDeptName ? `_${currentDeptName.replace(/[\\/:*?"<>|\s]+/g, '_')}` : '';
    XLSX.writeFile(workbook, `Courses_List${safeDeptSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);

    pushLocalNotification({
      titleKm: 'បាននាំចេញបញ្ជីមុខវិជ្ជាទៅ Excel',
      titleEn: 'Courses Exported to Excel',
      descKm: `បញ្ជីមុខវិជ្ជា (${currentDeptName || 'ទាំងអស់'}) ចំនួន ${sortedCoursesForExport.length} ត្រូវបានទាញយកជា Excel ជោគជ័យ។`,
      descEn: `${sortedCoursesForExport.length} courses were successfully exported to Excel.`,
      category: 'export',
      link: '/courses'
    });
  };

  // ✅ ទាញយកទម្រង់គំរូ Excel ដោយដាក់ជួរទំនេរចំនួន ៥០ ជួរ (ការពារកំហុសស្ទួនកូដមុខវិជ្ជាចាស់ៗពេល Import)
  const handleDownloadTemplate = () => {
    const defaultDeptName = activeDepartmentObj ? getDepartmentDisplayName(activeDepartmentObj) : '';

    const blankRow = () => ({
      'course_code': '',
      'course_name': '',
      'credit': '3',
      'department': defaultDeptName,
      'teacher': '',
      'description': ''
    });

    const templateData = Array.from({ length: 50 }, () => blankRow());

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const colWidths = [
      { wch: 16 }, { wch: 30 }, { wch: 10 }, { wch: 26 }, { wch: 24 }, { wch: 35 }
    ];
    applyExcelStyling(worksheet, colWidths, [0, 2]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    const safeDeptSuffix = defaultDeptName ? `_${defaultDeptName.replace(/[\\/:*?"<>|\s]+/g, '_')}` : '';
    XLSX.writeFile(workbook, `course_import_template${safeDeptSuffix}.xlsx`);

    pushLocalNotification({
      titleKm: 'បានទាញយកទម្រង់គំរូ Excel មុខវិជ្ជា',
      titleEn: 'Course Excel Template Downloaded',
      descKm: 'ទម្រង់គំរូសម្រាប់នាំចូលទិន្នន័យមុខវិជ្ជាត្រូវបានទាញយកជោគជ័យ។',
      descEn: 'The Excel template for course import was downloaded successfully.',
      category: 'download',
      link: '/courses'
    });
  };

  // ✅ ប្រសិនបើយើងបានចុចចូលកាតដេប៉ាតឺម៉ង់ណាមួយហើយ ពេលនាំចូល Excel វានឹងចាប់យកដេប៉ាតឺម៉ង់នោះឱ្យមុខវិជ្ជាទាំងអស់ដោយស្វ័យប្រវត្តិ
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

  // ✅ ផ្ទៀងផ្ទាត់ឈ្មោះគ្រូបង្រៀនពេល Import Excel
  const findTeacherId = (teacherNameOrEmail) => {
    if (!teacherNameOrEmail || !teacherNameOrEmail.toString().trim()) return null;
    const search = teacherNameOrEmail.toString().trim().toLowerCase();
    const found = teachers.find(tItem => {
      const fullName = `${tItem.first_name || ''} ${tItem.last_name || ''}`.trim().toLowerCase();
      const reverseName = `${tItem.last_name || ''} ${tItem.first_name || ''}`.trim().toLowerCase();
      return (
        fullName === search ||
        reverseName === search ||
        (tItem.email && tItem.email.toLowerCase() === search) ||
        (tItem.teacher_code && tItem.teacher_code.toLowerCase() === search) ||
        (tItem.id && tItem.id.toString() === search) ||
        (tItem.user_id && tItem.user_id.toString() === search)
      );
    });
    return found ? found.id : null;
  };

  const normalizeCourseHeader = (key) => {
    const k = key.toString().trim().toLowerCase();
    if (k.includes('code') || k.includes('កូដ')) return 'course_code';
    if (k.includes('name') || k.includes('ឈ្មោះ') || k.includes('មុខវិជ្ជា')) return 'course_name';
    if (k.includes('credit') || k.includes('ក្រេឌីត')) return 'credit';
    if (k.includes('dept') || k.includes('department') || k.includes('ដេប៉ាតឺម៉ង់') || k.includes('ជំនាញ')) return 'department';
    if (k.includes('teacher') || k.includes('គ្រូ')) return 'teacher';
    if (k.includes('desc') || k.includes('ពិពណ៌នា')) return 'description';
    return key;
  };

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
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

          const nonEmptyRows = rawJson
            .map((row, index) => ({ row, excelRowNumber: index + 2 }))
            .filter(({ row }) => {
              const item = {};
              Object.keys(row).forEach((k) => {
                item[normalizeCourseHeader(k)] = row[k]?.toString().trim();
              });
              return Boolean(item.course_code || item.course_name);
            });

          if (nonEmptyRows.length === 0) {
            setImportPreview([]);
            setImportError(t('រកមិនឃើញទិន្នន័យមុខវិជ្ជាក្នុងឯកសារនេះទេ!', 'No course data found in this file!'));
            return;
          }

          const existingCodes = new Set(courses.map(c => (c.course_code || '').toLowerCase()));
          const fileCodes = new Set();

          const parsedRows = nonEmptyRows.map(({ row, excelRowNumber }) => {
            const item = {};
            Object.keys(row).forEach(k => { item[normalizeCourseHeader(k)] = row[k]?.toString().trim(); });

            const cleanCode = (item.course_code || '').replace(/^'+/, '').trim();
            const errors = [];

            if (!cleanCode) {
              errors.push(t('ខ្វះកូដមុខវិជ្ជា', 'Missing Course Code'));
            } else if (existingCodes.has(cleanCode.toLowerCase())) {
              errors.push(t('កូដមុខវិជ្ជានេះមានក្នុងប្រព័ន្ធរួចហើយ', 'Course code already exists'));
            } else if (fileCodes.has(cleanCode.toLowerCase())) {
              errors.push(t('កូដមុខវិជ្ជាស្ទួនក្នុងឯកសារនេះ', 'Duplicate course code in file'));
            } else {
              fileCodes.add(cleanCode.toLowerCase());
            }

            if (!item.course_name) errors.push(t('ខ្វះឈ្មោះមុខវិជ្ជា', 'Missing Course Name'));

            const deptId = findDepartmentId(item.department);
            const teacherId = findTeacherId(item.teacher);
            if (!deptId) errors.push(t('រកមិនឃើញដេប៉ាតឺម៉ង់', 'Department not found'));
            if (!item.teacher) {
              errors.push(t('ខ្វះឈ្មោះគ្រូបង្រៀន', 'Missing Teacher Name'));
            } else if (!teacherId) {
              errors.push(t('រកមិនឃើញឈ្មោះគ្រូបង្រៀននេះក្នុងប្រព័ន្ធ', 'Teacher not found in system'));
            }

            return {
              rowIndex: excelRowNumber,
              data: {
                course_code: cleanCode,
                course_name: item.course_name || '',
                credit: Number(item.credit) || 3,
                department_id: deptId,
                teacher_id: teacherId,
                description: item.description || ''
              },
              isValid: errors.length === 0,
              errors
            };
          });

          setImportPreview(parsedRows);
        } catch (err) {
          console.error('Course Excel parse error:', err);
          setImportError(t('មិនអាចអានឯកសារ Excel នេះបានទេ!', 'Failed to read Excel file!'));
        } finally {
          e.target.value = null;
        }
      }, 0);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    if (isImporting) return;
    const validItems = importPreview.filter(r => r.isValid).map(r => r.data);
    if (validItems.length === 0) {
      return;
    }

    setIsImporting(true);
    setImportError('');
    try {
      const results = await Promise.allSettled(
        validItems.map((coursePayload) => api.post('/admin/courses', coursePayload))
      );
      const successCount = results.filter(r => r.status === 'fulfilled').length;

      clearCoursesCache();
      try {
        localStorage.removeItem(getCoursesCacheKey(currentAdminId));
        localStorage.removeItem(getCoursesMetaCacheKey(currentAdminId));
        localStorage.removeItem(CACHE_KEY_SHARED_COURSES);
        localStorage.removeItem(CACHE_KEY_LEGACY_COURSES);
        localStorage.removeItem(CACHE_KEY_LEGACY_META);
      } catch (e) {}

      if (successCount > 0) {
        pushLocalNotification({
          titleKm: 'បាននាំចូលមុខវិជ្ជាពី Excel',
          titleEn: 'Courses Imported from Excel',
          descKm: `មុខវិជ្ជាចំនួន ${successCount} ត្រូវបាននាំចូលទៅក្នុងប្រព័ន្ធជោគជ័យ។`,
          descEn: `${successCount} courses were imported successfully.`,
          category: 'import',
          link: '/courses'
        });
      }

      setShowImportModal(false);
      setImportPreview([]);
      setSelectedFileName('');
      fetchCourses(true);
    } catch (error) {
      console.error('Import courses error:', error);
      setImportError(t('មានបញ្ហាក្នុងការនាំចូលមុខវិជ្ជា!', 'Error importing courses!'));
    } finally {
      setIsImporting(false);
    }
  };

  // ============================================================================
  // 📌 ផ្នែកទី ៧៖ ការបង្ហាញទម្រង់ផ្ទៃមុខកម្មវិធី (JSX UI RENDERING)
  // ============================================================================
  return (
    <div className="crs-page-bg p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6 animate-fadeIn">
      
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
                <BookOpenIcon className="h-8 w-8 text-yellow-400" />
              </div>
              {t('គ្រប់គ្រងមុខវិជ្ជា', 'Manage Courses')}
            </h1>
            <p className={`text-blue-200/80 text-sm font-medium ${selectedDepartment === 'all' ? 'max-w-none' : 'max-w-xl'}`}>
              {selectedDepartment === 'all'
                ? t('សូមចុចជ្រើសរើសកាតដេប៉ាតឺម៉ង់ខាងក្រោម ដើម្បីបន្ថែមមុខវិជ្ជាថ្មី នាំចូល ឬនាំចេញទិន្នន័យ Excel តាមដេប៉ាតឺម៉ង់។', 'Please select a department card below to add courses, import, or export Excel data by department.')
                : t('បង្កើត កែប្រែ និងលុបមុខវិជ្ជាតាមដេប៉ាតឺម៉ង់ រួមជាមួយការចាត់តាំងគ្រូបង្រៀន ឬនាំចូលពី Excel ។', 'Create, edit, and manage courses by department along with teacher assignments or Excel import.')}
            </p>
          </div>

          {selectedDepartment !== 'all' && (
            <div className="flex flex-wrap items-center gap-3 shrink-0 animate-fadeIn">
              <button
                onClick={handleExportExcel}
                className="inline-flex items-center justify-center px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer"
                title={t('នាំចេញបញ្ជីមុខវិជ្ជាជា Excel', 'Export course list to Excel')}
              >
                <DocumentIcon className="h-5 w-5 mr-2" />
                {t('នាំចេញ Excel', 'Export Excel')}
              </button>
              <button
                onClick={() => { setImportPreview([]); setSelectedFileName(''); setImportError(''); setShowImportModal(true); }}
                className="inline-flex items-center justify-center px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer"
                title={t('នាំចូលទិន្នន័យមុខវិជ្ជាពី Excel', 'Import course data from Excel')}
              >
                <DocumentIcon className="h-5 w-5 mr-2" />
                {t('នាំចូល Excel', 'Import Excel')}
              </button>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                {t('បន្ថែមមុខវិជ្ជា', 'Add Course')}
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
            className="crs-scroll-arrow absolute -left-3 z-20 h-9 w-9 rounded-full bg-white/90 hover:bg-white backdrop-blur-md border border-gray-200/90 text-gray-700 hover:text-blue-600 shadow-[0_4px_12px_rgba(0,0,0,0.12)] flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer"
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
              selectedDepartment === 'all' ? 'bg-gradient-to-br from-blue-900 to-indigo-950 text-white border-blue-800 shadow-lg -translate-y-0.5' : 'crs-dept-card bg-white text-gray-900 border-gray-100 hover:border-blue-200 hover:shadow-md shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between w-full">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${selectedDepartment === 'all' ? 'bg-white/15 text-white border-white/20' : 'crs-dept-blue bg-blue-50 text-blue-600 border-blue-100'}`}>
                <Squares2X2Icon className="h-5 w-5" />
              </div>
              <span className={`text-2xl font-extrabold ${selectedDepartment === 'all' ? 'text-white' : 'crs-text-primary text-gray-900'}`}>
                {departmentCounts.all || 0}
              </span>
            </div>
            <div className="mt-4">
              <p className={`text-sm font-extrabold truncate ${selectedDepartment === 'all' ? 'text-white' : 'crs-text-primary text-gray-900'}`}>
                {t('មុខវិជ្ជាទាំងអស់', 'All Courses')}
              </p>
              <p className={`text-xs font-medium mt-0.5 truncate ${selectedDepartment === 'all' ? 'text-blue-200/80' : 'crs-text-secondary text-gray-500'}`}>
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
                  isSelected ? 'bg-gradient-to-br from-blue-900 to-indigo-950 text-white border-blue-800 shadow-lg -translate-y-0.5' : 'crs-dept-card bg-white text-gray-900 border-gray-100 hover:border-blue-200 hover:shadow-md shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between w-full">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${isSelected ? 'bg-white/15 text-white border-white/20' : `${theme.darkClass} ${theme.bg} ${theme.text} ${theme.border}`}`}>
                    <AcademicCapIcon className="h-5 w-5" />
                  </div>
                  <span className={`text-2xl font-extrabold ${isSelected ? 'text-white' : 'crs-text-primary text-gray-900'}`}>
                    {count}
                  </span>
                </div>
                <div className="mt-4">
                  <p className={`text-sm font-extrabold truncate ${isSelected ? 'text-white' : 'crs-text-primary text-gray-900'}`} title={deptName}>
                    {deptName}
                  </p>
                  <p className={`text-xs font-medium mt-0.5 truncate ${isSelected ? 'text-blue-200/80' : 'crs-text-secondary text-gray-500'}`}>
                    {t('មុខវិជ្ជាសិក្សា', 'Department Courses')}
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
            className="crs-scroll-arrow absolute -right-3 z-20 h-9 w-9 rounded-full bg-white/90 hover:bg-white backdrop-blur-md border border-gray-200/90 text-gray-700 hover:text-blue-600 shadow-[0_4px_12px_rgba(0,0,0,0.12)] flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer"
            title={t('អូសទៅស្ដាំ', 'Scroll Right')}
          >
            <ChevronRightIcon className="h-4 w-4 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 7.3. ប្រអប់ស្វែងរកមុខវិជ្ជា (Search Box)                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="crs-surface-card bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md shrink-0">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder=""
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="crs-input w-full pl-11 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 7.4. តារាងបង្ហាញបញ្ជីមុខវិជ្ជា (Main Table - បន្ទាត់ស្រទន់ស្អាតភ្នែក)    */}
      {/* ------------------------------------------------------------------ */}
      <div className="crs-surface-card bg-white rounded-[1.5rem] border border-gray-200 shadow-sm overflow-hidden">
        <div className="crs-table-bar px-6 py-5 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="crs-text-primary text-[18px] font-extrabold text-gray-900">
              {activeDepartmentObj
                ? `${t('បញ្ជីមុខវិជ្ជា', 'Courses List')} - ${getDepartmentDisplayName(activeDepartmentObj)}`
                : t('បញ្ជីមុខវិជ្ជាទាំងអស់', 'All Courses List')}
            </h2>
          </div>
          {selectedDepartment !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedDepartment('all')}
              className="crs-badge-blue text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
            >
              {t('បង្ហាញគ្រប់ដេប៉ាតឺម៉ង់វិញ', 'Show All Departments')}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="crs-table-head bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('មុខវិជ្ជា', 'Course')}
                </th>
                <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('កូដ', 'Code')}
                </th>
                <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('ដេប៉ាតឺម៉ង់', 'Department')}
                </th>
                <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('គ្រូបង្រៀន', 'Teacher')}
                </th>
                <th className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('ក្រេឌីត', 'Credit')}
                </th>
                <th className="px-4 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {t('សកម្មភាព', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="crs-table-body bg-white">
              {displayedCourses.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-16 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <BookOpenIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="crs-text-primary font-bold text-gray-600 text-base">
                        {searchTerm
                          ? t('មិនឃើញលទ្ធផលស្វែងរក', 'No search results found')
                          : activeDepartmentObj
                          ? t(`មិនទាន់មានមុខវិជ្ជាក្នុងដេប៉ាតឺម៉ង់ «${getDepartmentDisplayName(activeDepartmentObj)}» នៅឡើយទេ`, 'No courses in this department yet')
                          : t('មិនទាន់មានមុខវិជ្ជានៅឡើយទេ', 'No courses available yet')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedCourses.map((course) => {
                  const matchedDeptObj = course.department || departments.find(d => String(d.id) === String(course.department_id));
                  const teacher = resolveCourseTeacher(course, teachers);

                  return (
                    <tr key={course.id} className="crs-table-row hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-medium text-sm shadow-sm shrink-0">
                            <BookOpenIcon className="h-5 w-5" />
                          </div>
                          <div className="ml-3">
                            <div className="crs-text-primary text-sm font-extrabold text-gray-900">
                              {course.course_name}
                            </div>
                            <div className="crs-text-secondary text-xs text-gray-500 font-medium line-clamp-1 max-w-xs">
                              {course.description || t('គ្មានការពិពណ៌នា', 'No description')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="crs-code-pill px-2.5 py-1 text-xs font-bold font-mono bg-gray-100 border border-gray-200 text-gray-700 rounded-lg">
                          {course.course_code}
                        </span>
                      </td>
                      <td className="crs-text-secondary px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-600">
                        {getDepartmentDisplayName(matchedDeptObj)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {teacher ? (
                          <span className="crs-text-primary text-sm font-bold text-gray-800">
                            {getTeacherFullName(teacher)}
                          </span>
                        ) : (
                          <span className="crs-text-secondary text-gray-400 font-medium">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="crs-badge-amber px-3 py-1 text-xs font-bold rounded-lg border bg-amber-50 text-amber-700 border-amber-200">
                          {course.credit} {t('ក្រេឌីត', 'Credits')}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => openEditModal(course)}
                            className="crs-action-edit p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-xl transition-all cursor-pointer"
                            title={t('កែប្រែ', 'Edit')}
                          >
                            <PencilSquareIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(course)}
                            className="crs-action-delete p-2 text-rose-600 hover:text-rose-900 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition-all cursor-pointer"
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
          <div className="crs-pagination-bar px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
            <p className="crs-text-secondary text-xs font-bold text-gray-600">
              {t('ទំព័រ', 'Page')} {meta.current_page} / {meta.last_page} ({displayedCourses.length} {t('មុខវិជ្ជា', 'total')})
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={meta.current_page === 1}
                className="crs-page-btn px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
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
                      : 'crs-page-btn bg-white border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(meta.last_page, p + 1))}
                disabled={meta.current_page === meta.last_page}
                className="crs-page-btn px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {t('បន្ទាប់', 'Next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 7.6. ផ្ទាំង Modal បង្កើត ឬកែប្រែមុខវិជ្ជា                              */}
      {/* ------------------------------------------------------------------ */}
      {showModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="crs-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            <div className="crs-modal-bar flex justify-between items-center p-6 sm:p-8 border-b border-gray-100">
              <div>
                <h2 className="crs-text-primary text-xl font-extrabold text-gray-900 flex items-center gap-2">
                  <span className="crs-badge-indigo bg-indigo-100 text-indigo-600 p-2.5 rounded-xl border border-indigo-200">
                    <BookOpenIcon className="h-6 w-6" />
                  </span>
                  {editingCourse ? t('កែប្រែមុខវិជ្ជា', 'Edit Course') : t('បន្ថែមមុខវិជ្ជាថ្មី', 'Add New Course')}
                </h2>
                {!editingCourse && activeDepartmentObj && (
                  <p className="crs-text-secondary text-xs text-gray-500 font-bold mt-1 ml-12">
                    {t('ដេប៉ាតឺម៉ង់៖', 'Department:')}{' '}
                    <span className="text-indigo-600 dark:text-indigo-400">
                      {getDepartmentDisplayName(activeDepartmentObj)}
                    </span>
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowModal(false); setFormError(''); }}
                className="crs-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 sm:p-8 overflow-y-auto flex-1">
              <form id="courseForm" onSubmit={handleSubmit} className="space-y-5">
                {formError && (
                  <div className="crs-warning-box p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-600">
                    <ExclamationCircleIcon className="h-5 w-5 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold leading-relaxed">{formError}</p>
                  </div>
                )}

                <div>
                  <label className="crs-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('ឈ្មោះមុខវិជ្ជា', 'Course Name')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="course_name"
                    required
                    value={formData.course_name}
                    onChange={handleInputChange}
                    className="crs-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                    placeholder=""
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="crs-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('កូដមុខវិជ្ជា', 'Course Code')} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="course_code"
                      required
                      value={formData.course_code}
                      onChange={handleInputChange}
                      className="crs-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm font-mono"
                      placeholder=""
                    />
                  </div>
                  <div>
                    <label className="crs-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ក្រេឌីត', 'Credit')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="credit"
                      required
                      value={formData.credit}
                      onChange={handleInputChange}
                      className="crs-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all bg-white shadow-sm"
                    >
                      <option value="" disabled>{t('ជ្រើសរើសក្រេឌីត', 'Select Credit')}</option>
                      {[1, 2, 3, 4, 5, 6].map((cr) => (
                        <option key={cr} value={cr}>
                          {cr} {t('ក្រេឌីត', 'Credits')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="crs-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('ដេប៉ាតឺម៉ង់', 'Department')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="department_id"
                      required
                      disabled={Boolean(editingCourse) || selectedDepartment !== 'all'}
                      value={formData.department_id}
                      onChange={handleInputChange}
                      className={`crs-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all bg-white shadow-sm ${
                        Boolean(editingCourse) || selectedDepartment !== 'all' ? 'opacity-80 cursor-not-allowed bg-gray-100 font-bold text-indigo-900' : ''
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
                    <label className="crs-label block text-sm font-bold text-gray-700 mb-1.5">
                      {t('គ្រូបង្រៀនទទួលបន្ទុក', 'Assigned Teacher')} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="teacher_id"
                      required
                      value={formData.teacher_id}
                      onChange={handleInputChange}
                      className="crs-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all bg-white shadow-sm"
                    >
                      <option value="" disabled>{t('ជ្រើសរើសគ្រូបង្រៀន', 'Select Teacher')}</option>
                      {availableTeachersForModal.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {getTeacherFullName(teacher)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="crs-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('ការពិពណ៌នា', 'Description')}
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    value={formData.description}
                    onChange={handleInputChange}
                    className="crs-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all resize-none shadow-sm"
                    placeholder={t('ពិពណ៌នាអំពីមុខវិជ្ជា...', 'Describe the course...')}
                  />
                </div>
              </form>
            </div>

            <div className="crs-modal-bar p-6 sm:p-8 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50 shrink-0">
              <button
                type="button"
                onClick={() => { setShowModal(false); setFormError(''); }}
                className="crs-cancel-btn px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                type="submit"
                form="courseForm"
                disabled={isSubmitting}
                className="px-6 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                ) : (
                  <BookOpenIcon className="h-5 w-5" />
                )}
                {editingCourse ? t('រក្សាទុកការកែប្រែ', 'Save Changes') : t('បង្កើតមុខវិជ្ជា', 'Create Course')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 7.7. ផ្ទាំង Modal សម្រាប់នាំចូលមុខវិជ្ជាពី Excel                        */}
      {/* ------------------------------------------------------------------ */}
      {showImportModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="crs-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            <div className="crs-modal-bar flex justify-between items-center p-5 border-b border-gray-100">
              <div>
                <h2 className="crs-text-primary text-lg font-extrabold text-gray-900 flex items-center gap-2">
                  <span className="crs-badge-emerald bg-emerald-100 text-emerald-600 p-2 rounded-xl border border-emerald-200">
                    <DocumentIcon className="h-5 w-5" />
                  </span>
                  {t('នាំចូលមុខវិជ្ជាពី Excel', 'Import Courses from Excel')}
                </h2>
                {activeDepartmentObj && (
                  <p className="crs-text-secondary text-xs text-gray-500 font-bold mt-1 ml-11">
                    {t('ដេប៉ាតឺម៉ង់គោលដៅ៖', 'Target Department:')}{' '}
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {getDepartmentDisplayName(activeDepartmentObj)}
                    </span>
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowImportModal(false); setImportPreview([]); setSelectedFileName(''); setImportError(''); }}
                className="crs-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              {importError && (
                <div className="crs-warning-box p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-600">
                  <ExclamationCircleIcon className="h-5 w-5 shrink-0 mt-0.5" />
                  <p className="text-xs font-bold leading-relaxed">{importError}</p>
                </div>
              )}

              <div className="crs-import-info bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="crs-import-title font-extrabold text-emerald-900 text-sm">
                    {t('ណែនាំសម្រាប់ការនាំចូល៖', 'Import Instructions:')}
                  </h4>
                  <p className="crs-import-desc text-xs font-medium text-emerald-700 mt-1">
                    {activeDepartmentObj
                      ? t(`មុខវិជ្ជាទាំងអស់ក្នុងឯកសារនេះ នឹងត្រូវដាក់បញ្ចូលទៅក្នុងដេប៉ាតឺម៉ង់ «${getDepartmentDisplayName(activeDepartmentObj)}» ដោយស្វ័យប្រវត្តិ។`, `All courses in this file will be automatically assigned to "${getDepartmentDisplayName(activeDepartmentObj)}".`)
                      : t('សូមទាញយកទម្រង់គំរូ Excel ហើយបំពេញកូដ ឈ្មោះមុខវិជ្ជា ដេប៉ាតឺម៉ង់ និងឈ្មោះគ្រូបង្រៀនឱ្យបានត្រឹមត្រូវ។', 'Please download the template and fill in course code, name, department, and teacher.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="crs-template-btn inline-flex items-center px-4 py-2 bg-white border border-emerald-300 text-emerald-800 text-xs font-bold rounded-lg hover:bg-emerald-100 transition-all shrink-0 shadow-sm cursor-pointer"
                >
                  <DocumentIcon className="h-4 w-4 mr-1.5 text-emerald-600" />
                  {t('ទាញយកគំរូ', 'Template')}
                </button>
              </div>

              <div>
                <label className="crs-label block text-sm font-bold text-gray-700 mb-2">
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
                  <div className={`crs-dropzone border-2 border-dashed rounded-xl py-6 px-4 flex flex-col items-center justify-center text-center transition-all duration-300 shadow-sm ${selectedFileName ? 'border-emerald-500 bg-emerald-50' : 'border-emerald-300 bg-emerald-50/40 group-hover:bg-emerald-50 group-hover:border-emerald-500 group-hover:shadow-md'}`}>
                    {selectedFileName ? (
                      <>
                        <div className="p-2.5 bg-emerald-500 rounded-full mb-3 shadow-sm border border-emerald-600">
                          <DocumentTextIcon className="h-6 w-6 text-white" />
                        </div>
                        <h3 className="crs-import-title text-sm font-extrabold text-emerald-900 mb-1.5">
                          {selectedFileName}
                        </h3>
                        <p className="crs-import-desc text-xs text-emerald-600 font-medium">
                          {t('ចុចដើម្បីផ្លាស់ប្តូរឯកសារ', 'Click to change file')}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="crs-badge-emerald p-2.5 bg-emerald-100 rounded-full mb-3 group-hover:scale-110 transition-transform duration-300 shadow-sm border border-emerald-200">
                          <DocumentIcon className="h-6 w-6 text-emerald-600" />
                        </div>
                        <h3 className="crs-import-title text-sm font-extrabold text-emerald-900 mb-1.5">
                          {t('ចុចទីនេះ ឬទាញឯកសារទម្លាក់ទីនេះ', 'Click to upload or drag and drop')}
                        </h3>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {importPreview.length > 0 && importPreview.some(r => !r.isValid) && (
                <div className="crs-warning-box mt-4 p-4 bg-rose-50/50 border border-rose-200 rounded-xl flex items-center justify-between gap-4 animate-fadeIn">
                  <div>
                    <p className="crs-text-primary text-sm font-bold text-gray-800">
                      {t('មានទិន្នន័យខុសក្នុងបញ្ជី', 'Errors in Parsed Data')}
                    </p>
                    <p className="crs-text-secondary text-xs text-gray-500">
                      {importPreview.length} {t('ជួរ', 'rows')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="crs-badge-emerald bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-transparent">
                      <CheckCircleIcon className="h-4 w-4" />
                      {importPreview.filter(r => r.isValid).length} {t('ត្រឹមត្រូវ', 'Valid')}
                    </span>
                    <span
                      className="crs-badge-rose bg-rose-100 text-rose-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-transparent"
                      title={importPreview.filter(r => !r.isValid).map(r => `ជួរទី ${r.rowIndex}: ${r.errors[0]}`).join('\n')}
                    >
                      <ExclamationCircleIcon className="h-4 w-4" />
                      {importPreview.filter(r => !r.isValid).length} {t('មានកំហុស', 'Error')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="crs-modal-bar p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50 shrink-0">
              <button
                type="button"
                onClick={() => { setShowImportModal(false); setImportPreview([]); setSelectedFileName(''); setImportError(''); }}
                className="crs-cancel-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
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
                {isImporting
                  ? t('កំពុងនាំចូល...', 'Importing...')
                  : `${t('នាំចូលទិន្នន័យ', 'Import Data')} (${importPreview.filter(r => r.isValid).length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 7.8. ផ្ទាំង Modal បញ្ជាក់ការលុបមុខវិជ្ជា                               */}
      {/* ------------------------------------------------------------------ */}
      {showDeleteModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="crs-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fadeIn border border-transparent">
            <div className="crs-delete-title flex items-center text-rose-600 mb-5">
              <div className="crs-badge-rose p-2 bg-rose-100 rounded-full mr-3 border border-rose-200">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-extrabold">{t('បញ្ជាក់ការលុប', 'Confirm Deletion')}</h3>
            </div>
            <p className="crs-text-secondary text-sm font-medium text-gray-600 mb-6 leading-relaxed">
              {t('តើលោកអ្នកប្រាកដជាចង់លុបមុខវិជ្ជា', 'Are you sure you want to delete course')} «
              <span className="crs-text-primary font-extrabold text-gray-900">
                {courseToDelete?.course_name}
              </span>
              » {t('នេះមែនទេ?', 'this course?')}
              <br /><br />
              <span className="crs-warning-box text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100 block">
                {t('* ទិន្នន័យ និងមេរៀនទាំងអស់ដែលជាប់ទាក់ទងនឹងមុខវិជ្ជានេះអាចនឹងបាត់បង់។', '* Data and all lessons related to this course may be lost.')}
              </span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowDeleteModal(false); setCourseToDelete(null); }}
                disabled={isDeleting}
                className="crs-cancel-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer disabled:opacity-50"
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
      {/* 📌 ផ្នែកទី ៨៖ CSS សម្រាប់កំណត់ពណ៌ទម្រង់យប់ (Dark Mode Styling)         */}
      {/* ==================================================================== */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* ✅ បន្ទាត់ខណ្ឌចែកជួរក្នុងតារាងពេលថ្ងៃ (Light mode subtle row dividers) */
        .crs-table-row + .crs-table-row > td {
          border-top: 1px solid #f1f5f9;
        }

        html.dark .crs-page-bg {
          background-color: transparent !important;
        }
        html.dark .crs-surface-card,
        html.dark .crs-dept-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .crs-dept-card:hover {
          border-color: #3b82f6 !important;
        }
        html.dark .crs-table-bar {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .crs-text-primary {
          color: #f8fafc !important;
        }
        html.dark .crs-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .crs-label {
          color: #cbd5e1 !important;
        }

        html.dark .crs-scroll-arrow {
          background-color: rgba(30, 41, 59, 0.9) !important;
          border-color: #475569 !important;
          color: #e2e8f0 !important;
        }
        html.dark .crs-scroll-arrow:hover {
          background-color: #2563eb !important;
          border-color: #3b82f6 !important;
          color: #ffffff !important;
        }

        html.dark .crs-dept-blue { background-color: rgba(59, 130, 246, 0.15) !important; color: #60a5fa !important; border-color: rgba(59, 130, 246, 0.3) !important; }
        html.dark .crs-dept-emerald { background-color: rgba(16, 185, 129, 0.15) !important; color: #34d399 !important; border-color: rgba(16, 185, 129, 0.3) !important; }
        html.dark .crs-dept-indigo { background-color: rgba(99, 102, 241, 0.15) !important; color: #818cf8 !important; border-color: rgba(99, 102, 241, 0.3) !important; }
        html.dark .crs-dept-amber { background-color: rgba(245, 158, 11, 0.15) !important; color: #fbbf24 !important; border-color: rgba(245, 158, 11, 0.3) !important; }
        html.dark .crs-dept-rose { background-color: rgba(244, 63, 94, 0.15) !important; color: #fb7185 !important; border-color: rgba(244, 63, 94, 0.3) !important; }
        html.dark .crs-dept-purple { background-color: rgba(168, 85, 247, 0.15) !important; color: #c084fc !important; border-color: rgba(168, 85, 247, 0.3) !important; }
        html.dark .crs-dept-cyan { background-color: rgba(6, 182, 212, 0.15) !important; color: #22d3ee !important; border-color: rgba(6, 182, 212, 0.3) !important; }

        html.dark .crs-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
          color-scheme: dark;
        }
        html.dark .crs-input::placeholder {
          color: #64748b !important;
        }
        html.dark .crs-input:focus {
          border-color: #6366f1 !important;
          background-color: #0f172a !important;
        }

        /* ✅ តារាងមុខវិជ្ជា និងបន្ទាត់ខណ្ឌចែកស្រទន់ស្អាតភ្នែកក្នុងទម្រង់យប់ */
        html.dark .crs-table-head {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .crs-table-head th {
          color: #94a3b8 !important;
        }
        html.dark .crs-table-body {
          background-color: #1e293b !important;
        }
        html.dark .crs-table-row + .crs-table-row > td {
          border-top: 1px solid rgba(51, 65, 85, 0.55) !important;
        }
        html.dark .crs-table-row:hover {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }

        html.dark .crs-code-pill {
          background-color: #0f172a !important;
          color: #e2e8f0 !important;
          border-color: #334155 !important;
        }
        html.dark .crs-badge-blue {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html.dark .crs-badge-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          color: #818cf8 !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .crs-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .crs-badge-emerald svg {
          color: #34d399 !important;
        }
        html.dark .crs-badge-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
        html.dark .crs-badge-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          color: #fb7185 !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
        }
        html.dark .crs-badge-rose svg {
          color: #fb7185 !important;
        }

        html.dark .crs-action-edit {
          color: #818cf8 !important;
        }
        html.dark .crs-action-edit:hover {
          background-color: rgba(99, 102, 241, 0.18) !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
          color: #a5b4fc !important;
        }
        html.dark .crs-action-delete {
          color: #fb7185 !important;
        }
        html.dark .crs-action-delete:hover {
          background-color: rgba(244, 63, 94, 0.18) !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
          color: #fda4af !important;
        }
        html.dark .crs-pagination-bar {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
        }
        html.dark .crs-page-btn {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .crs-page-btn:hover:not(:disabled) {
          background-color: #334155 !important;
          color: #ffffff !important;
        }

        html.dark .crs-modal-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .crs-modal-bar {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
        }
        html.dark .crs-close-btn,
        html.dark .crs-cancel-btn {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .crs-close-btn:hover,
        html.dark .crs-cancel-btn:hover {
          background-color: #334155 !important;
          color: #ffffff !important;
        }
        html.dark .crs-import-info {
          background-color: rgba(16, 185, 129, 0.1) !important;
          border-color: rgba(16, 185, 129, 0.25) !important;
        }
        html.dark .crs-import-title {
          color: #34d399 !important;
        }
        html.dark .crs-import-desc {
          color: #a7f3d0 !important;
        }
        html.dark .crs-template-btn {
          background-color: #0f172a !important;
          border-color: rgba(16, 185, 129, 0.4) !important;
          color: #34d399 !important;
        }
        html.dark .crs-template-btn:hover {
          background-color: rgba(16, 185, 129, 0.2) !important;
        }
        html.dark .crs-dropzone {
          background-color: rgba(16, 185, 129, 0.06) !important;
          border-color: rgba(16, 185, 129, 0.35) !important;
        }
        html.dark .group:hover .crs-dropzone {
          background-color: rgba(16, 185, 129, 0.12) !important;
          border-color: #10b981 !important;
        }
        html.dark .crs-delete-title {
          color: #fb7185 !important;
        }
        html.dark .crs-warning-box {
          background-color: rgba(244, 63, 94, 0.12) !important;
          border-color: rgba(244, 63, 94, 0.25) !important;
          color: #fda4af !important;
        }
      `}</style>
    </div>
  );
};

export default ManageCourses;
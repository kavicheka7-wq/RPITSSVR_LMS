// src/components/admin/ManageDepartments.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../services/api';
import { clearDepartmentsCache } from '../../services/metadataService';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { 
  PlusIcon, 
  PencilSquareIcon, 
  TrashIcon,
  XMarkIcon,
  BuildingLibraryIcon,
  UserGroupIcon,
  BookOpenIcon,
  MagnifyingGlassIcon,
  AcademicCapIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

// ============================================================================
// 📌 ផ្នែកទី១៖ ប្រព័ន្ធផ្ទុកទិន្នន័យតាមគណនី Admin ម្នាក់ៗ (User-Scoped 0ms Cache)
// ============================================================================
const CACHE_KEY_SHARED_DEPTS = 'cached_admin_departments_list';
const getDeptsCacheKey = (uid) => `cached_admin_departments_list_v8_${uid}`;

// ✅ Global Memory Cache បែងចែកតាម uid របស់អ្នកគ្រប់គ្រងម្នាក់ៗ
const ADMIN_DEPTS_MEM_CACHE = {
  uid: null,
  departments: null,
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

// ✅ អនុគមន៍ទាញយកឈ្មោះដេប៉ាតឺម៉ង់ដើមពី Database ដោយមិនបម្លែងភាសាខ្មែរ-អង់គ្លេស
const getDepartmentDisplayName = (dept) => {
  if (!dept) return '';
  if (typeof dept === 'string') return dept;
  return dept.department_name || dept.name || '';
};

// ✅ អនុគមន៍សម្រាប់បញ្ជូនសារជូនដំណឹងចូលទៅកាន់រូបកណ្ដឹង (NotificationBell) នៅលើ Navbar
const pushLocalNotification = (notif) => {
  try {
    const userObjStr = localStorage.getItem('auth_user') || localStorage.getItem('user');
    let uid = 'default';
    let role = 'admin';
    if (userObjStr) {
      const userObj = JSON.parse(userObjStr);
      uid = userObj.id || userObj.user_id || userObj.email || 'default';
      if (userObj.role) {
        const rName =
          typeof userObj.role === 'string'
            ? userObj.role
            : userObj.role.role_name || userObj.role.name || 'admin';
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
// 📌 ផ្នែកទី២៖ Component គោលសម្រាប់គ្រប់គ្រងដេប៉ាតឺម៉ង់ (ManageDepartments)
// ============================================================================
const ManageDepartments = () => {
  const { t } = useLanguage();
  const { user } = useAuth();

  // ✅ កំណត់អត្តសញ្ញាណ Admin បច្ចុប្បន្នឱ្យមានស្ថិរភាពតាំងពីវិនាទីដំបូង
  const currentAdminId = useMemo(() => resolveAdminUid(user), [user]);

  if (
    ADMIN_DEPTS_MEM_CACHE.uid &&
    ADMIN_DEPTS_MEM_CACHE.uid !== currentAdminId
  ) {
    ADMIN_DEPTS_MEM_CACHE.departments = null;
    ADMIN_DEPTS_MEM_CACHE.lastSyncedAt = 0;
  }
  ADMIN_DEPTS_MEM_CACHE.uid = currentAdminId;

  // ✅ ១. អានទិន្នន័យពី Cache មកបង្ហាញភ្លាមៗក្នុងពេល 0 វិនាទី (គ្មាន Skeleton Loading)
  const [departments, setDepartments] = useState(() => {
    if (Array.isArray(ADMIN_DEPTS_MEM_CACHE.departments)) {
      return ADMIN_DEPTS_MEM_CACHE.departments;
    }
    const fromUserKey = readStorageJson(getDeptsCacheKey(currentAdminId), null);
    if (Array.isArray(fromUserKey)) {
      ADMIN_DEPTS_MEM_CACHE.departments = fromUserKey;
      return fromUserKey;
    }
    const fallback = readStorageJson(CACHE_KEY_SHARED_DEPTS, []);
    ADMIN_DEPTS_MEM_CACHE.departments = fallback;
    return fallback;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  // ============================================================================
  // 📌 ផ្នែកទី៣៖ ទាញយកទិន្នន័យដោយមិនរាំងស្ទះ UI (Non-Blocking 0ms Sync)
  // ============================================================================
  const fetchDepartments = useCallback(
    async (forceRefresh = false) => {
      const cachedDepts = readStorageJson(getDeptsCacheKey(currentAdminId), null);
      if (Array.isArray(cachedDepts) && !forceRefresh) {
        setDepartments(cachedDepts);
        ADMIN_DEPTS_MEM_CACHE.departments = cachedDepts;
      }

      const now = Date.now();
      if (
        !forceRefresh &&
        ADMIN_DEPTS_MEM_CACHE.uid === currentAdminId &&
        Array.isArray(ADMIN_DEPTS_MEM_CACHE.departments) &&
        ADMIN_DEPTS_MEM_CACHE.departments.length > 0 &&
        now - ADMIN_DEPTS_MEM_CACHE.lastSyncedAt < 25000
      ) {
        return;
      }

      try {
        const response = await api.get('/admin/departments');
        const depts = Array.isArray(response.data?.data)
          ? response.data.data
          : Array.isArray(response.data)
          ? response.data
          : [];

        setDepartments(depts);
        ADMIN_DEPTS_MEM_CACHE.uid = currentAdminId;
        ADMIN_DEPTS_MEM_CACHE.departments = depts;
        ADMIN_DEPTS_MEM_CACHE.lastSyncedAt = Date.now();

        try {
          localStorage.setItem(
            getDeptsCacheKey(currentAdminId),
            JSON.stringify(depts)
          );
          localStorage.setItem(CACHE_KEY_SHARED_DEPTS, JSON.stringify(depts));
        } catch (e) {
          console.warn('Failed to cache departments:', e);
        }
      } catch (error) {
        console.error('Error fetching departments:', error);
      }
    },
    [currentAdminId]
  );

  useEffect(() => {
    fetchDepartments(false);
  }, [fetchDepartments]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  // ✅ រក្សាទុកដេប៉ាតឺម៉ង់ថ្មី ឬការកែប្រែ រួចធ្វើបច្ចុប្បន្នភាពលើអេក្រង់ភ្លាមៗ (ភ្ជាប់តែកណ្ដឹង)
  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanName = formData.name.trim();
    if (!cleanName) {
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: cleanName,
        department_name: cleanName,
        description: formData.description ? formData.description.trim() : ''
      };

      if (editingDepartment) {
        const response = await api.put(`/admin/departments/${editingDepartment.id}`, payload);
        const serverData = response.data?.data || response.data;
        const updatedDept = {
          ...editingDepartment,
          ...payload,
          ...(serverData && typeof serverData === 'object' ? serverData : {})
        };

        setDepartments(prev => {
          const newList = prev.map(d => d.id === editingDepartment.id ? updatedDept : d);
          ADMIN_DEPTS_MEM_CACHE.departments = newList;
          try {
            localStorage.setItem(getDeptsCacheKey(currentAdminId), JSON.stringify(newList));
            localStorage.setItem(CACHE_KEY_SHARED_DEPTS, JSON.stringify(newList));
          } catch (e) {}
          return newList;
        });

        pushLocalNotification({
          titleKm: 'បានកែប្រែដេប៉ាតឺម៉ង់',
          titleEn: 'Department Updated',
          descKm: `ដេប៉ាតឺម៉ង់ «${cleanName}» ត្រូវបានកែប្រែដោយជោគជ័យ។`,
          descEn: `Department "${cleanName}" has been updated successfully.`,
          category: 'department',
          link: '/admin/departments'
        });
      } else {
        const response = await api.post('/admin/departments', payload);
        const serverData = response.data?.data || response.data;
        const newDept = {
          id: Date.now(),
          teachers_count: 0,
          students_count: 0,
          courses_count: 0,
          ...payload,
          ...(serverData && typeof serverData === 'object' ? serverData : {})
        };

        setDepartments(prev => {
          const newList = [...prev, newDept];
          ADMIN_DEPTS_MEM_CACHE.departments = newList;
          try {
            localStorage.setItem(getDeptsCacheKey(currentAdminId), JSON.stringify(newList));
            localStorage.setItem(CACHE_KEY_SHARED_DEPTS, JSON.stringify(newList));
          } catch (e) {}
          return newList;
        });

        pushLocalNotification({
          titleKm: 'បានបង្កើតដេប៉ាតឺម៉ង់ថ្មី',
          titleEn: 'New Department Created',
          descKm: `ដេប៉ាតឺម៉ង់ «${cleanName}» ត្រូវបានបង្កើតចូលក្នុងប្រព័ន្ធជោគជ័យ។`,
          descEn: `Department "${cleanName}" has been created successfully.`,
          category: 'department',
          link: '/admin/departments'
        });
      }

      clearDepartmentsCache();
      setShowModal(false);
      resetForm();
      fetchDepartments(true);
    } catch (error) {
      console.error('Error saving department:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (dept) => {
    setSelectedDepartment(dept);
    setShowDeleteModal(true);
  };

  // ✅ លុបដេប៉ាតឺម៉ង់ដោយប្រើ Optimistic UI Update និងបញ្ជូនសារចូលកណ្ដឹង
  const confirmDelete = async () => {
    if (!selectedDepartment) return;

    const deletedId = selectedDepartment.id;
    const deletedName = getDepartmentDisplayName(selectedDepartment);
    const previousDepartments = [...departments];

    setShowDeleteModal(false);
    setSelectedDepartment(null);

    setDepartments(prev => {
      const newList = prev.filter(d => d.id !== deletedId);
      ADMIN_DEPTS_MEM_CACHE.departments = newList;
      try {
        localStorage.setItem(getDeptsCacheKey(currentAdminId), JSON.stringify(newList));
        localStorage.setItem(CACHE_KEY_SHARED_DEPTS, JSON.stringify(newList));
      } catch (e) {}
      return newList;
    });

    try {
      await api.delete(`/admin/departments/${deletedId}`);
      clearDepartmentsCache();

      pushLocalNotification({
        titleKm: 'បានលុបដេប៉ាតឺម៉ង់',
        titleEn: 'Department Deleted',
        descKm: `ដេប៉ាតឺម៉ង់ «${deletedName}» ត្រូវបានលុបចេញពីប្រព័ន្ធរួចរាល់។`,
        descEn: `Department "${deletedName}" has been removed.`,
        category: 'department',
        link: '/admin/departments'
      });
    } catch (error) {
      console.error('Error deleting department:', error);
      setDepartments(previousDepartments);
      ADMIN_DEPTS_MEM_CACHE.departments = previousDepartments;
      try {
        localStorage.setItem(getDeptsCacheKey(currentAdminId), JSON.stringify(previousDepartments));
        localStorage.setItem(CACHE_KEY_SHARED_DEPTS, JSON.stringify(previousDepartments));
      } catch (e) {}
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
    });
    setEditingDepartment(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  // ✅ ចាប់យកឈ្មោះ និងការពិពណ៌នាដើមពី Database មកបង្ហាញក្នុងប្រអប់ Input ពេលចុចកែប្រែ
  const openEditModal = (dept) => {
    setEditingDepartment(dept);
    setFormData({
      name: getDepartmentDisplayName(dept),
      description: dept.description || '',
    });
    setShowModal(true);
  };

  // ✅ ស្វែងរក (Search) ដេប៉ាតឺម៉ង់តាមឈ្មោះ ឬការពិពណ៌នា
  const filteredDepartments = useMemo(() => {
    if (!searchTerm.trim()) return departments;
    const q = searchTerm.toLowerCase().trim();
    return departments.filter(dept => {
      const rawName = getDepartmentDisplayName(dept).toLowerCase();
      const rawDesc = (dept.description || '').toLowerCase();
      return rawName.includes(q) || rawDesc.includes(q);
    });
  }, [departments, searchTerm]);

  const getDepartmentColor = (index) => {
    const gradients = [
      'from-blue-500 to-indigo-600',
      'from-purple-500 to-pink-600',
      'from-emerald-500 to-teal-600',
      'from-amber-500 to-orange-600',
      'from-rose-500 to-red-600',
      'from-cyan-500 to-blue-600',
    ];
    return gradients[index % gradients.length];
  };

  return (
    <div className="dept-page-bg p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6 animate-fadeIn">
      
      {/* ------------------------------------------------------------------ */}
      {/* 1. Header Banner (Dark Blue Gradient)                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-8 shadow-xl border border-blue-900">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-[28px] sm:text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                <BuildingLibraryIcon className="h-8 w-8 text-yellow-400" />
              </div>
              {t('គ្រប់គ្រងដេប៉ាតឺម៉ង់', 'Manage Departments')}
            </h1>
            <p className="text-blue-200/80 text-sm max-w-xl font-medium">
              {t('រៀបចំ និងគ្រប់គ្រងដេប៉ាតឺម៉ង់ទាំងអស់នៅក្នុងប្រព័ន្ធ រួមបញ្ចូលទាំងចំនួនគ្រូបង្រៀន សិស្ស និងមុខវិជ្ជា។', 'Manage all departments in the system, including teachers, students, and courses assignments.')}
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer shrink-0"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            {t('បន្ថែមដេប៉ាតឺម៉ង់', 'Add Department')}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Search & Stats Box                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="dept-surface-card bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col lg:flex-row gap-4 items-center justify-between">
        
        {/* Search Input */}
        <div className="relative w-full lg:w-96 shrink-0">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder=""
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="dept-input w-full pl-11 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-sm"
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

        {/* Dynamic Stats Badges */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:justify-end">
          <div className="dept-badge-indigo flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-xl border border-indigo-100 shadow-2xs">
            <BuildingLibraryIcon className="h-4 w-4 text-indigo-500" />
            <span className="text-xs font-bold text-indigo-700">{departments.length} {t('ដេប៉ាតឺម៉ង់', 'Depts')}</span>
          </div>
          <div className="dept-badge-purple flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 rounded-xl border border-purple-100 shadow-2xs">
            <AcademicCapIcon className="h-4 w-4 text-purple-500" />
            <span className="text-xs font-bold text-purple-700">
              {departments.reduce((acc, dept) => acc + (dept.teachers_count || 0), 0)} {t('គ្រូ', 'Teachers')}
            </span>
          </div>
          <div className="dept-badge-emerald flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-xl border border-emerald-100 shadow-2xs">
            <UserGroupIcon className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-bold text-emerald-700">
              {departments.reduce((acc, dept) => acc + (dept.students_count || 0), 0)} {t('សិស្ស', 'Students')}
            </span>
          </div>
          <div className="dept-badge-amber flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-xl border border-amber-100 shadow-2xs">
            <BookOpenIcon className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-bold text-amber-700">
              {departments.reduce((acc, dept) => acc + (dept.courses_count || 0), 0)} {t('មុខវិជ្ជា', 'Courses')}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Main Content Area (គ្មាន Skeleton Loading)                      */}
      {/* ------------------------------------------------------------------ */}
      {filteredDepartments.length === 0 ? (
        <div className="dept-surface-card bg-white rounded-3xl shadow-sm border border-gray-100 p-20 text-center">
          <BuildingLibraryIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="dept-text-primary text-gray-700 font-extrabold text-lg">
            {searchTerm ? t('មិនឃើញលទ្ធផលស្វែងរក', 'No search results found') : t('មិនទាន់មានដេប៉ាតឺម៉ង់នៅឡើយទេ', 'No departments available yet')}
          </p>
          <p className="dept-text-secondary text-sm text-gray-400 mt-2 font-medium">
            {searchTerm ? t('សូមប្តូរពាក្យស្វែងរកផ្សេងទៀត', 'Try a different search term') : t('ចុចប៊ូតុង "បន្ថែមដេប៉ាតឺម៉ង់" នៅខាងលើដើម្បីចាប់ផ្តើម', 'Click "Add Department" above to start')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDepartments.map((dept, index) => {
            const colorGradient = getDepartmentColor(index);
            const deptName = getDepartmentDisplayName(dept) || t('មិនស្គាល់', 'Unknown');
            const deptDesc = dept.description || t('គ្មានការពិពណ៌នា', 'No description');
            const teacherCount = dept.teachers_count || 0;
            const studentCount = dept.students_count || 0;
            const courseCount = dept.courses_count || 0;
            const totalUsers = teacherCount + studentCount;

            return (
              <div 
                key={dept.id} 
                className="dept-surface-card bg-white rounded-3xl shadow-sm border border-gray-100 p-6 hover:shadow-xl hover:border-indigo-100 transition-all duration-300 hover:-translate-y-1.5 group flex flex-col h-full relative overflow-hidden"
              >
                {/* Decoration */}
                <div className={`absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br ${colorGradient} opacity-5 rounded-full blur-2xl group-hover:opacity-20 transition-opacity`}></div>

                <div className="flex items-start justify-between mb-5 relative z-10">
                  <div className={`h-14 w-14 rounded-2xl bg-gradient-to-r ${colorGradient} flex items-center justify-center shadow-md transform group-hover:scale-105 transition-transform duration-300`}>
                    <BuildingLibraryIcon className="h-7 w-7 text-white" />
                  </div>
                  {/* ✅ បង្ហាញជានិច្ចលើទូរស័ព្ទ/Tablet និងលោតចេញពេលដាក់ Mouse លើកុំព្យូទ័រ */}
                  <div className="dept-action-box flex items-center gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-300 bg-gray-50/80 p-1.5 rounded-xl border border-gray-100 backdrop-blur-sm">
                    <button
                      onClick={() => openEditModal(dept)}
                      className="dept-action-edit p-1.5 text-indigo-600 lg:text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                      title={t('កែប្រែ', 'Edit')}
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(dept)}
                      className="dept-action-delete p-1.5 text-rose-600 lg:text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                      title={t('លុប', 'Delete')}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-6 flex-1 relative z-10">
                  <h3 className="dept-card-title text-[17px] font-extrabold text-gray-900 mb-1.5 line-clamp-1 group-hover:text-indigo-700 transition-colors" title={deptName}>
                    {deptName}
                  </h3>
                  <p className="dept-text-secondary text-[13px] text-gray-500 font-medium line-clamp-2 leading-relaxed">
                    {deptDesc}
                  </p>
                </div>

                <div className="dept-stats-container grid grid-cols-3 gap-3 p-3 bg-gray-50/80 rounded-xl border border-gray-100 relative z-10 mt-auto">
                  <div className="dept-stat-item flex flex-col items-center justify-center p-2 rounded-lg bg-white shadow-2xs">
                    <div className="dept-stat-purple flex items-center gap-1 text-purple-600 mb-0.5">
                      <AcademicCapIcon className="h-4 w-4" />
                      <span className="font-extrabold text-[15px]">{teacherCount}</span>
                    </div>
                    <p className="dept-text-muted text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('គ្រូ', 'Teachers')}</p>
                  </div>
                  <div className="dept-stat-item flex flex-col items-center justify-center p-2 rounded-lg bg-white shadow-2xs">
                    <div className="dept-stat-emerald flex items-center gap-1 text-emerald-600 mb-0.5">
                      <UserGroupIcon className="h-4 w-4" />
                      <span className="font-extrabold text-[15px]">{studentCount}</span>
                    </div>
                    <p className="dept-text-muted text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('សិស្ស', 'Students')}</p>
                  </div>
                  <div className="dept-stat-item flex flex-col items-center justify-center p-2 rounded-lg bg-white shadow-2xs">
                    <div className="dept-stat-amber flex items-center gap-1 text-amber-500 mb-0.5">
                      <BookOpenIcon className="h-4 w-4" />
                      <span className="font-extrabold text-[15px]">{courseCount}</span>
                    </div>
                    <p className="dept-text-muted text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('មុខវិជ្ជា', 'Courses')}</p>
                  </div>
                </div>

                {/* Bottom Total User Tag */}
                <div className="dept-divider mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] font-bold text-gray-400 relative z-10 uppercase tracking-wide">
                  <span className="dept-text-muted">{t('អ្នកប្រើសរុបរួម', 'Total Users')}</span>
                  <span className="dept-total-pill bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200 shadow-2xs">{totalUsers}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. MODAL - 1: Add/Edit Department                                  */}
      {/* ------------------------------------------------------------------ */}
      {showModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
          <div className="dept-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden border border-transparent">
            
            {/* Modal Header Fixed */}
            <div className="dept-modal-bar flex justify-between items-center p-6 sm:p-8 border-b border-gray-100 bg-gray-50/50 shrink-0">
              <h2 className="dept-text-primary text-xl font-extrabold text-gray-900 flex items-center gap-2">
                <span className="dept-badge-indigo bg-indigo-100 text-indigo-600 p-2.5 rounded-xl border border-indigo-200">
                  <BuildingLibraryIcon className="h-6 w-6" />
                </span>
                {editingDepartment ? t('កែប្រែដេប៉ាតឺម៉ង់', 'Edit Department') : t('បន្ថែមដេប៉ាតឺម៉ង់ថ្មី', 'Add New Department')}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="dept-close-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-xl transition-all bg-white border border-gray-200 cursor-pointer"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            
            {/* Form */}
            <form id="deptForm" onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              {/* Modal Body Scrolling */}
              <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-5">
                <div>
                  <label className="dept-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('ឈ្មោះដេប៉ាតឺម៉ង់', 'Department Name')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleInputChange}
                    className="dept-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm"
                    placeholder=""
                  />
                </div>

                <div>
                  <label className="dept-label block text-sm font-bold text-gray-700 mb-1.5">
                    {t('ការពិពណ៌នា', 'Description')}
                  </label>
                  <textarea
                    name="description"
                    rows={4}
                    value={formData.description}
                    onChange={handleInputChange}
                    className="dept-input w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all resize-none shadow-sm"
                    placeholder={t('ពិពណ៌នាអំពីមុខងារដេប៉ាតឺម៉ង់...', 'Describe department function...')}
                  />
                </div>
              </div>

              {/* Modal Footer Fixed */}
              <div className="dept-modal-bar p-6 sm:p-8 border-t border-gray-100 bg-gray-50/50 flex justify-end space-x-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="dept-cancel-btn px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all cursor-pointer"
                >
                  {t('បោះបង់', 'Cancel')}
                </button>
                <button
                  type="submit"
                  form="deptForm"
                  disabled={isSubmitting}
                  className="px-6 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  ) : (
                    <BuildingLibraryIcon className="h-5 w-5" />
                  )}
                  {editingDepartment ? t('រក្សាទុកការកែប្រែ', 'Save Changes') : t('បង្កើតដេប៉ាតឺម៉ង់', 'Create Department')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 5. MODAL - 2: Delete Confirmation                                  */}
      {/* ------------------------------------------------------------------ */}
      {showDeleteModal && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
          <div className="dept-modal-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fadeIn border border-transparent">
            <div className="dept-delete-title flex items-center text-rose-600 mb-5">
              <div className="dept-badge-rose p-2 bg-rose-100 rounded-full mr-3 border border-rose-200">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-extrabold">{t('បញ្ជាក់ការលុប', 'Confirm Deletion')}</h3>
            </div>
            <p className="dept-text-secondary text-sm font-medium text-gray-600 mb-6 leading-relaxed">
              {t('តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបដេប៉ាតឺម៉ង់', 'Are you sure you want to delete department')} «<span className="dept-text-primary font-extrabold text-gray-900">{getDepartmentDisplayName(selectedDepartment)}</span>» {t('នេះមែនទេ?', 'this department?')}
              <br /><br />
              <span className="dept-warning-box text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100 block">
                {t('* ការលុបនេះអាចប៉ះពាល់ដល់ទិន្នន័យគ្រូ សិស្ស និងមុខវិជ្ជាដែលពាក់ព័ន្ធ។', '* Deleting this will affect associated teachers, students, and courses.')}
              </span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedDepartment(null);
                }}
                className="dept-cancel-btn px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-all shadow-md cursor-pointer"
              >
                {t('លុបចោល', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ CSS សម្រាប់កំណត់ពណ៌ទម្រង់យប់ (Dark Mode) ឱ្យស្អាតភ្លឺច្បាស់ និងស្រួលមើល */}
      <style>{`
        html.dark .dept-page-bg {
          background-color: transparent !important;
        }
        html.dark .dept-surface-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .dept-surface-card:hover {
          border-color: #4f46e5 !important;
        }
        html.dark .dept-text-primary,
        html.dark .dept-card-title {
          color: #f8fafc !important;
        }
        html.dark .group:hover .dept-card-title {
          color: #818cf8 !important;
        }
        html.dark .dept-text-secondary {
          color: #94a3b8 !important;
        }
        html.dark .dept-text-muted {
          color: #64748b !important;
        }
        html.dark .dept-label {
          color: #cbd5e1 !important;
        }
        html.dark .dept-divider {
          border-color: #334155 !important;
        }

        /* ប្រអប់ Input ស្វែងរក និង Form ក្នុងទម្រង់យប់ */
        html.dark .dept-input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        html.dark .dept-input::placeholder {
          color: #64748b !important;
        }
        html.dark .dept-input:focus {
          border-color: #6366f1 !important;
          background-color: #0f172a !important;
        }

        /* ផ្លាកសញ្ញាស្ថិតិ (Stats Badges) ក្នុងទម្រង់យប់ */
        html.dark .dept-badge-indigo {
          background-color: rgba(99, 102, 241, 0.15) !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }
        html.dark .dept-badge-indigo span,
        html.dark .dept-badge-indigo svg {
          color: #818cf8 !important;
        }

        html.dark .dept-badge-purple {
          background-color: rgba(168, 85, 247, 0.15) !important;
          border-color: rgba(168, 85, 247, 0.3) !important;
        }
        html.dark .dept-badge-purple span,
        html.dark .dept-badge-purple svg {
          color: #c084fc !important;
        }

        html.dark .dept-badge-emerald {
          background-color: rgba(16, 185, 129, 0.15) !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        html.dark .dept-badge-emerald span,
        html.dark .dept-badge-emerald svg {
          color: #34d399 !important;
        }

        html.dark .dept-badge-amber {
          background-color: rgba(245, 158, 11, 0.15) !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }
        html.dark .dept-badge-amber span,
        html.dark .dept-badge-amber svg {
          color: #fbbf24 !important;
        }

        html.dark .dept-badge-rose {
          background-color: rgba(244, 63, 94, 0.15) !important;
          border-color: rgba(244, 63, 94, 0.3) !important;
          color: #fb7185 !important;
        }

        /* ប្រអប់ស្ថិតិទាំង ៣ នៅក្នុងកាតដេប៉ាតឺម៉ង់នីមួយៗ */
        html.dark .dept-stats-container {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
        }
        html.dark .dept-stat-item {
          background-color: #1e293b !important;
          border: 1px solid #334155 !important;
        }
        html.dark .dept-stat-purple { color: #c084fc !important; }
        html.dark .dept-stat-emerald { color: #34d399 !important; }
        html.dark .dept-stat-amber { color: #fbbf24 !important; }

        html.dark .dept-total-pill {
          background-color: #0f172a !important;
          color: #e2e8f0 !important;
          border-color: #334155 !important;
        }

        /* ប៊ូតុងកែប្រែ និងលុបលើកាត */
        html.dark .dept-action-box {
          background-color: rgba(15, 23, 42, 0.85) !important;
          border-color: #334155 !important;
        }
        html.dark .dept-action-edit:hover {
          background-color: rgba(99, 102, 241, 0.2) !important;
          color: #818cf8 !important;
        }
        html.dark .dept-action-delete:hover {
          background-color: rgba(244, 63, 94, 0.2) !important;
          color: #fb7185 !important;
        }

        /* ផ្ទាំង Modal បន្ថែម/កែប្រែ និងលុប */
        html.dark .dept-modal-card {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        html.dark .dept-modal-bar {
          background-color: rgba(15, 23, 42, 0.6) !important;
          border-color: #334155 !important;
        }
        html.dark .dept-close-btn,
        html.dark .dept-cancel-btn {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        html.dark .dept-close-btn:hover,
        html.dark .dept-cancel-btn:hover {
          background-color: #334155 !important;
          color: #ffffff !important;
        }
        html.dark .dept-delete-title {
          color: #fb7185 !important;
        }
        html.dark .dept-warning-box {
          background-color: rgba(244, 63, 94, 0.12) !important;
          border-color: rgba(244, 63, 94, 0.25) !important;
          color: #fda4af !important;
        }
      `}</style>
    </div>
  );
};

export default ManageDepartments;
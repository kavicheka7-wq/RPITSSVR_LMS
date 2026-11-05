// src/components/admin/ManageUsers.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { getCachedRoles } from '../../services/metadataService';
import { toast } from 'react-toastify';
import { useLanguage } from '../../context/LanguageContext';
import { PencilIcon, TrashIcon, PlusIcon, UserGroupIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const CACHE_KEY_USERS = 'cached_admin_users_page1';
const CACHE_KEY_USERS_META = 'cached_admin_users_meta';

const ManageUsers = () => {
  const { t, language } = useLanguage();
  const [users, setUsers] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY_USERS);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [meta, setMeta] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY_USERS_META);
      return cached ? JSON.parse(cached) : { current_page: 1, last_page: 1, total: 0, per_page: 15 };
    } catch {
      return { current_page: 1, last_page: 1, total: 0, per_page: 15 };
    }
  });
  const [loading, setLoading] = useState(users.length === 0);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // ✅ Pagination States
  const [page, setPage] = useState(1);
  const [perPage] = useState(15);
  
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    role_id: '',
    status: 'active',
    gender: '',
    phone: '',
  });
  const [roles, setRoles] = useState([]);

  // ✅ Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Initial load
  useEffect(() => {
    fetchRoles();
  }, []);

  // ✅ Fetch users ពេល page ឬ debouncedSearch ផ្លាស់ប្តូរ
  useEffect(() => {
    fetchUsers();
  }, [page, debouncedSearch]);

  const fetchUsers = async () => {
    if (users.length === 0) setLoading(true);
    try {
      const response = await api.get('/admin/users', {
        params: {
          page,
          per_page: perPage,
          search: debouncedSearch,
        }
      });
      const data = response.data.data || [];
      const metaData = {
        current_page: response.data.current_page || 1,
        last_page: response.data.last_page || 1,
        total: response.data.total || 0,
        per_page: response.data.per_page || perPage,
      };
      setUsers(data);
      setMeta(metaData);

      if (page === 1 && !debouncedSearch) {
        localStorage.setItem(CACHE_KEY_USERS, JSON.stringify(data));
        localStorage.setItem(CACHE_KEY_USERS_META, JSON.stringify(metaData));
      }
    } catch (error) {
      toast.error(t('មិនអាចទាញយកទិន្នន័យអ្នកប្រើប្រាស់បានទេ', 'Failed to fetch users'));
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const rolesData = await getCachedRoles();
      setRoles(rolesData || []);
    } catch (error) {
      console.error('Error fetching roles:', error);
    }
  };

  const getRoleDisplayName = (roleName) => {
    if (language === 'km') {
      switch(roleName) {
        case 'Admin': return 'អ្នកគ្រប់គ្រង';
        case 'Teacher': return 'គ្រូបង្រៀន';
        case 'Student': return 'សិស្ស';
        default: return roleName;
      }
    }
    return roleName;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.put(`/admin/users/${editingUser.id}`, formData);
        toast.success(t('បានកែប្រែអ្នកប្រើប្រាស់ដោយជោគជ័យ', 'User updated successfully'));
      } else {
        await api.post('/admin/users', formData);
        toast.success(t('បានបន្ថែមអ្នកប្រើប្រាស់ដោយជោគជ័យ', 'User created successfully'));
      }
      localStorage.removeItem(CACHE_KEY_USERS);
      localStorage.removeItem(CACHE_KEY_USERS_META);
      setShowModal(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || t('ការធ្វើប្រតិបត្តិការបានបរាជ័យ', 'Operation failed'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('តើអ្នកប្រាកដថាចង់លុបអ្នកប្រើប្រាស់នេះមែនទេ?', 'Are you sure you want to delete this user?'))) {
      try {
        await api.delete(`/admin/users/${id}`);
        localStorage.removeItem(CACHE_KEY_USERS);
        localStorage.removeItem(CACHE_KEY_USERS_META);
        toast.success(t('បានលុបអ្នកប្រើប្រាស់ដោយជោគជ័យ', 'User deleted successfully'));
        fetchUsers();
      } catch (error) {
        toast.error(t('មិនអាចលុបអ្នកប្រើប្រាស់បានទេ', 'Failed to delete user'));
      }
    }
  };

  const resetForm = () => {
    setFormData({
      first_name: '', last_name: '', email: '', password: '',
      role_id: '', status: 'active', gender: '', phone: '',
    });
    setEditingUser(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFormData({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      password: '',
      role_id: user.role_id,
      status: user.status,
      gender: user.gender || '',
      phone: user.phone || '',
    });
    setShowModal(true);
  };

  const statusLabel = (status) => (status === 'active' ? t('សកម្ម', 'Active') : t('អសកម្ម', 'Inactive'));

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="bg-primary-100 text-primary-700 p-2 rounded-lg">
              <UserGroupIcon className="h-6 w-6" />
            </span>
            {t('គ្រប់គ្រងអ្នកប្រើប្រាស់', 'Manage Users')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t('បង្កើត និងគ្រប់គ្រងគណនីអ្នកប្រើប្រាស់ក្នុងប្រព័ន្ធ', 'Create and manage user accounts in system')}</p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-primary-700 transition-colors"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          {t('បន្ថែមអ្នកប្រើប្រាស់', 'Add User')}
        </button>
      </div>

      {/* ✅ Search Box */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('ស្វែងរកតាមឈ្មោះ ឬអ៊ីមែល...', 'Search by name or email...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">{t('បញ្ជីអ្នកប្រើប្រាស់', 'Users List')}</h2>
          <span className="px-3 py-1 bg-primary-50 text-primary-700 text-xs font-bold rounded-lg border border-primary-100">
            {meta.total || 0}
          </span>
        </div>

        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('អ្នកប្រើប្រាស់', 'User')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('អ៊ីមែល', 'Email')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('តួនាទី', 'Role')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('ស្ថានភាព', 'Status')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('សកម្មភាព', 'Action')}</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {loading && users.length === 0 ? (
              [...Array(6)].map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                      <div className="h-4 bg-gray-200 rounded w-28"></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-gray-200 rounded w-36"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-5 bg-gray-200 rounded-full w-16"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="h-7 bg-gray-200 rounded w-16 ml-auto"></div>
                  </td>
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-14 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <UserGroupIcon className="h-12 w-12 text-gray-300 mb-3" />
                    <p className="font-medium">{t('មិនទាន់មានអ្នកប្រើប្រាស់នៅឡើយទេ', 'No users found')}</p>
                  </div>
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-primary-50 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary-700">
                          {user.first_name?.[0]}{user.last_name?.[0]}
                        </span>
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {user.first_name} {user.last_name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{getRoleDisplayName(user.role?.role_name)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {statusLabel(user.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => openEditModal(user)} className="text-gray-400 hover:text-primary-600 transition-colors mr-2 p-1.5 rounded-lg hover:bg-primary-50">
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button onClick={() => handleDelete(user.id)} className="text-gray-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50">
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ✅ Pagination UI */}
        {meta.last_page > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
            <p className="text-xs font-bold text-gray-600">
              {t('ទំព័រ', 'Page')} {meta.current_page} / {meta.last_page} ({meta.total} {t('អ្នកប្រើ', 'users')})
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={meta.current_page === 1}
                className="px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {t('មុន', 'Previous')}
              </button>
              {(() => {
                const totalPages = meta.last_page || 1;
                const current = meta.current_page || 1;
                let start = Math.max(1, current - 2);
                let end = Math.min(totalPages, start + 4);
                if (end - start < 4) {
                  start = Math.max(1, end - 4);
                }
                const pages = [];
                for (let i = start; i <= end; i++) {
                  pages.push(i);
                }
                return pages.map((pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                      meta.current_page === pageNum
                        ? 'bg-primary-600 text-white'
                        : 'bg-white border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                ));
              })()}
              <button
                onClick={() => setPage(p => Math.min(meta.last_page, p + 1))}
                disabled={meta.current_page === meta.last_page}
                className="px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {t('បន្ទាប់', 'Next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal (ដូចដើម មិនបានកែ) */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-start justify-center p-4">
          <div className="relative mt-16 mb-8 w-full max-w-md bg-white rounded-2xl shadow-xl">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingUser ? t('កែប្រែអ្នកប្រើប្រាស់', 'Edit User') : t('បន្ថែមអ្នកប្រើប្រាស់ថ្មី', 'Add New User')}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg h-8 w-8 flex items-center justify-center transition-colors">
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('នាមខ្លួន', 'First Name')}</label>
                    <input type="text" required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('នាមត្រកូល', 'Last Name')}</label>
                    <input type="text" required value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('អ៊ីមែល', 'Email')}</label>
                  <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {editingUser ? t('ពាក្យសម្ងាត់ (ទុកឲ្យទទេ ដើម្បីរក្សាដដែល)', 'Password (leave empty to keep unchanged)') : t('ពាក្យសម្ងាត់', 'Password')}
                  </label>
                  <input type="password" required={!editingUser} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('តួនាទី', 'Role')}</label>
                    <select required value={formData.role_id} onChange={(e) => setFormData({ ...formData, role_id: e.target.value })} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm">
                      <option value="">{t('ជ្រើសរើសតួនាទី', 'Select Role')}</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>{getRoleDisplayName(role.role_name)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('ស្ថានភាព', 'Status')}</label>
                    <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm">
                      <option value="active">{t('សកម្ម', 'Active')}</option>
                      <option value="inactive">{t('អសកម្ម', 'Inactive')}</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  {t('បោះបង់', 'Cancel')}
                </button>
                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors shadow-sm">
                  {editingUser ? t('រក្សាទុក', 'Save') : t('បង្កើត', 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;
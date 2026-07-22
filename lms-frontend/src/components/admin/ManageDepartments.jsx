// src/components/admin/ManageDepartments.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon,
  XMarkIcon,
  BuildingLibraryIcon,
  UserGroupIcon,
  BookOpenIcon,
  MagnifyingGlassIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

const ManageDepartments = () => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/admin/departments');
      setDepartments(response.data.data || []);
      console.log('Departments with counts:', response.data.data);
    } catch (error) {
      console.error('Error fetching departments:', error);
      toast.error('មិនអាចទាញយកបញ្ជីដេប៉ាតឺម៉ង់បានទេ');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const payload = {
      name: formData.name,
      description: formData.description,
    };

    try {
      let response;
      if (editingDepartment) {
        response = await api.put(`/admin/departments/${editingDepartment.id}`, payload);
        toast.success('បានកែប្រែដេប៉ាតឺម៉ង់ដោយជោគជ័យ');
      } else {
        response = await api.post('/admin/departments', payload);
        toast.success('បានបន្ថែមដេប៉ាតឺម៉ង់ថ្មីដោយជោគជ័យ');
      }
      setShowModal(false);
      resetForm();
      fetchDepartments();
    } catch (error) {
      console.error('Submit error:', error.response?.data);
      toast.error(error.response?.data?.message || 'ការធ្វើប្រតិបត្តិការបានបរាជ័យ');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('តើអ្នកប្រាកដថាចង់លុបដេប៉ាតឺម៉ង់នេះមែនទេ?')) {
      try {
        await api.delete(`/admin/departments/${id}`);
        toast.success('បានលុបដេប៉ាតឺម៉ង់ដោយជោគជ័យ');
        fetchDepartments();
      } catch (error) {
        toast.error(error.response?.data?.message || 'មិនអាចលុបដេប៉ាតឺម៉ង់បានទេ');
      }
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

  const openEditModal = (department) => {
    setEditingDepartment(department);
    setFormData({
      name: department.name || department.department_name || '',
      description: department.description || '',
    });
    setShowModal(true);
  };

  // Filter departments based on search
  const filteredDepartments = departments.filter(dept => {
    const search = searchTerm.toLowerCase();
    return (
      (dept.name || dept.department_name || '').toLowerCase().includes(search) ||
      (dept.description || '').toLowerCase().includes(search)
    );
  });

  // Get random color for department icon
  const getDepartmentColor = (index) => {
    const colors = [
      'from-blue-500 to-blue-600',
      'from-green-500 to-green-600',
      'from-purple-500 to-purple-600',
      'from-orange-500 to-orange-600',
      'from-red-500 to-red-600',
      'from-indigo-500 to-indigo-600',
      'from-pink-500 to-pink-600',
      'from-teal-500 to-teal-600',
    ];
    return colors[index % colors.length];
  };

  const getTotalUsers = (dept) => {
    return (dept.teachers_count || 0) + (dept.students_count || 0);
  };


  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
              <BuildingLibraryIcon className="h-6 w-6" />
            </span>
            ដេប៉ាតឺម៉ង់
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            គ្រប់គ្រងដេប៉ាតឺម៉ង់ទាំងអស់ក្នុងប្រព័ន្ធ
            <span className="ml-2 text-indigo-600 font-medium">({departments.length} ដេប៉ាតឺម៉ង់)</span>
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition-all hover:shadow-md"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          បន្ថែមដេប៉ាតឺម៉ង់
        </button>
      </div>

      {/* Search & Stats */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="ស្វែងរកដេប៉ាតឺម៉ង់..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <span className="font-medium text-gray-700">{departments.length}</span>
              <span>ដេប៉ាតឺម៉ង់</span>
            </div>
            <div className="w-px h-6 bg-gray-200"></div>
            <div className="flex items-center gap-1">
              <AcademicCapIcon className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-gray-700">
                {departments.reduce((acc, dept) => acc + (dept.teachers_count || 0), 0)}
              </span>
              <span>គ្រូ</span>
            </div>
            <div className="w-px h-6 bg-gray-200"></div>
            <div className="flex items-center gap-1">
              <UserGroupIcon className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-gray-700">
                {departments.reduce((acc, dept) => acc + (dept.students_count || 0), 0)}
              </span>
              <span>សិស្ស</span>
            </div>
            <div className="w-px h-6 bg-gray-200"></div>
            <div className="flex items-center gap-1">
              <BookOpenIcon className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-gray-700">
                {departments.reduce((acc, dept) => acc + (dept.courses_count || 0), 0)}
              </span>
              <span>មុខវិជ្ជា</span>
            </div>
          </div>
        </div>
      </div>

      {/* Departments Grid */}
      {filteredDepartments.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <BuildingLibraryIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">
            {searchTerm ? 'មិនឃើញលទ្ធផលស្វែងរក' : 'មិនទាន់មានដេប៉ាតឺម៉ង់នៅឡើយទេ'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {searchTerm ? 'សូមប្តូរពាក្យស្វែងរក' : 'ចុច "បន្ថែមដេប៉ាតឺម៉ង់" ដើម្បីចាប់ផ្តើម'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDepartments.map((dept, index) => {
            const colorGradient = getDepartmentColor(index);
            const deptName = dept.name || dept.department_name || 'មិនស្គាល់';
            const deptDesc = dept.description || 'គ្មានការពិពណ៌នា';
            const teacherCount = dept.teachers_count || 0;
            const studentCount = dept.students_count || 0;
            const courseCount = dept.courses_count || 0;
            const totalUsers = teacherCount + studentCount;

            return (
              <div 
                key={dept.id} 
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-r ${colorGradient} flex items-center justify-center shadow-sm`}>
                    <BuildingLibraryIcon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(dept)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      title="កែប្រែ"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(dept.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title="លុប"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {deptName}
                </h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                  {deptDesc}
                </p>

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
                      <AcademicCapIcon className="h-4 w-4 text-purple-500" />
                      <span className="font-medium text-gray-900">{teacherCount}</span>
                    </div>
                    <p className="text-xs text-gray-400">គ្រូ</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
                      <UserGroupIcon className="h-4 w-4 text-green-500" />
                      <span className="font-medium text-gray-900">{studentCount}</span>
                    </div>
                    <p className="text-xs text-gray-400">សិស្ស</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
                      <BookOpenIcon className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-gray-900">{courseCount}</span>
                    </div>
                    <p className="text-xs text-gray-400">មុខវិជ្ជា</p>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-gray-50">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>អ្នកប្រើសរុប</span>
                    <span className="font-medium text-gray-700">{totalUsers}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal - Create/Edit Department */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 animate-fadeIn">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                  <BuildingLibraryIcon className="h-5 w-5" />
                </span>
                {editingDepartment ? 'កែប្រែដេប៉ាតឺម៉ង់' : 'បន្ថែមដេប៉ាតឺម៉ង់ថ្មី'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ឈ្មោះដេប៉ាតឺម៉ង់ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="ឧ. វិទ្យាសាស្ត្រកុំព្យូទ័រ"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ការពិពណ៌នា
                </label>
                <textarea
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                  placeholder="ពិពណ៌នាអំពីដេប៉ាតឺម៉ង់..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2"
                >
                  <BuildingLibraryIcon className="h-5 w-5" />
                  {editingDepartment ? 'រក្សាទុក' : 'បង្កើតដេប៉ាតឺម៉ង់'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageDepartments;
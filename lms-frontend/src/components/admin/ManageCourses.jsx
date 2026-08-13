// src/components/admin/ManageCourses.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useLanguage } from '../../context/LanguageContext';
import { 
  PencilIcon, 
  TrashIcon, 
  PlusIcon, 
  BookOpenIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const ManageCourses = () => {
  const { t } = useLanguage();
  const [courses, setCourses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    course_code: '',
    course_name: '',
    credit: 3,
    description: '',
    department_id: '',
    teacher_id: '',
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchCourses(),
        fetchDepartments(),
        fetchTeachers()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const response = await api.get('/admin/courses');
      const coursesData = response.data.data || response.data || [];
      setCourses(coursesData);
    } catch (error) {
      console.error('Error fetching courses:', error);
      toast.error(t('មិនអាចទាញយកទិន្នន័យមុខវិជ្ជាបានទេ', 'Cannot fetch courses data'));
      throw error;
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/admin/departments');
      const departmentsData = response.data.data || response.data || [];
      setDepartments(departmentsData);
    } catch (error) {
      console.error('Error fetching departments:', error);
      toast.error(t('មិនអាចទាញយកទិន្នន័យជំនាញបានទេ', 'Cannot fetch departments data'));
      throw error;
    }
  };

  const fetchTeachers = async () => {
    try {
      const response = await api.get('/admin/teachers');
      const teachersData = response.data.data?.data || response.data.data || response.data || [];
      setTeachers(teachersData);
    } catch (error) {
      console.error('Error fetching teachers:', error);
      toast.error(t('មិនអាចទាញយកទិន្នន័យគ្រូបង្រៀនបានទេ', 'Cannot fetch teachers data'));
      throw error;
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
    
    const payload = { ...formData };

    if (!payload.course_name || !payload.course_code || !payload.department_id || !payload.teacher_id) {
      toast.error(t('សូមបំពេញព័ត៌មានឱ្យបានពេញលេញ', 'Please fill in all required fields'));
      return;
    }

    try {
      let response;
      if (editingCourse) {
        response = await api.put(`/admin/courses/${editingCourse.id}`, payload);
        toast.success(t('បានកែប្រែមុខវិជ្ជាដោយជោគជ័យ', 'Course updated successfully'));
      } else {
        response = await api.post('/admin/courses', payload);
        toast.success(t('បានបន្ថែមមុខវិជ្ជាដោយជោគជ័យ', 'Course added successfully'));
      }
      
      setShowModal(false);
      resetForm();
      await fetchCourses();
      
    } catch (error) {
      console.error('Submit error:', error.response?.data);
      
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        const errorMessages = Object.values(errors).flat().join('\n');
        toast.error(errorMessages);
      } else {
        toast.error(error.response?.data?.message || t('ការធ្វើប្រតិបត្តិការបានបរាជ័យ', 'Operation failed'));
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('តើអ្នកប្រាកដថាចង់លុបមុខវិជ្ជានេះមែនទេ?', 'Are you sure you want to delete this course?'))) {
      try {
        await api.delete(`/admin/courses/${id}`);
        toast.success(t('បានលុបមុខវិជ្ជាដោយជោគជ័យ', 'Course deleted successfully'));
        await fetchCourses();
      } catch (error) {
        console.error('Delete error:', error.response?.data);
        toast.error(error.response?.data?.message || t('មិនអាចលុបមុខវិជ្ជាបានទេ', 'Cannot delete course'));
      }
    }
  };

  const resetForm = () => {
    setFormData({
      course_code: '',
      course_name: '',
      credit: 3,
      description: '',
      department_id: '',
      teacher_id: '',
    });
    setEditingCourse(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (course) => {
    setEditingCourse(course);
    setFormData({
      course_code: course.course_code || '',
      course_name: course.course_name || '',
      credit: course.credit ?? 3,
      description: course.description || '',
      department_id: course.department_id || '',
      teacher_id: course.teacher_id || '',
    });
    setShowModal(true);
  };

  const filteredCourses = courses.filter(course => {
    const search = searchTerm.toLowerCase();
    return (
      course.course_name?.toLowerCase().includes(search) ||
      course.course_code?.toLowerCase().includes(search) ||
      course.department?.department_name?.toLowerCase().includes(search) ||
      course.teacher?.first_name?.toLowerCase().includes(search) ||
      course.teacher?.last_name?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                <BookOpenIcon className="h-6 w-6" />
              </span>
              {t('គ្រប់គ្រងមុខវិជ្ជា', 'Manage Courses')}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('បន្ថែម និងគ្រប់គ្រងមុខវិជ្ជាទាំងអស់ក្នុងប្រព័ន្ធ', 'Add and manage all system courses')}
              <span className="ml-2 text-indigo-600 font-medium">({courses.length} {t('មុខវិជ្ជា', 'courses')})</span>
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition-all hover:shadow-md"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            {t('បន្ថែមមុខវិជ្ជា', 'Add Course')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('ស្វែងរកតាមឈ្មោះ កូដ ជំនាញ ឬគ្រូបង្រៀន...', 'Search by name, code, department, or teacher...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="h-20 w-20 rounded-full border-t-2 border-b-2 border-indigo-100"></div>
            <div className="absolute top-0 left-0 h-20 w-20 rounded-full border-t-2 border-indigo-600 animate-spin"></div>
          </div>
          <p className="mt-6 text-base font-medium text-gray-600">{t('កំពុងផ្ទុកទិន្នន័យមុខវិជ្ជា...', 'Loading courses data...')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('សូមរង់ចាំមួយភ្លែត', 'Please wait a moment')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('មុខវិជ្ជា', 'Course')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('កូដ', 'Code')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ជំនាញ', 'Department')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('គ្រូបង្រៀន', 'Teacher')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ក្រេឌីត', 'Credit')}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('សកម្មភាព', 'Action')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredCourses.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-14 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <BookOpenIcon className="h-16 w-16 text-gray-300 mb-3" />
                        <p className="font-medium">
                          {searchTerm ? t('មិនឃើញលទ្ធផលស្វែងរក', 'No search results found') : t('មិនទាន់មានមុខវិជ្ជានៅឡើយទេ', 'No courses available yet')}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          {searchTerm ? t('សូមប្តូរពាក្យស្វែងរក', 'Try a different search term') : t('ចុច "បន្ថែមមុខវិជ្ជា" ដើម្បីចាប់ផ្តើម', 'Click "Add Course" to start')}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCourses.map((course) => (
                    <tr key={course.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white font-medium text-sm shadow-sm">
                            <BookOpenIcon className="h-5 w-5" />
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {course.course_name}
                            </div>
                            <div className="text-xs text-gray-500 line-clamp-1">
                              {course.description || t('គ្មានការពិពណ៌នា', 'No description')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-mono bg-gray-100 text-gray-700 rounded-lg">
                          {course.course_code}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {course.department?.department_name || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {course.teacher
                          ? `${course.teacher.first_name} ${course.teacher.last_name}`
                          : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          {course.credit} {t('ក្រេឌីត', 'Credits')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => openEditModal(course)}
                            className="p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all"
                            title={t('កែប្រែ', 'Edit')}
                          >
                            <PencilIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(course.id)}
                            className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-xl transition-all"
                            title={t('លុប', 'Delete')}
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {filteredCourses.length > 0 && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-sm text-gray-600">
                {t('បង្ហាញ', 'Showing')} <span className="font-medium text-gray-900">{filteredCourses.length}</span> {t('មុខវិជ្ជា', 'courses')}
                {courses.length !== filteredCourses.length && (
                  <span> {t('ក្នុងចំណោម', 'out of')} <span className="font-medium text-gray-900">{courses.length}</span> {t('មុខវិជ្ជា', 'courses')}</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modal - Create/Edit Course */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 p-8 max-h-[90vh] overflow-y-auto animate-scaleIn">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                  <BookOpenIcon className="h-5 w-5" />
                </span>
                {editingCourse ? t('កែប្រែមុខវិជ្ជា', 'Edit Course') : t('បន្ថែមមុខវិជ្ជាថ្មី', 'Add New Course')}
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
                  {t('ឈ្មោះមុខវិជ្ជា', 'Course Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="course_name"
                  required
                  value={formData.course_name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder={t('ឧ. គ្រឹះវិទ្យាសាស្ត្រកុំព្យូទ័រ', 'e.g. Computer Science Fundamentals')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('កូដមុខវិជ្ជា', 'Course Code')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="course_code"
                    required
                    value={formData.course_code}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder={t('ឧ. CS101', 'e.g. CS101')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('ក្រេឌីត', 'Credit')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="credit"
                    min="1"
                    max="6"
                    required
                    value={formData.credit}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('ជំនាញ', 'Department')} <span className="text-red-500">*</span>
                </label>
                <select
                  name="department_id"
                  required
                  value={formData.department_id}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                >
                  <option value="">{t('ជ្រើសរើសជំនាញ', 'Select Department')}</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.department_name || dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('គ្រូបង្រៀនទទួលបន្ទុក', 'Assigned Teacher')} <span className="text-red-500">*</span>
                </label>
                <select
                  name="teacher_id"
                  required
                  value={formData.teacher_id}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                >
                  <option value="">{t('ជ្រើសរើសគ្រូបង្រៀន', 'Select Teacher')}</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.first_name} {teacher.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('ការពិពណ៌នា', 'Description')}
                </label>
                <textarea
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                  placeholder={t('ពិពណ៌នាអំពីមុខវិជ្ជា...', 'Describe the course...')}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
                >
                  {t('បោះបង់', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2"
                >
                  <BookOpenIcon className="h-5 w-5" />
                  {editingCourse ? t('រក្សាទុក', 'Save') : t('បង្កើតមុខវិជ្ជា', 'Create Course')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageCourses;
// src/components/admin/ManageCourses.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { 
  PencilIcon, 
  TrashIcon, 
  PlusIcon, 
  BookOpenIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const ManageCourses = () => {
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
      // ពិនិត្យមើលថាតើទិន្នន័យស្ថិតក្នុង data.data ឬ data
      const coursesData = response.data.data || response.data || [];
      setCourses(coursesData);
      console.log('Courses loaded:', coursesData);
    } catch (error) {
      console.error('Error fetching courses:', error);
      toast.error('មិនអាចទាញយកទិន្នន័យមុខវិជ្ជាបានទេ');
      throw error;
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/admin/departments');
      const departmentsData = response.data.data || response.data || [];
      setDepartments(departmentsData);
      console.log('Departments loaded:', departmentsData);
    } catch (error) {
      console.error('Error fetching departments:', error);
      toast.error('មិនអាចទាញយកទិន្នន័យជំនាញបានទេ');
      throw error;
    }
  };

  const fetchTeachers = async () => {
    try {
      const response = await api.get('/admin/teachers');
      const teachersData = response.data.data || response.data || [];
      setTeachers(teachersData);
      console.log('Teachers loaded:', teachersData);
    } catch (error) {
      console.error('Error fetching teachers:', error);
      toast.error('មិនអាចទាញយកទិន្នន័យគ្រូបង្រៀនបានទេ');
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

    // ពិនិត្យមើលថាតើមានទិន្នន័យគ្រប់គ្រាន់
    if (!payload.course_name || !payload.course_code || !payload.department_id || !payload.teacher_id) {
      toast.error('សូមបំពេញព័ត៌មានឱ្យបានពេញលេញ');
      return;
    }

    try {
      let response;
      if (editingCourse) {
        response = await api.put(`/admin/courses/${editingCourse.id}`, payload);
        toast.success('បានកែប្រែមុខវិជ្ជាដោយជោគជ័យ');
      } else {
        response = await api.post('/admin/courses', payload);
        toast.success('បានបន្ថែមមុខវិជ្ជាដោយជោគជ័យ');
      }
      
      console.log('Response:', response.data);
      
      setShowModal(false);
      resetForm();
      await fetchCourses(); // ធ្វើបច្ចុប្បន្នភាពបញ្ជី
      
    } catch (error) {
      console.error('Submit error:', error.response?.data);
      
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        const errorMessages = Object.values(errors).flat().join('\n');
        toast.error(errorMessages);
      } else {
        toast.error(error.response?.data?.message || 'ការធ្វើប្រតិបត្តិការបានបរាជ័យ');
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('តើអ្នកប្រាកដថាចង់លុបមុខវិជ្ជានេះមែនទេ?')) {
      try {
        await api.delete(`/admin/courses/${id}`);
        toast.success('បានលុបមុខវិជ្ជាដោយជោគជ័យ');
        await fetchCourses();
      } catch (error) {
        console.error('Delete error:', error.response?.data);
        toast.error(error.response?.data?.message || 'មិនអាចលុបមុខវិជ្ជាបានទេ');
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

  // Filter courses based on search
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
              គ្រប់គ្រងមុខវិជ្ជា
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              បន្ថែម និងគ្រប់គ្រងមុខវិជ្ជាទាំងអស់ក្នុងប្រព័ន្ធ
              <span className="ml-2 text-indigo-600 font-medium">({courses.length} មុខវិជ្ជា)</span>
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition-all hover:shadow-md"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            បន្ថែមមុខវិជ្ជា
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="ស្វែងរកតាមឈ្មោះ កូដ ជំនាញ ឬគ្រូបង្រៀន..."
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

      {/* Courses Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  មុខវិជ្ជា
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  កូដ
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ជំនាញ
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  គ្រូបង្រៀន
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ក្រេឌីត
                </th>
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  សកម្មភាព
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
                        {searchTerm ? 'មិនឃើញលទ្ធផលស្វែងរក' : 'មិនទាន់មានមុខវិជ្ជានៅឡើយទេ'}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {searchTerm ? 'សូមប្តូរពាក្យស្វែងរក' : 'ចុច "បន្ថែមមុខវិជ្ជា" ដើម្បីចាប់ផ្តើម'}
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
                            {course.description || 'គ្មានការពិពណ៌នា'}
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
                        {course.credit} ក្រេឌីត
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => openEditModal(course)}
                          className="p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all"
                          title="កែប្រែ"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(course.id)}
                          className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-xl transition-all"
                          title="លុប"
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
        
        {/* Footer with count */}
        {filteredCourses.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-sm text-gray-600">
              បង្ហាញ <span className="font-medium text-gray-900">{filteredCourses.length}</span> មុខវិជ្ជា
              {courses.length !== filteredCourses.length && (
                <span> ក្នុងចំណោម <span className="font-medium text-gray-900">{courses.length}</span> មុខវិជ្ជា</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Modal - Create/Edit Course */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                  <BookOpenIcon className="h-5 w-5" />
                </span>
                {editingCourse ? 'កែប្រែមុខវិជ្ជា' : 'បន្ថែមមុខវិជ្ជាថ្មី'}
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
                  ឈ្មោះមុខវិជ្ជា <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="course_name"
                  required
                  value={formData.course_name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="ឧ. គ្រឹះវិទ្យាសាស្ត្រកុំព្យូទ័រ"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    កូដមុខវិជ្ជា <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="course_code"
                    required
                    value={formData.course_code}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="ឧ. CS101"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    ក្រេឌីត <span className="text-red-500">*</span>
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
                  ជំនាញ <span className="text-red-500">*</span>
                </label>
                <select
                  name="department_id"
                  required
                  value={formData.department_id}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                >
                  <option value="">ជ្រើសរើសជំនាញ</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.department_name || dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  គ្រូបង្រៀនទទួលបន្ទុក <span className="text-red-500">*</span>
                </label>
                <select
                  name="teacher_id"
                  required
                  value={formData.teacher_id}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                >
                  <option value="">ជ្រើសរើសគ្រូបង្រៀន</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.first_name} {teacher.last_name}
                    </option>
                  ))}
                </select>
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
                  placeholder="ពិពណ៌នាអំពីមុខវិជ្ជា..."
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
                  <BookOpenIcon className="h-5 w-5" />
                  {editingCourse ? 'រក្សាទុក' : 'បង្កើតមុខវិជ្ជា'}
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
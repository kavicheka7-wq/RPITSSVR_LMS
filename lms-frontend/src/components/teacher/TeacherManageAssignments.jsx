// src/components/teacher/TeacherManageAssignments.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  ClipboardDocumentListIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';

export default function TeacherManageAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    course_id: '',
    title: '',
    description: '',
    due_date: '',
    total_score: 100,
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchCourses(),
        fetchAssignments()
      ]);
    } catch (error) {
      console.error('Error fetching initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const response = await api.get('/teacher/courses');
      // ធានាថាវាចាប់យក Array ជានិច្ច
      const coursesData = response.data.data || response.data || [];
      setCourses(Array.isArray(coursesData) ? coursesData : []);
    } catch (error) {
      toast.error('មិនអាចទាញយកទិន្នន័យមុខវិជ្ជាបានទេ');
      setCourses([]);
    }
  };

  const fetchAssignments = async () => {
    try {
      const response = await api.get('/teacher/assignments');
      // ធានាថាវាចាប់យក Array ជានិច្ច
      const assignmentsData = response.data.data || response.data || [];
      setAssignments(Array.isArray(assignmentsData) ? assignmentsData : []);
    } catch (error) {
      toast.error('មិនអាចទាញយកទិន្នន័យកិច្ចការបានទេ');
      setAssignments([]);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openAddModal = () => {
    setEditingAssignment(null);
    setFormData({
      course_id: Array.isArray(courses) && courses.length > 0 ? courses[0].id : '',
      title: '',
      description: '',
      due_date: '',
      total_score: 100,
    });
    setShowAddModal(true);
  };

  const openEditModal = (assignment) => {
    setEditingAssignment(assignment);
    
    // Format the database date to datetime-local format (YYYY-MM-DDTHH:mm)
    let formattedDueDate = '';
    if (assignment.due_date) {
      const date = new Date(assignment.due_date);
      // Offset timezone to keep local time correctly formatted
      const tzOffset = date.getTimezoneOffset() * 60000;
      formattedDueDate = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
    }

    setFormData({
      course_id: assignment.course_id || '',
      title: assignment.title || '',
      description: assignment.description || '',
      due_date: formattedDueDate,
      total_score: assignment.total_score ?? 100,
    });
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = {
      course_id: formData.course_id,
      title: formData.title,
      description: formData.description,
      due_date: formData.due_date,
      total_score: parseFloat(formData.total_score) || 100,
    };

    try {
      if (editingAssignment) {
        await api.put(`/teacher/assignments/${editingAssignment.id}`, payload);
        toast.success('បានកែប្រែកិច្ចការដោយជោគជ័យ');
      } else {
        await api.post('/teacher/assignments', payload);
        toast.success('បានបន្ថែមកិច្ចការដោយជោគជ័យ');
      }
      setShowAddModal(false);
      await fetchAssignments();
    } catch (error) {
      console.error('Submit error:', error);
      if (error.response?.data?.errors) {
        toast.error(Object.values(error.response.data.errors).flat().join('\n'));
      } else {
        toast.error(error.response?.data?.message || 'ការរក្សាទុកកិច្ចការបានបរាជ័យ');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (assignment) => {
    setSelectedAssignment(assignment);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedAssignment) return;
    try {
      const response = await api.delete(`/teacher/assignments/${selectedAssignment.id}`);
      toast.success(response.data?.message || 'បានលុបកិច្ចការដោយជោគជ័យ');
      setShowDeleteModal(false);
      setSelectedAssignment(null);
      await fetchAssignments();
    } catch (error) {
      toast.error(error.response?.data?.message || 'មិនអាចលុបកិច្ចការបានទេ');
    }
  };

  // ប្រើ Array.isArray ដើម្បីការពារ Error Filter
  const filteredAssignments = Array.isArray(assignments) ? assignments.filter(assignment => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = 
      assignment.title?.toLowerCase().includes(search) ||
      assignment.description?.toLowerCase().includes(search);
    const matchesCourse = selectedCourse === '' || assignment.course_id?.toString() === selectedCourse;
    return matchesSearch && matchesCourse;
  }) : [];

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('kh-KH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };


  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                <ClipboardDocumentListIcon className="h-6 w-6" />
              </span>
              គ្រប់គ្រងកិច្ចការ (Assignments)
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              បង្កើត និងគ្រប់គ្រងកិច្ចការផ្ទះ ឬគម្រោងសម្រាប់សិស្ស
              <span className="ml-2 text-indigo-600 font-medium">({Array.isArray(assignments) ? assignments.length : 0} កិច្ចការ)</span>
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition-all hover:shadow-md"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            បន្ថែមតម្លៃកិច្ចការ
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="ស្វែងរកតាមចំណងជើង ឬការពិពណ៌នា..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="sm:w-64">
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white transition-all"
            >
              <option value="">គ្រប់មុខវិជ្ជា</option>
              {Array.isArray(courses) && courses.map(course => (
                <option key={course.id} value={course.id}>
                  {course.course_name} ({course.course_code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">No</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">កិច្ចការ (Assignment)</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">មុខវិជ្ជា (Course)</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ថ្ងៃកំណត់ (Due Date)</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">ពិន្ទុសរុប (Score)</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">ការដាក់ (Submissions)</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-14 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <ClipboardDocumentListIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="font-medium">
                        {searchTerm ? 'មិនឃើញលទ្ធផលស្វែងរក' : 'មិនទាន់មានកិច្ចការនៅឡើយទេ'}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {searchTerm ? 'សូមប្តូរពាក្យស្វែងរក' : 'ចុច "បន្ថែមតម្លៃកិច្ចការ" ដើម្បីចាប់ផ្តើម'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((assignment, index) => {
                  const submissionsCount = assignment.submissions_count || 0;
                  const isOverdue = new Date(assignment.due_date) < new Date();

                  return (
                    <tr key={assignment.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-400">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-gray-900">{assignment.title}</div>
                        <div className="text-xs text-gray-500 line-clamp-2 mt-1 max-w-sm">
                          {assignment.description}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-800 font-medium">
                          {assignment.course?.course_name || 'គ្មានមុខវិជ្ជា'}
                        </div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">
                          {assignment.course?.course_code}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        <div className={`flex items-center gap-1.5 font-medium ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                          <CalendarIcon className="h-4 w-4 shrink-0" />
                          {formatDate(assignment.due_date)}
                        </div>
                        {isOverdue && (
                          <span className="inline-block mt-0.5 px-2 py-0.5 rounded-sm bg-red-50 text-red-700 text-[10px] font-bold">
                            ហួសកំណត់
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-800">
                        {assignment.total_score} ភិន្ទុ
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${submissionsCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                          {submissionsCount} នាក់
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => openEditModal(assignment)}
                            className="p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all"
                            title="កែប្រែ"
                          >
                            <PencilSquareIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(assignment)}
                            className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-xl transition-all"
                            title="លុប"
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

      {/* Modal - Add/Edit Assignment */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                  <ClipboardDocumentListIcon className="h-5 w-5" />
                </span>
                {editingAssignment ? 'កែប្រែកិច្ចការ' : 'បន្ថែមដេញថ្លៃកិច្ចការថ្មី'}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ចំណងជើងកិច្ចការ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="ឧ. កិច្ចការទី១៖ សរសេរកូដ HTML/CSS"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  មុខវិជ្ជា <span className="text-red-500">*</span>
                </label>
                <select
                  name="course_id"
                  required
                  value={formData.course_id}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white transition-all"
                >
                  <option value="">ជ្រើសរើសមុខវិជ្ជា</option>
                  {Array.isArray(courses) && courses.map(course => (
                    <option key={course.id} value={course.id}>
                      {course.course_name} ({course.course_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    ថ្ងៃកំណត់ការដាក់កិច្ចការ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    name="due_date"
                    required
                    value={formData.due_date}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    ពិន្ទុសរុប <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="total_score"
                    min="10"
                    max="100"
                    required
                    value={formData.total_score}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ការពិពណ៌នាពីកិច្ចការ <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="description"
                  required
                  rows={4}
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="លម្អិតអំពីចំណុចការងារ លំហាត់ ឬការណែនាំផ្សេងៗ..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  ) : (
                    <ClipboardDocumentListIcon className="h-5 w-5" />
                  )}
                  {editingAssignment ? 'រក្សាទុក' : 'បង្កើតកិច្ចការ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-fadeIn">
            <div className="flex items-center text-red-600 mb-4">
              <ExclamationTriangleIcon className="h-6 w-6 mr-2" />
              <h3 className="text-lg font-bold">បញ្ជាក់ការលុប</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបកិច្ចការ «<span className="font-semibold text-gray-800">{selectedAssignment?.title}</span>» នេះមែនទេ?
              <br />
              <span className="text-red-500 text-xs font-semibold mt-1 block">ការលុបកិច្ចការនេះនឹងធ្វើឱ្យបាត់បង់រាល់ព័ត៌មានពាក់ព័ន្ធទាំងស្រុង។</span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedAssignment(null);
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
              >
                បោះបង់
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-xl hover:bg-red-700 transition-all shadow-sm"
              >
                លុបចោល
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
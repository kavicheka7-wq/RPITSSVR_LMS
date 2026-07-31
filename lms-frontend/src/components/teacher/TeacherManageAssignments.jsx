// src/components/teacher/TeacherManageAssignments.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { handleDownloadFile } from '../../utils/downloadUtils';
import {
  ClipboardDocumentListIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  UserCircleIcon,
  DocumentCheckIcon
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

  // Submissions Modal State
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [viewingAssignment, setViewingAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissionSearch, setSubmissionSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gradingData, setGradingData] = useState({});

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
    
    let formattedDueDate = '';
    if (assignment.due_date) {
      const date = new Date(assignment.due_date);
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

  // Submissions Handlers
  const openSubmissionsModal = async (assignment) => {
    setViewingAssignment(assignment);
    setShowSubmissionsModal(true);
    setLoadingSubmissions(true);
    setSubmissionSearch('');
    setStatusFilter('all');
    try {
      const response = await api.get(`/teacher/assignments/${assignment.id}/submissions`);
      const subs = response.data.submissions || [];
      setSubmissions(subs);

      const initialGrading = {};
      subs.forEach(sub => {
        initialGrading[sub.id] = {
          score: sub.score !== null && sub.score !== undefined ? sub.score : '',
          feedback: sub.feedback || '',
          isSaving: false
        };
      });
      setGradingData(initialGrading);
    } catch (error) {
      console.error('Fetch submissions error:', error);
      toast.error(error.response?.data?.message || 'មិនអាចទាញយកបញ្ជីការដាក់កិច្ចការបានទេ');
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const handleGradeChange = (submissionId, field, value) => {
    setGradingData(prev => ({
      ...prev,
      [submissionId]: {
        ...prev[submissionId],
        [field]: value
      }
    }));
  };

  const handleSaveGrade = async (submissionId) => {
    const currentGrade = gradingData[submissionId];
    if (!currentGrade) return;

    setGradingData(prev => ({
      ...prev,
      [submissionId]: { ...prev[submissionId], isSaving: true }
    }));

    try {
      const payload = {
        score: currentGrade.score !== '' ? parseFloat(currentGrade.score) : null,
        feedback: currentGrade.feedback || null,
      };

      const response = await api.put(`/teacher/submissions/${submissionId}/grade`, payload);
      toast.success(response.data?.message || 'បានកែប្រែពិន្ទុដោយជោគជ័យ');

      setSubmissions(prev => prev.map(sub => {
        if (sub.id === submissionId) {
          return {
            ...sub,
            score: response.data.submission.score,
            feedback: response.data.submission.feedback
          };
        }
        return sub;
      }));
    } catch (error) {
      console.error('Save grade error:', error);
      toast.error(error.response?.data?.message || 'មិនអាចដាក់ពិន្ទុបានទេ');
    } finally {
      setGradingData(prev => ({
        ...prev,
        [submissionId]: { ...prev[submissionId], isSaving: false }
      }));
    }
  };

  const getFileUrl = (filePath) => {
    if (!filePath) return '#';
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
    const backendBase = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '');
    const cleanPath = filePath.replace(/^\/?storage\//, '');
    return `${backendBase}/api/download-file?path=${encodeURIComponent(cleanPath)}`;
  };

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
                        <button
                          onClick={() => openSubmissionsModal(assignment)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:scale-105 ${submissionsCount > 0 ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                          title="មើលការដាក់កិច្ចការ"
                        >
                          <EyeIcon className="h-4 w-4" />
                          {submissionsCount} នាក់
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => openSubmissionsModal(assignment)}
                            className="p-2 text-emerald-600 hover:text-emerald-900 hover:bg-emerald-50 rounded-xl transition-all"
                            title="មើលការដាក់កិច្ចការ"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </button>
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

      {/* Submissions Viewing & Grading Modal */}
      {showSubmissionsModal && viewingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8 p-6 md:p-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-5 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <span className="bg-emerald-100 text-emerald-700 p-2.5 rounded-xl">
                  <DocumentCheckIcon className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    បញ្ជីសិស្សដាក់កិច្ចការ៖ {viewingAssignment.title}
                  </h2>
                  <p className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2 items-center">
                    <span>មុខវិជ្ជា៖ <strong className="text-gray-700">{viewingAssignment.course?.course_name}</strong></span>
                    <span>•</span>
                    <span>ថ្ងៃកំណត់៖ <strong className="text-gray-700">{formatDate(viewingAssignment.due_date)}</strong></span>
                    <span>•</span>
                    <span>ពិន្ទុសរុប៖ <strong className="text-indigo-600">{viewingAssignment.total_score} ភិន្ទុ</strong></span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSubmissionsModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Submissions Filter & Search */}
            <div className="flex flex-col sm:flex-row gap-3 my-4 shrink-0 justify-between items-center bg-gray-50 p-3 rounded-xl">
              <div className="relative w-full sm:w-72">
                <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ស្វែងរកតាមឈ្មោះសិស្ស..."
                  value={submissionSearch}
                  onChange={(e) => setSubmissionSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <span className="text-xs text-gray-500 font-medium">តម្រង៖</span>
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${statusFilter === 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
                >
                  ទាំងអស់ ({submissions.length})
                </button>
                <button
                  onClick={() => setStatusFilter('graded')}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${statusFilter === 'graded' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
                >
                  បានដាក់ពិន្ទុ ({submissions.filter(s => s.score !== null && s.score !== undefined).length})
                </button>
                <button
                  onClick={() => setStatusFilter('ungraded')}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${statusFilter === 'ungraded' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
                >
                  មិនទាន់ដាក់ពិន្ទុ ({submissions.filter(s => s.score === null || s.score === undefined).length})
                </button>
              </div>
            </div>

            {/* Submissions List */}
            <div className="overflow-y-auto flex-1 border border-gray-100 rounded-xl">
              {loadingSubmissions ? (
                <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center">
                  <ArrowPathIcon className="h-8 w-8 animate-spin text-emerald-600 mb-2" />
                  <p className="text-sm font-medium">កំពុងទាញយកបញ្ជីសិស្សដាក់កិច្ចការ...</p>
                </div>
              ) : submissions.length === 0 ? (
                <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center">
                  <DocumentCheckIcon className="h-12 w-12 text-gray-300 mb-2" />
                  <p className="font-semibold text-gray-700">មិនទាន់មានសិស្សដាក់កិច្ចការនេះនៅឡើយទេ</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">សិស្ស (Student)</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">កាលបរិច្ឆេទដាក់</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">ឯកសារ</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">ពិន្ទុ (/ {viewingAssignment.total_score})</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">មតិយោបល់ (Feedback)</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">សកម្មភាព</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {submissions
                      .filter(sub => {
                        const nameMatch = sub.student?.name?.toLowerCase().includes(submissionSearch.toLowerCase()) ||
                                         sub.student?.email?.toLowerCase().includes(submissionSearch.toLowerCase());
                        if (statusFilter === 'graded') return nameMatch && sub.score !== null && sub.score !== undefined;
                        if (statusFilter === 'ungraded') return nameMatch && (sub.score === null || sub.score === undefined);
                        return nameMatch;
                      })
                      .map((sub) => {
                        const isLate = viewingAssignment.due_date && new Date(sub.submitted_at) > new Date(viewingAssignment.due_date);
                        const grade = gradingData[sub.id] || { score: sub.score ?? '', feedback: sub.feedback || '', isSaving: false };

                        return (
                          <tr key={sub.id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                {sub.student?.profile_image ? (
                                  <img
                                    src={getFileUrl(sub.student.profile_image)}
                                    alt={sub.student?.name}
                                    className="w-9 h-9 rounded-full object-cover border border-gray-200"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm">
                                    {sub.student?.name ? sub.student.name.charAt(0).toUpperCase() : <UserCircleIcon className="h-6 w-6" />}
                                  </div>
                                )}
                                <div>
                                  <div className="text-sm font-semibold text-gray-900">{sub.student?.name || 'សិស្សមិនស្គាល់'}</div>
                                  <div className="text-xs text-gray-500">{sub.student?.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-xs font-medium text-gray-700">
                                {formatDate(sub.submitted_at)}
                              </div>
                              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${isLate ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                {isLate ? 'ដាក់យឺតយ៉ាវ' : 'បានដាក់តាមកំណត់'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-center">
                              {sub.file_path ? (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadFile(sub.file_path)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all cursor-pointer"
                                >
                                  <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                                  ទាញយកឯកសារ
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">គ្មានឯកសារ</span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <input
                                type="number"
                                min="0"
                                max={viewingAssignment.total_score}
                                step="0.5"
                                placeholder={`0 - ${viewingAssignment.total_score}`}
                                value={grade.score}
                                onChange={(e) => handleGradeChange(sub.id, 'score', e.target.value)}
                                className="w-24 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                placeholder="មតិយោបល់កែលម្អ..."
                                value={grade.feedback}
                                onChange={(e) => handleGradeChange(sub.id, 'feedback', e.target.value)}
                                className="w-full min-w-[160px] px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-center">
                              <button
                                onClick={() => handleSaveGrade(sub.id)}
                                disabled={grade.isSaving}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all disabled:opacity-50"
                              >
                                {grade.isSaving ? (
                                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircleIcon className="h-3.5 w-3.5" />
                                )}
                                រក្សាទុក
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-4 mt-2 border-t border-gray-100 shrink-0">
              <button
                onClick={() => setShowSubmissionsModal(false)}
                className="px-5 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
              >
                បិទ
              </button>
            </div>
          </div>
        </div>
      )}

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
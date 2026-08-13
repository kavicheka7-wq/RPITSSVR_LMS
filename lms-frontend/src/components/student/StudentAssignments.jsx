import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { handleDownloadFile } from '../../utils/downloadUtils';
import { useLanguage } from '../../context/LanguageContext';
import {
  DocumentCheckIcon,
  ArrowPathIcon,
  ClockIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ClipboardDocumentCheckIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

const StudentAssignments = () => {
  const { t, language } = useLanguage();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('all');

  // Submit modal states
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [submittingFile, setSubmittingFile] = useState(false);

  const getStorageUrl = (path) => {
    if (!path) return '#';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) return path;
    const backendBase = (api.defaults?.baseURL || 'http://localhost:8000/api').replace(/\/api\/?$/, '');
    const cleanPath = path.replace(/^\/?storage\//, '');
    return `${backendBase}/api/download-file?path=${encodeURIComponent(cleanPath)}`;
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      const response = await api.get('/student/assignments');
      setAssignments(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error(t('មិនអាចទាញយកកិច្ចការបានទេ', 'Failed to fetch assignments'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSubmitModal = (assignment) => {
    setSelectedAssignment(assignment);
    setUploadFile(null);
    setSubmitModalOpen(true);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
    }
  };

  const handleAssignmentSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile || !selectedAssignment) {
      toast.error(t('សូមជ្រើសរើសឯកសារដើម្បីផ្ញើ', 'Please select a file to submit'));
      return;
    }

    setSubmittingFile(true);
    const formData = new FormData();
    formData.append('assignment_id', selectedAssignment.id);
    formData.append('file', uploadFile);

    try {
      await api.post('/student/assignments/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(t('បានប្រគល់កិច្ចការដោយជោគជ័យ', 'Assignment submitted successfully'));
      setSubmitModalOpen(false);
      setUploadFile(null);
      fetchAssignments(); // Refresh list to show submitted status
    } catch (error) {
      console.error('Error submitting assignment:', error);
      toast.error(error.response?.data?.message || t('មិនអាចប្រគល់កិច្ចការបានទេ', 'Failed to submit assignment'));
    } finally {
      setSubmittingFile(false);
    }
  };

  // Extract unique courses for filtering dropdown
  const courses = Array.from(new Set(assignments.map(a => a.course?.id).filter(Boolean))).map(id => {
    const assign = assignments.find(a => a.course?.id === id);
    return assign ? assign.course : null;
  }).filter(Boolean);

  // Filter list
  const filteredAssignments = assignments.filter((assign) => {
    const matchesSearch = 
      assign.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      assign.course?.course_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      assign.course?.course_code?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCourse = selectedCourse === 'all' || assign.course_id === Number(selectedCourse);

    return matchesSearch && matchesCourse;
  });

  // Calculate statistics
  const totalCount = assignments.length;
  const submittedCount = assignments.filter(a => a.submission).length;
  const overdueCount = assignments.filter(a => !a.submission && new Date() > new Date(a.due_date)).length;
  const pendingCount = totalCount - submittedCount - overdueCount;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ArrowPathIcon className="h-10 w-10 text-blue-900 animate-spin" />
        <p className="text-sm text-gray-500 font-sans">{t('កំពុងទាញយកព័ត៌មានកិច្ចការ...', 'Loading assignments...')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-8 shadow-xl border border-blue-900">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-3 py-1 rounded-lg border border-yellow-400/20 uppercase tracking-wider font-sans">
              {t('មជ្ឈមណ្ឌលកិច្ចការ', 'Assignments Center')}
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight">{t('កិច្ចការ និងលំហាត់ទាំងអស់', 'All Assignments & Homework')}</h1>
            <p className="text-blue-200 text-sm max-w-xl font-medium">
              {t('គ្រប់គ្រង កត់ត្រា និងបញ្ជូនកិច្ចការសិក្សាទៅកាន់សាស្រ្តាចារ្យរបស់អ្នកឱ្យបានទាន់ពេលវេលា។', 'Submit homework and track grades in a timely manner.')}
            </p>
          </div>

          {/* Quick Metrics Cards */}
          <div className="flex flex-wrap gap-3">
            <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl flex items-center gap-2.5">
              <div className="h-8 w-8 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/20 animate-pulse">
                <DocumentCheckIcon className="h-5 w-5 text-blue-300" />
              </div>
              <div>
                <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">{t('បញ្ជូនរួច', 'Submitted')}</p>
                <p className="text-base font-black text-white">{submittedCount} / {totalCount}</p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl flex items-center gap-2.5">
              <div className="h-8 w-8 bg-yellow-500/20 rounded-lg flex items-center justify-center border border-yellow-500/20">
                <ClockIcon className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">{t('នៅសល់', 'Pending')}</p>
                <p className="text-base font-black text-white">{pendingCount}</p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl flex items-center gap-2.5">
              <div className="h-8 w-8 bg-rose-500/20 rounded-lg flex items-center justify-center border border-rose-500/20">
                <ExclamationCircleIcon className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider font-sans">{t('ហួសកំណត់', 'Overdue')}</p>
                <p className="text-base font-black text-white">{overdueCount}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('ស្វែងរកតាមឈ្មោះកិច្ចការ ឬមុខវិជ្ជា...', 'Search assignments...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-950 transition-colors"
          />
        </div>

        {/* Filter Dropdown */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <FunnelIcon className="h-5 w-5 text-gray-400 hidden sm:block" />
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="w-full md:w-64 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-950 bg-white transition-colors font-semibold text-gray-700"
          >
            <option value="all">{t('មុខវិជ្ជាទាំងអស់', 'All Courses')}</option>
            {(Array.isArray(courses) ? courses : []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.course_code.toUpperCase()} - {course.course_name}
              </option>
            ))}
          </select>
        </div>

      </div>

      {/* Assignment List */}
      {filteredAssignments.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 space-y-2">
          <ClipboardDocumentCheckIcon className="h-12 w-12 mx-auto text-gray-300" />
          <h3 className="text-base font-bold text-gray-700">{t('មិនរកឃើញកិច្ចការឡើយទេ', 'No assignments found')}</h3>
          <p className="text-xs text-gray-400">{t('សាកល្បងផ្លាស់ប្តូរតម្រង ឬស្វែងរកចំណងជើងផ្សេងទៀត។', 'Try changing filters or search terms.')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAssignments.map((assign) => {
            const isSubmitted = !!assign.submission;
            const isOverdue = !isSubmitted && new Date() > new Date(assign.due_date);
            const submission = assign.submission;

            return (
              <div
                key={assign.id}
                className="bg-white border border-gray-100 rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-md transition-all duration-300"
              >
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black text-yellow-600 bg-yellow-400/10 px-2.5 py-0.5 rounded-md border border-yellow-400/20 uppercase">
                      {assign.course?.course_code}
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold">
                      {assign.course?.course_name}
                    </span>
                    <span className={`text-[10px] font-bold inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border ${
                      isSubmitted 
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                        : isOverdue 
                          ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' 
                          : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                    }`}>
                      {isSubmitted ? t('✔ ប្រគល់រួច', '✔ Submitted') : isOverdue ? t('✖ ហួសកំណត់', '✖ Overdue') : t('⏱ កំពុងរង់ចាំ', '⏱ Pending')}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 leading-snug">{assign.title}</h3>
                  {assign.description && (
                    <p className="text-sm text-gray-500 leading-relaxed max-w-3xl">{assign.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-400 font-medium">
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-4 w-4 text-gray-300" />
                      {t('កាលបរិច្ឆេទកំណត់៖', 'Due Date:')} {new Date(assign.due_date).toLocaleString(language === 'km' ? 'km-KH' : 'en-US')}
                    </span>
                    <span>&bull;</span>
                    <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded">
                      {t('ពិន្ទុអតិបរមា៖', 'Max Score:')} {assign.marks || 100} 
                    </span>
                  </div>
                </div>

                {/* Submissions Details / Actions */}
                <div className="lg:w-72 shrink-0 flex flex-col items-start lg:items-end justify-center border-t lg:border-t-0 pt-4 lg:pt-0 border-gray-100">
                  {isSubmitted ? (
                    <div className="bg-gray-50 border border-gray-200/50 p-4 rounded-2xl w-full space-y-1.5 text-xs text-gray-600">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 font-bold uppercase tracking-wide text-[9px]">{t('ស្ថានភាពកិច្ចការ', 'Result Status')}</span>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {t('បានប្រគល់:', 'Submitted:')} {new Date(submission.submitted_at).toLocaleDateString(language === 'km' ? 'km-KH' : 'en-US')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-gray-700">{t('ពិន្ទុទទួលបាន៖', 'Score Earned:')}</span>
                        <span className="font-extrabold text-gray-900 text-sm">
                          {submission.score !== null ? `${submission.score} / ${assign.marks || 100}` : t('មិនទាន់កែ', 'Pending Grading')}
                        </span>
                      </div>
                      {submission.feedback && (
                        <div className="text-[10px] text-yellow-600 bg-yellow-500/5 p-2 rounded-lg border border-yellow-500/10 mt-1 italic font-medium">
                          {t('មតិយោបល់:', 'Feedback:')} {submission.feedback}
                        </div>
                      )}
                      {submission.file_path && (
                        <div className="pt-1.5 border-t border-gray-100">
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(submission.file_path)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                          >
                            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                            {t('ទាញយកឯកសារដែលបានផ្ញើ', 'Download Submitted File')}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : isOverdue ? (
                    <span className="text-sm font-bold text-rose-500 flex items-center gap-1">
                      <ExclamationCircleIcon className="h-4 w-4" />
                      {t('កាលកំណត់ត្រូវបានបិទ', 'Submissions Closed')}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleOpenSubmitModal(assign)}
                      className="w-full lg:w-auto inline-flex items-center justify-center gap-1.5 bg-blue-950 hover:bg-yellow-500 hover:text-blue-950 text-white text-xs font-bold px-5 py-3 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer"
                    >
                      <CloudArrowUpIcon className="h-5 w-5" />
                      {t('ប្រគល់កិច្ចការ', 'Submit Assignment')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SUBMISSION MODAL */}
      {submitModalOpen && selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <CloudArrowUpIcon className="h-6 w-6 text-indigo-600" />
                {t('ប្រគល់កិច្ចការ', 'Submit Assignment')}
              </h2>
              <button
                onClick={() => setSubmitModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-xl transition text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 text-xs space-y-1">
              <p className="font-bold text-gray-800">{t('កិច្ចការ:', 'Assignment:')} {selectedAssignment.title}</p>
              <p className="text-gray-500">{t('កាលបរិច្ឆេទកំណត់:', 'Due Date:')} {new Date(selectedAssignment.due_date).toLocaleString(language === 'km' ? 'km-KH' : 'en-US')}</p>
            </div>

            <form onSubmit={handleAssignmentSubmit} className="space-y-6">
              <div className="border-2 border-dashed border-gray-300 hover:border-indigo-500/50 transition bg-gray-50/50 hover:bg-gray-50 rounded-2xl p-6 text-center cursor-pointer relative">
                <input
                  type="file"
                  required
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.zip"
                />
                <CloudArrowUpIcon className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                <span className="block text-sm font-semibold text-gray-700">
                  {uploadFile ? uploadFile.name : t('សូមជ្រើសរើស ឬអូសឯកសារមកទីនេះ', 'Select or drag file here')}
                </span>
                <span className="block text-xs text-gray-400 mt-1">
                  ({t('គាំទ្រ PDF, Word, PowerPoint, Excel, ZIP ទំហំរហូតដល់ 10MB', 'Accepts PDF, Word, PowerPoint, Excel, ZIP up to 10MB')})
                </span>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSubmitModalOpen(false)}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                >
                  {t('បោះបង់', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submittingFile || !uploadFile}
                  className="px-5 py-2.5 bg-blue-950 hover:bg-yellow-500 hover:text-blue-950 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  {submittingFile ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      កំពុងផ្ទុកឡើង...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="h-4 w-4" />
                      ផ្ញើកិច្ចការ
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default StudentAssignments;

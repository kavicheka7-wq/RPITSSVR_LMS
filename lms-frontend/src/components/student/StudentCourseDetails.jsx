import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  BookOpenIcon,
  AcademicCapIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowDownTrayIcon,
  PlayIcon,
  ClockIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
  BuildingLibraryIcon,
  ArrowLeftIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

const StudentCourseDetails = () => {
  const { courseId } = useParams();
  const [activeTab, setActiveTab] = useState('lessons');
  const [courseData, setCourseData] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Lesson expand states
  const [expandedLesson, setExpandedLesson] = useState(null);

  // Assignment upload modal state
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [submittingFile, setSubmittingFile] = useState(false);

  useEffect(() => {
    fetchCourseDetails();
  }, [courseId]);

  const fetchCourseDetails = async () => {
    setLoading(true);
    try {
      const [detailsRes, lessonsRes] = await Promise.all([
        api.get(`/student/courses/${courseId}`),
        api.get(`/student/courses/${courseId}/lessons`)
      ]);
      setCourseData(detailsRes.data);
      setLessons(lessonsRes.data);
    } catch (error) {
      toast.error('មិនអាចទាញយកព័ត៌មានមុខវិជ្ជាបានទេ (Failed to fetch course details)');
    } finally {
      setLoading(false);
    }
  };

  const handleLessonToggle = (lessonId) => {
    setExpandedLesson(expandedLesson === lessonId ? null : lessonId);
  };

  const getFileIcon = (fileName) => {
    if (!fileName) return '📄';
    const ext = fileName.split('.').pop().toLowerCase();
    if (ext === 'pdf') return '📕';
    if (ext === 'doc' || ext === 'docx') return '📘';
    if (ext === 'ppt' || ext === 'pptx') return '📙';
    if (ext === 'xls' || ext === 'xlsx') return '📗';
    return '📄';
  };

  const getAttendanceBadgeClass = (status) => {
    switch (status) {
      case 'Present': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'Late': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
      case 'Absent': return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  const handleOpenSubmitModal = (assignment) => {
    setSelectedAssignment(assignment);
    setUploadFile(null);
    setSubmitModalOpen(true);
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setUploadFile(e.target.files[0]);
    }
  };

  const handleAssignmentSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.warning('សូមជ្រើសរើសឯកសារដើម្បីផ្ទុកឡើង (Please select a file)');
      return;
    }

    setSubmittingFile(true);
    const formData = new FormData();
    formData.append('assignment_id', selectedAssignment.id);
    formData.append('file', uploadFile);

    try {
      await api.post('/student/assignments/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('ប្រគល់កិច្ចការដោយជោគជ័យ (Assignment submitted successfully)');
      setSubmitModalOpen(false);
      fetchCourseDetails(); // Refresh details to show submitted status
    } catch (error) {
      const errMsg = error.response?.data?.message || 'មានបញ្ហាក្នុងការប្រគល់កិច្ចការ';
      toast.error(errMsg);
    } finally {
      setSubmittingFile(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ArrowPathIcon className="h-10 w-10 text-blue-900 animate-spin" />
        <p className="text-sm text-gray-500 font-sans">កំពុងផ្ទុកព័ត៌មានមុខវិជ្ជា... (Loading course panel...)</p>
      </div>
    );
  }

  if (!courseData) {
    return (
      <div className="text-center py-20 text-gray-500">
        <XCircleIcon className="h-12 w-12 text-rose-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-800">មិនរកឃើញមុខវិជ្ជាសិក្សានេះទេ</h3>
        <p className="text-sm text-gray-400 mt-1">Course data not found or access denied.</p>
        <Link to="/student/courses" className="mt-4 inline-flex items-center gap-2 text-blue-900 font-bold hover:underline">
          &larr; Back to Courses
        </Link>
      </div>
    );
  }

  const {
    course = {},
    assignments = [],
    submissions = [],
    quizzes = [],
    quiz_attempts = [],
    attendance = [],
    grade = null
  } = courseData || {};
  const baseURL = api.defaults.baseURL.replace('/api', '');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* Back button & Title */}
      <div className="flex items-center gap-4">
        <Link
          to="/student/courses"
          className="p-2 border border-gray-200 hover:bg-gray-100 rounded-2xl transition-all"
          title="ត្រឡប់ក្រោយ"
        >
          <ArrowLeftIcon className="h-5 w-5 text-gray-700" />
        </Link>
        <div>
          <span className="text-xs font-bold text-yellow-600 bg-yellow-400/10 px-2.5 py-1 rounded-lg border border-yellow-400/20 uppercase">
            {course.course_code}
          </span>
          <h1 className="text-2xl font-bold text-gray-900 mt-1.5">{course.course_name}</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-100 bg-white p-2 rounded-2xl flex flex-wrap gap-2 shadow-xs">
        {[
          { id: 'lessons', label: 'មេរៀន (Lessons)', count: lessons.length },
          { id: 'assignments', label: 'កិច្ចការ (Assignments)', count: assignments.length },
          { id: 'quizzes', label: 'កម្រងសំណួរ (Quizzes)', count: quizzes.length },
          { id: 'attendance', label: 'វត្តមាន (Attendance)', count: attendance.length },
          { id: 'scores', label: 'ពិន្ទុ (Scores)', count: grade ? 1 : 0 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-bold rounded-xl transition-all ${
              activeTab === tab.id
                ? 'bg-blue-950 text-white shadow-md'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-md ${
                activeTab === tab.id ? 'bg-yellow-400 text-blue-950' : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden p-6">
        
        {/* LESSONS TAB */}
        {activeTab === 'lessons' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 border-b pb-3 mb-4">មេរៀន និងឯកសារឧបទេស (Lessons & Study Material)</h3>
            {lessons.length === 0 ? (
              <p className="text-gray-500 text-center py-10 italic">មិនទាន់មានមេរៀនដែលបានបង្ហោះនៅឡើយទេ (No lessons uploaded yet)</p>
            ) : (
              <div className="space-y-3">
                {lessons.map((lesson) => {
                  const filesCount = lesson.files?.length || 0;
                  const videosCount = lesson.videos?.length || 0;
                  const isExpanded = expandedLesson === lesson.id;

                  return (
                    <div key={lesson.id} className="border border-gray-100 rounded-2xl overflow-hidden hover:shadow-xs transition-shadow">
                      <button
                        onClick={() => handleLessonToggle(lesson.id)}
                        className="w-full px-6 py-4 flex items-center justify-between bg-gray-50/50 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 bg-blue-900/10 rounded-xl flex items-center justify-center border border-blue-900/10">
                            <BookOpenIcon className="h-5 w-5 text-blue-900" />
                          </div>
                          <div>
                            <span className="text-xs text-yellow-600 font-bold uppercase tracking-wider">
                              មេរៀនលំដាប់ {lesson.lesson_order}
                            </span>
                            <h4 className="font-bold text-gray-900 text-sm mt-0.5">{lesson.title}</h4>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="text-xs text-gray-400 font-semibold bg-gray-100 px-2.5 py-1 rounded-lg">
                            {filesCount} files &bull; {videosCount} videos
                          </span>
                          {isExpanded ? (
                            <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                          ) : (
                            <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-6 py-5 border-t border-gray-100 bg-white space-y-5">
                          {lesson.description && (
                            <div className="space-y-1">
                              <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider">សេចក្តីពិពណ៌នា (Description)</h5>
                              <p className="text-sm text-gray-600 leading-relaxed">{lesson.description}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Materials */}
                            <div className="space-y-3">
                              <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5">ឯកសារមេរៀន (Documents)</h5>
                              {filesCount === 0 ? (
                                <p className="text-xs text-gray-400 italic">គ្មានឯកសារផ្ទុកឡើង</p>
                              ) : (
                                <div className="space-y-2">
                                  {lesson.files.map((file) => (
                                    <div key={file.id} className="flex items-center justify-between bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-100 hover:bg-gray-100/50 transition">
                                      <span className="text-xs font-semibold text-gray-700 truncate max-w-[220px]" title={file.file_name}>
                                        {getFileIcon(file.file_name)} {file.file_name}
                                      </span>
                                      <a
                                        href={`${baseURL}/storage/${file.file_path}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download={file.file_name}
                                        className="p-1.5 text-blue-900 hover:text-yellow-600 hover:bg-white rounded-lg border border-gray-200/50 shadow-2xs hover:shadow-xs transition"
                                        title="ទាញយកឯកសារ"
                                      >
                                        <ArrowDownTrayIcon className="h-4 w-4" />
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Videos */}
                            <div className="space-y-3">
                              <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5">វីដេអូបង្រៀន (Lectures)</h5>
                              {videosCount === 0 ? (
                                <p className="text-xs text-gray-400 italic">គ្មានវីដេអូផ្ទុកឡើង</p>
                              ) : (
                                <div className="space-y-2">
                                  {lesson.videos.map((video) => (
                                    <div key={video.id} className="flex items-center justify-between bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-100 hover:bg-gray-100/50 transition">
                                      <span className="text-xs font-semibold text-gray-700 truncate max-w-[220px]" title={video.title}>
                                        🎥 {video.title}
                                      </span>
                                      <a
                                        href={`${baseURL}/storage/${video.video_url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg border border-purple-100 transition"
                                        title="មើលវីដេអូ"
                                      >
                                        <PlayIcon className="h-3.5 w-3.5" />
                                        មើលវីដេអូ
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ASSIGNMENTS TAB */}
        {activeTab === 'assignments' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 border-b pb-3 mb-4">កិច្ចការដែលត្រូវធ្វើ (Course Assignments)</h3>
            {assignments.length === 0 ? (
              <p className="text-gray-500 text-center py-10 italic">គ្មានកិច្ចការដែលបានដាក់នៅឡើយទេ (No assignments assigned yet)</p>
            ) : (
              <div className="space-y-4">
                {assignments.map((assignment) => {
                  const submission = submissions.find(s => s.assignment_id === assignment.id);
                  const isOverdue = new Date() > new Date(assignment.due_date);

                  return (
                    <div key={assignment.id} className="border border-gray-100 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                            {assignment.marks} ពិន្ទុសរុប (Max Points)
                          </span>
                          <span className={`text-xs font-semibold inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border ${
                            submission 
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                              : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                          }`}>
                            {submission ? 'ប្រគល់រួចហើយ (Submitted)' : isOverdue ? 'ហួសកាលកំណត់ (Overdue)' : 'មិនទាន់ប្រគល់ (Pending)'}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-gray-900">{assignment.title}</h4>
                        {assignment.description && <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">{assignment.description}</p>}
                        
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <ClockIcon className="h-4 w-4" />
                          <span>កាលបរិច្ឆេទប្រគល់: {new Date(assignment.due_date).toLocaleDateString()} {new Date(assignment.due_date).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      {/* Action status/button */}
                      <div className="flex flex-col items-start md:items-end justify-center gap-2 shrink-0">
                        {submission ? (
                          <div className="bg-gray-50 border border-gray-200/50 p-4 rounded-2xl w-full md:w-64 space-y-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">ស្ថានភាពកិច្ចការ (Grade details)</span>
                            <div className="flex items-center justify-between text-xs text-gray-600">
                              <span>ពិន្ទុទទួលបាន:</span>
                              <span className="font-bold text-gray-900">
                                {submission.score !== null ? `${submission.score} / ${assignment.marks}` : 'មិនទាន់កែ'}
                              </span>
                            </div>
                            {submission.feedback && (
                              <div className="text-[11px] text-yellow-600 bg-yellow-500/5 p-2 rounded-lg border border-yellow-500/10 mt-1 italic">
                                Feedback: {submission.feedback}
                              </div>
                            )}
                          </div>
                        ) : isOverdue ? (
                          <span className="text-sm font-semibold text-rose-500">កាលកំណត់ត្រូវបានបិទ</span>
                        ) : (
                          <button
                            onClick={() => handleOpenSubmitModal(assignment)}
                            className="inline-flex items-center gap-1.5 bg-blue-950 hover:bg-yellow-500 hover:text-blue-950 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer"
                          >
                            <CloudArrowUpIcon className="h-4 w-4" />
                            ប្រគល់កិច្ចការ (Submit Assignment)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* QUIZZES TAB */}
        {activeTab === 'quizzes' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 border-b pb-3 mb-4">កម្រងសំណួរវាយតម្លៃ (Course Quizzes)</h3>
            {quizzes.length === 0 ? (
              <p className="text-gray-500 text-center py-10 italic">គ្មានកម្រងសំណួរដែលបានដាក់នៅឡើយទេ (No quizzes available yet)</p>
            ) : (
              <div className="space-y-3">
                {quizzes.map((quiz) => {
                  const attempt = quiz_attempts.find(a => a.quiz_id === quiz.id);
                  const isCompleted = !!(attempt && attempt.submitted_at);
                  const hasActiveAttempt = !!(attempt && !attempt.submitted_at);

                  return (
                    <div key={quiz.id} className="border border-gray-100 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-sm transition">
                      <div className="space-y-1.5">
                        <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-lg">
                          កម្រងសំណួរ (Quiz)
                        </span>
                        <h4 className="font-bold text-gray-900 text-sm mt-2">{quiz.title}</h4>
                        <p className="text-xs text-gray-400">រយៈពេលមេរៀន: {quiz.duration} នាទី (Minutes)</p>
                      </div>

                      <div className="flex flex-col sm:items-end justify-center gap-2">
                        {isCompleted ? (
                          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5">
                            <CheckCircleIcon className="h-4 w-4" />
                            <span>ធ្វើរួចរាល់ | ពិន្ទុ: {attempt.score} / {quiz.total_mark} ({quiz.total_mark > 0 ? Math.round((attempt.score / quiz.total_mark) * 100) : 0}%)</span>
                          </div>
                        ) : (
                          <Link
                            to="/student/quizzes"
                            className="inline-flex items-center gap-1.5 bg-blue-950 hover:bg-yellow-500 hover:text-blue-950 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer"
                          >
                            {hasActiveAttempt ? 'បន្តការធ្វើតេស្ត (Resume)' : 'ចាប់ផ្តើមធ្វើ (Attempt)'}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ATTENDANCE TAB */}
        {activeTab === 'attendance' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 border-b pb-3 mb-4">ប្រវត្តិនៃការចូលរួម (Attendance Log)</h3>
            {attendance.length === 0 ? (
              <p className="text-gray-500 text-center py-10 italic">មិនទាន់មានកត់ត្រាវត្តមាននៅឡើយទេ (No attendance entries yet)</p>
            ) : (
              <div className="overflow-hidden border border-gray-100 rounded-2xl">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">កាលបរិច្ឆេទ (Date)</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">ស្ថានភាពវត្តមាន (Status)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {attendance.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {new Date(entry.attendance_date).toLocaleDateString('km-KH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-center">
                          <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-xl ${getAttendanceBadgeClass(entry.status)}`}>
                            {entry.status === 'Present' ? '✔ វត្តមាន' : entry.status === 'Late' ? '⏱ យឺត' : '✖ អវត្តមាន'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SCORES TAB */}
        {activeTab === 'scores' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 border-b pb-3 mb-4">របាយការណ៍ពិន្ទុប្រឡាំ និងបញ្ចប់ (Course Grade Card)</h3>
            {!grade ? (
              <p className="text-gray-500 text-center py-10 italic">មិនទាន់មានពិន្ទុត្រូវបានបញ្ចូលនៅឡើយទេ (No scores recorded yet)</p>
            ) : (
              <div className="max-w-xl mx-auto bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 border border-blue-800/30 p-8 rounded-3xl shadow-xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full blur-2xl"></div>
                <h4 className="text-lg font-bold text-yellow-400 mb-6 flex items-center gap-2 border-b border-white/10 pb-3">
                  <AcademicCapIcon className="h-5 w-5" />
                  តារាងពិន្ទុរួម (Grade Sheet)
                </h4>

                <div className="space-y-4 text-sm">
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-white/60">ពិន្ទុកិច្ចការ (Assignment Score):</span>
                    <span className="font-bold text-white text-base">
                      {grade.assignment_score !== null ? `${grade.assignment_score}%` : '-'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-white/60">ពិន្ទុកម្រងសំណួរ (Quiz Score):</span>
                    <span className="font-bold text-white text-base">
                      {grade.quiz_score !== null ? `${grade.quiz_score}%` : '-'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-white/60">ពិន្ទុចុងក្រោយ (Final Score):</span>
                    <span className="font-bold text-yellow-400 text-lg">
                      {grade.final_score !== null ? `${grade.final_score}%` : '-'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-4">
                    <span className="text-white/60">និទ្ទេសរួម (Overall Grade):</span>
                    <span className={`px-4 py-1.5 text-base font-extrabold rounded-xl ${
                      grade.grade_letter === 'A' || grade.grade_letter === 'B+' 
                        ? 'bg-emerald-500 text-white' 
                        : grade.grade_letter === 'F' 
                          ? 'bg-rose-500 text-white' 
                          : 'bg-yellow-500 text-blue-950'
                    }`}>
                      {grade.grade_letter || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* OVERVIEW / SIDEBAR BOX FOR COURSE INFO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-lg p-6 space-y-4">
          <h3 className="text-lg font-bold text-gray-900">សេចក្តីពិពណ៌នាមុខវិជ្ជា (Course Details)</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            {course.description || 'មិនទាន់មានការបញ្ចូលសេចក្តីពិពណ៌នាសម្រាប់មុខវិជ្ជានេះឡើយទេ។ (No description provided for this course.)'}
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-lg p-6 space-y-5">
          <h3 className="text-lg font-bold text-gray-900 border-b pb-2">គ្រូបង្រៀន & ដេប៉ាតឺម៉ង់</h3>
          
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {course.teacher_profile?.profile_image_url ? (
                <img
                  src={course.teacher_profile.profile_image_url}
                  alt={course.teacher?.name}
                  className="h-10 w-10 rounded-xl object-cover border border-yellow-500/20 shadow-sm"
                />
              ) : (
                <div className="h-10 w-10 bg-yellow-500/10 rounded-xl flex items-center justify-center border border-yellow-500/10">
                  <UserIcon className="h-5 w-5 text-yellow-600" />
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400 font-medium">សាស្រ្តាចារ្យបង្រៀន (Teacher)</p>
                <p className="text-sm font-bold text-gray-800">{course.teacher?.name || 'គ្រូបង្រៀន'}</p>
                {course.teacher_profile?.specialization && (
                  <p className="text-[10px] text-yellow-600 font-bold leading-tight">{course.teacher_profile.specialization}</p>
                )}
                <p className="text-xs text-gray-500 mt-0.5 leading-none">{course.teacher?.email}</p>
                {course.teacher_profile?.phone && (
                  <p className="text-[10px] text-gray-400 mt-0.5">Tel: {course.teacher_profile.phone}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-blue-900/10 rounded-xl flex items-center justify-center border border-blue-900/10">
                <BuildingLibraryIcon className="h-5 w-5 text-blue-900" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">ដេប៉ាតឺម៉ង់ (Department)</p>
                <p className="text-sm font-bold text-gray-800">{course.department?.department_name || 'ដេប៉ាតឺម៉ង់'}</p>
                <p className="text-xs text-gray-500 mt-0.5">{course.department?.department_code}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SUBMISSION MODAL */}
      {submitModalOpen && selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <CloudArrowUpIcon className="h-6 w-6 text-indigo-600" />
                ប្រគល់កិច្ចការ (Submit Assignment)
              </h2>
              <button
                onClick={() => setSubmitModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-xl transition text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 text-xs space-y-1">
              <p className="font-bold text-gray-800">Assignment: {selectedAssignment.title}</p>
              <p className="text-gray-500">Due Date: {new Date(selectedAssignment.due_date).toLocaleString()}</p>
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
                  {uploadFile ? uploadFile.name : 'សូមជ្រើសរើស ឬអូសឯកសារមកទីនេះ'}
                </span>
                <span className="block text-xs text-gray-400 mt-1">
                  (Accepts PDF, Word, PowerPoint, Excel, ZIP up to 10MB)
                </span>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSubmitModalOpen(false)}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                >
                  បោះបង់ (Cancel)
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

export default StudentCourseDetails;

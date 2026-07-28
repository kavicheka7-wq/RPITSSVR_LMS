import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  AcademicCapIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  BookOpenIcon,
  PencilSquareIcon
} from '@heroicons/react/24/outline';

const StudentQuizzes = () => {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('all');

  // Attempt Quiz State
  const [activeQuizAttempt, setActiveQuizAttempt] = useState(null); // quiz data with questions
  const [attemptAnswers, setAttemptAnswers] = useState({}); // { question_id: selected_option_id }
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0); // in seconds
  const [isSubmitting, setIsSubmitting] = useState(false);
  const timerRef = useRef(null);
  const endTimeRef = useRef(null);

  // Result dialog state
  const [quizResult, setQuizResult] = useState(null);

  useEffect(() => {
    fetchQuizzes();
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (activeQuizAttempt && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        if (!endTimeRef.current) return;
        const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
          clearInterval(timerRef.current);
          handleQuizSubmit(null, true);
        }
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [activeQuizAttempt, timeLeft]);

  const fetchQuizzes = async () => {
    try {
      const response = await api.get('/student/quizzes');
      setQuizzes(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error('មិនអាចទាញយកកម្រងសំណួរបានទេ (Failed to fetch quizzes)');
    } finally {
      setLoading(false);
    }
  };

  const handleStartAttempt = async (quiz) => {
    setLoadingQuiz(true);
    try {
      const response = await api.get(`/student/quizzes/${quiz.id}`);
      setActiveQuizAttempt(response.data.quiz);
      setAttemptAnswers({});
      const rawTimeLeft = response.data.time_left;
      const duration = response.data.quiz?.duration;
      let secondsLeft = 30 * 60; // fallback 30 mins

      if (rawTimeLeft !== undefined && rawTimeLeft !== null) {
        secondsLeft = parseInt(rawTimeLeft, 10);
      } else if (duration !== undefined && duration !== null) {
        secondsLeft = parseInt(duration, 10) * 60;
      }

      if (isNaN(secondsLeft) || secondsLeft < 0) {
        secondsLeft = 0;
      }

      setTimeLeft(secondsLeft);
      endTimeRef.current = Date.now() + secondsLeft * 1000;
    } catch (error) {
      const errMsg = error.response?.data?.message || 'មិនអាចចាប់ផ្តើមធ្វើសំណួរបានទេ';
      toast.error(errMsg);
    } finally {
      setLoadingQuiz(false);
    }
  };

  const handleSelectOption = (questionId, optionId) => {
    setAttemptAnswers((prev) => ({
      ...prev,
      [questionId]: optionId
    }));
  };

  const handleQuizSubmit = async (e, isAuto = false) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    // Check if all questions are answered (unless it's an auto-submit from timeout)
    if (!isAuto && activeQuizAttempt?.questions) {
      const unanswered = activeQuizAttempt.questions.filter(q => !attemptAnswers[q.id]);
      if (unanswered.length > 0) {
        if (!window.confirm(`អ្នកនៅសល់សំណួរចំនួន ${unanswered.length} ទៀតមិនទាន់ឆ្លើយ។ តើអ្នកចង់ផ្ញើចម្លើយមែនទេ?`)) {
          return;
        }
      }
    }

    setIsSubmitting(true);
    clearInterval(timerRef.current);
    endTimeRef.current = null;

    // Format answers: [ { question_id, selected_option } ]
    const formattedAnswers = Object.entries(attemptAnswers).map(([qId, optId]) => ({
      question_id: Number(qId),
      selected_option: optId
    }));

    try {
      const response = await api.post(`/student/quizzes/${activeQuizAttempt.id}/submit`, {
        answers: formattedAnswers
      });
      setQuizResult(response.data);
      setActiveQuizAttempt(null);
      fetchQuizzes(); // Refresh list to update status
    } catch (error) {
      const errMsg = error.response?.data?.message || 'មានបញ្ហាក្នុងការផ្ញើចម្លើយ';
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Filter & unique courses logic
  const courses = Array.from(new Set(quizzes.map(q => q.course?.id).filter(Boolean))).map(id => {
    const quiz = quizzes.find(q => q.course?.id === id);
    return quiz ? quiz.course : null;
  }).filter(Boolean);

  const filteredQuizzes = quizzes.filter((quiz) => {
    const matchesSearch = 
      quiz.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      quiz.course?.course_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      quiz.course?.course_code?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCourse = selectedCourse === 'all' || quiz.course_id === Number(selectedCourse);
    return matchesSearch && matchesCourse;
  });

  const totalCount = quizzes.length;
  const completedCount = quizzes.filter(q => q.attempt).length;
  const activeCount = quizzes.filter(q => !q.attempt && new Date() >= new Date(q.start_date) && new Date() <= new Date(q.end_date)).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ArrowPathIcon className="h-10 w-10 text-blue-900 animate-spin" />
        <p className="text-sm text-gray-500 font-sans">កំពុងទាញយកព័ត៌មានកម្រងសំណួរ... (Loading quizzes...)</p>
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
              មជ្ឈមណ្ឌលវាយតម្លៃ (Quizzes Hub)
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight">កម្រងសំណួរវាយតម្លៃទាំងអស់</h1>
            <p className="text-blue-200 text-sm max-w-xl font-medium">
              ចូលរួមធ្វើតេស្ត កម្រងសំណួរលំហាត់ និងវាស់ស្ទង់សមត្ថភាពសិក្សាតាមមុខវិជ្ជានីមួយៗ។ (Complete exams and quizzes.)
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap gap-3">
            <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl flex items-center gap-2.5">
              <div className="h-8 w-8 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/20">
                <CheckCircleIcon className="h-5 w-5 text-blue-300" />
              </div>
              <div>
                <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">ធ្វើរួចរាល់ (Completed)</p>
                <p className="text-base font-black text-white">{completedCount} / {totalCount}</p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl flex items-center gap-2.5">
              <div className="h-8 w-8 bg-yellow-500/20 rounded-lg flex items-center justify-center border border-yellow-500/20">
                <PencilSquareIcon className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">អាចធ្វើបាន (Active)</p>
                <p className="text-base font-black text-white">{activeCount}</p>
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
            placeholder="ស្វែងរកតាមឈ្មោះសំណួរ ឬមុខវិជ្ជា... (Search quizzes...)"
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
            <option value="all">មុខវិជ្ជាទាំងអស់ (All Courses)</option>
            {(Array.isArray(courses) ? courses : []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.course_code.toUpperCase()} - {course.course_name}
              </option>
            ))}
          </select>
        </div>

      </div>

      {/* Catalogue list */}
      {filteredQuizzes.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 space-y-2">
          <PencilSquareIcon className="h-12 w-12 mx-auto text-gray-300" />
          <h3 className="text-base font-bold text-gray-700">មិនរកឃើញកម្រងសំណួរឡើយទេ</h3>
          <p className="text-xs text-gray-400">សាកល្បងផ្លាស់ប្តូរតម្រង ឬស្វែងរកចំណងជើងផ្សេងទៀត។</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredQuizzes.map((quiz) => {
            const isCompleted = !!(quiz.attempt && quiz.attempt.submitted_at);
            const hasActiveAttempt = !!(quiz.attempt && !quiz.attempt.submitted_at);
            const now = new Date();
            const start = new Date(quiz.start_date);
            const end = new Date(quiz.end_date);
            
            const isNotStartedYet = now < start;
            const isExpired = now > end;
            const isActive = (!isCompleted && !isNotStartedYet && !isExpired) || hasActiveAttempt;

            return (
              <div
                key={quiz.id}
                className="bg-white border border-gray-100 rounded-3xl shadow-xs p-6 hover:shadow-md transition-all duration-300 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-yellow-600 bg-yellow-400/10 px-2.5 py-0.5 rounded-md border border-yellow-400/20 uppercase">
                      {quiz.course?.course_code}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                      isCompleted 
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                        : hasActiveAttempt
                          ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                          : isExpired 
                            ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' 
                            : isNotStartedYet 
                              ? 'bg-gray-100 text-gray-500 border-gray-200' 
                              : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                    }`}>
                      {isCompleted 
                        ? '✔ ធ្វើរួចរាល់' 
                        : hasActiveAttempt 
                          ? '⚡ កំពុងធ្វើ' 
                          : isExpired 
                            ? '✖ ហួសពេលកំណត់' 
                            : isNotStartedYet 
                              ? '⏱ មិនទាន់បើក' 
                              : '⚡ អាចធ្វើបាន'}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-gray-900 leading-snug line-clamp-1">{quiz.title}</h3>
                  {quiz.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{quiz.description}</p>
                  )}

                  <div className="space-y-1.5 border-t border-gray-50 pt-3 text-[11px] text-gray-400">
                    <div className="flex justify-between">
                      <span>រយៈពេលធ្វើ (Duration):</span>
                      <span className="font-bold text-gray-700">{quiz.duration} នាទី (mins)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ចាប់ផ្តើម៖</span>
                      <span className="font-semibold text-gray-700">{new Date(quiz.start_date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>បញ្ចប់៖</span>
                      <span className="font-semibold text-gray-700">{new Date(quiz.end_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-gray-50">
                  {isCompleted ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 px-4 py-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1.5">
                      <CheckCircleIcon className="h-5 w-5" />
                      <span>ចម្លើយផ្ញើរួច &bull; ពិន្ទុ៖ {quiz.attempt.score} / {quiz.total_mark} ({quiz.total_mark > 0 ? Math.round((quiz.attempt.score / quiz.total_mark) * 100) : 0}%)</span>
                    </div>
                  ) : isNotStartedYet ? (
                    <button
                      disabled
                      className="w-full bg-gray-50 border border-gray-200 text-gray-400 text-xs font-bold py-2.5 rounded-xl cursor-not-allowed text-center"
                    >
                      មិនទាន់ចាប់ផ្តើមឡើយ (Locked)
                    </button>
                  ) : isExpired && !hasActiveAttempt ? (
                    <button
                      disabled
                      className="w-full bg-rose-500/5 border border-rose-500/10 text-rose-400 text-xs font-bold py-2.5 rounded-xl cursor-not-allowed text-center"
                    >
                      ហួសពេលកំណត់ហើយ (Expired)
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStartAttempt(quiz)}
                      disabled={loadingQuiz}
                      className="w-full inline-flex items-center justify-center gap-1.5 bg-blue-950 hover:bg-yellow-500 hover:text-blue-950 text-white text-xs font-bold py-2.5 rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      <PencilSquareIcon className="h-5 w-5" />
                      {hasActiveAttempt ? 'បន្តការធ្វើតេស្ត (Resume Quiz)' : 'ចាប់ផ្តើមធ្វើតេស្ត (Attempt Quiz)'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QUIZ ATTEMPT SCREEN MODAL */}
      {activeQuizAttempt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl mx-4 my-8 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between bg-blue-950 text-white rounded-t-3xl shrink-0">
              <div>
                <span className="text-[10px] font-black text-yellow-400 bg-white/10 px-2 py-0.5 rounded">
                  {activeQuizAttempt.course?.course_code?.toUpperCase()}
                </span>
                <h2 className="text-lg font-bold mt-1">{activeQuizAttempt.title}</h2>
              </div>
              <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl border border-white/10 text-sm font-bold">
                <ClockIcon className="h-5 w-5 text-yellow-400 animate-pulse" />
                <span>ពេលវេលានៅសល់: <span className="text-yellow-400">{formatTime(timeLeft)}</span></span>
              </div>
            </div>

            {/* Modal Body (Scrollable Questions) */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {activeQuizAttempt.questions?.map((q, idx) => (
                <div key={q.id} className="space-y-4 border-b border-gray-100 pb-6 last:border-b-0 last:pb-0">
                  <div className="flex gap-2">
                    <span className="font-extrabold text-blue-950 text-base shrink-0">សំណួរ {idx + 1}៖</span>
                    <h3 className="text-gray-900 font-bold text-base leading-relaxed">{q.question_text}</h3>
                  </div>

                  {/* Options List */}
                  <div className="grid grid-cols-1 gap-2.5 pl-6">
                    {q.options?.map((opt) => {
                      const isSelected = attemptAnswers[q.id] === opt.id;
                      return (
                        <label
                          key={opt.id}
                          className={`flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-semibold cursor-pointer transition-all duration-200 select-none ${
                            isSelected 
                              ? 'bg-blue-500/10 border-blue-500 text-blue-900 shadow-sm'
                              : 'bg-gray-50 border-gray-200/80 text-gray-700 hover:bg-gray-100/50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`question-${q.id}`}
                            checked={isSelected}
                            onChange={() => handleSelectOption(q.id, opt.id)}
                            className="h-4 w-4 text-blue-950 focus:ring-blue-950 border-gray-300"
                          />
                          <span>{opt.option_text}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-5 border-t border-gray-100 flex justify-end gap-3 shrink-0 bg-gray-50/50 rounded-b-3xl">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('តើអ្នកចង់បោះបង់ការប្រឡងមែនទេ?')) {
                    setActiveQuizAttempt(null);
                    setAttemptAnswers({});
                    endTimeRef.current = null;
                  }
                }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-6 py-2.5 rounded-xl transition"
              >
                បោះបង់ (Cancel)
              </button>
              <button
                type="button"
                onClick={(e) => handleQuizSubmit(e)}
                disabled={isSubmitting}
                className="bg-blue-950 hover:bg-yellow-500 hover:text-blue-950 text-white font-bold px-6 py-2.5 rounded-xl shadow transition"
              >
                {isSubmitting ? 'កំពុងផ្ញើ...' : 'ផ្ញើចម្លើយ (Submit)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUIZ RESULT PANEL DIALOG */}
      {quizResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 p-8 text-center space-y-6">
            <div className="h-16 w-16 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 mx-auto">
              <CheckCircleIcon className="h-10 w-10 text-emerald-500" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-gray-900">ការបញ្ជូនតេស្តទទួលបានជោគជ័យ!</h2>
              <p className="text-xs text-gray-400">ចម្លើយរបស់អ្នកត្រូវបានកត់ត្រារួចរាល់ហើយ។</p>
            </div>

            <div className="bg-gray-50 border border-gray-100 p-5 rounded-2xl space-y-2 text-sm text-gray-700">
              <div className="flex justify-between">
                <span>ពិន្ទុសរុប (Exam Score)៖</span>
                <span className="font-extrabold text-blue-950 text-base">
                  {quizResult.total_marks > 0 ? Math.round((quizResult.score / quizResult.total_marks) * 100) : 0}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>ចម្លើយត្រឹមត្រូវ (Points)៖</span>
                <span className="font-extrabold text-gray-900">{quizResult.score} / {quizResult.total_marks || 100}</span>
              </div>
            </div>

            <button
              onClick={() => setQuizResult(null)}
              className="w-full bg-blue-950 hover:bg-yellow-500 hover:text-blue-950 text-white font-bold py-2.5 rounded-xl shadow transition"
            >
              បិទបង្អួច (Close Window)
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default StudentQuizzes;

// src/components/teacher/TeacherManageQuizzes.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  BookOpenIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CalendarIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

export default function TeacherManageQuizzes() {
  const [quizzes, setQuizzes] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [expandedQuiz, setExpandedQuiz] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for creating/editing a Quiz
  const [formData, setFormData] = useState({
    course_id: '',
    title: '',
    duration: 60,
    total_mark: 100,
    start_date: '',
    end_date: '',
  });

  // Form states for adding questions (inside expanded section)
  const [questionText, setQuestionText] = useState('');
  const [questionType, setQuestionType] = useState('MCQ'); // MCQ, TrueFalse, Essay
  const [questionMark, setQuestionMark] = useState(10);
  const [mcqOptions, setMcqOptions] = useState([
    { option_text: '', is_correct: false },
    { option_text: '', is_correct: false },
    { option_text: '', is_correct: false },
    { option_text: '', is_correct: false },
  ]);
  const [tfCorrect, setTfCorrect] = useState('true'); // 'true' or 'false'
  const [addingQuestionQuizId, setAddingQuestionQuizId] = useState(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchCourses(),
        fetchQuizzes()
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

  const fetchQuizzes = async () => {
    try {
      const response = await api.get('/teacher/quizzes');
      // ធានាថាវាចាប់យក Array ជានិច្ច
      const quizzesData = response.data.data || response.data || [];
      setQuizzes(Array.isArray(quizzesData) ? quizzesData : []);
    } catch (error) {
      toast.error('មិនអាចទាញយកទិន្នន័យកម្រងសំណួរបានទេ');
      setQuizzes([]);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openAddModal = () => {
    setEditingQuiz(null);
    setFormData({
      course_id: Array.isArray(courses) && courses.length > 0 ? courses[0].id : '',
      title: '',
      duration: 60,
      total_mark: 100,
      start_date: '',
      end_date: '',
    });
    setShowAddModal(true);
  };

  const openEditModal = (quiz) => {
    setEditingQuiz(quiz);

    // Format dates to datetime-local format
    let formattedStart = '';
    let formattedEnd = '';
    const tzOffset = new Date().getTimezoneOffset() * 60000;

    if (quiz.start_date) {
      formattedStart = new Date(new Date(quiz.start_date).getTime() - tzOffset).toISOString().slice(0, 16);
    }
    if (quiz.end_date) {
      formattedEnd = new Date(new Date(quiz.end_date).getTime() - tzOffset).toISOString().slice(0, 16);
    }

    setFormData({
      course_id: quiz.course_id || '',
      title: quiz.title || '',
      duration: quiz.duration ?? 60,
      total_mark: quiz.total_mark ?? 100,
      start_date: formattedStart,
      end_date: formattedEnd,
    });
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = {
      course_id: formData.course_id,
      title: formData.title,
      duration: parseInt(formData.duration) || 60,
      total_mark: parseFloat(formData.total_mark) || 100,
      start_date: formData.start_date,
      end_date: formData.end_date,
    };

    try {
      if (editingQuiz) {
        await api.put(`/teacher/quizzes/${editingQuiz.id}`, payload);
        toast.success('បានកែប្រែកម្រងសំណួរដោយជោគជ័យ');
      } else {
        await api.post('/teacher/quizzes', payload);
        toast.success('បានបន្ថែមកម្រងសំណួរដោយជោគជ័យ');
      }
      setShowAddModal(false);
      await fetchQuizzes();
    } catch (error) {
      console.error('Submit error:', error);
      if (error.response?.data?.errors) {
        toast.error(Object.values(error.response.data.errors).flat().join('\n'));
      } else {
        toast.error(error.response?.data?.message || 'ការរក្សាទុកកម្រងសំណួរបានបរាជ័យ');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (quiz) => {
    setSelectedQuiz(quiz);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedQuiz) return;
    try {
      const response = await api.delete(`/teacher/quizzes/${selectedQuiz.id}`);
      toast.success(response.data?.message || 'បានលុបកម្រងសំណួរដោយជោគជ័យ');
      setShowDeleteModal(false);
      setSelectedQuiz(null);
      await fetchQuizzes();
    } catch (error) {
      toast.error(error.response?.data?.message || 'មិនអាចលុបកម្រងសំណួរបានទេ');
    }
  };

  // Add Question logic
  const handleAddQuestion = async (quizId) => {
    if (!questionText) {
      toast.error('សូមបញ្ចូលខ្លឹមសារសំណួរ');
      return;
    }

    let options = [];
    if (questionType === 'MCQ') {
      const filledOptions = mcqOptions.filter(opt => opt.option_text.trim() !== '');
      if (filledOptions.length < 2) {
        toast.error('សំណួរពហុជ្រើសរើស ត្រូវតែមានជម្រើសយ៉ាងតិច ២');
        return;
      }
      const hasCorrect = filledOptions.some(opt => opt.is_correct);
      if (!hasCorrect) {
        toast.error('សូមជ្រើសរើសចម្លើយត្រឹមត្រូវមួយយ៉ាងតិច');
        return;
      }
      options = filledOptions;
    } else if (questionType === 'TrueFalse') {
      options = [
        { option_text: 'ពិត (True)', is_correct: tfCorrect === 'true' },
        { option_text: 'មិនពិត (False)', is_correct: tfCorrect === 'false' }
      ];
    }

    const payload = {
      question_text: questionText,
      question_type: questionType,
      mark: parseFloat(questionMark) || 10,
      options: questionType === 'Essay' ? [] : options,
    };

    setAddingQuestionQuizId(quizId);
    try {
      await api.post(`/teacher/quizzes/${quizId}/questions`, payload);
      toast.success('បានបន្ថែមសំណួរដោយជោគជ័យ');
      setQuestionText('');
      setQuestionMark(10);
      setMcqOptions([
        { option_text: '', is_correct: false },
        { option_text: '', is_correct: false },
        { option_text: '', is_correct: false },
        { option_text: '', is_correct: false },
      ]);
      await fetchQuizzes();
    } catch (error) {
      toast.error(error.response?.data?.message || 'មិនអាចបន្ថែមសំណួរបានទេ');
    } finally {
      setAddingQuestionQuizId(null);
    }
  };

  // Delete Question
  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបសំណួរនេះមែនទេ?')) return;
    try {
      await api.delete(`/teacher/quizzes/questions/${questionId}`);
      toast.success('បានលុបសំណួរដោយជោគជ័យ');
      await fetchQuizzes();
    } catch (error) {
      toast.error(error.response?.data?.message || 'មិនអាចលុបសំណួរបានទេ');
    }
  };

  const handleMcqOptionChange = (index, value) => {
    setMcqOptions(prev => prev.map((opt, i) => i === index ? { ...opt, option_text: value } : opt));
  };

  const handleMcqCorrectToggle = (index) => {
    setMcqOptions(prev => prev.map((opt, i) => ({ ...opt, is_correct: i === index })));
  };

  // ប្រើ Array.isArray ការពារការគាំង
  const filteredQuizzes = Array.isArray(quizzes) ? quizzes.filter(quiz => {
    const search = searchTerm.toLowerCase();
    return quiz.title?.toLowerCase().includes(search);
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
                <BookOpenIcon className="h-6 w-6" />
              </span>
              គ្រប់គ្រងកម្រងសំណួរ (Quizzes)
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              បង្កើតកម្រងសំណួរប្រឡង និងគ្រប់គ្រងសំណួរនីមួយៗ
              <span className="ml-2 text-indigo-600 font-medium">({Array.isArray(quizzes) ? quizzes.length : 0} កម្រងសំណួរ)</span>
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition-all hover:shadow-md"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            បន្ថែមតម្លៃកម្រងសំណួរ
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="ស្វែងរកតាមចំណងជើងកម្រងសំណួរ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">No</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ចំណងជើងកម្រងសំណួរ</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">មុខវិជ្ជា (Course)</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">រយះពេល</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">ពិន្ទុសរុប</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">ចំនួនសំណួរ</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Attempts</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredQuizzes.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-14 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <BookOpenIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="font-medium">
                        {searchTerm ? 'មិនឃើញលទ្ធផលស្វែងរក' : 'មិនទាន់មានកម្រងសំណួរនៅឡើយទេ'}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {searchTerm ? 'សូមប្តូរពាក្យស្វែងរក' : 'ចុច "បន្ថែមតម្លៃកម្រងសំណួរ" ដើម្បីចាប់ផ្តើម'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredQuizzes.map((quiz, index) => {
                  const isExpanded = expandedQuiz === quiz.id;
                  const questionsCount = quiz.questions_count || quiz.questions?.length || 0;
                  const attemptsCount = quiz.attempts_count || 0;

                  return (
                    <React.Fragment key={quiz.id}>
                      <tr 
                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => setExpandedQuiz(isExpanded ? null : quiz.id)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-400">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-gray-900">{quiz.title}</div>
                          <div className="text-[10px] text-gray-400 mt-1 flex flex-col gap-0.5">
                            <span>ចាប់ផ្តើម៖ {formatDate(quiz.start_date)}</span>
                            <span>បញ្ចប់៖ {formatDate(quiz.end_date)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-800 font-medium">{quiz.course?.course_name}</div>
                          <div className="text-xs text-gray-500 font-mono mt-0.5">{quiz.course?.course_code}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">
                          <div className="flex items-center justify-center gap-1">
                            <ClockIcon className="h-4 w-4 text-gray-400" />
                            {quiz.duration} នាទី
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-800">
                          {quiz.total_mark} ភិន្ទុ
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                            {questionsCount}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            {attemptsCount} នាក់
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => openEditModal(quiz)}
                              className="p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all"
                              title="កែប្រែ"
                            >
                              <PencilSquareIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(quiz)}
                              className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-xl transition-all"
                              title="លុប"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => setExpandedQuiz(isExpanded ? null : quiz.id)}
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                              title={isExpanded ? 'បិទសំណួរ' : 'បង្ហាញសំណួរ'}
                            >
                              {isExpanded ? (
                                <ChevronUpIcon className="h-5 w-5" />
                              ) : (
                                <ChevronDownIcon className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Section for managing Questions */}
                      {isExpanded && (
                        <tr className="bg-gray-50/70">
                          <td colSpan="8" className="px-8 py-5">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                              
                              {/* Questions List (Left 2 columns) */}
                              <div className="lg:col-span-2 space-y-4">
                                <h4 className="text-sm font-bold text-gray-900 border-b pb-2 flex justify-between items-center">
                                  <span>បញ្ជីសំណួរ ({quiz.questions?.length || 0})</span>
                                  <span className="text-xs text-indigo-600 font-medium">ពិន្ទុសរុប៖ {quiz.questions?.reduce((sum, q) => sum + parseFloat(q.mark), 0) || 0} / {quiz.total_mark}</span>
                                </h4>
                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                                  {(!Array.isArray(quiz.questions) || quiz.questions.length === 0) ? (
                                    <p className="text-xs text-gray-400 italic py-4">គ្មានសំណួរនៅក្នុងកម្រងសំណួរនេះទេ</p>
                                  ) : (
                                    quiz.questions.map((question, qIdx) => (
                                      <div key={question.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-2xs hover:shadow-xs transition relative">
                                        <div className="flex justify-between items-start mb-2">
                                          <div className="text-xs font-bold text-gray-900">
                                            សំណួរទី {qIdx + 1} <span className="ml-2 font-normal text-gray-400 bg-gray-50 px-2 py-0.5 rounded-sm">{question.question_type}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-indigo-600">{question.mark} ភិន្ទុ</span>
                                            <button
                                              onClick={() => handleDeleteQuestion(question.id)}
                                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                                              title="លុបសំណួរ"
                                            >
                                              <TrashIcon className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </div>
                                        <p className="text-sm text-gray-800 font-medium mb-3">{question.question_text}</p>
                                        
                                        {/* Display MCQ Options */}
                                        {question.question_type === 'MCQ' && (
                                          <div className="grid grid-cols-2 gap-2">
                                            {Array.isArray(question.options) && question.options.map((opt, oIdx) => (
                                              <div 
                                                key={opt.id} 
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${opt.is_correct ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-gray-50/50 border-gray-200 text-gray-700'}`}
                                              >
                                                <span className="font-bold">{String.fromCharCode(65 + oIdx)}.</span>
                                                <span className="truncate">{opt.option_text}</span>
                                                {opt.is_correct && <CheckCircleIcon className="h-4 w-4 text-emerald-600 shrink-0 ml-auto" />}
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        {/* Display True/False Options */}
                                        {question.question_type === 'TrueFalse' && (
                                          <div className="flex gap-4">
                                            {Array.isArray(question.options) && question.options.map(opt => (
                                              <span 
                                                key={opt.id} 
                                                className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${opt.is_correct ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                                              >
                                                {opt.option_text}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>

                              {/* Add Question Form (Right 1 column) */}
                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs h-fit space-y-4">
                                <h4 className="text-sm font-bold text-gray-900 border-b pb-2">បន្ថែមសំណួរថ្មី</h4>
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">ខ្លឹមសារសំណួរ</label>
                                  <textarea
                                    rows={2}
                                    placeholder="បញ្ចូលសំណួរ..."
                                    value={questionText}
                                    onChange={(e) => setQuestionText(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">ប្រភេទសំណួរ</label>
                                    <select
                                      value={questionType}
                                      onChange={(e) => setQuestionType(e.target.value)}
                                      className="w-full px-2 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    >
                                      <option value="MCQ">ពហុជ្រើសរើស (MCQ)</option>
                                      <option value="TrueFalse">ពិត/មិនពិត (True/False)</option>
                                      <option value="Essay">សរសេររៀបរាប់ (Essay)</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">ពិន្ទុ</label>
                                    <input
                                      type="number"
                                      value={questionMark}
                                      onChange={(e) => setQuestionMark(e.target.value)}
                                      className="w-full px-2 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </div>
                                </div>

                                {/* MCQ Option Inputs */}
                                {questionType === 'MCQ' && (
                                  <div className="space-y-2">
                                    <label className="block text-xs font-semibold text-gray-500">ចម្លើយជម្រើស (និងកំណត់ចម្លើយត្រូវ)</label>
                                    {mcqOptions.map((opt, oIdx) => (
                                      <div key={oIdx} className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-gray-400">{String.fromCharCode(65 + oIdx)}.</span>
                                        <input
                                          type="text"
                                          placeholder={`ជម្រើស ${String.fromCharCode(65 + oIdx)}...`}
                                          value={opt.option_text}
                                          onChange={(e) => handleMcqOptionChange(oIdx, e.target.value)}
                                          className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none"
                                        />
                                        <input
                                          type="radio"
                                          name={`mcq_correct_${quiz.id}`}
                                          checked={opt.is_correct}
                                          onChange={() => handleMcqCorrectToggle(oIdx)}
                                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                          title="កំណត់ចម្លើយត្រឹមត្រូវ"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* True/False Options */}
                                {questionType === 'TrueFalse' && (
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-2">ចម្លើយត្រូវ</label>
                                    <div className="flex gap-4">
                                      <label className="inline-flex items-center text-xs font-medium text-gray-700">
                                        <input
                                          type="radio"
                                          name={`tf_correct_${quiz.id}`}
                                          value="true"
                                          checked={tfCorrect === 'true'}
                                          onChange={() => setTfCorrect('true')}
                                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 mr-1.5"
                                        />
                                        ពិត (True)
                                      </label>
                                      <label className="inline-flex items-center text-xs font-medium text-gray-700">
                                        <input
                                          type="radio"
                                          name={`tf_correct_${quiz.id}`}
                                          value="false"
                                          checked={tfCorrect === 'false'}
                                          onChange={() => setTfCorrect('false')}
                                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 mr-1.5"
                                        />
                                        មិនពិត (False)
                                      </label>
                                    </div>
                                  </div>
                                )}

                                <button
                                  onClick={() => handleAddQuestion(quiz.id)}
                                  disabled={addingQuestionQuizId === quiz.id || !questionText}
                                  className="w-full inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-40"
                                >
                                  {addingQuestionQuizId === quiz.id ? (
                                    <ArrowPathIcon className="h-4 w-4 animate-spin mr-1.5" />
                                  ) : (
                                    <PlusIcon className="h-4 w-4 mr-1.5" />
                                  )}
                                  បន្ថែមសំណួរ
                                </button>
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal - Add/Edit Quiz */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                  <BookOpenIcon className="h-5 w-5" />
                </span>
                {editingQuiz ? 'កែប្រែកម្រងសំណួរ' : 'បង្កើតកម្រងសំណួរថ្មី'}
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
                  ចំណងជើងកម្រងសំណួរ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="ឧ. តេស្តសាកល្បងឆមាសទី១"
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
                  {/* ធានាថាវាដំណើរការពេលបើក Modal */}
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
                    រយះពេលធ្វើតេស្ត (នាទី) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="duration"
                    min="5"
                    required
                    value={formData.duration}
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
                    name="total_mark"
                    min="10"
                    required
                    value={formData.total_mark}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    ថ្ងៃចាប់ផ្តើម <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    name="start_date"
                    required
                    value={formData.start_date}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    ថ្ងៃបញ្ចប់ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    name="end_date"
                    required
                    value={formData.end_date}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
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
                    <BookOpenIcon className="h-5 w-5" />
                  )}
                  {editingQuiz ? 'រក្សាទុក' : 'បង្កើតកម្រងសំណួរ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-fadeIn">
            <div className="flex items-center text-red-600 mb-4">
              <ExclamationTriangleIcon className="h-6 w-6 mr-2" />
              <h3 className="text-lg font-bold">បញ្ជាក់ការលុប</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបកម្រងសំណួរ «<span className="font-semibold text-gray-800">{selectedQuiz?.title}</span>» នេះមែនទេ?
              <br />
              <span className="text-red-500 text-xs font-semibold mt-1 block">ការលុបកម្រងសំណួរនេះនឹងធ្វើឱ្យបាត់បង់រាល់ព័ត៌មានសំណួរ និងចម្លើយទាំងអស់ពាក់ព័ន្ធ។</span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedQuiz(null);
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
// src/components/teacher/TeacherManageQuizzes.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useLanguage } from '../../context/LanguageContext';
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
  CheckCircleIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon,
  EyeIcon,
  UserCircleIcon,
  AcademicCapIcon,
  DocumentCheckIcon
} from '@heroicons/react/24/outline';

export default function TeacherManageQuizzes() {
  const { t, language } = useLanguage();
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

  // Import JSON Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCourseId, setImportCourseId] = useState('');
  const [jsonContent, setJsonContent] = useState('');
  const [importFile, setImportFile] = useState(null);
  // Submissions Modal State
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [viewingQuiz, setViewingQuiz] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissionSearch, setSubmissionSearch] = useState('');

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
      const coursesData = response.data.data || response.data || [];
      setCourses(Array.isArray(coursesData) ? coursesData : []);
    } catch (error) {
      toast.error(t('មិនអាចទាញយកទិន្នន័យមុខវិជ្ជាបានទេ', 'Cannot fetch courses data'));
      setCourses([]);
    }
  };

  const fetchQuizzes = async () => {
    try {
      const response = await api.get('/teacher/quizzes');
      const quizzesData = response.data.data || response.data || [];
      setQuizzes(Array.isArray(quizzesData) ? quizzesData : []);
    } catch (error) {
      toast.error(t('មិនអាចទាញយកទិន្នន័យកម្រងសំណួរបានទេ', 'Cannot fetch quizzes data'));
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
        toast.success(t('បានកែប្រែកម្រងសំណួរដោយជោគជ័យ', 'Quiz updated successfully'));
      } else {
        await api.post('/teacher/quizzes', payload);
        toast.success(t('បានបន្ថែមកម្រងសំណួរដោយជោគជ័យ', 'Quiz created successfully'));
      }
      setShowAddModal(false);
      await fetchQuizzes();
    } catch (error) {
      console.error('Submit error:', error);
      if (error.response?.data?.errors) {
        toast.error(Object.values(error.response.data.errors).flat().join('\n'));
      } else {
        toast.error(error.response?.data?.message || t('ការរក្សាទុកកម្រងសំណួរបានបរាជ័យ', 'Failed to save quiz'));
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
      toast.success(response.data?.message || t('បានលុបកម្រងសំណួរដោយជោគជ័យ', 'Quiz deleted successfully'));
      setShowDeleteModal(false);
      setSelectedQuiz(null);
      await fetchQuizzes();
    } catch (error) {
      toast.error(error.response?.data?.message || t('មិនអាចលុបកម្រងសំណួរបានទេ', 'Cannot delete quiz'));
    }
  };

  // Add Question logic
  const handleAddQuestion = async (quizId) => {
    if (!questionText) {
      toast.error(t('សូមបញ្ចូលខ្លឹមសារសំណួរ', 'Please enter question content'));
      return;
    }

    let options = [];
    if (questionType === 'MCQ') {
      const filledOptions = mcqOptions.filter(opt => opt.option_text.trim() !== '');
      if (filledOptions.length < 2) {
        toast.error(t('សំណួរពហុជ្រើសរើស ត្រូវតែមានជម្រើសយ៉ាងតិច ២', 'Multiple choice questions must have at least 2 options'));
        return;
      }
      const hasCorrect = filledOptions.some(opt => opt.is_correct);
      if (!hasCorrect) {
        toast.error(t('សូមជ្រើសរើសចម្លើយត្រឹមត្រូវមួយយ៉ាងតិច', 'Please select at least one correct option'));
        return;
      }
      options = filledOptions;
    } else if (questionType === 'TrueFalse') {
      options = [
        { option_text: t('ពិត (True)', 'True'), is_correct: tfCorrect === 'true' },
        { option_text: t('មិនពិត (False)', 'False'), is_correct: tfCorrect === 'false' }
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
      toast.success(t('បានបន្ថែមសំណួរដោយជោគជ័យ', 'Question added successfully'));
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
      toast.error(error.response?.data?.message || t('មិនអាចបន្ថែមសំណួរបានទេ', 'Cannot add question'));
    } finally {
      setAddingQuestionQuizId(null);
    }
  };

  // Delete Question
  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm(t('តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបសំណួរនេះមែនទេ?', 'Are you sure you want to delete this question?'))) return;
    try {
      await api.delete(`/teacher/quizzes/questions/${questionId}`);
      toast.success(t('បានលុបសំណួរដោយជោគជ័យ', 'Question deleted successfully'));
      await fetchQuizzes();
    } catch (error) {
      toast.error(error.response?.data?.message || t('មិនអាចលុបសំណួរបានទេ', 'Cannot delete question'));
    }
  };

  const handleMcqOptionChange = (index, value) => {
    setMcqOptions(prev => prev.map((opt, i) => i === index ? { ...opt, option_text: value } : opt));
  };

  const handleMcqCorrectToggle = (index) => {
    setMcqOptions(prev => prev.map((opt, i) => ({ ...opt, is_correct: i === index })));
  };

  // Import JSON Handlers
  const downloadSampleJson = () => {
    const sample = [
      {
        "title": "HTML & CSS Basics Quiz",
        "duration": 45,
        "total_mark": 100,
        "questions": [
          {
            "question_text": "What does HTML stand for?",
            "question_type": "MCQ",
            "mark": 10,
            "options": [
              { "option_text": "HyperText Markup Language", "is_correct": true },
              { "option_text": "HighText Machine Language", "is_correct": false },
              { "option_text": "Hyperlink Text Mark Language", "is_correct": false },
              { "option_text": "Home Tool Markup Language", "is_correct": false }
            ]
          },
          {
            "question_text": "Is CSS used for styling web pages?",
            "question_type": "TrueFalse",
            "mark": 10,
            "options": [
              { "option_text": "True", "is_correct": true },
              { "option_text": "False", "is_correct": false }
            ]
          },
          {
            "question_text": "Explain the CSS Box Model.",
            "question_type": "Essay",
            "mark": 20,
            "options": []
          }
        ]
      }
    ];

    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quiz_import_template.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const quizArray = Array.isArray(parsed) ? parsed : [parsed];
        setParsedQuizzes(quizArray);
        setJsonContent(JSON.stringify(parsed, null, 2));
      } catch (err) {
        toast.error(t('ឯកសារ JSON មិនត្រឹមត្រូវ (Invalid JSON format)', 'Invalid JSON format'));
        setParsedQuizzes([]);
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!parsedQuizzes || parsedQuizzes.length === 0) {
      toast.error(t('សូមជ្រើសរើសឯកសារ JSON ឬបិទភ្ជាប់ទិន្នន័យ JSON ដែលមានសំណួរ', 'Please select a JSON file or paste valid JSON content'));
      return;
    }
    const targetCourse = importCourseId || (courses.length > 0 ? courses[0].id : '');
    if (!targetCourse) {
      toast.error(t('សូមជ្រើសរើសមុខវិជ្ជាសម្រាប់កម្រងសំណួរ', 'Please select a course for the quiz'));
      return;
    }

    setIsImporting(true);
    try {
      const payload = {
        course_id: targetCourse,
        quizzes: parsedQuizzes.map(q => ({
          ...q,
          course_id: q.course_id || targetCourse
        }))
      };

      const response = await api.post('/teacher/quizzes/import', payload);
      toast.success(response.data?.message || t('បាននាំចូលកម្រងសំណួរដោយជោគជ័យ', 'Quizzes imported successfully'));
      setShowImportModal(false);
      setParsedQuizzes([]);
      setJsonContent('');
      setImportFile(null);
      await fetchQuizzes();
    } catch (error) {
      console.error('Import error:', error);
      toast.error(error.response?.data?.message || t('ការនាំចូលកម្រងសំណួរបានបរាជ័យ', 'Failed to import quizzes'));
    } finally {
      setIsImporting(false);
    }
  };

  // Fetch Quiz Attempts / Submissions for a teacher to view
  const openSubmissionsModal = async (quiz) => {
    setViewingQuiz(quiz);
    setShowSubmissionsModal(true);
    setLoadingSubmissions(true);
    setSubmissionSearch('');
    try {
      const response = await api.get(`/teacher/quizzes/${quiz.id}/results`);
      const attemptsData = response.data.attempts || response.data || [];
      setSubmissions(Array.isArray(attemptsData) ? attemptsData : []);
    } catch (error) {
      console.error('Error fetching quiz submissions:', error);
      toast.error(t('មិនអាចទាញយកទិន្នន័យការប្រឡងរបស់សិស្សបានទេ', 'Cannot fetch student exam submissions'));
      setSubmissions([]);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const filteredSubmissions = Array.isArray(submissions) ? submissions.filter(attempt => {
    const search = submissionSearch.toLowerCase();
    const studentName = attempt.student ? `${attempt.student.first_name || ''} ${attempt.student.last_name || ''}`.toLowerCase() : '';
    const studentEmail = attempt.student?.email?.toLowerCase() || '';
    return studentName.includes(search) || studentEmail.includes(search);
  }) : [];

  const filteredQuizzes = Array.isArray(quizzes) ? quizzes.filter(quiz => {
    const search = searchTerm.toLowerCase();
    return quiz.title?.toLowerCase().includes(search);
  }) : [];

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'km' ? 'kh-KH' : 'en-US', {
      year: 'numeric',
      month: 'short',
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
              {t('គ្រប់គ្រងកម្រងសំណួរ', 'Manage Quizzes')}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('បង្កើតកម្រងសំណួរប្រឡង និងគ្រប់គ្រងសំណួរនីមួយៗ', 'Create exam quizzes and manage individual questions')}
              <span className="ml-2 text-indigo-600 font-medium">({Array.isArray(quizzes) ? quizzes.length : 0} {t('កម្រងសំណួរ', 'quizzes')})</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-emerald-700 transition-all hover:shadow-md cursor-pointer"
            >
              <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
              {t('នាំចូលកម្រងសំណួរ JSON', 'Import Quizzes JSON')}
            </button>
            <button
              onClick={openAddModal}
              className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition-all hover:shadow-md cursor-pointer"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              {t('បន្ថែមតម្លៃកម្រងសំណួរ', 'Add New Quiz')}
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('ស្វែងរកតាមចំណងជើងកម្រងសំណួរ...', 'Search by quiz title...')}
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
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('ល.រ', 'No')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('ចំណងជើងកម្រងសំណួរ', 'Quiz Title')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('មុខវិជ្ជា (Course)', 'Course')}</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('រយះពេល', 'Duration')}</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('ពិន្ទុសរុប', 'Total Mark')}</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('ចំនួនសំណួរ', 'Questions')}</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('ការប្រឡង (Attempts)', 'Attempts')}</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('សកម្មភាព', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredQuizzes.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-14 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <BookOpenIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="font-medium">
                        {searchTerm ? t('មិនឃើញលទ្ធផលស្វែងរក', 'No search results found') : t('មិនទាន់មានកម្រងសំណួរនៅឡើយទេ', 'No quizzes available yet')}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {searchTerm ? t('សូមប្តូរពាក្យស្វែងរក', 'Please try a different search keyword') : t('ចុច "បន្ថែមតម្លៃកម្រងសំណួរ" ដើម្បីចាប់ផ្តើម', 'Click "Add New Quiz" to get started')}
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
                            <span>{t('ចាប់ផ្តើម៖', 'Start:')} {formatDate(quiz.start_date)}</span>
                            <span>{t('បញ្ចប់៖', 'End:')} {formatDate(quiz.end_date)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-800 font-medium">{quiz.course?.course_name}</div>
                          <div className="text-xs text-gray-500 font-mono mt-0.5">{quiz.course?.course_code}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">
                          <div className="flex items-center justify-center gap-1">
                            <ClockIcon className="h-4 w-4 text-gray-400" />
                            {quiz.duration} {t('នាទី', 'mins')}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-800">
                          {quiz.total_mark} {t('ពិន្ទុ', 'pts')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                            {questionsCount}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openSubmissionsModal(quiz)}
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors cursor-pointer shadow-2xs"
                            title={t('មើលការប្រឡងរបស់សិស្ស', 'View Student Submissions')}
                          >
                            <EyeIcon className="h-3.5 w-3.5 mr-1" />
                            {attemptsCount} {t('នាក់', 'students')}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => openSubmissionsModal(quiz)}
                              className="p-2 text-emerald-600 hover:text-emerald-900 hover:bg-emerald-50 rounded-xl transition-all"
                              title={t('មើលការប្រឡងសិស្ស (Submissions)', 'View Submissions')}
                            >
                              <EyeIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => openEditModal(quiz)}
                              className="p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all"
                              title={t('កែប្រែ', 'Edit')}
                            >
                              <PencilSquareIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(quiz)}
                              className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-xl transition-all"
                              title={t('លុប', 'Delete')}
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => setExpandedQuiz(isExpanded ? null : quiz.id)}
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                              title={isExpanded ? t('បិទសំណួរ', 'Hide Questions') : t('បង្ហាញសំណួរ', 'Show Questions')}
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
                                  <span>{t('បញ្ជីសំណួរ', 'Questions List')} ({quiz.questions?.length || 0})</span>
                                  <span className="text-xs text-indigo-600 font-medium">{t('ពិន្ទុសរុប៖', 'Total Mark:')} {quiz.questions?.reduce((sum, q) => sum + parseFloat(q.mark), 0) || 0} / {quiz.total_mark}</span>
                                </h4>
                                <div className="space-y-3 max-h-100 overflow-y-auto pr-2">
                                  {(!Array.isArray(quiz.questions) || quiz.questions.length === 0) ? (
                                    <p className="text-xs text-gray-400 italic py-4">{t('គ្មានសំណួរនៅក្នុងកម្រងសំណួរនេះទេ', 'No questions in this quiz yet')}</p>
                                  ) : (
                                    quiz.questions.map((question, qIdx) => (
                                      <div key={question.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-2xs hover:shadow-xs transition relative">
                                        <div className="flex justify-between items-start mb-2">
                                          <div className="text-xs font-bold text-gray-900">
                                            {t('សំណួរទី', 'Question')} {qIdx + 1} <span className="ml-2 font-normal text-gray-400 bg-gray-50 px-2 py-0.5 rounded-sm">{question.question_type}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-indigo-600">{question.mark} {t('ពិន្ទុ', 'pts')}</span>
                                            <button
                                              onClick={() => handleDeleteQuestion(question.id)}
                                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                              title={t('លុបសំណួរ', 'Delete question')}
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
                                <h4 className="text-sm font-bold text-gray-900 border-b pb-2">{t('បន្ថែមសំណួរថ្មី', 'Add New Question')}</h4>
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">{t('ខ្លឹមសារសំណួរ', 'Question Content')}</label>
                                  <textarea
                                    rows={2}
                                    placeholder={t('បញ្ចូលសំណួរ...', 'Enter question content...')}
                                    value={questionText}
                                    onChange={(e) => setQuestionText(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">{t('ប្រភេទសំណួរ', 'Question Type')}</label>
                                    <select
                                      value={questionType}
                                      onChange={(e) => setQuestionType(e.target.value)}
                                      className="w-full px-2 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    >
                                      <option value="MCQ">{t('ពហុជ្រើសរើស (MCQ)', 'Multiple Choice (MCQ)')}</option>
                                      <option value="TrueFalse">{t('ពិត/មិនពិត (True/False)', 'True / False')}</option>
                                      <option value="Essay">{t('សរសេររៀបរាប់ (Essay)', 'Essay')}</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">{t('ពិន្ទុ', 'Mark')}</label>
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
                                    <label className="block text-xs font-semibold text-gray-500">{t('ចម្លើយជម្រើស (និងកំណត់ចម្លើយត្រូវ)', 'Options (and set correct answer)')}</label>
                                    {mcqOptions.map((opt, oIdx) => (
                                      <div key={oIdx} className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-gray-400">{String.fromCharCode(65 + oIdx)}.</span>
                                        <input
                                          type="text"
                                          placeholder={`${t('ជម្រើស', 'Option')} ${String.fromCharCode(65 + oIdx)}...`}
                                          value={opt.option_text}
                                          onChange={(e) => handleMcqOptionChange(oIdx, e.target.value)}
                                          className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none"
                                        />
                                        <input
                                          type="radio"
                                          name={`mcq_correct_${quiz.id}`}
                                          checked={opt.is_correct}
                                          onChange={() => handleMcqCorrectToggle(oIdx)}
                                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 cursor-pointer"
                                          title={t('កំណត់ចម្លើយត្រឹមត្រូវ', 'Set correct answer')}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* True/False Options */}
                                {questionType === 'TrueFalse' && (
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-2">{t('ចម្លើយត្រូវ', 'Correct Answer')}</label>
                                    <div className="flex gap-4">
                                      <label className="inline-flex items-center text-xs font-medium text-gray-700 cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`tf_correct_${quiz.id}`}
                                          value="true"
                                          checked={tfCorrect === 'true'}
                                          onChange={() => setTfCorrect('true')}
                                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 mr-1.5"
                                        />
                                        {t('ពិត (True)', 'True')}
                                      </label>
                                      <label className="inline-flex items-center text-xs font-medium text-gray-700 cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`tf_correct_${quiz.id}`}
                                          value="false"
                                          checked={tfCorrect === 'false'}
                                          onChange={() => setTfCorrect('false')}
                                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 mr-1.5"
                                        />
                                        {t('មិនពិត (False)', 'False')}
                                      </label>
                                    </div>
                                  </div>
                                )}

                                <button
                                  onClick={() => handleAddQuestion(quiz.id)}
                                  disabled={addingQuestionQuizId === quiz.id || !questionText}
                                  className="w-full inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-40 cursor-pointer"
                                >
                                  {addingQuestionQuizId === quiz.id ? (
                                    <ArrowPathIcon className="h-4 w-4 animate-spin mr-1.5" />
                                  ) : (
                                    <PlusIcon className="h-4 w-4 mr-1.5" />
                                  )}
                                  {t('បន្ថែមសំណួរ', 'Add Question')}
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
                {editingQuiz ? t('កែប្រែកម្រងសំណួរ', 'Edit Quiz') : t('បង្កើតកម្រងសំណួរថ្មី', 'Create New Quiz')}
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
                  {t('ចំណងជើងកម្រងសំណួរ', 'Quiz Title')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder={t('ឧ. តេស្តសាកល្បងឆមាសទី១', 'e.g., Semester 1 Practice Quiz')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('មុខវិជ្ជា', 'Course')} <span className="text-red-500">*</span>
                </label>
                <select
                  name="course_id"
                  required
                  value={formData.course_id}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white transition-all"
                >
                  <option value="">{t('ជ្រើសរើសមុខវិជ្ជា', 'Select Course')}</option>
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
                    {t('រយះពេលធ្វើតេស្ត (នាទី)', 'Duration (Minutes)')} <span className="text-red-500">*</span>
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
                    {t('ពិន្ទុសរុប', 'Total Mark')} <span className="text-red-500">*</span>
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
                    {t('ថ្ងៃចាប់ផ្តើម', 'Start Date')} <span className="text-red-500">*</span>
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
                    {t('ថ្ងៃបញ្ចប់', 'End Date')} <span className="text-red-500">*</span>
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
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
                >
                  {t('បោះបង់', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  ) : (
                    <BookOpenIcon className="h-5 w-5" />
                  )}
                  {editingQuiz ? t('រក្សាទុក', 'Save Changes') : t('បង្កើតកម្រងសំណួរ', 'Create Quiz')}
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
              <h3 className="text-lg font-bold">{t('បញ្ជាក់ការលុប', 'Confirm Deletion')}</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {t('តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបកម្រងសំណួរ', 'Are you sure you want to delete quiz')} «<span className="font-semibold text-gray-800">{selectedQuiz?.title}</span>» {t('នេះមែនទេ?', 'this quiz?')}
              <br />
              <span className="text-red-500 text-xs font-semibold mt-1 block">{t('ការលុបកម្រងសំណួរនេះនឹងធ្វើឱ្យបាត់បង់រាល់ព័ត៌មានសំណួរ និងចម្លើយទាំងអស់ពាក់ព័ន្ធ។', 'Deleting this quiz will permanently remove all associated questions and answers.')}</span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedQuiz(null);
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-xl hover:bg-red-700 transition-all shadow-sm cursor-pointer"
              >
                {t('លុបចោល', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import JSON Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 md:p-8 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="bg-emerald-100 text-emerald-600 p-2 rounded-xl">
                  <ArrowUpTrayIcon className="h-5 w-5" />
                </span>
                {t('នាំចូលកម្រងសំណួរតាម JSON (Import Quiz JSON)', 'Import Quiz JSON')}
              </h2>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setParsedQuizzes([]);
                  setJsonContent('');
                  setImportFile(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-5">
              {/* Target Course Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('ជ្រើសរើសមុខវិជ្ជាសម្រាប់នាំចូល', 'Select Course to Import')} <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={importCourseId}
                  onChange={(e) => setImportCourseId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition-all text-sm"
                >
                  <option value="">{t('ជ្រើសរើសមុខវិជ្ជា', 'Select Course')}</option>
                  {Array.isArray(courses) && courses.map(course => (
                    <option key={course.id} value={course.id}>
                      {course.course_name} ({course.course_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Upload JSON File & Download Template */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">
                    {t('ជ្រើសរើសឯកសារ JSON', 'Select JSON File')} <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={downloadSampleJson}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline cursor-pointer"
                  >
                    <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                    {t('ទាញយកគំរូឯកសារ JSON', 'Download JSON Sample')}
                  </button>
                </div>
                <div className="border-2 border-dashed border-gray-300 hover:border-emerald-500 rounded-2xl p-6 text-center bg-gray-50/50 transition-colors">
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileChange}
                    className="hidden"
                    id="json-file-input"
                  />
                  <label htmlFor="json-file-input" className="cursor-pointer flex flex-col items-center">
                    <DocumentTextIcon className="h-10 w-10 text-emerald-600 mb-2" />
                    <span className="text-sm font-semibold text-gray-800">
                      {importFile ? importFile.name : t('ចុចទីនេះដើម្បីជ្រើសរើសឯកសារ .json', 'Click here to select .json file')}
                    </span>
                    <span className="text-xs text-gray-400 mt-1">
                      {importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : t('ទម្រង់ឯកសារ JSON (Standard Quiz JSON)', 'Standard Quiz JSON format')}
                    </span>
                  </label>
                </div>
              </div>

              {/* Parsed JSON Preview */}
              {parsedQuizzes.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-800 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-emerald-900">
                    <CheckCircleIcon className="h-4 w-4" />
                    {t('បានរកឃើញកម្រងសំណួរចំនួន', 'Found quizzes:')} {parsedQuizzes.length} {t('កម្រង', 'quizzes')}
                  </div>
                  {parsedQuizzes.map((q, idx) => (
                    <div key={idx} className="pl-5 text-emerald-700">
                      • {q.title || t('កម្រងសំណួរគ្មានចំណងជើង', 'Untitled Quiz')} ({q.questions?.length || 0} {t('សំណួរ', 'questions')})
                    </div>
                  ))}
                </div>
              )}

              {/* JSON Textarea Editor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('ឬបិទភ្ជាប់ទិន្នន័យ JSON ផ្ទាល់នៅទីនេះ (Or Paste JSON Directly)', 'Or Paste JSON Directly')}
                </label>
                <textarea
                  rows={6}
                  value={jsonContent}
                  onChange={(e) => {
                    setJsonContent(e.target.value);
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setParsedQuizzes(Array.isArray(parsed) ? parsed : [parsed]);
                    } catch (err) {
                      setParsedQuizzes([]);
                    }
                  }}
                  placeholder='[ { "title": "Quiz Title", "duration": 45, "questions": [...] } ]'
                  className="w-full px-4 py-2.5 font-mono text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all bg-gray-50"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportModal(false);
                    setParsedQuizzes([]);
                    setJsonContent('');
                    setImportFile(null);
                  }}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
                >
                  {t('បោះបង់', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isImporting || parsedQuizzes.length === 0}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isImporting ? (
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  ) : (
                    <ArrowUpTrayIcon className="h-5 w-5" />
                  )}
                  {t('នាំចូលកម្រងសំណួរ', 'Import Quizzes')} ({parsedQuizzes.length})
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - View Student Submissions / Attempts */}
      {showSubmissionsModal && viewingQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="bg-emerald-100 text-emerald-600 p-2 rounded-xl">
                    <DocumentCheckIcon className="h-6 w-6" />
                  </span>
                  {t('លទ្ធផល និងការប្រឡងរបស់សិស្ស (Quiz Submissions)', 'Quiz Submissions & Results')}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {t('កម្រងសំណួរ៖', 'Quiz:')} <span className="font-semibold text-gray-800">{viewingQuiz.title}</span> 
                  <span className="mx-2">•</span> 
                  {t('ពិន្ទុសរុប៖', 'Total Mark:')} <span className="font-semibold text-indigo-600">{viewingQuiz.total_mark} {t('ពិន្ទុ', 'pts')}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setShowSubmissionsModal(false);
                  setViewingQuiz(null);
                  setSubmissions([]);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 flex items-center gap-4">
                  <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-xs">
                    <AcademicCapIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-xs text-indigo-600 font-semibold uppercase tracking-wider">{t('សិស្សប្រឡងសរុប', 'Total Students')}</div>
                    <div className="text-2xl font-bold text-indigo-950">{submissions.length} {t('នាក់', 'students')}</div>
                  </div>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 flex items-center gap-4">
                  <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-xs">
                    <CheckCircleIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-xs text-emerald-600 font-semibold uppercase tracking-wider">{t('ជាប់ (Pass ≥ 50%)', 'Passed (≥ 50%)')}</div>
                    <div className="text-2xl font-bold text-emerald-950">
                      {submissions.filter(s => (parseFloat(s.score) / (parseFloat(viewingQuiz.total_mark) || 1)) >= 0.5).length} {t('នាក់', 'students')}
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-4 flex items-center gap-4">
                  <div className="p-3 bg-amber-600 text-white rounded-xl shadow-xs">
                    <ClockIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-xs text-amber-600 font-semibold uppercase tracking-wider">{t('ពិន្ទុមធ្យម (Avg Score)', 'Average Score')}</div>
                    <div className="text-2xl font-bold text-amber-950">
                      {submissions.length > 0 
                        ? (submissions.reduce((acc, curr) => acc + (parseFloat(curr.score) || 0), 0) / submissions.length).toFixed(1)
                        : '0'} / {viewingQuiz.total_mark}
                    </div>
                  </div>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={t('ស្វែងរកតាមឈ្មោះ ឬអ៊ីមែលរបស់សិស្ស...', 'Search by student name or email...')}
                  value={submissionSearch}
                  onChange={(e) => setSubmissionSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Submissions Table / List */}
              {loadingSubmissions ? (
                <div className="py-16 text-center text-gray-500">
                  <ArrowPathIcon className="h-8 w-8 animate-spin mx-auto text-emerald-600 mb-2" />
                  <p className="text-sm font-medium">{t('កំពុងទាញយកទិន្នន័យការប្រឡង...', 'Fetching exam submissions...')}</p>
                </div>
              ) : filteredSubmissions.length === 0 ? (
                <div className="py-14 text-center text-gray-500 border border-dashed border-gray-200 rounded-2xl">
                  <DocumentCheckIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-base font-semibold text-gray-700">
                    {submissionSearch ? t('មិនរកឃើញសិស្សតាមការស្វែងរកទេ', 'No students match your search') : t('មិនទាន់មានសិស្សប្រឡងកម្រងសំណួរនេះនៅឡើយទេ', 'No students have taken this quiz yet')}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {submissionSearch ? t('សូមពិនិត្យពាក្យស្វែងរកឡើងវិញ', 'Please check your search keywords') : t('នៅពេលសិស្សធ្វើកម្រងសំណួរចោទ លទ្ធផលនឹងបង្ហាញនៅទីនេះ', 'When students attempt the quiz, their results will appear here')}
                  </p>
                </div>
              ) : (
                <div className="border border-gray-100 rounded-xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t('ល.រ', 'No')}</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t('ព័ត៌មានសិស្ស', 'Student Info')}</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">{t('ថ្ងៃ ចាប់ផ្តើម', 'Started At')}</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">{t('ថ្ងៃ ប្រគល់ (Submitted)', 'Submitted At')}</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">{t('ពិន្ទុទទួលបាន', 'Score')}</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">{t('ស្ថានភាព', 'Status')}</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {filteredSubmissions.map((attempt, idx) => {
                          const student = attempt.student;
                          const studentName = student 
                            ? `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.email 
                            : t('មិនស្គាល់អត្តសញ្ញាណ', 'Unknown Student');
                          const scoreVal = parseFloat(attempt.score) || 0;
                          const totalVal = parseFloat(viewingQuiz.total_mark) || 100;
                          const percentage = Math.round((scoreVal / totalVal) * 100);
                          const isPassed = percentage >= 50;

                          return (
                            <tr key={attempt.id || idx} className="hover:bg-gray-50/60 transition-colors">
                              <td className="px-4 py-3 text-xs font-semibold text-gray-400">
                                {idx + 1}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {student?.profile_image ? (
                                    <img
                                      src={student.profile_image.startsWith('http') ? student.profile_image : `/storage/${student.profile_image}`}
                                      alt={studentName}
                                      className="w-9 h-9 rounded-full object-cover border border-gray-200"
                                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                    />
                                  ) : null}
                                  <div className={`w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 ${student?.profile_image ? 'hidden' : ''}`}>
                                    {studentName.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="text-sm font-bold text-gray-900">{studentName}</div>
                                    <div className="text-xs text-gray-400">{student?.email || '—'}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-xs text-gray-600">
                                {formatDate(attempt.started_at)}
                              </td>
                              <td className="px-4 py-3 text-center text-xs text-gray-600 font-medium">
                                {formatDate(attempt.submitted_at)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="text-sm font-extrabold text-gray-900">
                                  {scoreVal} <span className="text-xs font-normal text-gray-400">/ {totalVal}</span>
                                </div>
                                <div className="text-[11px] font-semibold text-indigo-600 mt-0.5">
                                  ({percentage}%)
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                                  isPassed 
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                                }`}>
                                  {isPassed ? t('ជាប់ (Passed)', 'Passed') : t('ធ្លាក់ (Failed)', 'Failed')}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowSubmissionsModal(false);
                  setViewingQuiz(null);
                  setSubmissions([]);
                }}
                className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បិទ (Close)', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
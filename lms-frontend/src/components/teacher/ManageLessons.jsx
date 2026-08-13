// src/components/teacher/ManageLessons.jsx
import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useLanguage } from '../../context/LanguageContext';
import {
  BookOpenIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  DocumentIcon,
  VideoCameraIcon,
  PencilSquareIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  PaperClipIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';

export default function ManageLessons() {
  const { t, language } = useLanguage();
  const [lessons, setLessons] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [expandedLesson, setExpandedLesson] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // File & Video upload loading states
  const [uploadingFileId, setUploadingFileId] = useState(null);
  const [uploadingVideoId, setUploadingVideoId] = useState(null);
  const [uploadingYoutubeId, setUploadingYoutubeId] = useState(null);

  const fileInputRef = useRef(null);
  const videoFileInputRef = useRef(null);

  // State to track media being uploaded to a specific lesson (inside expanded section)
  const [videoTitle, setVideoTitle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');

  // Form state for creating/editing a lesson
  const [formData, setFormData] = useState({
    title: '',
    course_id: '',
    lesson_order: '1',
    description: '',
  });

  // File upload state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [youtubeVideo, setYoutubeVideo] = useState({ title: '', url: '' });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const getStorageUrl = (path) => {
    if (!path) return '#';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) return path;
    const backendBase = (api.defaults?.baseURL || 'http://localhost:8000/api').replace(/\/api\/?$/, '');
    const cleanPath = path.replace(/^\/?storage\//, '');
    return `${backendBase}/api/download-file?path=${encodeURIComponent(cleanPath)}`;
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchCourses(),
        fetchLessons()
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

  const fetchLessons = async () => {
    try {
      const response = await api.get('/teacher/lessons');
      const lessonsData = response.data.data || response.data || [];
      setLessons(Array.isArray(lessonsData) ? lessonsData : []);
    } catch (error) {
      toast.error(t('មិនអាចទាញយកទិន្នន័យមេរៀនបានទេ', 'Cannot fetch lessons data'));
      setLessons([]);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const openAddModal = () => {
    setEditingLesson(null);
    setFormData({
      title: '',
      course_id: Array.isArray(courses) && courses.length > 0 ? courses[0].id : '',
      lesson_order: ((Array.isArray(lessons) ? lessons.length : 0) + 1).toString(),
      description: '',
    });
    setSelectedFiles([]);
    setYoutubeVideo({ title: '', url: '' });
    setShowAddModal(true);
  };

  const openEditModal = (lesson) => {
    setEditingLesson(lesson);
    setFormData({
      title: lesson.title || '',
      course_id: lesson.course_id || '',
      lesson_order: (lesson.lesson_order ?? 1).toString(),
      description: lesson.description || '',
    });
    setSelectedFiles([]);
    setYoutubeVideo({ title: '', url: '' });
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = {
      title: formData.title,
      course_id: formData.course_id,
      lesson_order: parseInt(formData.lesson_order) || 1,
      description: formData.description,
    };

    try {
      let currentLessonId = null;

      if (editingLesson) {
        await api.put(`/teacher/lessons/${editingLesson.id}`, payload);
        currentLessonId = editingLesson.id;
        toast.success(t('បានកែប្រែមេរៀនដោយជោគជ័យ', 'Lesson updated successfully'));
      } else {
        const response = await api.post('/teacher/lessons', payload);
        currentLessonId = response.data?.lesson?.id || response.data?.id; 
        toast.success(t('បានបន្ថែមមេរៀនដោយជោគជ័យ', 'Lesson created successfully'));
      }

      if (selectedFiles.length > 0 && currentLessonId) {
        for (const file of selectedFiles) {
          const filePayload = new FormData();
          filePayload.append('lesson_id', currentLessonId);
          filePayload.append('file', file);
          
          try {
             await api.post('/teacher/lessons/file', filePayload, {
               headers: { 'Content-Type': 'multipart/form-data' }
             });
          } catch (fileError) {
             console.error('File upload failed for', file.name, fileError);
             toast.error(t(`មិនអាចផ្ទុកឯកសារ ${file.name} ឡើងបានទេ`, `Failed to upload file ${file.name}`));
          }
        }
      }

      if (youtubeVideo.url && youtubeVideo.title && currentLessonId) {
         const videoPayload = new FormData();
         videoPayload.append('lesson_id', currentLessonId);
         videoPayload.append('title', youtubeVideo.title);
         videoPayload.append('video_url', youtubeVideo.url); 
         
         try {
            await api.post('/teacher/lessons/video', videoPayload, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
         } catch (videoError) {
            console.error('Video upload failed', videoError);
            toast.error(t('មិនអាចបញ្ចូលវីដេអូបានទេ', 'Failed to upload video'));
         }
      }

      setShowAddModal(false);
      setSelectedFiles([]);
      setYoutubeVideo({ title: '', url: '' });
      await fetchLessons();
      
    } catch (error) {
      console.error('Submit error:', error);
      if (error.response?.data?.errors) {
        toast.error(Object.values(error.response.data.errors).flat().join('\n'));
      } else {
        toast.error(error.response?.data?.message || t('ការរក្សាទុកមេរៀនបានបរាជ័យ', 'Failed to save lesson'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (lesson) => {
    setSelectedLesson(lesson);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedLesson) return;
    try {
      await api.delete(`/teacher/lessons/${selectedLesson.id}`);
      toast.success(t('បានលុបមេរៀនដោយជោគជ័យ', 'Lesson deleted successfully'));
      setShowDeleteModal(false);
      setSelectedLesson(null);
      await fetchLessons();
    } catch (error) {
      toast.error(t('មិនអាចលុបមេរៀនបានទេ', 'Cannot delete lesson'));
    }
  };

  // Upload Lesson File
  const handleUploadFile = async (lessonId, e) => {
    const file = e.target.files[0];
    if (!file) return;

    const filePayload = new FormData();
    filePayload.append('lesson_id', lessonId);
    filePayload.append('file', file);

    setUploadingFileId(lessonId);
    try {
      await api.post('/teacher/lessons/file', filePayload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(t('បានផ្ទុកឡើងឯកសារដោយជោគជ័យ', 'File uploaded successfully'));
      await fetchLessons();
    } catch (error) {
      toast.error(error.response?.data?.message || t('ការផ្ទុកឡើងឯកសារបានបរាជ័យ', 'Failed to upload file'));
    } finally {
      setUploadingFileId(null);
    }
  };

  // Delete Lesson File
  const handleDeleteFile = async (fileId) => {
    if (!window.confirm(t('តើអ្នកចង់លុបឯកសារនេះមែនទេ?', 'Are you sure you want to delete this file?'))) return;
    try {
      await api.delete(`/teacher/lessons/files/${fileId}`);
      toast.success(t('បានលុបឯកសារដោយជោគជ័យ', 'File deleted successfully'));
      await fetchLessons();
    } catch (error) {
      toast.error(t('មិនអាចលុបឯកសារបានទេ', 'Cannot delete file'));
    }
  };

  // Upload Video
  const handleUploadVideo = async (lessonId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!videoTitle) {
      toast.error(t('សូមបញ្ចូលចំណងជើងវីដេអូមុនពេលផ្ទុកឡើង', 'Please enter video title before uploading'));
      return;
    }

    const videoPayload = new FormData();
    videoPayload.append('lesson_id', lessonId);
    videoPayload.append('title', videoTitle);
    videoPayload.append('video', file);

    setUploadingVideoId(lessonId);
    try {
      await api.post('/teacher/lessons/video', videoPayload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(t('បានផ្ទុកឡើងវីដេអូដោយជោគជ័យ', 'Video uploaded successfully'));
      setVideoTitle('');
      await fetchLessons();
    } catch (error) {
      toast.error(error.response?.data?.message || t('ការផ្ទុកឡើងវីដេអូបានបរាជ័យ', 'Failed to upload video'));
    } finally {
      setUploadingVideoId(null);
    }
  };

  // Delete Video
  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm(t('តើអ្នកចង់លុបវីដេអូនេះមែនទេ?', 'Are you sure you want to delete this video?'))) return;
    try {
      await api.delete(`/teacher/lessons/videos/${videoId}`);
      toast.success(t('បានលុបវីដេអូដោយជោគជ័យ', 'Video deleted successfully'));
      await fetchLessons();
    } catch (error) {
      toast.error(t('មិនអាចលុបវីដេអូបានទេ', 'Cannot delete video'));
    }
  };

  const filteredLessons = Array.isArray(lessons) ? lessons.filter(lesson => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = 
      lesson.title?.toLowerCase().includes(search) ||
      lesson.description?.toLowerCase().includes(search);
    const matchesCourse = selectedCourse === '' || lesson.course_id?.toString() === selectedCourse;
    return matchesSearch && matchesCourse;
  }) : [];

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
              {t('គ្រប់គ្រងមេរៀន', 'Manage Lessons')}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('បន្ថែមមេរៀន ក៏ដូចជាវីដេអូ និងឯកសារបង្រៀនសម្រាប់មុខវិជ្ជានីមួយៗ', 'Add lessons, videos, and teaching materials for each course')}
              <span className="ml-2 text-indigo-600 font-medium">({Array.isArray(lessons) ? lessons.length : 0} {t('មេរៀន', 'lessons')})</span>
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition-all hover:shadow-md cursor-pointer"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            {t('បន្ថែមមេរៀន', 'Add Lesson')}
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder={t('ស្វែងរកតាមចំណងជើង ឬការពិពណ៌នា...', 'Search by title or description...')}
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
              <option value="">{t('គ្រប់មុខវិជ្ជា', 'All Courses')}</option>
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
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('ល.រ', 'No')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('ឈ្មោះមេរៀន', 'Lesson Title')}</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('ឯកសារ', 'Files')}</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('វីដេអូ', 'Videos')}</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('សកម្មភាព', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredLessons.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-14 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <BookOpenIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="font-medium">
                        {searchTerm ? t('មិនឃើញលទ្ធផលស្វែងរក', 'No search results found') : t('មិនទាន់មានមេរៀននៅឡើយទេ', 'No lessons available yet')}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {searchTerm ? t('សូមប្តូរពាក្យស្វែងរក', 'Please try a different search keyword') : t('ចុច "បន្ថែមមេរៀន" ដើម្បីចាប់ផ្តើម', 'Click "Add Lesson" to get started')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLessons.map((lesson, index) => {
                  const isExpanded = expandedLesson === lesson.id;
                  const filesCount = lesson.files?.length || 0;
                  const videosCount = lesson.videos?.length || 0;

                  return (
                    <React.Fragment key={lesson.id}>
                      <tr 
                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => setExpandedLesson(isExpanded ? null : lesson.id)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-400">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-gray-900">
                            {lesson.title}
                          </div>
                          <div className="text-xs text-indigo-600 font-medium mt-0.5">
                            {lesson.course?.course_name || t('គ្មានមុខវិជ្ជា', 'No Course')} ({lesson.course?.course_code})
                          </div>
                          <div className="text-xs text-gray-500 line-clamp-1 mt-1">
                            {lesson.description || t('គ្មានការពិពណ៌នា', 'No Description')}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <DocumentIcon className="h-3.5 w-3.5 mr-1" />
                            {filesCount}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            <VideoCameraIcon className="h-3.5 w-3.5 mr-1" />
                            {videosCount}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => openEditModal(lesson)}
                              className="p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all"
                              title={t('កែប្រែ', 'Edit')}
                            >
                              <PencilSquareIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(lesson)}
                              className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-xl transition-all"
                              title={t('លុប', 'Delete')}
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => setExpandedLesson(isExpanded ? null : lesson.id)}
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                              title={isExpanded ? t('បិទព័ត៌មានលម្អិត', 'Hide Details') : t('បង្ហាញព័ត៌មានលម្អិត', 'Show Details')}
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

                      {/* Expanded Section */}
                      {isExpanded && (
                        <tr className="bg-gray-50/70">
                          <td colSpan="5" className="px-8 py-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              {/* Files Section */}
                              <div>
                                <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5 border-b pb-1.5">
                                  <DocumentIcon className="h-4 w-4 text-indigo-600" />
                                  {t('ឯកសារមេរៀន', 'Lesson Files')} ({filesCount})
                                </h4>
                                <div className="space-y-2 mb-4 max-h-[200px] overflow-y-auto pr-1">
                                  {filesCount === 0 ? (
                                    <p className="text-xs text-gray-400 italic">{t('គ្មានឯកសារផ្ទុកឡើង', 'No uploaded files')}</p>
                                  ) : (
                                    Array.isArray(lesson.files) && lesson.files.map(file => (
                                      <div key={file.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-gray-100 shadow-2xs hover:shadow-xs transition text-xs">
                                        <a
                                          href={getStorageUrl(file.file_path)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-indigo-600 hover:underline font-medium truncate max-w-[200px]"
                                          title={file.file_name}
                                        >
                                          {file.file_name}
                                        </a>
                                        <button
                                          onClick={() => handleDeleteFile(file.id)}
                                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                          title={t('លុបឯកសារ', 'Delete file')}
                                        >
                                          <TrashIcon className="h-4 w-4" />
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingFileId === lesson.id}
                                    className="inline-flex items-center justify-center px-4 py-2 border border-dashed border-indigo-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/50 text-indigo-600 text-xs font-semibold rounded-xl transition cursor-pointer"
                                  >
                                    {uploadingFileId === lesson.id ? (
                                      <ArrowPathIcon className="h-4 w-4 animate-spin mr-1.5" />
                                    ) : (
                                      <PaperClipIcon className="h-4 w-4 mr-1.5" />
                                    )}
                                    {t('ផ្ទុកឡើងឯកសារ', 'Upload File')}
                                  </button>
                                  <input
                                    ref={fileInputRef}
                                    type="file"
                                    onChange={(e) => handleUploadFile(lesson.id, e)}
                                    className="hidden"
                                    accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls"
                                  />
                                </div>
                              </div>

                              {/* Videos Section */}
                              <div>
                                <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5 border-b pb-1.5">
                                  <VideoCameraIcon className="h-4 w-4 text-purple-600" />
                                  {t('វីដេអូបង្រៀន', 'Teaching Videos')} ({videosCount})
                                </h4>
                                <div className="space-y-2 mb-4 max-h-[200px] overflow-y-auto pr-1">
                                  {videosCount === 0 ? (
                                    <p className="text-xs text-gray-400 italic">{t('គ្មានវីដេអូផ្ទុកឡើង', 'No uploaded videos')}</p>
                                  ) : (
                                    Array.isArray(lesson.videos) && lesson.videos.map(video => (
                                      <div key={video.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-gray-100 shadow-2xs hover:shadow-xs transition text-xs">
                                        <a
                                          href={`${api.defaults.baseURL.replace('/api', '')}/storage/${video.video_url}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-purple-600 hover:underline font-medium truncate max-w-[200px]"
                                          title={video.title}
                                        >
                                          {video.title}
                                        </a>
                                        <button
                                          onClick={() => handleDeleteVideo(video.id)}
                                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                          title={t('លុបវីដេអូ', 'Delete video')}
                                        >
                                          <TrashIcon className="h-4 w-4" />
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>
                                <div className="space-y-3 bg-white p-3 rounded-2xl border border-gray-100">
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      placeholder={t('ចំណងជើងវីដេអូ...', 'Video title...')}
                                      value={videoTitle}
                                      onChange={(e) => setVideoTitle(e.target.value)}
                                      className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                                    />
                                    <button
                                      onClick={() => videoFileInputRef.current?.click()}
                                      disabled={uploadingVideoId === lesson.id || !videoTitle}
                                      className="inline-flex items-center justify-center px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-40 cursor-pointer"
                                    >
                                      {uploadingVideoId === lesson.id ? (
                                        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin mr-1" />
                                      ) : (
                                        <VideoCameraIcon className="h-3.5 w-3.5 mr-1" />
                                      )}
                                      {t('ផ្ទុកឡើង', 'Upload')}
                                    </button>
                                  </div>
                                  <input
                                    ref={videoFileInputRef}
                                    type="file"
                                    onChange={(e) => handleUploadVideo(lesson.id, e)}
                                    className="hidden"
                                    accept="video/mp4,video/x-m4v,video/*"
                                  />
                                </div>
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

      {/* MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                  <BookOpenIcon className="h-5 w-5" />
                </span>
                {editingLesson ? t('កែប្រែមេរៀន', 'Edit Lesson') : t('បន្ថែមមេរៀនថ្មី', 'Add New Lesson')}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Row 1: Course & Order */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        {course.course_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('លំដាប់លំដោយ', 'Lesson Order')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="lesson_order"
                    min="1"
                    required
                    value={formData.lesson_order}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Row 2: Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('ចំណងជើងមេរៀន', 'Lesson Title')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder={t('ឧ. សេចក្តីផ្តើមអំពីកម្មវិធី...', 'e.g., Introduction to Programming...')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Row 3: Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('ការពិពណ៌នា', 'Description')}
                </label>
                <textarea
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder={t('ពិពណ៌នាអំពីមេរៀន...', 'Describe the lesson...')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              {/* Row 4: Upload Files */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('ផ្ទុកឡើងឯកសារ (PDF, DOCX, ជាដើម)', 'Upload Files (PDF, DOCX, etc.)')}
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 transition-all bg-gray-50 hover:bg-indigo-50/30">
                      <PaperClipIcon className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-600">{t('ជ្រើសរើសឯកសារ', 'Select Files')}</span>
                      <input
                        type="file"
                        multiple
                        onChange={handleFileChange}
                        className="hidden"
                        accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls"
                      />
                    </div>
                  </label>
                </div>
                {selectedFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-xl">
                        <span className="text-sm text-gray-700 truncate max-w-[300px]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Row 5: YouTube Video */}
              <div className="border-t border-gray-100 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <VideoCameraIcon className="h-4 w-4 inline mr-1 text-purple-600" />
                  {t('វីដេអូ (YouTube URL)', 'Video (YouTube URL)')}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder={t('ចំណងជើងវីដេអូ', 'Video Title')}
                    value={youtubeVideo.title}
                    onChange={(e) => setYoutubeVideo({ ...youtubeVideo, title: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LinkIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="url"
                      placeholder="https://youtube.com/..."
                      value={youtubeVideo.url}
                      onChange={(e) => setYoutubeVideo({ ...youtubeVideo, url: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Buttons */}
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
                  {editingLesson ? t('រក្សាទុក', 'Save Changes') : t('បង្កើតមេរៀន', 'Create Lesson')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-fadeIn">
            <div className="flex items-center text-red-600 mb-4">
              <ExclamationTriangleIcon className="h-6 w-6 mr-2" />
              <h3 className="text-lg font-bold">{t('បញ្ជាក់ការលុប', 'Confirm Deletion')}</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {t('តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបមេរៀន', 'Are you sure you want to delete lesson')} «<span className="font-semibold text-gray-800">{selectedLesson?.title}</span>» {t('នេះមែនទេ?', 'this lesson?')}
              <br />
              <span className="text-red-500 text-xs font-semibold mt-1 block">{t('* ឯកសារ និងវីដេអូទាំងអស់របស់មេរៀននេះនឹងត្រូវលុបចោលទាំងស្រុង។', '* All files and videos in this lesson will be permanently deleted.')}</span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedLesson(null);
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
    </div>
  );
}
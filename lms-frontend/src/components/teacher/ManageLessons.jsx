// src/components/teacher/ManageLessons.jsx
import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
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
      toast.error('មិនអាចទាញយកទិន្នន័យមុខវិជ្ជាបានទេ');
      setCourses([]);
    }
  };

  const fetchLessons = async () => {
    try {
      const response = await api.get('/teacher/lessons');
      const lessonsData = response.data.data || response.data || [];
      setLessons(Array.isArray(lessonsData) ? lessonsData : []);
    } catch (error) {
      toast.error('មិនអាចទាញយកទិន្នន័យមេរៀនបានទេ');
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

  // កែសម្រួល handleSubmit ថ្មីដើម្បីរុញទាំងអក្សរ និងឯកសារ
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

      // ជំហានទី១៖ បង្កើត ឬ កែប្រែមេរៀន (បញ្ជូនទិន្នន័យជាអក្សរ)
      if (editingLesson) {
        await api.put(`/teacher/lessons/${editingLesson.id}`, payload);
        currentLessonId = editingLesson.id;
        toast.success('បានកែប្រែមេរៀនដោយជោគជ័យ');
      } else {
        const response = await api.post('/teacher/lessons', payload);
        // ចាប់យក ID របស់មេរៀនដែលទើបនឹងបង្កើតថ្មី 
        currentLessonId = response.data?.lesson?.id || response.data?.id; 
        toast.success('បានបន្ថែមមេរៀនដោយជោគជ័យ');
      }

      // ជំហានទី២៖ ផ្ទុកឡើងឯកសារ (ប្រសិនបើមាន)
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
             toast.error(`មិនអាចផ្ទុកឯកសារ ${file.name} ឡើងបានទេ`);
          }
        }
      }

      // ជំហានទី៣៖ បញ្ចូលវីដេអូ YouTube (ប្រសិនបើមាន)
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
            toast.error('មិនអាចបញ្ចូលវីដេអូបានទេ');
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
        toast.error(error.response?.data?.message || 'ការរក្សាទុកមេរៀនបានបរាជ័យ');
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
      toast.success('បានលុបមេរៀនដោយជោគជ័យ');
      setShowDeleteModal(false);
      setSelectedLesson(null);
      await fetchLessons();
    } catch (error) {
      toast.error('មិនអាចលុបមេរៀនបានទេ');
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
      toast.success('បានផ្ទុកឡើងឯកសារដោយជោគជ័យ');
      await fetchLessons();
    } catch (error) {
      toast.error(error.response?.data?.message || 'ការផ្ទុកឡើងឯកសារបានបរាជ័យ');
    } finally {
      setUploadingFileId(null);
    }
  };

  // Delete Lesson File
  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('តើអ្នកចង់លុបឯកសារនេះមែនទេ?')) return;
    try {
      await api.delete(`/teacher/lessons/files/${fileId}`);
      toast.success('បានលុបឯកសារដោយជោគជ័យ');
      await fetchLessons();
    } catch (error) {
      toast.error('មិនអាចលុបឯកសារបានទេ');
    }
  };

  // Upload Video
  const handleUploadVideo = async (lessonId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!videoTitle) {
      toast.error('សូមបញ្ចូលចំណងជើងវីដេអូមុនពេលផ្ទុកឡើង');
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
      toast.success('បានផ្ទុកឡើងវីដេអូដោយជោគជ័យ');
      setVideoTitle('');
      await fetchLessons();
    } catch (error) {
      toast.error(error.response?.data?.message || 'ការផ្ទុកឡើងវីដេអូបានបរាជ័យ');
    } finally {
      setUploadingVideoId(null);
    }
  };

  // Delete Video
  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm('តើអ្នកចង់លុបវីដេអូនេះមែនទេ?')) return;
    try {
      await api.delete(`/teacher/lessons/videos/${videoId}`);
      toast.success('បានលុបវីដេអូដោយជោគជ័យ');
      await fetchLessons();
    } catch (error) {
      toast.error('មិនអាចលុបវីដេអូបានទេ');
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
              គ្រប់គ្រងមេរៀន
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              បន្ថែមមេរៀន ក៏ដូចជាវីដេអូ និងឯកសារបង្រៀនសម្រាប់មុខវិជ្ជានីមួយៗ
              <span className="ml-2 text-indigo-600 font-medium">({Array.isArray(lessons) ? lessons.length : 0} មេរៀន)</span>
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition-all hover:shadow-md"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            បន្ថែមមេរៀន
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
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Files</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Videos</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredLessons.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-14 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <BookOpenIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="font-medium">
                        {searchTerm ? 'មិនឃើញលទ្ធផលស្វែងរក' : 'មិនទាន់មានមេរៀននៅឡើយទេ'}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {searchTerm ? 'សូមប្តូរពាក្យស្វែងរក' : 'ចុច "បន្ថែមមេរៀន" ដើម្បីចាប់ផ្តើម'}
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
                            {lesson.course?.course_name || 'គ្មានមុខវិជ្ជា'} ({lesson.course?.course_code})
                          </div>
                          <div className="text-xs text-gray-500 line-clamp-1 mt-1">
                            {lesson.description || 'គ្មានការពិពណ៌នា'}
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
                              title="កែប្រែ"
                            >
                              <PencilSquareIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(lesson)}
                              className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-xl transition-all"
                              title="លុប"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => setExpandedLesson(isExpanded ? null : lesson.id)}
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                              title={isExpanded ? 'បិទព័ត៌មានលម្អិត' : 'បង្ហាញព័ត៌មានលម្អិត'}
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
                                  ឯកសារមេរៀន ({filesCount})
                                </h4>
                                <div className="space-y-2 mb-4 max-h-[200px] overflow-y-auto pr-1">
                                  {filesCount === 0 ? (
                                    <p className="text-xs text-gray-400 italic">គ្មានឯកសារផ្ទុកឡើង</p>
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
                                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                                          title="លុបឯកសារ"
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
                                    className="inline-flex items-center justify-center px-4 py-2 border border-dashed border-indigo-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/50 text-indigo-600 text-xs font-semibold rounded-xl transition"
                                  >
                                    {uploadingFileId === lesson.id ? (
                                      <ArrowPathIcon className="h-4 w-4 animate-spin mr-1.5" />
                                    ) : (
                                      <PaperClipIcon className="h-4 w-4 mr-1.5" />
                                    )}
                                    ផ្ទុកឡើងឯកសារ
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
                                  វីដេអូបង្រៀន ({videosCount})
                                </h4>
                                <div className="space-y-2 mb-4 max-h-[200px] overflow-y-auto pr-1">
                                  {videosCount === 0 ? (
                                    <p className="text-xs text-gray-400 italic">គ្មានវីដេអូផ្ទុកឡើង</p>
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
                                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                                          title="លុបវីដេអូ"
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
                                      placeholder="ចំណងជើងវីដេអូ..."
                                      value={videoTitle}
                                      onChange={(e) => setVideoTitle(e.target.value)}
                                      className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                                    />
                                    <button
                                      onClick={() => videoFileInputRef.current?.click()}
                                      disabled={uploadingVideoId === lesson.id || !videoTitle}
                                      className="inline-flex items-center justify-center px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-40"
                                    >
                                      {uploadingVideoId === lesson.id ? (
                                        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin mr-1" />
                                      ) : (
                                        <VideoCameraIcon className="h-3.5 w-3.5 mr-1" />
                                      )}
                                      ផ្ទុកឡើង
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
                {editingLesson ? 'កែប្រែមេរៀន' : 'បន្ថែមមេរៀនថ្មី'}
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
                        {course.course_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    លំដាប់លំដោយ <span className="text-red-500">*</span>
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
                  ចំណងជើងមេរៀន <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="ឧ. សេចក្តីផ្តើមអំពីកម្មវិធី..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Row 3: Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ការពិពណ៌នា
                </label>
                <textarea
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="ពិពណ៌នាអំពីមេរៀន..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              {/* Row 4: Upload Files */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ផ្ទុកឡើងឯកសារ (PDF, DOCX, ជាដើម)
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 transition-all bg-gray-50 hover:bg-indigo-50/30">
                      <PaperClipIcon className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-600">ជ្រើសរើសឯកសារ</span>
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
                  វីដេអូ (YouTube URL)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="ចំណងជើងវីដេអូ"
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
                  {editingLesson ? 'រក្សាទុក' : 'បង្កើតមេរៀន'}
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
              <h3 className="text-lg font-bold">បញ្ជាក់ការលុប</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              តើលោកគ្រូ/អ្នកគ្រូប្រាកដជាចង់លុបមេរៀន «<span className="font-semibold text-gray-800">{selectedLesson?.title}</span>» នេះមែនទេ?
              <br />
              <span className="text-red-500 text-xs font-semibold mt-1 block">* ឯកសារ និងវីដេអូទាំងអស់របស់មេរៀននេះនឹងត្រូវលុបចោលទាំងស្រុង។</span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedLesson(null);
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
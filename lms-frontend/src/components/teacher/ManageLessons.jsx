// teacher/lessons/manage/page.jsx
import {
  BookOpenIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  DocumentIcon,
  VideoCameraIcon,
  PencilSquareIcon,
  TrashIcon,
  EyeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  PaperClipIcon
} from '@heroicons/react/24/outline';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ManageLessons() {
  const navigate = useNavigate();
  const [lessons, setLessons] = useState([]);
  const [lessonFiles, setLessonFiles] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [expandedLesson, setExpandedLesson] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    course: '',
    order: '',
    description: '',
    files: [],
    videoTitle: '',
    videoUrl: ''
  });

  // Mock data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 500));

      const lessonsData = [
        {
          id: 1,
          course_id: 1,
          title: 'សេចក្តីផ្តើមកម្មវិធី',
          description: 'ការណែនាំអំពីកម្មវិធី និងការដំឡើងប្រព័ន្ធ',
          lesson_order: 1,
          created_by: 1,
          created_at: '2024-01-15 08:00:00',
          course_name: 'គណិតវិទ្យា',
          teacher_name: 'លោក សុខា មាន'
        },
        {
          id: 2,
          course_id: 1,
          title: 'អថេរ និងប្រភេទទិន្នន័យ',
          description: 'ស្វែងយល់ពីអថេរ និងប្រភេទទិន្នន័យផ្សេងៗ',
          lesson_order: 2,
          created_by: 1,
          created_at: '2024-01-18 10:30:00',
          course_name: 'គណិតវិទ្យា',
          teacher_name: 'លោក សុខា មាន'
        },
        {
          id: 3,
          course_id: 2,
          title: 'រចនាសម្ព័ន្ធគ្រប់គ្រង',
          description: 'ស្វែងយល់ពីរចនាសម្ព័ន្ធគ្រប់គ្រងក្នុងកម្មវិធី',
          lesson_order: 1,
          created_by: 2,
          created_at: '2024-01-20 09:00:00',
          course_name: 'ភាសាខ្មែរ',
          teacher_name: 'លោកគ្រូ វណ្ណា សុខ'
        },
        {
          id: 4,
          course_id: 3,
          title: 'អនុគមន៍ និងវិធីសាស្ត្រ',
          description: 'ស្វែងយល់ពីអនុគមន៍ និងវិធីសាស្ត្រក្នុងកម្មវិធី',
          lesson_order: 2,
          created_by: 3,
          created_at: '2024-01-22 14:00:00',
          course_name: 'ភាសាអង់គ្លេស',
          teacher_name: 'លោកគ្រូ ភក្តី សេង'
        }
      ];

      const filesData = [
        { id: 1, lesson_id: 1, file_name: 'មេរៀនទី១.pdf', file_type: 'pdf' },
        { id: 2, lesson_id: 1, file_name: 'លំហាត់ទី១.docx', file_type: 'docx' },
        { id: 3, lesson_id: 2, file_name: 'កំណត់ចំណាំអថេរ.pdf', file_type: 'pdf' },
        { id: 4, lesson_id: 3, file_name: 'រចនាសម្ព័ន្ធគ្រប់គ្រង.pdf', file_type: 'pdf' }
      ];

      const videosData = [
        { id: 1, lesson_id: 1, title: 'វីដេអូណែនាំ', duration: '10:30' },
        { id: 2, lesson_id: 1, title: 'ការដំឡើងប្រព័ន្ធ', duration: '15:20' },
        { id: 3, lesson_id: 2, title: 'ពន្យល់អថេរ', duration: '12:45' }
      ];

      setLessons(lessonsData);
      setLessonFiles(filesData);
      setVideos(videosData);
      setLoading(false);
    };

    fetchData();
  }, []);

  const getFileCount = (lessonId) => {
    return lessonFiles.filter(file => file.lesson_id === lessonId).length;
  };

  const getVideoCount = (lessonId) => {
    return videos.filter(video => video.lesson_id === lessonId).length;
  };

  const getFilesForLesson = (lessonId) => {
    return lessonFiles.filter(file => file.lesson_id === lessonId);
  };

  const getVideosForLesson = (lessonId) => {
    return videos.filter(video => video.lesson_id === lessonId);
  };

  const handleDelete = (lesson) => {
    setSelectedLesson(lesson);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    setLessons(lessons.filter(l => l.id !== selectedLesson.id));
    setShowDeleteModal(false);
    setSelectedLesson(null);
  };

  const handleAddLesson = () => {
    setShowAddModal(true);
    setFormData({
      title: '',
      course: '',
      order: '',
      description: '',
      files: [],
      videoTitle: '',
      videoUrl: ''
    });
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setFormData(prev => ({ ...prev, files: [...prev.files, ...files] }));
  };

  const removeFile = (index) => {
    setFormData(prev => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      const newLesson = {
        id: lessons.length + 1,
        title: formData.title,
        description: formData.description,
        lesson_order: parseInt(formData.order) || lessons.length + 1,
        course_name: formData.course,
        created_at: new Date().toISOString(),
        teacher_name: 'លោក សុខា មាន'
      };

      setLessons([...lessons, newLesson]);

      if (formData.files.length > 0) {
        const newFiles = formData.files.map((file, index) => ({
          id: lessonFiles.length + index + 1,
          lesson_id: newLesson.id,
          file_name: file.name,
          file_type: file.name.split('.').pop()
        }));
        setLessonFiles([...lessonFiles, ...newFiles]);
      }

      if (formData.videoTitle && formData.videoUrl) {
        const newVideo = {
          id: videos.length + 1,
          lesson_id: newLesson.id,
          title: formData.videoTitle,
          video_url: formData.videoUrl,
          duration: '00:00'
        };
        setVideos([...videos, newVideo]);
      }

      setIsSubmitting(false);
      setShowAddModal(false);
      setFormData({
        title: '',
        course: '',
        order: '',
        description: '',
        files: [],
        videoTitle: '',
        videoUrl: ''
      });
    }, 1000);
  };

  const courses = ['', ...new Set(lessons.map(l => l.course_name))];

  const filteredLessons = lessons.filter(lesson => {
    const matchesSearch = lesson.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lesson.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCourse = selectedCourse === '' || lesson.course_name === selectedCourse;
    return matchesSearch && matchesCourse;
  });

  // Delete Modal
  const DeleteModal = () => (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 animate-fadeIn">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center text-red-600">
            <ExclamationTriangleIcon className="w-6 h-6 mr-2" />
            <h3 className="text-lg font-bold">បញ្ជាក់ការលុប</h3>
          </div>
          <button onClick={() => setShowDeleteModal(false)} className="text-gray-400 hover:text-gray-600 transition">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        <p className="text-gray-600 mb-6">
          តើអ្នកពិតជាចង់លុបមេរៀន 
          <span className="font-semibold text-gray-800"> "{selectedLesson?.title}"</span> មែនទេ?
          <br />
          <span className="text-sm text-red-500">សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ!</span>
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={() => setShowDeleteModal(false)}
            className="px-5 py-2 border border-gray-300 rounded-xl hover:bg-gray-50 transition text-gray-700"
          >
            បោះបង់
          </button>
          <button
            onClick={confirmDelete}
            className="px-5 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition shadow-sm"
          >
            លុប
          </button>
        </div>
      </div>
    </div>
  );

  // Add Lesson Modal
  const AddLessonModal = () => (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-fadeIn">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center">
            <div className="p-2 bg-blue-50 rounded-xl mr-3">
              <BookOpenIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">មេរៀនថ្មី</h2>
              <p className="text-sm text-gray-500">បំពេញព័ត៌មានដើម្បីបង្កើតមេរៀន</p>
            </div>
          </div>
          <button 
            onClick={() => setShowAddModal(false)}
            className="p-2 hover:bg-gray-100 rounded-xl transition"
          >
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ចំណងជើង <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleFormChange}
              placeholder="បញ្ចូលចំណងជើងមេរៀន..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              required
            />
          </div>

          {/* Course and Order */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                មុខវិជ្ជា <span className="text-red-500">*</span>
              </label>
              <select
                name="course"
                value={formData.course}
                onChange={handleFormChange}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
              >
                <option value="">ជ្រើសរើសមុខវិជ្ជា</option>
                {courses.filter(c => c !== '').map(course => (
                  <option key={course} value={course}>{course}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                លំដាប់ <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="order"
                value={formData.order}
                onChange={handleFormChange}
                placeholder="1"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ការពិពណ៌នា
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleFormChange}
              rows="3"
              placeholder="បញ្ចូលការពិពណ៌នាមេរៀន..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
            />
          </div>

          {/* Upload Files */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ផ្ទុកឯកសារ (PDF, DOCX, ...)
            </label>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition flex items-center"
              >
                <PaperClipIcon className="w-4 h-4 mr-2" />
                ជ្រើសរើសឯកសារ
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <span className="text-sm text-gray-500">
                {formData.files.length > 0 
                  ? `បានជ្រើសរើស ${formData.files.length} ឯកសារ` 
                  : 'មិនមានឯកសារ'}
              </span>
            </div>
            {formData.files.length > 0 && (
              <div className="mt-2 space-y-1">
                {formData.files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-xl text-sm">
                    <span className="text-gray-600">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-red-500 hover:text-red-700 transition"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Video */}
          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">វីដេអូ (ស្រេចចិត្ត)</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">ចំណងជើងវីដេអូ</label>
                <input
                  type="text"
                  name="videoTitle"
                  value={formData.videoTitle}
                  onChange={handleFormChange}
                  placeholder="វីដេអូណែនាំ"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">តំណវីដេអូ (YouTube)</label>
                <input
                  type="url"
                  name="videoUrl"
                  value={formData.videoUrl}
                  onChange={handleFormChange}
                  placeholder="https://youtube.com/..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-6 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition text-gray-700"
            >
              បោះបង់
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50 flex items-center shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                  កំពុងរក្សាទុក...
                </>
              ) : (
                'រក្សាទុក'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <ArrowPathIcon className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">កំពុងផ្ទុកទិន្នន័យ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">មេរៀន</h1>
            <p className="text-sm text-gray-500 mt-0.5">គ្រប់គ្រងមេរៀនទាំងអស់របស់អ្នក</p>
          </div>
          <button
            onClick={handleAddLesson}
            className="mt-3 sm:mt-0 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition flex items-center shadow-sm"
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            បន្ថែមមេរៀន
          </button>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
          <div className="w-full sm:flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="ស្វែងរកមេរៀន..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="w-full sm:w-auto px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition"
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
          >
            <option value="">- ជ្រើសរើសមុខវិជ្ជា -</option>
            {courses.filter(c => c !== '').map(course => (
              <option key={course} value={course}>{course}</option>
            ))}
          </select>
        </div>

        {/* Lessons Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ចំណងជើង</th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">ឯកសារ</th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">វីដេអូ</th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">សកម្មភាព</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredLessons.map((lesson, index) => {
                  const fileCount = getFileCount(lesson.id);
                  const videoCount = getVideoCount(lesson.id);
                  const isExpanded = expandedLesson === lesson.id;

                  return (
                    <>
                      <tr 
                        key={lesson.id} 
                        className="hover:bg-gray-50/50 transition cursor-pointer group"
                        onClick={() => setExpandedLesson(isExpanded ? null : lesson.id)}
                      >
                        <td className="px-4 py-3.5 text-sm text-gray-400 font-medium">{index + 1}</td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-gray-800">{lesson.title}</div>
                          {!isExpanded && (
                            <div className="text-sm text-gray-400 truncate max-w-md">{lesson.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-600 text-sm rounded-lg">
                            <DocumentIcon className="w-3.5 h-3.5 mr-1" />
                            {fileCount}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="inline-flex items-center px-2.5 py-1 bg-purple-50 text-purple-600 text-sm rounded-lg">
                            <VideoCameraIcon className="w-3.5 h-3.5 mr-1" />
                            {videoCount}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-center space-x-0.5">
                            <button 
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/teacher/lessons/${lesson.id}`);
                              }}
                            >
                              <EyeIcon className="w-4 h-4" />
                            </button>
                            <button 
                              className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-xl transition"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/teacher/lessons/edit/${lesson.id}`);
                              }}
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button 
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(lesson);
                              }}
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                            <button 
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedLesson(isExpanded ? null : lesson.id);
                              }}
                            >
                              {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Description */}
                      {isExpanded && (
                        <tr className="bg-gray-50/60">
                          <td colSpan="5" className="px-4 py-3.5">
                            <div className="text-sm text-gray-600">{lesson.description}</div>
                            {(getFilesForLesson(lesson.id).length > 0 || getVideosForLesson(lesson.id).length > 0) && (
                              <div className="mt-2 flex flex-wrap gap-4">
                                {getFilesForLesson(lesson.id).length > 0 && (
                                  <div>
                                    <span className="text-xs font-medium text-gray-500">ឯកសារ:</span>
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                      {getFilesForLesson(lesson.id).map(file => (
                                        <span key={file.id} className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs rounded-lg">
                                          {file.file_name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {getVideosForLesson(lesson.id).length > 0 && (
                                  <div>
                                    <span className="text-xs font-medium text-gray-500">វីដេអូ:</span>
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                      {getVideosForLesson(lesson.id).map(video => (
                                        <span key={video.id} className="px-2.5 py-1 bg-purple-100 text-purple-700 text-xs rounded-lg">
                                          {video.title}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Empty State */}
          {filteredLessons.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <BookOpenIcon className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">មិនមានមេរៀនទេ</p>
              <p className="text-sm text-gray-400 mt-1">ចុចប៊ូតុងខាងលើដើម្បីបង្កើតមេរៀនថ្មី</p>
            </div>
          )}

          {/* Footer */}
          {filteredLessons.length > 0 && (
            <div className="px-4 py-3 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                បង្ហាញ <span className="font-medium text-gray-700">{filteredLessons.length}</span> 
                {' '}ក្នុងចំណោម <span className="font-medium text-gray-700">{lessons.length}</span> មេរៀន
              </span>
              <div className="flex space-x-1.5">
                <button className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-600 text-sm disabled:opacity-50" disabled>
                  មុន
                </button>
                <button className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-sm shadow-sm">1</button>
                <button className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-600 text-sm">2</button>
                <button className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-600 text-sm">3</button>
                <button className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-600 text-sm">
                  បន្ទាប់
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showDeleteModal && <DeleteModal />}
      {showAddModal && <AddLessonModal />}
    </div>
  );
}
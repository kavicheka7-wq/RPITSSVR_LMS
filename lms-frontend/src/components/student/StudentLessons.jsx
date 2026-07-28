import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  BookOpenIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowDownTrayIcon,
  PlayIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  FolderOpenIcon
} from '@heroicons/react/24/outline';

const StudentLessons = () => {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [expandedLesson, setExpandedLesson] = useState(null);

  useEffect(() => {
    fetchLessons();
  }, []);

  const fetchLessons = async () => {
    try {
      const response = await api.get('/student/lessons');
      setLessons(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error('មិនអាចទាញយកព័ត៌មានមេរៀនបានទេ (Failed to fetch lessons)');
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

  // Get unique courses for the filter dropdown
  const courses = Array.from(new Set(lessons.map(l => l.course?.id).filter(Boolean))).map(id => {
    const lesson = lessons.find(l => l.course?.id === id);
    return lesson ? lesson.course : null;
  }).filter(Boolean);

  // Filter lessons based on search query and course filter
  const filteredLessons = lessons.filter((lesson) => {
    const matchesSearch = 
      lesson.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      lesson.course?.course_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      lesson.course?.course_code?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCourse = selectedCourse === 'all' || lesson.course_id === Number(selectedCourse);

    return matchesSearch && matchesCourse;
  });

  const baseURL = api.defaults.baseURL.replace('/api', '');

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ArrowPathIcon className="h-10 w-10 text-blue-900 animate-spin" />
        <p className="text-sm text-gray-500 font-sans">កំពុងផ្ទុកព័ត៌មានមេរៀន... (Loading lessons catalogue...)</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-8 shadow-xl border border-blue-900">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        
        <div className="relative z-10 space-y-2">
          <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-3 py-1 rounded-lg border border-yellow-400/20 uppercase tracking-wider">
            បណ្ណាល័យមេរៀន (Lessons Catalogue)
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">មេរៀន និងឯកសារមេរៀនទាំងអស់</h1>
          <p className="text-blue-200 text-sm max-w-xl font-medium">
            ស្វែងរក និងទាញយកមេរៀន វីដេអូបង្រៀន និងឯកសារជំនួយការសិក្សាពីគ្រប់មុខវិជ្ជា។ (Browse study files and video lectures.)
          </p>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="ស្វែងរកតាមចំណងជើង ឬកូដមុខវិជ្ជា... (Search lessons...)"
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

      {/* Lessons List */}
      {filteredLessons.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 space-y-2">
          <FolderOpenIcon className="h-12 w-12 mx-auto text-gray-300" />
          <h3 className="text-base font-bold text-gray-700">មិនរកឃើញមេរៀនឡើយទេ</h3>
          <p className="text-xs text-gray-400">សាកល្បងស្វែងរកដោយប្រើពាក្យគន្លឹះផ្សេងទៀត ឬផ្លាស់ប្តូរតម្រងមុខវិជ្ជា។</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLessons.map((lesson) => {
            const filesCount = lesson.files?.length || 0;
            const videosCount = lesson.videos?.length || 0;
            const isExpanded = expandedLesson === lesson.id;

            return (
              <div
                key={lesson.id}
                className="bg-white border border-gray-100/80 rounded-3xl shadow-xs overflow-hidden hover:shadow-md transition-all duration-300"
              >
                <button
                  onClick={() => handleLessonToggle(lesson.id)}
                  className="w-full px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50/20 hover:bg-gray-50/60 transition-colors text-left gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 bg-blue-900/10 rounded-2xl flex items-center justify-center border border-blue-900/10 shrink-0">
                      <BookOpenIcon className="h-5 w-5 text-blue-900" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black text-yellow-600 bg-yellow-400/10 px-2 py-0.5 rounded-md border border-yellow-400/20 uppercase">
                          {lesson.course?.course_code}
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                          មេរៀនទី {lesson.lesson_order}
                        </span>
                      </div>
                      <h4 className="font-bold text-gray-900 text-base mt-1.5">{lesson.title}</h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        មុខវិជ្ជា៖ {lesson.course?.course_name} &bull; បង្រៀនដោយ៖ {lesson.course?.teacher?.name || 'គ្រូបង្រៀន'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100">
                    <span className="text-xs text-gray-500 font-bold bg-white border border-gray-100 px-3 py-1.5 rounded-xl shadow-2xs">
                      📁 {filesCount} Files &bull; 🎥 {videosCount} Videos
                    </span>
                    {isExpanded ? (
                      <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-6 py-5 border-t border-gray-100/50 bg-white space-y-6">
                    {lesson.description && (
                      <div className="space-y-1">
                        <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider">សេចក្តីពិពណ៌នាមេរៀន (Description)</h5>
                        <p className="text-sm text-gray-600 leading-relaxed">{lesson.description}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Documents */}
                      <div className="space-y-3">
                        <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5">ឯកសារមេរៀន (Documents)</h5>
                        {filesCount === 0 ? (
                          <p className="text-xs text-gray-400 italic">គ្មានឯកសារផ្ទុកឡើង</p>
                        ) : (
                          <div className="space-y-2">
                            {lesson.files.map((file) => (
                              <div key={file.id} className="flex items-center justify-between bg-gray-50 px-4 py-2.5 rounded-2xl border border-gray-100 hover:bg-gray-100/50 transition">
                                <span className="text-xs font-semibold text-gray-700 truncate max-w-[200px]" title={file.file_name}>
                                  {getFileIcon(file.file_name)} {file.file_name}
                                </span>
                                <a
                                  href={`${baseURL}/storage/${file.file_path}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={file.file_name}
                                  className="p-1.5 text-blue-900 hover:text-yellow-600 hover:bg-white rounded-xl border border-gray-200/50 shadow-2xs hover:shadow-xs transition"
                                  title="ទាញយកឯកសារ"
                                >
                                  <ArrowDownTrayIcon className="h-4 w-4" />
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Lecture Videos */}
                      <div className="space-y-3">
                        <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5">វីដេអូបង្រៀន (Lectures)</h5>
                        {videosCount === 0 ? (
                          <p className="text-xs text-gray-400 italic">គ្មានវីដេអូផ្ទុកឡើង</p>
                        ) : (
                          <div className="space-y-2">
                            {lesson.videos.map((video) => (
                              <div key={video.id} className="flex items-center justify-between bg-gray-50 px-4 py-2.5 rounded-2xl border border-gray-100 hover:bg-gray-100/50 transition">
                                <span className="text-xs font-semibold text-gray-700 truncate max-w-[200px]" title={video.title}>
                                  🎥 {video.title}
                                </span>
                                <a
                                  href={`${baseURL}/storage/${video.video_url}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-xl border border-purple-100 transition"
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
  );
};

export default StudentLessons;

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { BookOpenIcon, AcademicCapIcon, ArrowPathIcon, ExclamationCircleIcon, UserIcon } from '@heroicons/react/24/outline';

const StudentCourses = () => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const response = await api.get('/student/courses');
      const coursesData = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
        ? response.data
        : [];
      setCourses(coursesData);
    } catch (error) {
      console.error('Error fetching courses:', error);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header section with gradient and premium styling */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 p-8 border border-blue-800/30 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-500/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-400/5 rounded-full blur-3xl -ml-24 -mb-24"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-yellow-500/10 rounded-xl flex items-center justify-center border border-yellow-500/20">
                <BookOpenIcon className="h-6 w-6 text-yellow-400" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-wide">
                មុខវិជ្ជាសិក្សារបស់ខ្ញុំ
              </h1>
            </div>
            <p className="text-sm text-blue-200/70 pl-13">
              ចូលមើល និងតាមដានមុខវិជ្ជាសិក្សាសកម្មទាំងអស់របស់អ្នក (Browse and track all your active enrolled courses)
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <ArrowPathIcon className="h-10 w-10 text-blue-900 animate-spin" />
          <p className="text-sm font-medium text-gray-500 font-sans">កំពុងទាញយកទិន្នន័យ... (Loading your courses...)</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-3xl p-16 text-center text-gray-500 shadow-lg">
          <div className="max-w-md mx-auto space-y-4">
            <ExclamationCircleIcon className="h-12 w-12 text-gray-300 mx-auto" />
            <h3 className="text-lg font-bold text-gray-800">មិនទាន់មានមុខវិជ្ជាសិក្សានៅឡើយទេ</h3>
            <p className="text-sm text-gray-400">
              អ្នកមិនទាន់បានចុះឈ្មោះចូលរៀនក្នុងមុខវិជ្ជាណាមួយសកម្មនៅឡើយទេ។ (You are not currently enrolled in any active courses)
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(Array.isArray(courses) ? courses : []).map((course) => (
            <Link
              key={course.id}
              to={`/student/courses/${course.id}`}
              className="group bg-white rounded-3xl border border-gray-100 hover:border-yellow-400/50 hover:shadow-xl transition-all duration-300 p-6 flex flex-col justify-between relative overflow-hidden"
            >
              {/* Background accents */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-400/5 rounded-full blur-2xl group-hover:bg-yellow-400/10 transition-colors"></div>

              <div className="space-y-4">
                {/* Course icon & Code */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-yellow-600 bg-yellow-400/10 px-3 py-1.5 rounded-xl border border-yellow-400/20">
                    {course.course_code}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">
                    {course.credit} ឥណទាន (Credits)
                  </span>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-900 transition-colors line-clamp-2">
                    {course.course_name}
                  </h3>
                  {course.description && (
                    <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">
                      {course.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Footer details */}
              <div className="mt-6 pt-4 border-t border-gray-100/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-xs text-gray-500 min-w-0">
                  <img
                    src={course.teacher_profile?.profile_image_url}
                    alt={course.teacher?.name}
                    className="h-7 w-7 rounded-full object-cover border border-gray-100"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-gray-800 truncate" title={course.teacher?.name}>
                      {course.teacher?.name || 'គ្រូបង្រៀន'}
                    </span>
                    {course.teacher_profile?.specialization && (
                      <span className="text-[10px] text-gray-400 truncate">
                        {course.teacher_profile.specialization}
                      </span>
                    )}
                  </div>
                </div>
                
                <span className="text-xs font-bold text-blue-900 group-hover:text-yellow-600 transition-colors shrink-0">
                  ចូលមើលមេរៀន &rarr;
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentCourses;

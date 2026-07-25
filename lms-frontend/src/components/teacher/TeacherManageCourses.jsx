// src/components/teacher/TeacherManageCourses.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { BookOpenIcon } from '@heroicons/react/24/outline';

const TeacherManageCourses = () => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const response = await api.get('/teacher/courses');
      const coursesData = response.data.data || response.data || [];
      setCourses(coursesData);
    } catch (error) {
      console.error('Error fetching courses:', error);
      toast.error('មិនអាចទាញយកទិន្នន័យមុខវិជ្ជាបានទេ');
    } finally {
      setLoading(false);
    }
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
              មុខវិជ្ជារបស់ខ្ញុំ
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              មើលបញ្ជីមុខវិជ្ជាបង្រៀនរបស់លោកគ្រូ/អ្នកគ្រូ
              <span className="ml-2 text-indigo-600 font-medium">({courses.length} មុខវិជ្ជា)</span>
            </p>
          </div>
        </div>
      </div>

      {/* Courses Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  មុខវិជ្ជា
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  កូដ
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ជំនាញ
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ក្រេឌីត
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {courses.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-14 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <BookOpenIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="font-medium">
                        មិនទាន់មានមុខវិជ្ជានៅឡើយទេ
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                courses.map((course) => (
                  <tr key={course.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white font-medium text-sm shadow-sm">
                          <BookOpenIcon className="h-5 w-5" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {course.course_name}
                          </div>
                          <div className="text-xs text-gray-500 line-clamp-1">
                            {course.description || 'គ្មានការពិពណ៌នា'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-mono bg-gray-100 text-gray-700 rounded-lg">
                        {course.course_code}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {course.department?.department_name || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        {course.credit} ក្រេឌីត
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer with count */}
        {courses.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-sm text-gray-600">
              សរុបមាន <span className="font-medium text-gray-900">{courses.length}</span> មុខវិជ្ជា
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherManageCourses;
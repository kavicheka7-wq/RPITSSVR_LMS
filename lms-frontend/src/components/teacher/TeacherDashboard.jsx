// src/components/teacher/TeacherDashboard.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { BookOpenIcon, UsersIcon, ClipboardDocumentListIcon, PencilSquareIcon } from '@heroicons/react/24/outline';

const TeacherDashboard = () => {
  const [stats, setStats] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/teacher/dashboard');
      setStats(response.data.stats);
      setCourses(response.data.courses);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const statCards = [
    { title: 'My Courses', value: stats?.total_courses || 0, icon: BookOpenIcon, color: 'bg-blue-500' },
    { title: 'Students', value: stats?.total_students || 0, icon: UsersIcon, color: 'bg-green-500' },
    { title: 'Lessons', value: stats?.total_lessons || 0, icon: ClipboardDocumentListIcon, color: 'bg-purple-500' },
    { title: 'Assignments', value: stats?.total_assignments || 0, icon: PencilSquareIcon, color: 'bg-yellow-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teacher Dashboard</h1>
        <p className="text-sm text-gray-600">Welcome back, {stats?.teacher_name || 'Teacher'}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className={`${stat.color} rounded-lg p-3`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* My Courses */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">My Courses</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <div key={course.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <h4 className="font-semibold text-gray-900">{course.course_name}</h4>
                <p className="text-sm text-gray-600">{course.course_code}</p>
                <div className="mt-3 flex justify-between text-sm text-gray-500">
                  <span>👨‍🎓 {course.students_count || 0} students</span>
                  <span>📚 {course.lessons_count || 0} lessons</span>
                </div>
                <div className="mt-3 flex justify-between text-sm text-gray-500">
                  <span>📝 {course.assignments_count || 0} assignments</span>
                  <span>📋 {course.quizzes_count || 0} quizzes</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
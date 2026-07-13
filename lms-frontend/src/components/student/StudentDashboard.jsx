// src/components/student/StudentDashboard.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { BookOpenIcon, AcademicCapIcon, ChartBarIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';

const StudentDashboard = () => {
  const [stats, setStats] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [recentActivity, setRecentActivity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/student/dashboard');
      setStats(response.data.stats);
      setEnrollments(response.data.enrollments);
      setRecentActivity(response.data.recent_activity);
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
    { title: 'Average Score', value: `${stats?.average_score || 0}%`, icon: ChartBarIcon, color: 'bg-green-500' },
    { title: 'Assignments', value: stats?.total_assignments || 0, icon: ClipboardDocumentListIcon, color: 'bg-purple-500' },
    { title: 'Quizzes', value: stats?.total_quizzes || 0, icon: AcademicCapIcon, color: 'bg-yellow-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Student Dashboard</h1>
        <p className="text-sm text-gray-600">Welcome back to your learning dashboard</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Courses */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">My Courses</h3>
          </div>
          <div className="p-6">
            {enrollments.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No courses enrolled yet</p>
            ) : (
              <div className="space-y-3">
                {enrollments.map((enrollment) => (
                  <div key={enrollment.id} className="border rounded-lg p-3 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-semibold text-gray-900">{enrollment.course.course_name}</h4>
                        <p className="text-sm text-gray-600">Teacher: {enrollment.course.teacher?.full_name}</p>
                      </div>
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                        {enrollment.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700">Recent Submissions</h4>
                {recentActivity?.submissions?.length === 0 ? (
                  <p className="text-gray-500 text-sm py-2">No recent submissions</p>
                ) : (
                  recentActivity?.submissions?.slice(0, 3).map((submission) => (
                    <div key={submission.id} className="py-2 border-b border-gray-100 last:border-0">
                      <p className="text-sm text-gray-800">{submission.assignment?.title}</p>
                      <p className="text-xs text-gray-500">
                        Submitted: {new Date(submission.submitted_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-700">Recent Quiz Attempts</h4>
                {recentActivity?.quiz_attempts?.length === 0 ? (
                  <p className="text-gray-500 text-sm py-2">No recent quiz attempts</p>
                ) : (
                  recentActivity?.quiz_attempts?.slice(0, 3).map((attempt) => (
                    <div key={attempt.id} className="py-2 border-b border-gray-100 last:border-0">
                      <p className="text-sm text-gray-800">{attempt.quiz?.title}</p>
                      <p className="text-xs text-gray-500">
                        Score: {attempt.score || 'Pending'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
// src/components/student/StudentDashboard.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  BookOpenIcon,
  AcademicCapIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  ClockIcon,
  SparklesIcon,
  CheckCircleIcon,
  UserCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

const StudentDashboard = () => {
  const [stats, setStats] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [recentActivity, setRecentActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const { getFullName, user } = useAuth();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/student/dashboard');
      setStats(response.data.stats);
      setEnrollments(response.data.enrollments || []);
      setRecentActivity(response.data.recent_activity || { submissions: [], quiz_attempts: [] });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return 'អរុណសួស្តី (Good Morning)';
    if (hr < 17) return 'ទិវាសួស្តី (Good Afternoon)';
    return 'សាយ័ណ្ហសួស្តី (Good Evening)';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ArrowPathIcon className="h-10 w-10 text-blue-900 animate-spin" />
        <p className="text-sm font-medium text-gray-500 font-sans">កំពុងផ្ទុកទិន្នន័យ... (Loading dashboard...)</p>
      </div>
    );
  }

  const statCards = [
    {
      title: 'វគ្គសិក្សាសកម្ម (Active Courses)',
      value: stats?.total_courses || 0,
      icon: BookOpenIcon,
      color: 'from-blue-600 to-cyan-500',
      shadowColor: 'shadow-blue-500/10',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
      description: 'វគ្គសិក្សាកំពុងរៀន',
      link: '/student/courses'
    },
    {
      title: 'ពិន្ទុមធ្យម (Average Score)',
      value: `${Math.round(stats?.average_score || 0)}%`,
      icon: ChartBarIcon,
      color: 'from-emerald-600 to-teal-500',
      shadowColor: 'shadow-emerald-500/10',
      textColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      description: 'លទ្ធផលសិក្សាសរុប',
      link: '/student/scores'
    },
    {
      title: 'កិច្ចការផ្ទះ (Assignments)',
      value: stats?.total_assignments || 0,
      icon: ClipboardDocumentListIcon,
      color: 'from-indigo-600 to-purple-500',
      shadowColor: 'shadow-indigo-500/10',
      textColor: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      description: 'កិច្ចការត្រូវប្រគល់',
      link: '/student/assignments'
    },
    {
      title: 'កម្រងសំណួរ (Quizzes)',
      value: stats?.total_quizzes || 0,
      icon: AcademicCapIcon,
      color: 'from-amber-500 to-yellow-400',
      shadowColor: 'shadow-amber-500/10',
      textColor: 'text-amber-600',
      bgColor: 'bg-amber-50',
      description: 'ការវាយតម្លៃចំណេះដឹង',
      link: '/student/quizzes'
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10">
      
      {/* Premium Welcome Header Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 p-8 md:p-10 border border-blue-800/30 shadow-xl">
        {/* Glow elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-500/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-400/5 rounded-full blur-3xl -ml-24 -mb-24"></div>
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-bold text-yellow-400">
              <SparklesIcon className="h-4 w-4 animate-pulse" />
              <span>សាលារៀនឌីជីថល (Digital Portal)</span>
            </div>
            
            <div className="space-y-1.5">
              <span className="text-sm font-semibold text-blue-200/80 tracking-wide uppercase">
                {getGreeting()}
              </span>
              <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                សួស្តី, {getFullName() || 'សិស្ស'} 👋
              </h1>
              <p className="text-sm md:text-base text-blue-100/70 max-w-xl leading-relaxed">
                សូមស្វាគមន៍មកកាន់គណនីសិក្សារបស់អ្នក។ តាមដានវឌ្ឍនភាព មេរៀន និងកិច្ចការរបស់អ្នកនៅទីនេះ។ (Track your learning journey here.)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-blue-200/60 font-medium">
              <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                <CalendarDaysIcon className="h-4 w-4 text-yellow-400" />
                {new Date().toLocaleDateString('km-KH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
              <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                <ClockIcon className="h-4 w-4 text-yellow-400" />
                សកម្មភាពចុងក្រោយ (Live Updates)
              </span>
            </div>
          </div>

          <div className="flex gap-3 shrink-0">
            <Link
              to="/student/courses"
              className="inline-flex items-center justify-center px-6 py-3 bg-white text-blue-950 hover:bg-yellow-500 hover:text-blue-950 font-bold text-sm rounded-2xl shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              វគ្គសិក្សាទាំងអស់ (My Courses)
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Link
              key={index}
              to={stat.link}
              className={`bg-white rounded-3xl p-6 border border-gray-100 hover:border-transparent shadow-sm hover:shadow-xl ${stat.shadowColor} transition-all duration-300 group hover:-translate-y-1 relative overflow-hidden block`}
            >
              {/* Card Hover Glow effect */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gray-50 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              <div className="flex items-center justify-between relative z-10">
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{stat.title}</p>
                  <p className="text-3xl font-extrabold text-gray-900 tracking-tight">{stat.value}</p>
                </div>
                <div className={`h-12 w-12 rounded-2xl ${stat.bgColor} flex items-center justify-center border border-gray-100/50 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`h-6 w-6 ${stat.textColor}`} />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100/80 flex items-center justify-between text-xs text-gray-400 relative z-10">
                <span>{stat.description}</span>
                <span className="font-semibold text-gray-600 group-hover:text-blue-900 transition-colors">ព័ត៌មានលម្អិត &rarr;</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Content Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Active Enrollments */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">វគ្គសិក្សារបស់ខ្ញុំ (My Enrolled Courses)</h3>
                <p className="text-xs text-gray-500">ចូលរៀន និងមើលសកម្មភាពតាមមុខវិជ្ជា</p>
              </div>
              <Link 
                to="/student/courses" 
                className="text-xs font-bold text-blue-900 hover:text-yellow-600 hover:underline flex items-center gap-1.5"
              >
                មើលទាំងអស់
                <ArrowRightIcon className="h-3 w-3" />
              </Link>
            </div>

            {enrollments.length === 0 ? (
              <div className="text-center py-16 text-gray-500 space-y-3">
                <BookOpenIcon className="h-12 w-12 text-gray-300 mx-auto" />
                <h4 className="font-bold text-gray-800">មិនទាន់មានការចុះឈ្មោះចូលរៀនឡើយទេ</h4>
                <p className="text-xs text-gray-400 max-w-xs mx-auto">
                  You are not currently enrolled in any active courses. Contact administration for enrollment.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {enrollments.map((enrollment) => (
                  <Link
                    key={enrollment.id}
                    to={`/student/courses/${enrollment.course_id}`}
                    className="group border border-gray-100 hover:border-yellow-400/50 rounded-2xl p-5 bg-white hover:bg-gray-50/30 hover:shadow-md transition-all duration-300 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-600 bg-yellow-400/10 px-2.5 py-1 rounded-lg border border-yellow-400/20">
                          {enrollment.course?.course_code}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          enrollment.status === 'active' 
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {enrollment.status === 'active' ? 'កំពុងសិក្សា' : enrollment.status}
                        </span>
                      </div>
                      
                      <div className="space-y-1">
                        <h4 className="font-bold text-gray-900 text-sm group-hover:text-blue-900 transition-colors line-clamp-1">
                          {enrollment.course?.course_name}
                        </h4>
                        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
                          {enrollment.course?.description || 'គ្មានការពិពណ៌នា'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 pt-3.5 border-t border-gray-100/80 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-gray-500 font-medium">
                        <UserCircleIcon className="h-4 w-4 text-blue-900/60" />
                        <span className="truncate max-w-[120px]" title={enrollment.course?.teacher?.name}>
                          {enrollment.course?.teacher?.name || 'គ្រូបង្រៀន'}
                        </span>
                      </div>
                      <span className="font-bold text-blue-900 group-hover:text-yellow-600 transition-colors flex items-center gap-0.5">
                        ចូលរៀន &rarr;
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Recent Activity Feed */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900">សកម្មភាពចុងក្រោយ (Recent Activity)</h3>
              <p className="text-xs text-gray-500">ប្រវត្តិប្រគល់កិច្ចការ និងកម្រងសំណួររបស់អ្នក</p>
            </div>

            <div className="space-y-6">
              
              {/* Recent Submissions */}
              <div className="space-y-3.5">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5">
                  ការផ្ញើកិច្ចការ (Submissions)
                </h4>
                {recentActivity?.submissions?.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">មិនទាន់មានការប្រគល់កិច្ចការឡើយទេ</p>
                ) : (
                  <div className="space-y-3">
                    {recentActivity?.submissions?.slice(0, 3).map((submission) => (
                      <div key={submission.id} className="flex gap-3 items-start group">
                        <div className="mt-0.5 h-7 w-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                          <CheckCircleIcon className="h-4 w-4" />
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate group-hover:text-blue-900 transition-colors" title={submission.assignment?.title}>
                            {submission.assignment?.title}
                          </p>
                          <p className="text-[10px] text-gray-400 font-semibold flex items-center gap-1">
                            <ClockIcon className="h-3 w-3" />
                            <span>ប្រគល់នៅ: {new Date(submission.submitted_at).toLocaleDateString()}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Quiz Attempts */}
              <div className="space-y-3.5">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5">
                  លទ្ធផលសំណួរ (Quiz Attempts)
                </h4>
                {recentActivity?.quiz_attempts?.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">មិនទាន់មានការធ្វើកម្រងសំណួរឡើយទេ</p>
                ) : (
                  <div className="space-y-3">
                    {recentActivity?.quiz_attempts?.slice(0, 3).map((attempt) => (
                      <div key={attempt.id} className="flex gap-3 items-start group">
                        <div className="mt-0.5 h-7 w-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                          <AcademicCapIcon className="h-4 w-4" />
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate group-hover:text-blue-900 transition-colors" title={attempt.quiz?.title}>
                            {attempt.quiz?.title}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                              ពិន្ទុ: {attempt.score || 0}%
                            </span>
                            <span className="text-[10px] text-gray-400 font-semibold">
                              {new Date(attempt.submitted_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
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
// src/components/teacher/TeacherDashboard.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { 
  BookOpenIcon, 
  UsersIcon, 
  ClipboardDocumentCheckIcon,
  ClockIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  SparklesIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  FolderOpenIcon,
  PlusIcon
} from '@heroicons/react/24/outline';

export default function TeacherDashboard() {
  const { t, language } = useLanguage();
  const [stats, setStats] = useState(null);
  const [courses, setCourses] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { getFullName, user } = useAuth();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/teacher/dashboard');
      setStats(response.data.stats || {});
      setCourses(Array.isArray(response.data.courses) ? response.data.courses : []);
      setRecentActivities(Array.isArray(response.data.recent_activities) ? response.data.recent_activities : []);
    } catch (err) {
      console.error('Error fetching teacher dashboard data:', err);
      setError(t('មិនអាចទាញយកទិន្នន័យផ្ទាំងគ្រប់គ្រងបានទេ', 'Failed to load dashboard data'));
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return t('អរុណសួស្តី', 'Good Morning');
    if (hr < 17) return t('ទិវាសួស្តី', 'Good Afternoon');
    return t('សាយ័ណ្ហសួស្តី', 'Good Evening');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh] gap-4">
        <ArrowPathIcon className="h-10 w-10 text-blue-600 animate-spin" />
        <p className="text-sm font-medium text-gray-500 font-sans">{t('កំពុងផ្ទុកទិន្នន័យ...', 'Loading dashboard...')}</p>
      </div>
    );
  }

  const statCards = [
    {
      title: t('ចំនួនសិស្សសរុប', 'Total Students'),
      value: stats?.total_students || 0,
      icon: UsersIcon,
      color: 'from-blue-600 to-indigo-600',
      shadowColor: 'shadow-blue-500/10',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
      subtitle: `${t('វត្តមានថ្ងៃនេះ', "Today's Attendance")}: ${stats?.present_today || 0}`,
      link: '/teacher/students'
    },
    {
      title: t('មុខវិជ្ជារបស់ខ្ញុំ', 'My Courses'),
      value: stats?.total_courses || 0,
      icon: BookOpenIcon,
      color: 'from-emerald-600 to-teal-600',
      shadowColor: 'shadow-emerald-500/10',
      textColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      subtitle: `${t('មេរៀនសរុប', 'Total Lessons')}: ${stats?.total_lessons || 0}`,
      link: '/teacher/courses'
    },
    {
      title: t('កិច្ចការរង់ចាំកែ', 'Pending Grading'),
      value: stats?.pending_assignments || 0,
      icon: ClipboardDocumentCheckIcon,
      color: 'from-amber-500 to-yellow-500',
      shadowColor: 'shadow-amber-500/10',
      textColor: 'text-amber-600',
      bgColor: 'bg-amber-50',
      subtitle: `${t('កិច្ចការសរុប', 'Total Assignments')}: ${stats?.total_assignments || 0}`,
      link: '/teacher/assignments'
    },
    {
      title: t('កម្រងសំណួរ', 'Total Quizzes'),
      value: stats?.total_quizzes || 0,
      icon: AcademicCapIcon,
      color: 'from-purple-600 to-indigo-600',
      shadowColor: 'shadow-purple-500/10',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
      subtitle: t('ការប្រឡង & តេស្ត', 'Exams & Quizzes'),
      link: '/teacher/quizzes'
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10">
      
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 p-8 md:p-10 border border-blue-800/30 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -ml-24 -mb-24"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-bold text-yellow-400">
              <SparklesIcon className="h-4 w-4 animate-pulse" />
              <span>{t('ផ្ទាំងគ្រប់គ្រងការបង្រៀន', 'Teacher Portal')}</span>
            </div>
            
            <div className="space-y-1.5">
              <span className="text-sm font-semibold text-blue-200/80 tracking-wide uppercase">
                {getGreeting()}
              </span>
              <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                {t('ស្វាគមន៍មកកាន់', 'Welcome,')} <span className="text-blue-400">{getFullName() || user?.name || t('លោកគ្រូ/អ្នកគ្រូ', 'Teacher')}</span> 👋
              </h1>
              <p className="text-sm md:text-base text-blue-100/70 max-w-xl leading-relaxed">
                {t('នេះជាទិដ្ឋភាពទូទៅនៃការបង្រៀន មុខវិជ្ជា និងសកម្មភាពសិស្សរបស់អ្នក។', 'Overview of your teaching portal, courses, and student activities.')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-blue-200/60 font-medium">
              <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                <CalendarDaysIcon className="h-4 w-4 text-yellow-400" />
                {new Date().toLocaleDateString(language === 'km' ? 'km-KH' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
              <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                <ClockIcon className="h-4 w-4 text-yellow-400" />
                {t('ទិន្នន័យទាន់សម័យ', 'Live Updates')}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              to="/teacher/courses"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-2xl shadow-lg transition-all duration-300 transform hover:-translate-y-0.5"
            >
              <BookOpenIcon className="w-5 h-5" />
              {t('គ្រប់គ្រងមុខវិជ្ជា', 'Manage Courses')}
            </Link>
            <Link
              to="/teacher/assignments"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-sm rounded-2xl backdrop-blur-md border border-white/10 transition-all duration-300"
            >
              <ClipboardDocumentCheckIcon className="w-5 h-5" />
              {t('កែកិច្ចការ', 'Grade Assignments')}
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

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
                <span>{stat.subtitle}</span>
                <span className="font-semibold text-gray-600 group-hover:text-blue-600 transition-colors">{t('មើលបន្ថែម', 'View More')} &rarr;</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Grid Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left: Courses List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t('មុខវិជ្ជាកំពុងបង្រៀន', 'Active Teaching Courses')}</h2>
                <p className="text-xs text-gray-500">{t('បញ្ជីមុខវិជ្ជា និងចំនួនសិស្សដែលបានចុះឈ្មោះរៀន', 'List of courses and enrolled student counts')}</p>
              </div>
              <Link
                to="/teacher/courses"
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-colors"
              >
                {t('មើលទាំងអស់', 'View All')}
                <ChevronRightIcon className="w-4 h-4" />
              </Link>
            </div>

            {courses.length === 0 ? (
              <div className="p-12 text-center">
                <FolderOpenIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium text-sm">{t('មិនទាន់មានមុខវិជ្ជាបង្រៀននៅឡើយទេ', 'No courses found')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/70 border-b border-gray-100 text-xs text-gray-500 font-semibold uppercase tracking-wider">
                      <th className="px-6 py-3.5">{t('កូដ', 'Code')}</th>
                      <th className="px-6 py-3.5">{t('ឈ្មោះមុខវិជ្ជា', 'Course Name')}</th>
                      <th className="px-6 py-3.5">{t('ដេប៉ាតឺម៉ង់', 'Department')}</th>
                      <th className="px-6 py-3.5 text-center">{t('សិស្ស', 'Students')}</th>
                      <th className="px-6 py-3.5 text-center">{t('មេរៀន', 'Lessons')}</th>
                      <th className="px-6 py-3.5 text-right">{t('សកម្មភាព', 'Action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {courses.map((course) => (
                      <tr key={course.id} className="hover:bg-gray-50/60 transition duration-150">
                        <td className="px-6 py-4 font-mono font-semibold text-blue-600">
                          {course.course_code}
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-800">
                          {course.course_name}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                          {course.department?.department_name || course.department?.name || t('ទូទៅ', 'General')}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                            {course.students_count ?? 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-gray-600 font-medium">
                          {course.lessons_count ?? 0}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            to={`/teacher/courses`}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline"
                          >
                            {t('គ្រប់គ្រង', 'Manage')}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right: Recent Activities / Quick Actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-blue-600" />
                {t('សកម្មភាពសិស្សចុងក្រោយ', 'Recent Student Activity')}
              </h3>
            </div>

            {recentActivities.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">{t('មិនទាន់មានសកម្មភាពថ្មីៗទេ', 'No recent submissions')}</p>
            ) : (
              <div className="space-y-4">
                {recentActivities.map((act) => (
                  <div key={act.id} className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 hover:bg-blue-50/50 transition-colors">
                    <div className="p-2 rounded-xl bg-blue-100 text-blue-600 shrink-0 mt-0.5">
                      <DocumentTextIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-gray-800 truncate">
                        {act.student_name}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {t('បានប្រគល់:', 'Submitted:')} <span className="font-semibold text-gray-700">{act.assignment_title}</span>
                      </p>
                      {act.submitted_at && (
                        <span className="text-[10px] text-gray-400 block mt-1">
                          {act.submitted_at}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links Card */}
          <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-3xl p-6 text-white shadow-md space-y-4">
            <h3 className="text-base font-bold flex items-center gap-2 text-yellow-400">
              <SparklesIcon className="w-5 h-5" />
              {t('ផ្លូវកាត់រហ័ស', 'Quick Actions')}
            </h3>
            <div className="grid grid-cols-1 gap-2.5 text-xs font-semibold">
              <Link 
                to="/teacher/assignments" 
                className="flex items-center justify-between p-3 rounded-xl bg-white/10 hover:bg-white/20 transition backdrop-blur-sm"
              >
                <span>{t('កែ និងដាក់ពិន្ទុកិច្ចការ', 'Grade Submissions')}</span>
                <ChevronRightIcon className="w-4 h-4" />
              </Link>
              <Link 
                to="/teacher/quizzes" 
                className="flex items-center justify-between p-3 rounded-xl bg-white/10 hover:bg-white/20 transition backdrop-blur-sm"
              >
                <span>{t('បង្កើតកម្រងសំណួរ', 'Create Quiz')}</span>
                <ChevronRightIcon className="w-4 h-4" />
              </Link>
              <Link 
                to="/teacher/students" 
                className="flex items-center justify-between p-3 rounded-xl bg-white/10 hover:bg-white/20 transition backdrop-blur-sm"
              >
                <span>{t('មើលបញ្ជីសិស្សតាមដាន', 'View Student Roster')}</span>
                <ChevronRightIcon className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
// src/components/admin/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { 
  UsersIcon, 
  BookOpenIcon, 
  AcademicCapIcon,
  UserGroupIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
  SparklesIcon,
  BuildingLibraryIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const AdminDashboard = () => {
  const { t, language } = useLanguage();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentUsers, setRecentUsers] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, usersRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users?per_page=5'),
      ]);
      setStats(statsRes.data);
      setRecentUsers(usersRes.data.data || []);
    } catch (err) {
      console.error('Error fetching admin dashboard data:', err);
      setError(t('មិនអាចទាញយកទិន្នន័យបានទេ', 'Cannot fetch dashboard data'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh] gap-4">
        <ArrowPathIcon className="h-10 w-10 text-emerald-600 animate-spin" />
        <p className="text-sm font-medium text-gray-500 font-sans">{t('កំពុងផ្ទុកទិន្នន័យ...', 'Loading admin portal...')}</p>
      </div>
    );
  }

  const statCards = [
    { 
      title: t('អ្នកប្រើប្រាស់សរុប', 'Total Users'), 
      value: stats?.total_users || 0, 
      icon: UsersIcon, 
      color: 'from-blue-600 to-indigo-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      trend: '+12%',
      trendUp: true,
      link: '/admin/users'
    },
    { 
      title: t('សិស្សសរុប', 'Total Students'), 
      value: stats?.total_students || 0, 
      icon: UserGroupIcon, 
      color: 'from-emerald-600 to-teal-600',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-600',
      trend: '+8%',
      trendUp: true,
      link: '/admin/students'
    },
    { 
      title: t('គ្រូបង្រៀន', 'Teachers'), 
      value: stats?.total_teachers || 0, 
      icon: AcademicCapIcon, 
      color: 'from-amber-500 to-yellow-500',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-600',
      trend: '+5%',
      trendUp: true,
      link: '/admin/teachers'
    },
    { 
      title: t('មុខវិជ្ជា', 'Courses'), 
      value: stats?.total_courses || 0, 
      icon: BookOpenIcon, 
      color: 'from-purple-600 to-indigo-600',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600',
      trend: '+15%',
      trendUp: true,
      link: '/admin/courses'
    },
    { 
      title: t('ដេប៉ាតឺម៉ង់', 'Departments'), 
      value: stats?.total_departments || 0, 
      icon: BuildingLibraryIcon, 
      color: 'from-cyan-600 to-blue-600',
      bgColor: 'bg-cyan-50',
      textColor: 'text-cyan-600',
      trend: '0%',
      trendUp: true,
      link: '/admin/departments'
    },
  ];

  const chartData = [
    { month: t('មករា', 'Jan'), users: 65, courses: 28 },
    { month: t('កុម្ភៈ', 'Feb'), users: 78, courses: 32 },
    { month: t('មីនា', 'Mar'), users: 90, courses: 35 },
    { month: t('មេសា', 'Apr'), users: 95, courses: 38 },
    { month: t('ឧសភា', 'May'), users: 110, courses: 42 },
    { month: t('មិថុនា', 'Jun'), users: 120, courses: 45 },
  ];

  const recentActivities = [
    { id: 1, user: 'សុខ សុភាព', action: t('បានចុះឈ្មោះចូលរៀន', 'Enrolled in a course'), time: t('2 ម៉ោងមុន', '2 hours ago'), type: 'enrollment' },
    { id: 2, user: 'លី សុខា', action: t('បានកែសម្រួលព័ត៌មានមុខវិជ្ជា', 'Updated course info'), time: t('3 ម៉ោងមុន', '3 hours ago'), type: 'course' },
    { id: 3, user: 'ផល សុភាព', action: t('បានបង្កើតដេប៉ាតឺម៉ង់ថ្មី', 'Created new department'), time: t('5 ម៉ោងមុន', '5 hours ago'), type: 'department' },
  ];

  const getRoleBadgeName = (roleName) => {
    if (language === 'km') {
      switch(roleName) {
        case 'Admin': return 'អ្នកគ្រប់គ្រង';
        case 'Teacher': return 'គ្រូបង្រៀន';
        case 'Student': return 'សិស្ស';
        default: return roleName || 'អ្នកប្រើប្រាស់';
      }
    }
    return roleName || 'User';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10">
      
      {/* Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-950 p-8 md:p-10 border border-emerald-800/30 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl -ml-24 -mb-24"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-bold text-yellow-400">
              <ShieldCheckIcon className="h-4 w-4 animate-pulse text-emerald-400" />
              <span>{t('ប្រព័ន្ធគ្រប់គ្រងជាន់ខ្ពស់', 'System Control Center')}</span>
            </div>
            
            <div className="space-y-1.5">
              <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                {t('ផ្ទាំងគ្រប់គ្រងប្រព័ន្ធ', 'System Dashboard')} <span className="text-emerald-400">Administrator</span> ⚙️
              </h1>
              <p className="text-sm md:text-base text-teal-100/70 max-w-xl leading-relaxed">
                {t('គ្រប់គ្រងអ្នកប្រើប្រាស់ គ្រូបង្រៀន សិស្ស មុខវិជ្ជា និងទិន្នន័យស្ថិតិសាលាទាំងមូល។', 'Manage users, teachers, students, courses, and institution-wide analytics.')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-teal-200/60 font-medium">
              <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                <ClockIcon className="h-4 w-4 text-yellow-400" />
                {new Date().toLocaleDateString(language === 'km' ? 'km-KH' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              to="/admin/reports"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-2xl shadow-lg transition-all duration-300 transform hover:-translate-y-0.5"
            >
              <ChartBarIcon className="w-5 h-5" />
              {t('របាយការណ៍សរុប', 'Overall Reports')}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Link 
              key={index}
              to={stat.link || '#'} 
              className="bg-white rounded-3xl p-6 border border-gray-100 hover:border-transparent shadow-sm hover:shadow-xl transition-all duration-300 group hover:-translate-y-1 relative overflow-hidden block"
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
                <span className="flex items-center gap-1 text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                  <ArrowTrendingUpIcon className="w-3.5 h-3.5" />
                  {stat.trend}
                </span>
                <span className="font-semibold text-gray-600 group-hover:text-emerald-600 transition-colors">{t('គ្រប់គ្រង', 'Manage')} &rarr;</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">{t('កំណើនអ្នកប្រើប្រាស់', 'User Growth')}</h3>
              <p className="text-xs text-gray-500">{t('ស្ថិតិប្រៀបធៀបក្នុងរយៈពេល ៦ ខែចុងក្រោយ', 'Comparison statistics over the last 6 months')}</p>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">{t('៦ ខែ', '6 Months')}</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#ffffff', 
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                }}
              />
              <Line 
                type="monotone" 
                dataKey="users" 
                stroke="#059669" 
                strokeWidth={3}
                dot={{ fill: '#059669', strokeWidth: 2, r: 5 }}
                activeDot={{ r: 8 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">{t('សកម្មភាពមុខវិជ្ជា', 'Course Activity')}</h3>
              <p className="text-xs text-gray-500">{t('ការកើនឡើងនៃមុខវិជ្ជាបង្រៀនតាមខែ', 'Increase in teaching courses by month')}</p>
            </div>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">{t('៦ ខែ', '6 Months')}</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#ffffff', 
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                }}
              />
              <Bar dataKey="courses" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grid Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Recent Users Table */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('អ្នកប្រើប្រាស់ថ្មីៗ', 'Recent Users')}</h3>
              <p className="text-xs text-gray-500">{t('បញ្ជីអ្នកប្រើប្រាស់ដែលបានចុះឈ្មោះក្នុងប្រព័ន្ធ', 'List of users recently registered in the system')}</p>
            </div>
            <Link to="/admin/students" className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-xl">
              {t('មើលទាំងអស់', 'View All')}
              <ChevronRightIcon className="w-4 h-4" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-100 text-xs text-gray-500 font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">{t('ឈ្មោះ', 'Name')}</th>
                  <th className="px-6 py-3.5">{t('អ៊ីមែល', 'Email')}</th>
                  <th className="px-6 py-3.5">{t('តួនាទី', 'Role')}</th>
                  <th className="px-6 py-3.5 text-center">{t('ស្ថានភាព', 'Status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {recentUsers.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-10 text-center text-gray-400">
                      {t('មិនទាន់មានអ្នកប្រើប្រាស់ទេ', 'No users found')}
                    </td>
                  </tr>
                ) : (
                  recentUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50/60 transition">
                      <td className="px-6 py-4 font-bold text-gray-800 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0">
                          {(u.first_name?.[0] || u.name?.[0] || 'U').toUpperCase()}
                        </div>
                        <span>{u.first_name || u.name} {u.last_name || ''}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600 font-mono">
                        {u.email}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                          u.role?.role_name === 'Admin' 
                            ? 'bg-red-50 text-red-700 border border-red-200' 
                            : u.role?.role_name === 'Teacher'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {getRoleBadgeName(u.role?.role_name)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                          u.status === 'active' 
                            ? 'bg-emerald-50 text-emerald-700' 
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {u.status === 'active' ? t('សកម្ម', 'Active') : t('អសកម្ម', 'Inactive')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Activity Column */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
              <ClockIcon className="w-5 h-5 text-emerald-600" />
              {t('សកម្មភាពថ្មីៗក្នុងប្រព័ន្ធ', 'Recent System Activities')}
            </h3>
            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 hover:bg-emerald-50/50 transition-colors">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-800">
                      {activity.user}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {activity.action}
                    </p>
                    <span className="text-[10px] text-gray-400 block mt-1">
                      {activity.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

export default AdminDashboard;
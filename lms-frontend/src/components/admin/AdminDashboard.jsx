// src/components/admin/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { 
  UsersIcon, 
  BookOpenIcon, 
  AcademicCapIcon,
  UserGroupIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  UserPlusIcon,
  ClockIcon,
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentUsers, setRecentUsers] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users?per_page=5'),
      ]);
      setStats(statsRes.data);
      setRecentUsers(usersRes.data.data || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // if (loading) {
  //   return (
  //     <div className="flex items-center justify-center min-h-100">
  //       <div className="text-center">
  //         <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto"></div>
  //         <p className="mt-4 text-gray-600 font-medium">កំពុងផ្ទុកទិន្នន័យ...</p>
  //       </div>
  //     </div>
  //   );
  // }

  const statCards = [
    { 
      title: 'អ្នកប្រើប្រាស់សរុប', 
      value: stats?.total_users || 0, 
      icon: UsersIcon, 
      color: 'from-primary-500 to-primary-700',
      bgColor: 'bg-primary-50',
      textColor: 'text-primary-600',
      trend: '+12%',
      trendUp: true,
    },
    { 
      title: 'សិស្ស', 
      value: stats?.total_students || 0, 
      icon: UserGroupIcon, 
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50',
      textColor: 'text-green-600',
      trend: '+8%',
      trendUp: true,
    },
    { 
      title: 'គ្រូបង្រៀន', 
      value: stats?.total_teachers || 0, 
      icon: AcademicCapIcon, 
      color: 'from-accent-500 to-accent-600',
      bgColor: 'bg-accent-50',
      textColor: 'text-accent-600',
      trend: '+5%',
      trendUp: true,
    },
    { 
      title: 'មុខវិជ្ជា', 
      value: stats?.total_courses || 0, 
      icon: BookOpenIcon, 
      color: 'from-primary-300 to-primary-500',
      bgColor: 'bg-primary-50',
      textColor: 'text-primary-500',
      trend: '+15%',
      trendUp: true,
    },
    { 
      title: 'ជំនាញ', 
      value: stats?.total_departments || 0, 
      icon: ChartBarIcon, 
      color: 'from-gray-400 to-gray-600',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-600',
      trend: '0%',
      trendUp: false,
    },
  ];

  // Sample chart data - replace with real data
  const chartData = [
    { month: 'មករា', users: 65, courses: 28 },
    { month: 'កុម្ភៈ', users: 78, courses: 32 },
    { month: 'មីនា', users: 90, courses: 35 },
    { month: 'មេសា', users: 95, courses: 38 },
    { month: 'ឧសភា', users: 110, courses: 42 },
    { month: 'មិថុនា', users: 120, courses: 45 },
  ];

  const pieData = [
    { name: 'សិស្ស', value: stats?.total_students || 0 },
    { name: 'គ្រូបង្រៀន', value: stats?.total_teachers || 0 },
    { name: 'អ្នកគ្រប់គ្រង', value: stats?.total_users - (stats?.total_students || 0) - (stats?.total_teachers || 0) || 0 },
  ];

  const COLORS = ['#22916E', '#C08526', '#1D6C5B'];

  const recentActivities = [
    { id: 1, user: 'សុខ សុភាព', action: 'បានចុះឈ្មោះចូលរៀន', time: '2 ម៉ោងមុន', type: 'enrollment' },
    { id: 2, user: 'លី សុខា', action: 'បានដាក់ពិន្ទុ', time: '3 ម៉ោងមុន', type: 'grade' },
    { id: 3, user: 'ផល សុភាព', action: 'បានបង្កើតមុខវិជ្ជាថ្មី', time: '5 ម៉ោងមុន', type: 'course' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="bg-primary-100 text-primary-600 p-2 rounded-lg">
              <ChartBarIcon className="h-6 w-6" />
            </span>
            ផ្ទាំងគ្រប់គ្រង
          </h1>
          <p className="text-sm text-gray-600 mt-1">ស្វាគមន៍ត្រឡប់មកវិញ, អ្នកគ្រប់គ្រងប្រព័ន្ធ</p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-3">
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            <ClockIcon className="h-4 w-4 inline mr-1" />
            {new Date().toLocaleDateString('km-KH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>

     {/* ============================================== */}
      {/* STATS GRID - ចាប់យកចំនួនគ្រូដោយស្វ័យប្រវត្តិ */}
      {/* ============================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div 
              key={index} 
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group hover:-translate-y-1"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`${stat.bgColor} rounded-xl p-3 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className={`h-6 w-6 ${stat.textColor}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-full ${
                  stat.trendUp ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
                }`}>
                  {stat.trendUp ? (
                    <ArrowTrendingUpIcon className="h-4 w-4" />
                  ) : (
                    <ArrowTrendingDownIcon className="h-4 w-4" />
                  )}
                  {stat.trend}
                </div>
              </div>
              <div className="mt-4 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full bg-linear-to-r ${stat.color} rounded-full transition-all duration-1000`}
                  style={{ width: `${Math.min((stat.value / 200) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">កំណើនអ្នកប្រើប្រាស់</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">៦ ខែចុងក្រោយ</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="users" 
                stroke="#1D6C5B" 
                strokeWidth={2}
                dot={{ fill: '#1D6C5B', strokeWidth: 2 }}
                activeDot={{ r: 8 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">សកម្មភាពមុខវិជ្ជា</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">៦ ខែចុងក្រោយ</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
              />
              <Legend />
              <Bar dataKey="courses" fill="#C08526" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Users */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">អ្នកប្រើប្រាស់ថ្មីៗ</h3>
            <button className="text-sm text-primary-600 hover:text-primary-800 font-medium">
              មើលទាំងអស់ →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ឈ្មោះ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    អ៊ីមែល
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    តួនាទី
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ស្ថានភាព
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {recentUsers.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <UsersIcon className="h-12 w-12 text-gray-300 mb-2" />
                        <p>មិនទាន់មានអ្នកប្រើប្រាស់ទេ</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  recentUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-linear-to-r from-primary-500 to-accent-500 flex items-center justify-center text-white font-medium text-sm">
                            {user.first_name?.[0]}{user.last_name?.[0]}
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {user.first_name} {user.last_name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.role?.role_name === 'Admin' 
                            ? 'bg-red-100 text-red-800' 
                            : user.role?.role_name === 'Teacher'
                            ? 'bg-accent-100 text-accent-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {user.role?.role_name === 'Admin' ? 'អ្នកគ្រប់គ្រង' : 
                           user.role?.role_name === 'Teacher' ? 'គ្រូបង្រៀន' : 'សិស្ស'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {user.status === 'active' ? 'សកម្ម' : 'អសកម្ម'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Stats / Activity */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">សកម្មភាពថ្មីៗ</h3>
          </div>
          <div className="p-6 space-y-4">
            {recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3">
                <div className={`shrink-0 w-2 h-2 mt-2 rounded-full ${
                  activity.type === 'enrollment' ? 'bg-green-500' :
                  activity.type === 'grade' ? 'bg-accent-500' :
                  'bg-primary-500'
                }`}></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{activity.user}</span>
                    <span className="text-gray-600"> {activity.action}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                </div>
              </div>
            ))}
            {recentActivities.length === 0 && (
              <div className="text-center py-6 text-gray-500">
                <ClockIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                <p>មិនមានសកម្មភាពថ្មីទេ</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
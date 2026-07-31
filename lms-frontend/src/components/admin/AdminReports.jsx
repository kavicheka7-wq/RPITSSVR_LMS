// src/components/admin/AdminReports.jsx
import React, { useState, useEffect, useMemo } from 'react';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { toast } from 'react-toastify';
import {
  ChartBarIcon,
  UserGroupIcon,
  AcademicCapIcon,
  BookOpenIcon,
  BuildingLibraryIcon,
  ArrowDownTrayIcon,
  PrinterIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentChartBarIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import {
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
  AreaChart,
  Area,
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];

const AdminReports = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('overview'); // overview | enrollments | attendance | academic
  const [loading, setLoading] = useState(true);

  // Filter states
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Report Data states
  const [overviewData, setOverviewData] = useState(null);
  const [enrollmentData, setEnrollmentData] = useState({ summary: {}, data: [] });
  const [attendanceData, setAttendanceData] = useState({ summary: {}, course_breakdown: [] });
  const [academicData, setAcademicData] = useState({ summary: {}, data: [] });

  // Initial loading of departments and courses for dropdowns
  useEffect(() => {
    fetchMetadata();
  }, []);

  // Fetch report data when active tab or filters change
  useEffect(() => {
    fetchReportData();
  }, [activeTab, selectedDept, selectedCourse, selectedStatus, dateFrom, dateTo]);

  const fetchMetadata = async () => {
    try {
      const [deptRes, courseRes] = await Promise.all([
        api.get('/admin/departments').catch(() => ({ data: [] })),
        api.get('/admin/courses').catch(() => ({ data: [] })),
      ]);
      setDepartments(deptRes.data.data || deptRes.data || []);
      setCourses(courseRes.data.data || courseRes.data || []);
    } catch (err) {
      console.error('Error fetching metadata:', err);
    }
  };

  const fetchReportData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'overview') {
        const res = await api.get('/admin/reports/overview');
        setOverviewData(res.data);
      } else if (activeTab === 'enrollments') {
        const params = {
          department_id: selectedDept,
          course_id: selectedCourse,
          status: selectedStatus,
          search: searchQuery,
          per_page: 50,
        };
        const res = await api.get('/admin/reports/enrollments', { params });
        setEnrollmentData(res.data);
      } else if (activeTab === 'attendance') {
        const params = {
          department_id: selectedDept,
          course_id: selectedCourse,
          date_from: dateFrom,
          date_to: dateTo,
        };
        const res = await api.get('/admin/reports/attendance', { params });
        setAttendanceData(res.data);
      } else if (activeTab === 'academic') {
        const params = {
          department_id: selectedDept,
          course_id: selectedCourse,
          search: searchQuery,
        };
        const res = await api.get('/admin/reports/academic', { params });
        setAcademicData(res.data);
      }
    } catch (err) {
      console.error('Failed to load report data:', err);
      toast.error(t('មិនអាចទាញយកទិន្នន័យរបាយការណ៍បានទេ', 'Failed to load report data'));
    } finally {
      setLoading(false);
    }
  };

  // CSV Export Helper
  const exportToCSV = () => {
    let csvRows = [];
    let filename = `lms_report_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`;

    if (activeTab === 'enrollments') {
      csvRows.push(['ID', 'Student Code', 'Student Name', 'Email', 'Course', 'Department', 'Status', 'Enrolled Date']);
      const rows = enrollmentData.data || [];
      rows.forEach((r) => {
        csvRows.push([
          r.id,
          `"${r.student_code || ''}"`,
          `"${r.student_name || ''}"`,
          `"${r.email || ''}"`,
          `"${r.course_name || ''}"`,
          `"${r.department_name || ''}"`,
          r.status,
          r.enrolled_date,
        ]);
      });
    } else if (activeTab === 'attendance') {
      csvRows.push(['Course Code', 'Course Name', 'Department', 'Total Records', 'Present', 'Absent', 'Late', 'Permission', 'Attendance Rate (%)']);
      const rows = attendanceData.course_breakdown || [];
      rows.forEach((r) => {
        csvRows.push([
          `"${r.course_code || ''}"`,
          `"${r.course_name || ''}"`,
          `"${r.department_name || ''}"`,
          r.total,
          r.present,
          r.absent,
          r.late,
          r.permission,
          `${r.rate}%`,
        ]);
      });
    } else if (activeTab === 'academic') {
      csvRows.push(['Student Code', 'Student Name', 'Course Code', 'Course Name', 'Department', 'Assignment Score', 'Quiz Score', 'Final Score', 'Grade Letter']);
      const rows = academicData.data || [];
      rows.forEach((r) => {
        csvRows.push([
          `"${r.student_code || ''}"`,
          `"${r.student_name || ''}"`,
          `"${r.course_code || ''}"`,
          `"${r.course_name || ''}"`,
          `"${r.department_name || ''}"`,
          r.assignment_score,
          r.quiz_score,
          r.final_score,
          r.grade_letter,
        ]);
      });
    } else {
      // Overview export
      csvRows.push(['Department Code', 'Department Name', 'Students Count', 'Teachers Count', 'Courses Count']);
      const rows = overviewData?.department_distribution || [];
      rows.forEach((r) => {
        csvRows.push([
          `"${r.department_code || ''}"`,
          `"${r.department_name || ''}"`,
          r.students_count,
          r.teachers_count,
          r.courses_count,
        ]);
      });
    }

    if (csvRows.length <= 1) {
      toast.warning(t('គ្មានទិន្នន័យសម្រាប់ទាញយកទេ', 'No report data to export'));
      return;
    }

    // Add UTF-8 BOM so Excel opens Khmer characters correctly
    const csvContent = '\uFEFF' + csvRows.map((e) => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(t('ទាញយក CSV បានជោគជ័យ', 'CSV report downloaded successfully'));
  };

  const handlePrint = () => {
    window.print();
  };

  // Grade Distribution chart array formatting
  const gradeChartData = useMemo(() => {
    if (!academicData?.summary?.grade_distribution) return [];
    const dist = academicData.summary.grade_distribution;
    return [
      { name: 'Grade A', count: dist.A || 0, color: '#10B981' },
      { name: 'Grade B', count: dist.B || 0, color: '#3B82F6' },
      { name: 'Grade C', count: dist.C || 0, color: '#F59E0B' },
      { name: 'Grade D', count: dist.D || 0, color: '#8B5CF6' },
      { name: 'Grade F', count: dist.F || 0, color: '#EF4444' },
    ];
  }, [academicData]);

  return (
    <div className="space-y-6 print:p-0">
      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #admin-report-container, #admin-report-container * {
            visibility: visible;
          }
          #admin-report-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div id="admin-report-container" className="space-y-6">
        {/* Header Section */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-400/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-yellow-400/20 backdrop-blur-md rounded-xl border border-yellow-400/30">
                  <DocumentChartBarIcon className="w-8 h-8 text-yellow-400" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                    {t('របាយការណ៍ និងការវិភាគ', 'Reports & Analytics')}
                  </h1>
                  <p className="text-blue-200 text-sm mt-1">
                    {t('ពិនិត្យមើល និងទាញយករាយការណ៍សង្ខេបអំពីការសិក្សា ការចុះឈ្មោះ និងវត្តមាន', 'Overview, enrollment tracking, attendance statistics, and academic performance')}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-3 no-print">
              <button
                onClick={fetchReportData}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition backdrop-blur-md border border-white/20 shadow-sm text-sm"
              >
                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{t('ធ្វើឡើងវិញ', 'Refresh')}</span>
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition shadow-lg shadow-emerald-900/30 text-sm"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                <span>{t('ទាញយក CSV', 'Export CSV')}</span>
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-blue-950 font-bold rounded-xl transition shadow-lg shadow-yellow-500/20 text-sm"
              >
                <PrinterIcon className="w-4 h-4" />
                <span>{t('បោះពុម្ព', 'Print Report')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 bg-white rounded-2xl p-2 shadow-sm no-print overflow-x-auto">
          {[
            { id: 'overview', name: t('របាយការណ៍ និងការវិភាគ', 'Reports & Analytics'), icon: ChartBarIcon },
            { id: 'enrollments', name: t('របាយការណ៍ការចុះឈ្មោះ', 'Enrollment Report'), icon: UserGroupIcon },
            { id: 'academic', name: t('របាយការណ៍ពិន្ទុ', 'Grade Report'), icon: AcademicCapIcon },
            { id: 'attendance', name: t('របាយការណ៍វត្តមាន', 'Attendance Report'), icon: CheckCircleIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-5 py-3 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-900 text-yellow-400 shadow-md font-semibold'
                    : 'text-gray-600 hover:text-blue-900 hover:bg-blue-50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-yellow-400' : 'text-gray-400'}`} />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Filters Bar (Hidden in Overview Tab) */}
        {activeTab !== 'overview' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 no-print space-y-4">
            <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm">
              <FunnelIcon className="w-4 h-4 text-blue-900" />
              <span>{t('តម្រងទិន្នន័យ', 'Filter Reports')}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Department Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {t('ដេប៉ាតឺម៉ង់', 'Department')}
                </label>
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t('-- ទាំងអស់ --', '-- All Departments --')}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.department_name} ({d.department_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Course Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {t('មុខវិជ្ជា', 'Course')}
                </label>
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t('-- ទាំងអស់ --', '-- All Courses --')}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.course_name} ({c.course_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tab-Specific Filters */}
              {activeTab === 'enrollments' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {t('ស្ថានភាព', 'Status')}
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">{t('-- គ្រប់ស្ថានភាព --', '-- All Statuses --')}</option>
                    <option value="active">{t('កំពុងសិក្សា', 'Active')}</option>
                    <option value="completed">{t('បានបញ្ចប់', 'Completed')}</option>
                    <option value="dropped">{t('បោះបង់', 'Dropped')}</option>
                  </select>
                </div>
              )}

              {activeTab === 'attendance' && (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      {t('ចាប់ពីថ្ងៃ', 'From Date')}
                    </label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      {t('ដល់ថ្ងៃ', 'To Date')}
                    </label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Search Bar */}
              {(activeTab === 'enrollments' || activeTab === 'academic') && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {t('ស្វែងរក', 'Search Keyword')}
                  </label>
                  <div className="relative">
                    <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder={t('ឈ្មោះ ឬលេខកូដ...', 'Name or Code...')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchReportData()}
                      className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content Container */}
        {loading ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-900 border-t-transparent mb-4"></div>
            <p className="text-gray-500 text-sm font-medium">
              {t('កំពុងដំណើរការទាញយកទិន្នន័យ...', 'Fetching report data...')}
            </p>
          </div>
        ) : (
          <>
            {/* ======================================================== */}
            {/* TAB 1: SYSTEM OVERVIEW                                   */}
            {/* ======================================================== */}
            {activeTab === 'overview' && overviewData && (
              <div className="space-y-6">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition">
                      <UserGroupIcon className="w-16 h-16 text-blue-900" />
                    </div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('សិស្សសរុប', 'Total Students')}
                    </p>
                    <h3 className="text-2xl font-black text-blue-950 mt-1">
                      {overviewData.stats.total_students}
                    </h3>
                    <span className="inline-block mt-2 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                      {overviewData.stats.total_enrollments} {t('ការចុះឈ្មោះ', 'Enrollments')}
                    </span>
                  </div>

                  <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition">
                      <AcademicCapIcon className="w-16 h-16 text-emerald-600" />
                    </div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('គ្រូបង្រៀនសរុប', 'Total Teachers')}
                    </p>
                    <h3 className="text-2xl font-black text-emerald-950 mt-1">
                      {overviewData.stats.total_teachers}
                    </h3>
                    <span className="inline-block mt-2 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      {overviewData.stats.total_departments} {t('ដេប៉ាតឺម៉ង់', 'Departments')}
                    </span>
                  </div>

                  <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition">
                      <BookOpenIcon className="w-16 h-16 text-amber-500" />
                    </div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('មុខវិជ្ជាសរុប', 'Total Courses')}
                    </p>
                    <h3 className="text-2xl font-black text-amber-950 mt-1">
                      {overviewData.stats.total_courses}
                    </h3>
                    <span className="inline-block mt-2 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                      {overviewData.stats.total_lessons} {t('មេរៀន', 'Lessons')}
                    </span>
                  </div>

                  <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition">
                      <CheckCircleIcon className="w-16 h-16 text-indigo-600" />
                    </div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('អត្រាវត្តមានសរុប', 'Attendance Rate')}
                    </p>
                    <h3 className="text-2xl font-black text-indigo-950 mt-1">
                      {overviewData.stats.overall_attendance_rate}%
                    </h3>
                    <span className="inline-block mt-2 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                      {overviewData.stats.total_assignments} {t('កិច្ចការ', 'Assignments')}
                    </span>
                  </div>
                </div>

                {/* Visual Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Department Distribution Bar Chart */}
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <BuildingLibraryIcon className="w-5 h-5 text-blue-900" />
                      {t('ចំនួនសិស្ស និងគ្រូតាមដេប៉ាតឺម៉ង់', 'Students & Teachers by Department')}
                    </h3>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={overviewData.department_distribution}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                          <XAxis dataKey="department_code" stroke="#6B7280" fontSize={12} />
                          <YAxis stroke="#6B7280" fontSize={12} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1E293B', color: '#FFF', borderRadius: '12px' }}
                          />
                          <Legend />
                          <Bar dataKey="students_count" name={t('សិស្ស', 'Students')} fill="#3B82F6" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="teachers_count" name={t('គ្រូ', 'Teachers')} fill="#10B981" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Enrollment Trend Area Chart */}
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <UserGroupIcon className="w-5 h-5 text-indigo-600" />
                      {t('កំណើនការចុះឈ្មោះក្នុងរយៈពេល ៦ ខែ', '6-Month Enrollment Growth')}
                    </h3>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={overviewData.enrollment_trend}>
                          <defs>
                            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366F1" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                          <XAxis dataKey="month" stroke="#6B7280" fontSize={12} />
                          <YAxis stroke="#6B7280" fontSize={12} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1E293B', color: '#FFF', borderRadius: '12px' }}
                          />
                          <Area type="monotone" dataKey="count" name={t('ការចុះឈ្មោះ', 'Enrollments')} stroke="#6366F1" fillOpacity={1} fill="url(#colorCount)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Department Summary Table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="text-base font-bold text-gray-900">
                      {t('ព័ត៌មានលម្អិតតាមដេប៉ាតឺម៉ង់', 'Department Breakdown Details')}
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                        <tr>
                          <th className="px-6 py-3">{t('កូដដេប៉ាតឺម៉ង់', 'Code')}</th>
                          <th className="px-6 py-3">{t('ឈ្មោះដេប៉ាតឺម៉ង់', 'Department Name')}</th>
                          <th className="px-6 py-3 text-center">{t('ចំនួនមុខវិជ្ជា', 'Courses')}</th>
                          <th className="px-6 py-3 text-center">{t('ចំនួនសិស្ស', 'Students')}</th>
                          <th className="px-6 py-3 text-center">{t('ចំនួនគ្រូ', 'Teachers')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {overviewData.department_distribution.map((dept) => (
                          <tr key={dept.id} className="hover:bg-gray-50/80 transition">
                            <td className="px-6 py-4 font-semibold text-blue-900">{dept.department_code}</td>
                            <td className="px-6 py-4 font-medium text-gray-800">{dept.department_name}</td>
                            <td className="px-6 py-4 text-center font-bold text-amber-600">{dept.courses_count}</td>
                            <td className="px-6 py-4 text-center font-bold text-blue-600">{dept.students_count}</td>
                            <td className="px-6 py-4 text-center font-bold text-emerald-600">{dept.teachers_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* TAB 2: ENROLLMENT REPORT                                 */}
            {/* ======================================================== */}
            {activeTab === 'enrollments' && (
              <div className="space-y-6">
                {/* Status Summary Bar */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs font-medium text-gray-500">{t('ការចុះឈ្មោះសរុប', 'Total Filtered')}</p>
                    <p className="text-xl font-extrabold text-gray-900 mt-1">{enrollmentData.summary?.total || 0}</p>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                    <p className="text-xs font-medium text-emerald-700">{t('កំពុងសិក្សា (Active)', 'Active')}</p>
                    <p className="text-xl font-extrabold text-emerald-900 mt-1">{enrollmentData.summary?.active || 0}</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <p className="text-xs font-medium text-blue-700">{t('បានបញ្ចប់ (Completed)', 'Completed')}</p>
                    <p className="text-xl font-extrabold text-blue-900 mt-1">{enrollmentData.summary?.completed || 0}</p>
                  </div>
                  <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
                    <p className="text-xs font-medium text-rose-700">{t('បោះបង់ (Dropped)', 'Dropped')}</p>
                    <p className="text-xl font-extrabold text-rose-900 mt-1">{enrollmentData.summary?.dropped || 0}</p>
                  </div>
                </div>

                {/* Enrollment Data Table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                        <tr>
                          <th className="px-6 py-3.5">{t('លេខកូដសិស្ស', 'Student Code')}</th>
                          <th className="px-6 py-3.5">{t('ឈ្មោះសិស្ស', 'Student Name')}</th>
                          <th className="px-6 py-3.5">{t('មុខវិជ្ជា', 'Course')}</th>
                          <th className="px-6 py-3.5">{t('ដេប៉ាតឺម៉ង់', 'Department')}</th>
                          <th className="px-6 py-3.5">{t('ថ្ងៃចុះឈ្មោះ', 'Enrolled Date')}</th>
                          <th className="px-6 py-3.5 text-center">{t('ស្ថានភាព', 'Status')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {enrollmentData.data?.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="px-6 py-8 text-center text-gray-400">
                              {t('មិនរកឃើញទិន្នន័យចុះឈ្មោះទេ', 'No enrollment records found')}
                            </td>
                          </tr>
                        ) : (
                          enrollmentData.data.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50/80 transition">
                              <td className="px-6 py-4 font-bold text-blue-900">{item.student_code}</td>
                              <td className="px-6 py-4">
                                <div className="font-semibold text-gray-900">{item.student_name}</div>
                                <div className="text-xs text-gray-400">{item.email}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="font-medium text-gray-800">{item.course_name}</div>
                                <div className="text-xs text-gray-400">{item.course_code}</div>
                              </td>
                              <td className="px-6 py-4 text-gray-600">{item.department_name}</td>
                              <td className="px-6 py-4 text-gray-500 text-xs">{item.enrolled_date}</td>
                              <td className="px-6 py-4 text-center">
                                <span
                                  className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                    item.status === 'active'
                                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                      : item.status === 'completed'
                                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                      : 'bg-rose-100 text-rose-700 border border-rose-200'
                                  }`}
                                >
                                  {item.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* TAB 3: ATTENDANCE REPORT                                 */}
            {/* ======================================================== */}
            {activeTab === 'attendance' && (
              <div className="space-y-6">
                {/* Attendance Summary Banner */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="bg-gradient-to-br from-indigo-900 to-blue-900 p-5 rounded-2xl text-white shadow-md">
                    <p className="text-xs text-blue-200 uppercase font-semibold">{t('អត្រាវត្តមានសរុប', 'Overall Attendance')}</p>
                    <h2 className="text-3xl font-black mt-1 text-yellow-400">{attendanceData.summary?.rate || 100}%</h2>
                    <p className="text-[11px] text-blue-200 mt-2">{attendanceData.summary?.total_records || 0} {t('កំណត់ត្រាវត្តមាន', 'Records Total')}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 text-emerald-600 font-semibold text-xs">
                      <CheckCircleIcon className="w-4 h-4" />
                      <span>{t('វត្តមាន (Present)', 'Present')}</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{attendanceData.summary?.present || 0}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 text-rose-600 font-semibold text-xs">
                      <XCircleIcon className="w-4 h-4" />
                      <span>{t('អវត្តមាន (Absent)', 'Absent')}</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{attendanceData.summary?.absent || 0}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-600 font-semibold text-xs">
                      <ClockIcon className="w-4 h-4" />
                      <span>{t('មកយឺត (Late)', 'Late')}</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{attendanceData.summary?.late || 0}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs">
                      <DocumentChartBarIcon className="w-4 h-4" />
                      <span>{t('ច្បាប់ (Permission)', 'Permission')}</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{attendanceData.summary?.permission || 0}</p>
                  </div>
                </div>

                {/* Course Attendance Rates Table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="text-base font-bold text-gray-900">
                      {t('អត្រាវត្តមានតាមមុខវិជ្ជា', 'Course Attendance Breakdown')}
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                        <tr>
                          <th className="px-6 py-3.5">{t('មុខវិជ្ជា', 'Course')}</th>
                          <th className="px-6 py-3.5">{t('ដេប៉ាតឺម៉ង់', 'Department')}</th>
                          <th className="px-6 py-3.5 text-center">{t('វត្តមាន', 'Present')}</th>
                          <th className="px-6 py-3.5 text-center">{t('អវត្តមាន', 'Absent')}</th>
                          <th className="px-6 py-3.5 text-center">{t('យឺត/ច្បាប់', 'Late/Perm')}</th>
                          <th className="px-6 py-3.5">{t('អត្រាវត្តមាន (%)', 'Attendance Rate')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {attendanceData.course_breakdown?.map((item) => (
                          <tr key={item.course_id} className="hover:bg-gray-50/80 transition">
                            <td className="px-6 py-4">
                              <div className="font-semibold text-gray-900">{item.course_name}</div>
                              <div className="text-xs text-gray-400">{item.course_code}</div>
                            </td>
                            <td className="px-6 py-4 text-gray-600">{item.department_name}</td>
                            <td className="px-6 py-4 text-center font-semibold text-emerald-600">{item.present}</td>
                            <td className="px-6 py-4 text-center font-semibold text-rose-600">{item.absent}</td>
                            <td className="px-6 py-4 text-center text-amber-600">{item.late + item.permission}</td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-32 bg-gray-100 h-2.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      item.rate >= 80 ? 'bg-emerald-500' : item.rate >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${item.rate}%` }}
                                  ></div>
                                </div>
                                <span className="font-bold text-xs text-gray-700">{item.rate}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* TAB 4: ACADEMIC PERFORMANCE REPORT                       */}
            {/* ======================================================== */}
            {activeTab === 'academic' && (
              <div className="space-y-6">
                {/* Academic Averages */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <p className="text-xs font-semibold text-gray-400 uppercase">{t('ពិន្ទុកិច្ចការមធ្យម', 'Avg Assignment')}</p>
                    <h3 className="text-2xl font-black text-blue-900 mt-1">{academicData.summary?.avg_assignment || 0}</h3>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <p className="text-xs font-semibold text-gray-400 uppercase">{t('ពិន្ទុកម្រងសំណួរមធ្យម', 'Avg Quiz Score')}</p>
                    <h3 className="text-2xl font-black text-amber-600 mt-1">{academicData.summary?.avg_quiz || 0}</h3>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <p className="text-xs font-semibold text-gray-400 uppercase">{t('ពិន្ទុចុងក្រោយមធ្យម', 'Avg Final Score')}</p>
                    <h3 className="text-2xl font-black text-emerald-600 mt-1">{academicData.summary?.avg_final || 0}</h3>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <p className="text-xs font-semibold text-gray-400 uppercase">{t('ចំនួនសិស្សប្រឡង', 'Total Graded')}</p>
                    <h3 className="text-2xl font-black text-indigo-900 mt-1">{academicData.summary?.total_graded || 0}</h3>
                  </div>
                </div>

                {/* Grade Distribution Bar Chart */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900 mb-4">
                    {t('ការបែងចែកនិទ្ទេស (Grade Distribution A - F)', 'Grade Distribution (A, B, C, D, F)')}
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={gradeChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                        <XAxis dataKey="name" stroke="#6B7280" fontSize={12} />
                        <YAxis stroke="#6B7280" fontSize={12} />
                        <Tooltip contentStyle={{ backgroundColor: '#1E293B', color: '#FFF', borderRadius: '12px' }} />
                        <Bar dataKey="count" name={t('ចំនួនសិស្ស', 'Count')}>
                          {gradeChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Grade Detail Table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="text-base font-bold text-gray-900">
                      {t('បញ្ជីពិន្ទុ និងនិទ្ទេសសិស្ស', 'Detailed Student Grades')}
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                        <tr>
                          <th className="px-6 py-3.5">{t('លេខកូដសិស្ស', 'Student Code')}</th>
                          <th className="px-6 py-3.5">{t('ឈ្មោះសិស្ស', 'Student Name')}</th>
                          <th className="px-6 py-3.5">{t('មុខវិជ្ជា', 'Course')}</th>
                          <th className="px-6 py-3.5 text-center">{t('ពិន្ទុកិច្ចការ', 'Assignment')}</th>
                          <th className="px-6 py-3.5 text-center">{t('ពិន្ទុតេស្ត', 'Quiz')}</th>
                          <th className="px-6 py-3.5 text-center">{t('ពិន្ទុចុងក្រោយ', 'Final Score')}</th>
                          <th className="px-6 py-3.5 text-center">{t('និទ្ទេស', 'Grade Letter')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {academicData.data?.length === 0 ? (
                          <tr>
                            <td colSpan="7" className="px-6 py-8 text-center text-gray-400">
                              {t('មិនរកឃើញទិន្នន័យពិន្ទុទេ', 'No grade records found')}
                            </td>
                          </tr>
                        ) : (
                          academicData.data.map((g) => (
                            <tr key={g.id} className="hover:bg-gray-50/80 transition">
                              <td className="px-6 py-4 font-bold text-blue-900">{g.student_code}</td>
                              <td className="px-6 py-4 font-semibold text-gray-900">{g.student_name}</td>
                              <td className="px-6 py-4">
                                <div className="font-medium text-gray-800">{g.course_name}</div>
                                <div className="text-xs text-gray-400">{g.course_code}</div>
                              </td>
                              <td className="px-6 py-4 text-center font-medium text-gray-700">{g.assignment_score}</td>
                              <td className="px-6 py-4 text-center font-medium text-gray-700">{g.quiz_score}</td>
                              <td className="px-6 py-4 text-center font-bold text-blue-600">{g.final_score}</td>
                              <td className="px-6 py-4 text-center">
                                <span
                                  className={`inline-block px-3 py-1 rounded-full text-xs font-black ${
                                    g.grade_letter === 'A'
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : g.grade_letter === 'B'
                                      ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                      : g.grade_letter === 'C'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                      : 'bg-rose-100 text-rose-800 border border-rose-300'
                                  }`}
                                >
                                  {g.grade_letter}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminReports;

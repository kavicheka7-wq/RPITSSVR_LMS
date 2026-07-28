// teacher/dashboard/page.jsx
import { 
  BookOpenIcon, 
  UsersIcon, 
  ClipboardDocumentCheckIcon,
  ClockIcon,
  ChevronRightIcon,
  CalendarIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function TeacherDashboard() {
  const [stats, setStats] = useState({
    myCourses: 2,
    totalStudents: 4,
    pendingGrading: 0,
    presentToday: 3,
    totalLessons: 12,
    pendingAssignments: 5,
    upcomingExams: 2
  });

  const [courses, setCourses] = useState([
    {
      id: 1,
      code: 'CS101',
      name: 'សេចក្តីផ្តើមកម្មវិធី',
      semester: 'ឆមាសទី ១ — ២០២៤-២០២៥',
      students: 2,
      status: 'active'
    },
    {
      id: 2,
      code: 'CS201',
      name: 'ការអភិវឌ្ឍវេបសាយ',
      semester: 'ឆមាសទី ១ — ២០២៤-២០២៥',
      students: 2,
      status: 'active'
    },
    {
      id: 3,
      code: 'MA101',
      name: 'គណិតវិទ្យាមូលដ្ឋាន',
      semester: 'ឆមាសទី ២ — ២០២៤-២០២៥',
      students: 3,
      status: 'upcoming'
    }
  ]);

  const [recentActivities, setRecentActivities] = useState([
    { id: 1, student: 'សុខា មាន', action: 'បានប្រគល់កិច្ចការ', time: '5 នាទីមុន' },
    { id: 2, student: 'វណ្ណា សុខ', action: 'បានចូលរួមប្រឡង', time: '15 នាទីមុន' },
    { id: 3, student: 'ភក្តី សេង', action: 'បានស្នើសំណួរ', time: '30 នាទីមុន' },
  ]);

  // Stat Card Component
  const StatCard = ({ icon: Icon, title, value, color, subtitle }) => (
    <div className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow duration-300">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );

  const getStatusColor = (status) => {
    switch(status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'upcoming': return 'bg-yellow-100 text-yellow-700';
      case 'completed': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status) => {
    switch(status) {
      case 'active': return 'កំពុងដំណើរការ';
      case 'upcoming': return 'នឹងចាប់ផ្តើម';
      case 'completed': return 'បានបញ្ចប់';
      default: return status;
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">
            ស្វាគមន៍មកកាន់, <span className="text-blue-600">លោកគ្រូ សុខា មាន!</span>
          </h1>
          <p className="text-gray-500 mt-1">នេះជាទិដ្ឋភាពទូទៅនៃការបង្រៀនរបស់លោកគ្រូសម្រាប់ថ្ងៃនេះ</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard 
            icon={UsersIcon} 
            title="ចំនួនសិស្សសរុប" 
            value={stats.totalStudents}
            color="bg-blue-500"
            subtitle={`មានវត្តមាន ${stats.presentToday} នាក់`}
          />
          <StatCard 
            icon={BookOpenIcon} 
            title="មេរៀនសរុប" 
            value={stats.totalLessons}
            color="bg-green-500"
            subtitle="ក្នុងឆមាសនេះ"
          />
          <StatCard 
            icon={ClipboardDocumentCheckIcon} 
            title="កិច្ចការរង់ចាំ" 
            value={stats.pendingAssignments}
            color="bg-yellow-500"
            subtitle="ត្រូវកែតម្រូវ"
          />
          <StatCard 
            icon={DocumentTextIcon} 
            title="ការប្រឡងខាងមុខ" 
            value={stats.upcomingExams}
            color="bg-purple-500"
            subtitle="នៅសប្តាហ៍នេះ"
          />
        </div>

        {/* My Courses Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">មុខវិជ្ជារបស់ខ្ញុំ</h2>
            <Link to="/teacher/courses">
              <button className="text-sm text-blue-600 hover:text-blue-800 flex items-center">
                មើលទាំងអស់
                <ChevronRightIcon className="w-4 h-4 ml-1" />
              </button>
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">កូដ</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ឈ្មោះមុខវិជ្ជា</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ឆមាស</th>
                  <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">សិស្ស</th>
                  <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">ស្ថានភាព</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(Array.isArray(courses) ? courses : []).map((course) => (
                  <tr key={course.id} className="hover:bg-gray-50/50 transition cursor-pointer">
                    <td className="px-6 py-4 text-sm font-mono text-gray-600">{course.code}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{course.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{course.semester}</td>
                    <td className="px-6 py-4 text-sm text-center text-gray-600">
                      {course.students} នាក់
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(course.status)}`}>
                        {getStatusText(course.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Section - Recent Activities & Quick Stats */}
        
      </div>
    </div>
  );
}
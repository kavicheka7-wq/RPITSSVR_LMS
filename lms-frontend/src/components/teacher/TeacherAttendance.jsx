// teacher/teacherattendance/page.jsx
import { ClipboardDocumentListIcon, MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

export default function TeacherAttendance() {
  const [attendance, setAttendance] = useState([
    { id: 1, name: 'លោក សុខា មាន', status: 'present', time: '07:45', subject: 'គណិតវិទ្យា' },
    { id: 2, name: 'លោកគ្រូ វណ្ណា សុខ', status: 'absent', time: '-', subject: 'ភាសាខ្មែរ' },
    { id: 3, name: 'លោកគ្រូ ភក្តី សេង', status: 'present', time: '07:50', subject: 'រូបវិទ្យា' },
    { id: 4, name: 'លោកគ្រូ សុភា សេង', status: 'late', time: '08:15', subject: 'ភាសាអង់គ្លេស' },
    { id: 5, name: 'លោកគ្រូ រ៉ានី ហ៊ុន', status: 'present', time: '07:30', subject: 'ជីវវិទ្យា' },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const toggleStatus = (id) => {
    setAttendance(attendance.map(item => 
      item.id === id ? { 
        ...item, 
        status: item.status === 'present' ? 'absent' : 
                item.status === 'absent' ? 'late' : 'present' 
      } : item
    ));
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'present': return 'bg-green-100 text-green-800';
      case 'absent': return 'bg-red-100 text-red-800';
      case 'late': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch(status) {
      case 'present': return 'មានវត្តមាន';
      case 'absent': return 'អវត្តមាន';
      case 'late': return 'មកយឺត';
      default: return status;
    }
  };

  const filteredAttendance = attendance.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || item.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">វត្តមានគ្រូបង្រៀន</h1>
        <p className="text-gray-500 mt-1">គ្រប់គ្រងវត្តមានគ្រូបង្រៀនប្រចាំថ្ងៃ</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">សរុប</p>
          <p className="text-2xl font-bold">{attendance.length}</p>
        </div>
        <div className="bg-green-50 rounded-xl shadow-sm p-4 border border-green-200">
          <p className="text-sm text-green-600">មានវត្តមាន</p>
          <p className="text-2xl font-bold text-green-700">{attendance.filter(a => a.status === 'present').length}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl shadow-sm p-4 border border-yellow-200">
          <p className="text-sm text-yellow-600">មកយឺត</p>
          <p className="text-2xl font-bold text-yellow-700">{attendance.filter(a => a.status === 'late').length}</p>
        </div>
        <div className="bg-red-50 rounded-xl shadow-sm p-4 border border-red-200">
          <p className="text-sm text-red-600">អវត្តមាន</p>
          <p className="text-2xl font-bold text-red-700">{attendance.filter(a => a.status === 'absent').length}</p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="ស្វែងរកឈ្មោះគ្រូ..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <select
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">ទាំងអស់</option>
              <option value="present">មានវត្តមាន</option>
              <option value="late">មកយឺត</option>
              <option value="absent">អវត្តមាន</option>
            </select>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              កត់ត្រា
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">លេខរៀង</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ឈ្មោះ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">មុខវិជ្ជា</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ពេលវេលា</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ស្ថានភាព</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">សកម្មភាព</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAttendance.map((item, index) => (
                <tr key={item.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 text-sm text-gray-500">{index + 1}</td>
                  <td className="px-6 py-4 font-medium text-gray-800">{item.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{item.subject}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{item.time}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(item.status)}`}>
                      {getStatusText(item.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleStatus(item.id)}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition mr-2"
                    >
                      ប្តូរ
                    </button>
                    <button className="text-gray-400 hover:text-blue-600 transition">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
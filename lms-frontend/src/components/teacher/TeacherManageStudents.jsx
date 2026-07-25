// src/components/teacher/TeacherManageStudents.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { 
  UserGroupIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const TeacherManageStudents = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      // API នេះគួរតែត្រូវបានកំណត់នៅលើ Backend ឲ្យទាញយកតែសិស្សដែលរៀនមុខវិជ្ជារបស់គ្រូនេះ
      const response = await api.get('/teacher/students');
      setStudents(response.data.data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast.error('មិនអាចទាញយកទិន្នន័យសិស្សបានទេ');
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(student => {
    const search = searchTerm.toLowerCase();
    return (
      student.first_name?.toLowerCase()?.includes(search) ||
      student.last_name?.toLowerCase()?.includes(search) ||
      student.email?.toLowerCase()?.includes(search) ||
      student.student_code?.toLowerCase()?.includes(search) ||
      student.batch_year?.toLowerCase()?.includes(search)
    );
  });

  const getStudyShiftLabel = (shift) => {
    const shifts = {
      'Monday-Friday': 'ចន្ទ-សុក្រ',
      'Saturday-Sunday': 'សៅរ៍-អាទិត្យ'
    };
    return shifts[shift] || shift;
  };

  const getDegreeLevelLabel = (level) => {
    const levels = {
      'Associate Degree': 'បរិញ្ញាបត្ររង',
      'Bachelor Degree': 'បរិញ្ញាបត្រ',
      'Master Degree': 'បរិញ្ញាបត្រជាន់ខ្ពស់'
    };
    return levels[level] || level;
  };

  const getProfileImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http')) {
      return imagePath;
    }
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    return `${baseUrl}/storage/${imagePath}`;
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                <UserGroupIcon className="h-6 w-6" />
              </span>
              បញ្ជីសិស្សរបស់ខ្ញុំ
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              មើលបញ្ជីសិស្សដែលរៀនមុខវិជ្ជារបស់លោកគ្រូ/អ្នកគ្រូ
              <span className="ml-2 text-indigo-600 font-medium">({students.length} នាក់)</span>
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="ស្វែងរកតាមឈ្មោះ អ៊ីមែល អត្តលេខ ឬជំនាន់..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  សិស្ស
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  អត្តលេខ
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  អ៊ីមែល
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ដេប៉ាតឺម៉ង់
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  វេនសិក្សា
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ស្ថានភាព
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-14 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <UserGroupIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="font-medium">
                        {searchTerm ? 'មិនឃើញលទ្ធផលស្វែងរក' : 'មិនទាន់មានសិស្សនៅឡើយទេ'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {student.profile_image ? (
                          <img 
                            src={getProfileImageUrl(student.profile_image)}
                            alt={`${student.first_name} ${student.last_name}`}
                            className="h-10 w-10 rounded-full object-cover border-2 border-gray-200 shadow-sm flex-shrink-0"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              const parent = e.target.parentElement;
                              const avatar = document.createElement('div');
                              avatar.className = 'h-10 w-10 rounded-full bg-gradient-to-r from-green-500 to-teal-500 flex items-center justify-center text-white font-medium text-sm shadow-sm flex-shrink-0';
                              avatar.textContent = `${student.first_name?.charAt(0) || ''}${student.last_name?.charAt(0) || ''}`;
                              parent.insertBefore(avatar, e.target);
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gradient-to-r from-green-500 to-teal-500 flex items-center justify-center text-white font-medium text-sm shadow-sm flex-shrink-0">
                            <span>{student.first_name?.charAt(0) || ''}{student.last_name?.charAt(0) || ''}</span>
                          </div>
                        )}
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {student.first_name} {student.last_name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {getDegreeLevelLabel(student.degree_level) || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {student.student_code || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {student.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {student.department?.name || student.department?.department_name || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {getStudyShiftLabel(student.study_shift)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        student.user?.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {student.user?.status === 'active' ? 'សកម្ម' : 'អសកម្ម'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {filteredStudents.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-sm text-gray-600">
              បង្ហាញ <span className="font-medium text-gray-900">{filteredStudents.length}</span> នាក់ 
              {students.length !== filteredStudents.length && (
                <span> ក្នុងចំណោម <span className="font-medium text-gray-900">{students.length}</span> នាក់</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherManageStudents;
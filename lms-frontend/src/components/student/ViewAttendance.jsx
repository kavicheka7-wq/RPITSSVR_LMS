// src/components/student/ViewAttendance.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useLanguage } from '../../context/LanguageContext';

const ViewAttendance = () => {
  const { t, language } = useLanguage();
  const [attendance, setAttendance] = useState([]);
  const [summary, setSummary] = useState({ present: 0, absent: 0, late: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttendance();
  }, []);

  const fetchAttendance = async () => {
    try {
      const response = await api.get('/student/attendance');
      setAttendance(response.data.attendance || []);
      setSummary(response.data.summary || { present: 0, absent: 0, late: 0 });
    } catch (error) {
      toast.error(t('មិនអាចទាញយកទិន្នន័យវត្តមានបានទេ', 'Failed to fetch attendance'));
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Present':
        return <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">{t('វត្តមាន (Present)', 'Present')}</span>;
      case 'Absent':
        return <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">{t('អវត្តមាន (Absent)', 'Absent')}</span>;
      case 'Late':
        return <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">{t('យឺត (Late)', 'Late')}</span>;
      default:
        return <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('វត្តមានសិក្សារបស់ខ្ញុំ', 'My Attendance')}</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-sm text-green-600 font-semibold">{t('វត្តមាន (Present)', 'Present')}</p>
          <p className="text-2xl font-bold text-green-700">{summary.present}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <p className="text-sm text-red-600 font-semibold">{t('អវត្តមាន (Absent)', 'Absent')}</p>
          <p className="text-2xl font-bold text-red-700">{summary.absent}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
          <p className="text-sm text-yellow-600 font-semibold">{t('យឺត (Late)', 'Late')}</p>
          <p className="text-2xl font-bold text-yellow-700">{summary.late}</p>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('មុខវិជ្ជា', 'Course')}
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('កាលបរិច្ឆេទ', 'Date')}
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('ស្ថានភាព', 'Status')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {attendance.length === 0 ? (
              <tr>
                <td colSpan="3" className="px-6 py-8 text-center text-gray-500 font-medium">
                  {t('មិនទាន់មានប្រវត្តិវត្តមាននៅឡើយទេ', 'No attendance records found')}
                </td>
              </tr>
            ) : (
              attendance.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                    {record.course?.course_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(record.attendance_date).toLocaleDateString(language === 'km' ? 'km-KH' : 'en-US')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(record.status)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ViewAttendance;
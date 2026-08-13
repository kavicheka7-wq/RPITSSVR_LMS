// src/components/teacher/ManageAttendance.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useLanguage } from '../../context/LanguageContext';

const ManageAttendance = () => {
  const { t } = useLanguage();
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);

  const getArrayData = (resData) => {
    if (!resData) return [];
    if (Array.isArray(resData)) return resData;
    if (Array.isArray(resData.data)) return resData.data;
    if (resData.data && Array.isArray(resData.data.data)) return resData.data.data;
    return [];
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const response = await api.get('/teacher/courses');
      const validCourses = getArrayData(response.data);
      setCourses(validCourses);
      if (validCourses.length > 0) {
        setSelectedCourse(validCourses[0].id);
      }
    } catch (error) {
      toast.error(t('មិនអាចទាញយកបញ្ជីមុខវិជ្ជាបានទេ', 'Failed to fetch courses'));
      setCourses([]);
    }
  };

  const fetchStudents = async () => {
    if (!selectedCourse) return;
    setLoading(true);
    try {
      const response = await api.get(`/teacher/courses/${selectedCourse}/students`);
      const validStudents = getArrayData(response.data);
      setStudents(validStudents.map(student => ({
        ...student,
        attendance_status: 'Present',
      })));
    } catch (error) {
      toast.error(t('មិនអាចទាញយកបញ្ជីសិស្សបានទេ', 'Failed to fetch students'));
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCourse) {
      fetchStudents();
    }
  }, [selectedCourse]);

  const handleAttendanceChange = (studentId, status) => {
    setStudents(students.map(student =>
      student.id === studentId
        ? { ...student, attendance_status: status }
        : student
    ));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const attendanceData = students.map(student => ({
        student_id: student.id,
        status: student.attendance_status,
      }));

      await api.post('/teacher/attendance/bulk', {
        course_id: selectedCourse,
        attendance_date: attendanceDate,
        attendance: attendanceData,
      });

      toast.success(t('បានកត់ត្រាវត្តមានដោយជោគជ័យ', 'Attendance marked successfully'));
    } catch (error) {
      toast.error(t('មិនអាចកត់ត្រាវត្តមានបានទេ', 'Failed to mark attendance'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('គ្រប់គ្រងវត្តមាន', 'Manage Attendance')}</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('មុខវិជ្ជា', 'Course')}</label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                required
              >
                <option value="">{t('ជ្រើសរើសមុខវិជ្ជា', 'Select Course')}</option>
                {(Array.isArray(courses) ? courses : []).map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.course_name} ({course.course_code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('កាលបរិច្ឆេទវត្តមាន', 'Attendance Date')}</label>
              <input
                type="date"
                value={attendanceDate}
                onChange={(e) => setAttendanceDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                required
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('សិស្ស', 'Student')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ស្ថានភាព', 'Status')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(Array.isArray(students) ? students : []).map((student) => (
                  <tr key={student.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {student.first_name} {student.last_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={student.attendance_status}
                        onChange={(e) => handleAttendanceChange(student.id, e.target.value)}
                        className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                      >
                        <option value="Present">{t('វត្តមាន (Present)', 'Present')}</option>
                        <option value="Absent">{t('អវត្តមាន (Absent)', 'Absent')}</option>
                        <option value="Late">{t('យឺត (Late)', 'Late')}</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? t('កំពុងរក្សាទុក...', 'Saving...') : t('រក្សាទុកវត្តមាន', 'Save Attendance')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManageAttendance;
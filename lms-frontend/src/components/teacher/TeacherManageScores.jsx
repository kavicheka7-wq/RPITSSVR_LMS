// src/components/teacher/TeacherManageScores.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  BookOpenIcon,
  AcademicCapIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

const TeacherManageScores = () => {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [studentScores, setStudentScores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const response = await api.get('/teacher/courses');
      // កែសម្រួល៖ ធានាថាវាចាប់យក Array ពី API យ៉ាងពិតប្រាកដ
      const coursesData = response.data.data || response.data || [];
      const validCourses = Array.isArray(coursesData) ? coursesData : [];
      
      setCourses(validCourses);
      
      if (validCourses.length > 0) {
        setSelectedCourse(validCourses[0].id);
      }
    } catch (error) {
      toast.error('មិនអាចទាញយកបញ្ជីមុខវិជ្ជាបានទេ (Failed to fetch courses)');
      setCourses([]); // ការពារកុំឱ្យ Error ពេលបណ្តាញមានបញ្ហា
    }
  };

  const fetchScores = async () => {
    if (!selectedCourse) return;
    setLoading(true);
    try {
      const response = await api.get(`/teacher/courses/${selectedCourse}/scores`);
      // ធានាថាវាជា Array
      const scoresData = response.data.data || response.data || [];
      setStudentScores(Array.isArray(scoresData) ? scoresData : []);
    } catch (error) {
      toast.error('មិនអាចទាញយកពិន្ទុសិស្សបានទេ (Failed to fetch student scores)');
      setStudentScores([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCourse) {
      fetchScores();
    } else {
      setStudentScores([]);
    }
  }, [selectedCourse]);

  // Helper to automatically determine grade letter from percentage
  const calculateGradeLetter = (score) => {
    if (score === null || score === undefined || score === '') return '';
    const s = parseFloat(score);
    if (isNaN(s)) return '';
    if (s >= 90) return 'A';
    if (s >= 85) return 'B+';
    if (s >= 80) return 'B';
    if (s >= 70) return 'C+';
    if (s >= 65) return 'C';
    if (s >= 50) return 'D';
    return 'F';
  };

  const handleScoreChange = (studentId, field, value) => {
    setStudentScores(prevScores =>
      prevScores.map(item => {
        if (item.student_id === studentId) {
          const updatedItem = { ...item, [field]: value };
          // If final_score is changed, automatically update grade_letter
          if (field === 'final_score') {
            updatedItem.grade_letter = calculateGradeLetter(value);
          }
          return updatedItem;
        }
        return item;
      })
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Format data as expected by PUT /scores
      const payload = {
        scores: studentScores.map(item => ({
          student_id: item.student_id,
          course_id: selectedCourse,
          assignment_score: item.assignment_score !== '' ? parseFloat(item.assignment_score) : null,
          quiz_score: item.quiz_score !== '' ? parseFloat(item.quiz_score) : null,
          final_score: item.final_score !== '' ? parseFloat(item.final_score) : null,
          grade_letter: item.grade_letter || null,
        }))
      };

      await api.put('/teacher/scores', payload);
      toast.success('រក្សាទុកពិន្ទុដោយជោគជ័យ (Scores saved successfully)');
      fetchScores(); // Reload to sync state
    } catch (error) {
      toast.error('មានបញ្ហាក្នុងការរក្សាទុកពិន្ទុ (Failed to save scores)');
    } finally {
      setSaving(false);
    }
  };

  const getGradeBadgeClass = (letter) => {
    if (!letter) return 'bg-gray-100/50 text-gray-400 border border-gray-200/20';
    const l = letter.toUpperCase();
    if (l === 'A' || l === 'B+') return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    if (l === 'B' || l === 'C+') return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    if (l === 'C' || l === 'D') return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
    return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* Header section with gradient and premium styling */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 p-8 border border-blue-800/30 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-500/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-400/5 rounded-full blur-3xl -ml-24 -mb-24"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-yellow-500/10 rounded-xl flex items-center justify-center border border-yellow-500/20">
                <AcademicCapIcon className="h-6 w-6 text-yellow-400" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-wide">
                គ្រប់គ្រងពិន្ទុសិស្ស
              </h1>
            </div>
            <p className="text-sm text-blue-200/70 pl-13">
              បញ្ចូល និងកែសម្រួលពិន្ទុរបស់សិស្សទៅតាមមុខវិជ្ជាដែលអ្នកបង្រៀន (Manage student scores and grades for your courses)
            </p>
          </div>

          {/* Select Course styling */}
          <div className="w-full md:w-80 space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-yellow-400/80">
              ជ្រើសរើសមុខវិជ្ជា (Select Course)
            </label>
            <div className="relative">
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="w-full appearance-none bg-blue-900/35 backdrop-blur-md text-white border border-blue-700/50 rounded-2xl px-4 py-3 pr-10 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400/30 transition-all cursor-pointer font-medium"
              >
                <option value="" className="bg-blue-950 text-gray-300">-- ជ្រើសរើសមុខវិជ្ជា --</option>
                {/* កែសម្រួល៖ ប្រើ Array.isArray ដើម្បីការពារ Error Map */}
                {Array.isArray(courses) && courses.map((course) => (
                  <option key={course.id} value={course.id} className="bg-blue-950 text-white">
                    {course.course_name} ({course.course_code})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <ChevronDownIcon className="h-5 w-5 text-yellow-400/80" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {selectedCourse && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <ArrowPathIcon className="h-10 w-10 text-blue-900 animate-spin" />
              <p className="text-sm font-medium text-gray-500">កំពុងទាញយកទិន្នន័យ... (Loading student grades...)</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="divide-y divide-gray-100">
              
              {/* Toolbar */}
              <div className="px-6 py-4 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-2">
                  <BookOpenIcon className="h-5 w-5 text-blue-900" />
                  <span className="text-sm font-bold text-gray-700">
                    ចំនួនសិស្សសរុប: {Array.isArray(studentScores) ? studentScores.length : 0} នាក់
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={saving || !Array.isArray(studentScores) || studentScores.length === 0}
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-950 to-blue-900 hover:from-yellow-500 hover:to-yellow-600 hover:text-blue-950 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-950/10 hover:shadow-yellow-500/20 transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {saving ? (
                    <>
                      <ArrowPathIcon className="h-5 w-5 animate-spin" />
                      កំពុងរក្សាទុក...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="h-5 w-5" />
                      រក្សាទុកពិន្ទុ (Save Scores)
                    </>
                  )}
                </button>
              </div>

              {/* Table section */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50/55">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                        ព័ត៌មានសិស្ស (Student Info)
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-40">
                        ពិន្ទុកិច្ចការ (Assignment %)
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-40">
                        ពិន្ទុកម្រងសំណួរ (Quiz %)
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-40">
                        ពិន្ទុចុងក្រោយ (Final Score %)
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-36">
                        និទ្ទេស (Grade Letter)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {!Array.isArray(studentScores) || studentScores.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-12 text-center text-gray-500 font-medium">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <ExclamationCircleIcon className="h-8 w-8 text-gray-400" />
                            <span>មិនទាន់មានសិស្សចុះឈ្មោះចូលរៀនក្នុងមុខវិជ្ជានេះនៅឡើយទេ</span>
                            <span className="text-xs text-gray-400">(No active student enrollments for this course)</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      studentScores.map((item) => (
                        <tr key={item.student_id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-900 text-sm">{item.student?.name || item.student_name}</span>
                              <span className="text-xs text-gray-400 mt-0.5">{item.student?.email || item.student_email}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex justify-center">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                placeholder="-"
                                value={item.assignment_score ?? ''}
                                onChange={(e) => handleScoreChange(item.student_id, 'assignment_score', e.target.value)}
                                className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-center font-semibold text-gray-700 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400/30 transition-all"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex justify-center">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                placeholder="-"
                                value={item.quiz_score ?? ''}
                                onChange={(e) => handleScoreChange(item.student_id, 'quiz_score', e.target.value)}
                                className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-center font-semibold text-gray-700 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400/30 transition-all"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex justify-center">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                placeholder="-"
                                value={item.final_score ?? ''}
                                onChange={(e) => handleScoreChange(item.student_id, 'final_score', e.target.value)}
                                className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-center font-semibold text-gray-800 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400/30 transition-all"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex justify-center items-center gap-2">
                              <select
                                value={item.grade_letter ?? ''}
                                onChange={(e) => handleScoreChange(item.student_id, 'grade_letter', e.target.value)}
                                className={`w-20 px-2 py-1.5 rounded-lg text-center font-bold text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400/30 transition-all cursor-pointer ${getGradeBadgeClass(item.grade_letter)}`}
                              >
                                <option value="" className="bg-white text-gray-700">-</option>
                                <option value="A" className="bg-white text-gray-900 font-bold">A</option>
                                <option value="B+" className="bg-white text-gray-900 font-bold">B+</option>
                                <option value="B" className="bg-white text-gray-900 font-bold">B</option>
                                <option value="C+" className="bg-white text-gray-900 font-bold">C+</option>
                                <option value="C" className="bg-white text-gray-900 font-bold">C</option>
                                <option value="D" className="bg-white text-gray-900 font-bold">D</option>
                                <option value="F" className="bg-white text-gray-900 font-bold">F</option>
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </form>
          )}
        </div>
      )}
      
      {!selectedCourse && (
        <div className="bg-white border border-gray-100 rounded-3xl p-16 text-center text-gray-500 shadow-lg">
          <div className="max-w-md mx-auto space-y-4">
            <BookOpenIcon className="h-12 w-12 text-gray-300 mx-auto" />
            <h3 className="text-lg font-bold text-gray-800">សូមជ្រើសរើសមុខវិជ្ជាដើម្បីបញ្ចូលពិន្ទុ</h3>
            <p className="text-sm text-gray-400">
              សូមជ្រើសរើសមុខវិជ្ជាណាមួយពីបញ្ជីរាយនាមខាងលើ ដើម្បីចាប់ផ្តើមវាយតម្លៃ និងកត់ត្រាពិន្ទុរបស់សិស្ស។
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherManageScores;
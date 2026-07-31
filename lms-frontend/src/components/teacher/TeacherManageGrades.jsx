// src/components/teacher/TeacherManageGrades.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useLanguage } from '../../context/LanguageContext';
import {
  AcademicCapIcon,
  BookOpenIcon,
  ChevronDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  SparklesIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

const TeacherManageGrades = () => {
  const { t } = useLanguage();
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [studentScores, setStudentScores] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingRowId, setSavingRowId] = useState(null);
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      fetchScores();
    } else {
      setStudentScores([]);
    }
  }, [selectedCourse]);

  const fetchCourses = async () => {
    try {
      const response = await api.get('/teacher/courses');
      const coursesData = response.data.data || response.data || [];
      const validCourses = Array.isArray(coursesData) ? coursesData : [];
      setCourses(validCourses);
      if (validCourses.length > 0) {
        setSelectedCourse(validCourses[0].id);
      }
    } catch (error) {
      console.error('Error fetching courses:', error);
      toast.error(t('មិនអាចទាញយកបញ្ជីមុខវិជ្ជាបានទេ', 'Failed to fetch courses'));
    }
  };

  const fetchScores = async () => {
    if (!selectedCourse) return;
    setLoading(true);
    try {
      const response = await api.get(`/teacher/courses/${selectedCourse}/scores`);
      const scoresData = response.data.data || response.data || [];
      const formatted = Array.isArray(scoresData)
        ? scoresData.map((s, idx) => {
            const stuCode = s.student_code || s.student?.code || `STU${String(s.student_id || idx + 1).padStart(3, '0')}`;
            const assign = s.assignment_score !== null && s.assignment_score !== undefined ? s.assignment_score : '';
            const quiz = s.quiz_score !== null && s.quiz_score !== undefined ? s.quiz_score : '';
            const midterm = s.midterm_score !== null && s.midterm_score !== undefined ? s.midterm_score : '';
            const finalTotal = s.final_score !== null && s.final_score !== undefined ? s.final_score : '';

            // Infer exam_score from stored final_score if available
            let exam = s.exam_score !== null && s.exam_score !== undefined ? s.exam_score : '';
            if (exam === '' && finalTotal !== '' && finalTotal !== null) {
              const a = assign !== '' ? parseFloat(assign) : null;
              const q = quiz !== '' ? parseFloat(quiz) : null;
              const m = midterm !== '' ? parseFloat(midterm) : null;

              let subSum = 0;
              if (a !== null && !isNaN(a)) subSum += a * 0.2;
              if (q !== null && !isNaN(q)) subSum += q * 0.2;
              if (m !== null && !isNaN(m)) subSum += m * 0.25;

              const calcExam = (parseFloat(finalTotal) - subSum) / 0.35;
              if (!isNaN(calcExam) && calcExam >= 0 && calcExam <= 100) {
                exam = Math.round(calcExam * 100) / 100;
              } else if (a === null && q === null && m === null) {
                exam = finalTotal;
              }
            }

            return {
              ...s,
              student_code: stuCode,
              assignment_score: assign,
              quiz_score: quiz,
              midterm_score: midterm,
              exam_score: exam,
              final_score: finalTotal,
              grade_letter: s.grade_letter ?? '',
            };
          })
        : [];
      setStudentScores(formatted);
    } catch (error) {
      console.error('Error fetching scores:', error);
      toast.error(t('មិនអាចទាញយកពិន្ទុសិស្សបានទេ', 'Failed to fetch student scores'));
      setStudentScores([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper to compute weighted total & letter grade
  // Assignment (20%), Quiz (20%), Midterm (25%), Final Exam (35%)
  const calculateRowMetrics = (assign, quiz, midterm, exam) => {
    const a = assign !== '' && assign !== null && assign !== undefined ? parseFloat(assign) : null;
    const q = quiz !== '' && quiz !== null && quiz !== undefined ? parseFloat(quiz) : null;
    const m = midterm !== '' && midterm !== null && midterm !== undefined ? parseFloat(midterm) : null;
    const e = exam !== '' && exam !== null && exam !== undefined ? parseFloat(exam) : null;

    let weightedSum = 0;
    let weightTotal = 0;

    if (a !== null && !isNaN(a)) {
      weightedSum += a * 0.2;
      weightTotal += 0.2;
    }
    if (q !== null && !isNaN(q)) {
      weightedSum += q * 0.2;
      weightTotal += 0.2;
    }
    if (m !== null && !isNaN(m)) {
      weightedSum += m * 0.25;
      weightTotal += 0.25;
    }
    if (e !== null && !isNaN(e)) {
      weightedSum += e * 0.35;
      weightTotal += 0.35;
    }

    if (weightTotal === 0) return { total: null, letter: '' };

    const totalScore = Math.round((weightedSum / weightTotal) * 100) / 100;

    let letter = '';
    if (totalScore >= 90) letter = 'A';
    else if (totalScore >= 85) letter = 'B+';
    else if (totalScore >= 80) letter = 'B';
    else if (totalScore >= 70) letter = 'C+';
    else if (totalScore >= 65) letter = 'C';
    else if (totalScore >= 50) letter = 'D';
    else letter = 'F';

    return { total: totalScore, letter };
  };

  const handleScoreChange = (studentId, field, value) => {
    setStudentScores((prev) =>
      prev.map((item) => {
        if (item.student_id === studentId) {
          const updated = { ...item, [field]: value };
          const { total, letter } = calculateRowMetrics(
            updated.assignment_score,
            updated.quiz_score,
            updated.midterm_score,
            updated.exam_score
          );
          updated.final_score = total;
          updated.grade_letter = letter;
          return updated;
        }
        return item;
      })
    );
  };

  const handleAutoFill = () => {
    setStudentScores((prev) =>
      prev.map((item) => {
        const assign = item.assignment_score !== '' ? item.assignment_score : (item.auto_assignment_score ?? '');
        const quiz = item.quiz_score !== '' ? item.quiz_score : (item.auto_quiz_score ?? '');
        const midterm = item.midterm_score ?? '';
        const exam = item.exam_score ?? '';

        const { total, letter } = calculateRowMetrics(assign, quiz, midterm, exam);
        return {
          ...item,
          assignment_score: assign,
          quiz_score: quiz,
          final_score: total,
          grade_letter: letter,
        };
      })
    );
    toast.info(t('បានគណនា និងបំពេញពិន្ទុស្វ័យប្រវត្តិ', 'Auto-calculated scores'));
  };

  // Save single row grade
  const saveSingleRow = async (item) => {
    setSavingRowId(item.student_id);
    try {
      const { total, letter } = calculateRowMetrics(
        item.assignment_score,
        item.quiz_score,
        item.midterm_score,
        item.exam_score
      );

      const payload = {
        student_id: item.student_id,
        course_id: parseInt(selectedCourse),
        assignment_score: item.assignment_score !== '' ? parseFloat(item.assignment_score) : null,
        quiz_score: item.quiz_score !== '' ? parseFloat(item.quiz_score) : null,
        midterm_score: item.midterm_score !== '' ? parseFloat(item.midterm_score) : null,
        final_score: total !== null ? total : null,
        grade_letter: letter || null,
      };

      await api.post('/teacher/scores', payload);
      toast.success(t('បានរក្សាទុកពិន្ទុសិស្ស', 'Saved student grade successfully'));
    } catch (err) {
      console.error(err);
      toast.error(t('មិនអាចរក្សាទុកពិន្ទុបានទេ', 'Failed to save grade'));
    } finally {
      setSavingRowId(null);
    }
  };

  // Save all rows grade
  const handleSaveAll = async (e) => {
    e.preventDefault();
    if (!selectedCourse) return;
    setSavingAll(true);
    try {
      const scoresPayload = studentScores.map((item) => {
        const { total, letter } = calculateRowMetrics(
          item.assignment_score,
          item.quiz_score,
          item.midterm_score,
          item.exam_score
        );
        return {
          student_id: item.student_id,
          course_id: parseInt(selectedCourse),
          assignment_score: item.assignment_score !== '' ? parseFloat(item.assignment_score) : null,
          quiz_score: item.quiz_score !== '' ? parseFloat(item.quiz_score) : null,
          midterm_score: item.midterm_score !== '' ? parseFloat(item.midterm_score) : null,
          final_score: total !== null ? total : null,
          grade_letter: letter || null,
        };
      });

      await api.put('/teacher/scores', { scores: scoresPayload });
      toast.success(t('បានរក្សាទុកពិន្ទុទាំងអស់ដោយជោគជ័យ', 'All scores saved successfully'));
      fetchScores();
    } catch (err) {
      console.error(err);
      toast.error(t('មានបញ្ហាក្នុងការរក្សាទុកពិន្ទុ', 'Failed to save scores'));
    } finally {
      setSavingAll(false);
    }
  };

  const filteredScores = studentScores.filter((item) => {
    const s = searchTerm.toLowerCase();
    const name = (item.student?.name || item.student_name || '').toLowerCase();
    const code = (item.student_code || '').toLowerCase();
    return name.includes(s) || code.includes(s);
  });

  const selectedCourseObj = courses.find((c) => String(c.id) === String(selectedCourse));

  return (
    <div className="p-6 max-w-full bg-gray-50 min-h-screen">
      {/* Title Header - Matching the image style */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('គ្រប់គ្រងពិន្ទុ', 'Grade Management')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedCourseObj
              ? `${selectedCourseObj.course_code} — ${selectedCourseObj.course_name}`
              : t('ជ្រើសរើសមុខវិជ្ជាដើម្បីគ្រប់គ្រងពិន្ទុ', 'Select a course to manage grades')}
          </p>
        </div>

        {/* Course Select Dropdown - Matching image style */}
        <div className="w-64">
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-10 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
          >
            <option value="">— Select Course —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.course_name} ({c.course_code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table Card - Clean white card with shadow */}
      {selectedCourse ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {/* Table Header - Matching image style with "Student Grades" title */}
          <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Student Grades</h2>
              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full border border-blue-200">
                {studentScores.length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search student..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white w-48"
                />
              </div>

              {/* Auto fill button - Green style */}
              <button
                type="button"
                onClick={handleAutoFill}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-medium transition border border-green-200"
              >
                <SparklesIcon className="w-4 h-4" />
                <span>Auto Fill</span>
              </button>

              {/* Save All button - Blue primary */}
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={savingAll || studentScores.length === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingAll ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckIcon className="w-4 h-4" />
                )}
                <span>Save All Grades</span>
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-20 text-center text-gray-400">
              <ArrowPathIcon className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
              <p className="text-sm">Loading student grades...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Assignment (20%)</th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Quiz (20%)</th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Midterm (25%)</th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Final Exam (35%)</th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Grade</th>
                    <th className="py-3 px-6 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredScores.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-gray-400 text-sm">
                        No student enrollments found for this course.
                      </td>
                    </tr>
                  ) : (
                    filteredScores.map((item) => {
                      const studentName = item.student?.name || item.student_name || 'N/A';
                      const studentCode = item.student_code || `STU${String(item.student_id).padStart(3, '0')}`;
                      
                      // Get first letter of name for avatar
                      const nameParts = studentName.trim().split(' ');
                      const initial = nameParts.length > 1 
                        ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
                        : (studentName[0] || 'S').toUpperCase();

                      const { total, letter } = calculateRowMetrics(
                        item.assignment_score,
                        item.quiz_score,
                        item.midterm_score,
                        item.exam_score
                      );
                      const finalLetter = letter || item.grade_letter || '';

                      // Determine grade badge color
                      const getGradeColor = (grade) => {
                        if (!grade) return 'bg-gray-100 text-gray-400';
                        if (grade === 'A' || grade === 'B+') return 'bg-green-100 text-green-700';
                        if (grade === 'B' || grade === 'C+') return 'bg-blue-100 text-blue-700';
                        if (grade === 'C' || grade === 'D') return 'bg-yellow-100 text-yellow-700';
                        return 'bg-red-100 text-red-700';
                      };

                      return (
                        <tr key={item.student_id} className="hover:bg-gray-50/50 transition-colors">
                          {/* Student Cell */}
                          <td className="py-3 px-6">
                            <div>
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-semibold text-sm flex items-center justify-center shrink-0">
                                  {initial}
                                </div>
                                <div>
                                  <div className="font-medium text-gray-900 text-sm">{studentName}</div>
                                  <div className="text-xs text-gray-400">{studentCode}</div>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Assignment (20%) */}
                          <td className="py-3 px-4 text-center">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              placeholder="—"
                              value={item.assignment_score}
                              onChange={(e) => handleScoreChange(item.student_id, 'assignment_score', e.target.value)}
                              className="w-16 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-center text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                            />
                          </td>

                          {/* Quiz (20%) */}
                          <td className="py-3 px-4 text-center">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              placeholder="—"
                              value={item.quiz_score}
                              onChange={(e) => handleScoreChange(item.student_id, 'quiz_score', e.target.value)}
                              className="w-16 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-center text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                            />
                          </td>

                          {/* Midterm (25%) */}
                          <td className="py-3 px-4 text-center">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              placeholder="—"
                              value={item.midterm_score}
                              onChange={(e) => handleScoreChange(item.student_id, 'midterm_score', e.target.value)}
                              className="w-16 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-center text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                            />
                          </td>

                          {/* Final Exam (35%) */}
                          <td className="py-3 px-4 text-center">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              placeholder="—"
                              value={item.exam_score}
                              onChange={(e) => handleScoreChange(item.student_id, 'exam_score', e.target.value)}
                              className="w-16 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-center text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                            />
                          </td>

                          {/* Total Score */}
                          <td className="py-3 px-4 text-center font-semibold text-blue-600 text-sm">
                            {total !== null ? `${total}%` : '—'}
                          </td>

                          {/* Grade Letter - Matching image style with colored badge */}
                          <td className="py-3 px-4 text-center">
                            {finalLetter ? (
                              <span className={`px-3 py-1 rounded-md text-xs font-semibold ${getGradeColor(finalLetter)}`}>
                                {finalLetter}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>

                          {/* Action Button - Matching image style with Save button */}
                          <td className="py-3 px-6 text-center">
                            <button
                              type="button"
                              onClick={() => saveSingleRow(item)}
                              disabled={savingRowId === item.student_id}
                              className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 text-xs font-medium rounded transition border border-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {savingRowId === item.student_id ? (
                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckIcon className="w-3.5 h-3.5" />
                              )}
                              <span>Save</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-16 text-center text-gray-400 shadow-sm">
          <BookOpenIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-700">Please select a course</h3>
          <p className="text-sm text-gray-400 mt-1">
            Choose a course from the dropdown menu above to manage and calculate student grades.
          </p>
        </div>
      )}
    </div>
  );
};

export default TeacherManageGrades;
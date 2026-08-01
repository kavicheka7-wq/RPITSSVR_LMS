import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { AcademicCapIcon, ArrowPathIcon, ExclamationCircleIcon, CheckCircleIcon, BookOpenIcon } from '@heroicons/react/24/outline';

const ViewScores = () => {
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScores();
  }, []);

  const fetchScores = async () => {
    try {
      const response = await api.get('/student/scores');
      const scoresData = response.data?.data || response.data || [];
      setGrades(Array.isArray(scoresData) ? scoresData : []);
    } catch (error) {
      toast.error('មិនអាចទាញយកពិន្ទុបានទេ (Failed to fetch scores)');
    } finally {
      setLoading(false);
    }
  };

  const getGradeBadge = (gradeLetter) => {
    if (!gradeLetter) return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-gray-100 text-gray-400 border border-gray-200">គ្មានទិន្នន័យ (N/A)</span>;
    
    const letter = gradeLetter.toUpperCase();
    if (letter === 'A' || letter === 'A+') {
      return (
        <span className="px-3 py-1.5 text-xs font-extrabold rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
          និទ្ទេស A
        </span>
      );
    }
    if (letter.startsWith('B')) {
      return (
        <span className="px-3 py-1.5 text-xs font-extrabold rounded-lg bg-blue-500/10 text-blue-600 border border-blue-500/20">
          និទ្ទេស {letter}
        </span>
      );
    }
    if (letter.startsWith('C')) {
      return (
        <span className="px-3 py-1.5 text-xs font-extrabold rounded-lg bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">
          និទ្ទេស {letter}
        </span>
      );
    }
    if (letter.startsWith('D')) {
      return (
        <span className="px-3 py-1.5 text-xs font-extrabold rounded-lg bg-orange-500/10 text-orange-600 border border-orange-500/20">
          និទ្ទេស {letter}
        </span>
      );
    }
    return (
      <span className="px-3 py-1.5 text-xs font-extrabold rounded-lg bg-rose-500/10 text-rose-600 border border-rose-500/20">
        និទ្ទេស {letter}
      </span>
    );
  };

  // Compute overall statistics
  const scoredGrades = grades.filter(g => g.final_score !== null);
  const averageFinalScore = scoredGrades.length > 0 
    ? Math.round(scoredGrades.reduce((sum, g) => sum + Number(g.final_score), 0) / scoredGrades.length) 
    : 0;
  const passedCoursesCount = scoredGrades.filter(g => g.grade_letter && g.grade_letter.toUpperCase() !== 'F').length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ArrowPathIcon className="h-10 w-10 text-blue-900 animate-spin" />
        <p className="text-sm text-gray-500 font-sans">កំពុងទាញយកព័ត៌មានពិន្ទុ... (Loading academic scores...)</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-8 shadow-xl border border-blue-900">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-3 py-1 rounded-lg border border-yellow-400/20 uppercase tracking-wider">
              សមិទ្ធផលសិក្សា (Academic Records)
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight">តារាងលទ្ធផលពិន្ទុសិក្សា</h1>
            <p className="text-blue-200 text-sm max-w-xl font-medium">
              ពិនិត្យមើលលទ្ធផលពិន្ទុ កិច្ចការផ្ទះ កម្រងសំណួរ និងនិទ្ទេសរួមតាមមុខវិជ្ជានីមួយៗ។ (View your scores and overall grades.)
            </p>
          </div>
          
          {/* Quick Stats inside banner */}
          <div className="flex flex-wrap gap-4">
            <div className="bg-white/5 border border-white/10 backdrop-blur-xs px-5 py-3.5 rounded-2xl flex items-center gap-3">
              <div className="h-10 w-10 bg-yellow-500/10 rounded-xl flex items-center justify-center border border-yellow-500/20">
                <AcademicCapIcon className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">ពិន្ទុមធ្យម (Avg Score)</p>
                <p className="text-lg font-black text-white">{averageFinalScore}%</p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 backdrop-blur-xs px-5 py-3.5 rounded-2xl flex items-center gap-3">
              <div className="h-10 w-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
                <CheckCircleIcon className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">មុខវិជ្ជាជាប់ (Passed)</p>
                <p className="text-lg font-black text-white">{passedCoursesCount} / {grades.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scores Table Card */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden p-6">
        <h3 className="text-lg font-bold text-gray-950 mb-4 flex items-center gap-2 border-b pb-3.5">
          <BookOpenIcon className="h-5 w-5 text-blue-900" />
          ព័ត៌មានលម្អិតនៃពិន្ទុ (Detailed Scores Sheet)
        </h3>

        {grades.length === 0 ? (
          <div className="text-center py-16 text-gray-500 space-y-2">
            <ExclamationCircleIcon className="h-12 w-12 text-gray-300 mx-auto" />
            <h3 className="text-base font-bold text-gray-700">មិនទាន់មានទិន្នន័យពិន្ទុនៅឡើយទេ</h3>
            <p className="text-xs text-gray-400">គ្មានមុខវិជ្ជាត្រូវបានរកឃើញសម្រាប់គណនីរបស់អ្នក។</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider rounded-l-2xl">មុខវិជ្ជាសិក្សា (Course)</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">សាស្រ្តាចារ្យ (Instructor)</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">ពិន្ទុកិច្ចការ (Assignments)</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">ពិន្ទុកម្រងសំណួរ (Quizzes)</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">ពិន្ទុពាក់កណ្តាលឆមាស (Midterm)</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">ពិន្ទុចុងក្រោយ (Final Score)</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider rounded-r-2xl">និទ្ទេសរួម (Grade)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {grades.map((grade) => {
                  const teacher = grade.course?.teacher || grade.course?.teacher_profile;
                  const teacherName = teacher?.name || teacher?.full_name || (teacher?.first_name ? `${teacher.first_name} ${teacher.last_name || ''}`.trim() : '') || 'គ្រូបង្រៀន';
                  const teacherImg = teacher?.profile_image_url || (teacher?.profile_image ? (teacher.profile_image.startsWith('http') ? teacher.profile_image : `/storage/${teacher.profile_image}`) : null);

                  const assignVal = grade.assignment_score !== null && grade.assignment_score !== undefined && grade.assignment_score !== '' ? grade.assignment_score : null;
                  const quizVal = grade.quiz_score !== null && grade.quiz_score !== undefined && grade.quiz_score !== '' ? grade.quiz_score : null;
                  const midtermVal = grade.midterm_score !== null && grade.midterm_score !== undefined && grade.midterm_score !== '' ? grade.midterm_score : null;
                  const finalVal = grade.final_score !== null && grade.final_score !== undefined && grade.final_score !== '' ? grade.final_score : null;

                  return (
                    <tr key={grade.course?.id || grade.course_id} className="hover:bg-gray-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-900">{grade.course?.course_name || '—'}</span>
                          <span className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">{grade.course?.course_code} &bull; {grade.course?.credit || 3} Credits</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {teacherImg ? (
                            <img
                              src={teacherImg}
                              alt={teacherName}
                              className="h-7 w-7 rounded-full object-cover border border-gray-200"
                              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                            />
                          ) : null}
                          <div className={`h-7 w-7 rounded-full bg-blue-900/10 text-blue-900 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-900/10 ${teacherImg ? 'hidden' : ''}`}>
                            {teacherName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-gray-800 truncate max-w-37.5">
                              {teacherName}
                            </span>
                            {teacher?.specialization && (
                              <span className="text-[9px] text-gray-400 truncate">
                                {teacher.specialization}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`text-xs font-bold ${assignVal !== null ? 'text-gray-900' : 'text-gray-400'}`}>
                          {assignVal !== null ? `${assignVal}%` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`text-xs font-bold ${quizVal !== null ? 'text-gray-900' : 'text-gray-400'}`}>
                          {quizVal !== null ? `${quizVal}%` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`text-xs font-bold ${midtermVal !== null ? 'text-gray-900' : 'text-gray-400'}`}>
                          {midtermVal !== null ? `${midtermVal}%` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`text-sm font-extrabold ${finalVal !== null ? 'text-blue-950 bg-blue-900/5 px-2.5 py-1.5 rounded-lg border border-blue-900/10' : 'text-gray-400'}`}>
                          {finalVal !== null ? `${finalVal}%` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {getGradeBadge(grade.grade_letter)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default ViewScores;
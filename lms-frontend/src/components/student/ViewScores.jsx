// src/components/student/ViewScores.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';

const ViewScores = () => {
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScores();
  }, []);

  const fetchScores = async () => {
    try {
      const response = await api.get('/student/scores');
      setGrades(response.data);
    } catch (error) {
      toast.error('Failed to fetch scores');
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (grade) => {
    if (!grade) return 'bg-gray-100 text-gray-800';
    const g = grade.toUpperCase();
    if (g === 'A' || g === 'A+') return 'bg-green-100 text-green-800';
    if (g === 'B' || g === 'B+') return 'bg-blue-100 text-blue-800';
    if (g === 'C' || g === 'C+') return 'bg-yellow-100 text-yellow-800';
    if (g === 'D' || g === 'D+') return 'bg-orange-100 text-orange-800';
    if (g === 'F') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Scores</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Course
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assignment Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quiz Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Final Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Grade
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {grades.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                  No scores available
                </td>
              </tr>
            ) : (
              grades.map((grade) => (
                <tr key={grade.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {grade.course?.course_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {grade.assignment_score !== null ? `${grade.assignment_score}%` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {grade.quiz_score !== null ? `${grade.quiz_score}%` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                    {grade.final_score !== null ? `${grade.final_score}%` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getGradeColor(grade.grade_letter)}`}>
                      {grade.grade_letter || '-'}
                    </span>
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

export default ViewScores;
// src/App.jsx - Reload trigger
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';
import Login from './components/auth/Login';
import Register from './components/auth/Register';

// Admin Components
import AdminDashboard from './components/admin/AdminDashboard';
// import ManageUsers from './components/admin/ManageUsers';
import ManageTeachers from './components/admin/ManageTeachers';
import ManageStudents from './components/admin/ManageStudents';
import ManageCourses from './components/admin/ManageCourses';
import ManageDepartments from './components/admin/ManageDepartments';
// import SystemSettings from './components/admin/SystemSettings';
;

// Teacher Components
import TeacherDashboard from './components/teacher/TeacherDashboard';
import TeacherManageCourses from './components/teacher/TeacherManageCourses';
import TeacherManageAssignments from './components/teacher/TeacherManageAssignments';
import TeacherManageQuizzes from './components/teacher/TeacherManageQuizzes';
import ManageLessons from './components/teacher/ManageLessons';
import TeacherManageStudents from './components/teacher/TeacherManageStudents';
import TeacherManageScores from './components/teacher/TeacherManageScores';
// import ManageClassroom from './components/teacher/ManageClassroom';
// import CreateStudent from './components/teacher/CreateStudent';
import ManageAttendance from './components/teacher/ManageAttendance';
// import ManageScores from './components/teacher/ManageScores';
// import CreateMajor from './components/teacher/CreateMajor';
// import CreateSubject from './components/teacher/CreateSubject';
// import UploadAssignment from './components/teacher/UploadAssignment';
// import UploadHomework from './components/teacher/UploadHomework';
// import UploadVideo from './components/teacher/UploadVideo';
// import OnlineExam from './components/teacher/OnlineExam';

// Student Components
import StudentDashboard from './components/student/StudentDashboard';
import ViewAttendance from './components/student/ViewAttendance';
import ViewScores from './components/student/ViewScores';
import StudentCourses from './components/student/StudentCourses';
import StudentCourseDetails from './components/student/StudentCourseDetails';
import StudentLessons from './components/student/StudentLessons';
import StudentAssignments from './components/student/StudentAssignments';
import StudentQuizzes from './components/student/StudentQuizzes';
// import StudentUploadAssignment from './components/student/UploadAssignment';
// import StudentUploadHomework from './components/student/UploadHomework';

// Main App Content with routing
const AppContent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const getDashboardPath = () => {
    if (!user) return '/login';
    const role = (user?.role?.role_name || user?.role_name || user?.role || '').toString().toLowerCase();
    switch (role) {
      case 'admin': return '/admin/dashboard';
      case 'teacher': return '/teacher/dashboard';
      case 'student': return '/student/dashboard';
      default: return '/login';
    }
  };

  // If user is not logged in, show auth pages without layout
  if (!user) {
    return (
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <ToastContainer position="bottom-right" />
      </Router>
    );
  }

  // User is logged in, show full layout with Navbar and Sidebar
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6">
            <Routes>
              {/* Redirect root to appropriate dashboard */}
              <Route path="/" element={<Navigate to={getDashboardPath()} replace />} />

              {/* Admin Routes */}
              <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                {/* <Route path="/admin/users" element={<ManageUsers />} /> */}
                <Route path="/admin/courses" element={<ManageCourses />} />
                <Route path="/admin/departments" element={<ManageDepartments />} />
  
                <Route path="/admin/teachers" element={<ManageTeachers />} />
                <Route path="/admin/students" element={<ManageStudents />} />
              </Route>

              {/* Teacher Routes */}
              <Route element={<ProtectedRoute allowedRoles={['Teacher']} />}>
                <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
                <Route path="/teacher/courses" element={<TeacherManageCourses />} />
                <Route path="/teacher/lessons" element={<ManageLessons />} />
                <Route path="/teacher/assignments" element={<TeacherManageAssignments />} />
                <Route path="/teacher/quizzes" element={<TeacherManageQuizzes />} />
                <Route path="/teacher/attendance" element={<ManageAttendance />} />
                <Route path="/teacher/scores" element={<TeacherManageScores />} />
                <Route path="/teacher/students" element={<TeacherManageStudents />} />
                <Route path="/teacher/departments" element={<ManageDepartments />} />
              </Route>

              {/* Student Routes */}
              <Route element={<ProtectedRoute allowedRoles={['Student']} />}>
                <Route path="/student/dashboard" element={<StudentDashboard />} />
                <Route path="/student/courses" element={<StudentCourses />} />
                <Route path="/student/courses/:courseId" element={<StudentCourseDetails />} />
                <Route path="/student/lessons" element={<StudentLessons />} />
                <Route path="/student/attendance" element={<ViewAttendance />} />
                <Route path="/student/scores" element={<ViewScores />} />
                <Route path="/student/assignments" element={<StudentAssignments />} />
                <Route path="/student/quizzes" element={<StudentQuizzes />} />
                {/* <Route path="/student/assignments/upload" element={<StudentUploadAssignment />} />
                <Route path="/student/homework/upload" element={<StudentUploadHomework />} /> */}
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to={getDashboardPath()} replace />} />
            </Routes>
          </main>
        </div>
        <ToastContainer position="bottom-right" />
      </div>
    </Router>
  );
};

// Main App Component
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
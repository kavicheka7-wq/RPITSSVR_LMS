// src/App.jsx
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';
import BottomNav from './components/common/BottomNav';
import Login from './components/auth/Login';
import Register from './components/auth/Register';

// Admin Components
import AdminDashboard from './components/admin/AdminDashboard';
import ManageTeachers from './components/admin/ManageTeachers';
import ManageCourses from './components/admin/ManageCourses';
import ManageDepartments from './components/admin/ManageDepartments';
import AdminReports from './components/admin/AdminReports';
import ManageStudentsYear1 from './components/admin/ManageStudentsYear1';
import ManageStudentsYear2 from './components/admin/ManageStudentsYear2';
import ManageStudentsYear3 from './components/admin/ManageStudentsYear3';
import ManageStudentsYear4 from './components/admin/ManageStudentsYear4';

// Teacher Components
import TeacherDashboard from './components/teacher/TeacherDashboard';
import TeacherManageCourses from './components/teacher/TeacherManageCourses';
import TeacherManageAssignments from './components/teacher/TeacherManageAssignments';
import TeacherManageQuizzes from './components/teacher/TeacherManageQuizzes';
import ManageLessons from './components/teacher/ManageLessons';
import TeacherManageStudents from './components/teacher/TeacherManageStudents';
import TeacherManageGrades from './components/teacher/TeacherManageGrades';
import ManageAttendance from './components/teacher/ManageAttendance';

// Student Components
import StudentDashboard from './components/student/StudentDashboard';
import ViewAttendance from './components/student/ViewAttendance';
import ViewScores from './components/student/ViewScores';
import StudentCourses from './components/student/StudentCourses';
import StudentLessons from './components/student/StudentLessons';
import StudentAssignments from './components/student/StudentAssignments';
import StudentQuizzes from './components/student/StudentQuizzes';

// Main App Content with routing
const AppContent = () => {
  const { user, loading } = useAuth();

  // ✅ ចាប់សកម្មភាព Scroll គ្រប់ទីកន្លែង ដើម្បីបង្ហាញ Scrollbar តែពេលកំពុងអូស និងលាក់វិញពេលឈប់អូស
  useEffect(() => {
    let scrollTimer = null;

    const handleScroll = (e) => {
      document.documentElement.classList.add('is-scrolling');
      if (e?.target && e.target.classList) {
        e.target.classList.add('is-scrolling');
      }

      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        document.documentElement.classList.remove('is-scrolling');
        document
          .querySelectorAll('.is-scrolling')
          .forEach((el) => el.classList.remove('is-scrolling'));
      }, 750);
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, []);

  if (loading && !user) {
    return null;
  }

  const getDashboardPath = () => {
    if (!user) return '/login';
    const role = (
      user?.role?.role_name ||
      user?.role_name ||
      user?.role ||
      ''
    )
      .toString()
      .toLowerCase();
    switch (role) {
      case 'admin':
        return '/admin/dashboard';
      case 'teacher':
        return '/teacher/dashboard';
      case 'student':
        return '/student/dashboard';
      default:
        return '/login';
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
      </Router>
    );
  }

  // ✅ User is logged in: Navbar លាតពេញអេក្រង់ 100% នៅខាងលើ ហើយផ្ទៃខាងក្រោមជាអ្នក Scroll
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="flex flex-col h-screen w-full overflow-hidden bg-gray-50 dark:bg-slate-950">
        {/* 1. Navbar ពេញអេក្រង់ 100% ដល់គែមស្ដាំបំផុត គ្មាន Scrollbar មកបាំង */}
        <div className="w-full shrink-0 z-40">
          <Navbar />
        </div>

        {/* 2. ផ្ទៃខាងក្រោម Navbar (Sidebar + Main Content ដែលអាច Scroll បានយ៉ាងរលូន) */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Sidebar />
          <main
            id="app-main-scroll"
            className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 pb-20 md:pb-6 min-w-0"
          >
            <Routes>
              {/* Redirect root to appropriate dashboard */}
              <Route path="/" element={<Navigate to={getDashboardPath()} replace />} />

              {/* Admin Routes */}
              <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/courses" element={<ManageCourses />} />
                <Route path="/admin/departments" element={<ManageDepartments />} />
                <Route path="/admin/teachers" element={<ManageTeachers />} />
                <Route path="/admin/users" element={<Navigate to="/admin/students/year-1" replace />} />
                <Route path="/admin/students" element={<Navigate to="/admin/students/year-1" replace />} />
                <Route path="/admin/students/year-1" element={<ManageStudentsYear1 />} />
                <Route path="/admin/students/year-2" element={<ManageStudentsYear2 />} />
                <Route path="/admin/students/year-3" element={<ManageStudentsYear3 />} />
                <Route path="/admin/students/year-4" element={<ManageStudentsYear4 />} />
                <Route path="/admin/reports" element={<AdminReports />} />
              </Route>

              {/* Teacher Routes */}
              <Route element={<ProtectedRoute allowedRoles={['Teacher']} />}>
                <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
                <Route path="/teacher/courses" element={<TeacherManageCourses />} />
                <Route path="/teacher/lessons" element={<ManageLessons />} />
                <Route path="/teacher/assignments" element={<TeacherManageAssignments />} />
                <Route path="/teacher/quizzes" element={<TeacherManageQuizzes />} />
                <Route path="/teacher/attendance" element={<ManageAttendance />} />
                <Route path="/teacher/scores" element={<TeacherManageGrades />} />
                <Route path="/teacher/grades" element={<TeacherManageGrades />} />
                <Route path="/teacher/students" element={<TeacherManageStudents />} />
                <Route path="/teacher/departments" element={<ManageDepartments />} />
              </Route>

              {/* Student Routes */}
              <Route element={<ProtectedRoute allowedRoles={['Student']} />}>
                <Route path="/student/dashboard" element={<StudentDashboard />} />
                <Route path="/student/courses" element={<StudentCourses />} />
                <Route path="/student/lessons" element={<StudentLessons />} />
                <Route path="/student/attendance" element={<ViewAttendance />} />
                <Route path="/student/scores" element={<ViewScores />} />
                <Route path="/student/grades" element={<ViewScores />} />
                <Route path="/student/assignments" element={<StudentAssignments />} />
                <Route path="/student/quizzes" element={<StudentQuizzes />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to={getDashboardPath()} replace />} />
            </Routes>
          </main>
        </div>

        <BottomNav />
      </div>
    </Router>
  );
};

// Main App Component
function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;
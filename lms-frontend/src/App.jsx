// src/App.jsx
import React, { useEffect, useRef, Suspense, lazy } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';
import BottomNav from './components/common/BottomNav';
import Login from './components/auth/Login';

// ✅ ប្រើប្រាស់ Lazy Loading (Code-Splitting) ដើម្បីកុំឱ្យ Browser ទាញកូដគ្រប់ទំព័រ និង Excel/Chart ធ្ងន់ៗពេលវាយ Domain ចូលដំបូង
const Register = lazy(() => import('./components/auth/Register'));

// Admin Components (Lazy Loaded)
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
const ManageTeachers = lazy(() => import('./components/admin/ManageTeachers'));
const ManageCourses = lazy(() => import('./components/admin/ManageCourses'));
const ManageDepartments = lazy(() => import('./components/admin/ManageDepartments'));
const AdminReports = lazy(() => import('./components/admin/AdminReports'));
const ManageStudentsYear1 = lazy(() => import('./components/admin/ManageStudentsYear1'));
const ManageStudentsYear2 = lazy(() => import('./components/admin/ManageStudentsYear2'));
const ManageStudentsYear3 = lazy(() => import('./components/admin/ManageStudentsYear3'));
const ManageStudentsYear4 = lazy(() => import('./components/admin/ManageStudentsYear4'));

// Teacher Components (Lazy Loaded)
const TeacherDashboard = lazy(() => import('./components/teacher/TeacherDashboard'));
const TeacherManageCourses = lazy(() => import('./components/teacher/TeacherManageCourses'));
const TeacherManageAssignments = lazy(() => import('./components/teacher/TeacherManageAssignments'));
const TeacherManageQuizzes = lazy(() => import('./components/teacher/TeacherManageQuizzes'));
const ManageLessons = lazy(() => import('./components/teacher/ManageLessons'));
const TeacherManageStudents = lazy(() => import('./components/teacher/TeacherManageStudents'));
const TeacherManageGrades = lazy(() => import('./components/teacher/TeacherManageGrades'));
const ManageAttendance = lazy(() => import('./components/teacher/ManageAttendance'));

// Student Components (Lazy Loaded)
const StudentDashboard = lazy(() => import('./components/student/StudentDashboard'));
const ViewAttendance = lazy(() => import('./components/student/ViewAttendance'));
const ViewScores = lazy(() => import('./components/student/ViewScores'));
const StudentCourses = lazy(() => import('./components/student/StudentCourses'));
const StudentLessons = lazy(() => import('./components/student/StudentLessons'));
const StudentAssignments = lazy(() => import('./components/student/StudentAssignments'));
const StudentQuizzes = lazy(() => import('./components/student/StudentQuizzes'));

// ✅ ប្ដូរ URL ទៅជា /dashboard ភ្លាមៗដោយមិនប្រើ navigate ដែលធ្វើឱ្យ Re-render ទំព័រពីរដង
const RootDashboardEntry = ({ children }) => {
  useEffect(() => {
    if (window.location.pathname === '/') {
      window.history.replaceState(null, '', '/dashboard');
    }
  }, []);

  return children;
};

// Main App Content with routing
const AppContent = () => {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();
  const mainScrollRef = useRef(null);

  // ✅ រំកិលផ្ទៃមាតិកាមកលើបំផុតវិញដោយស្វ័យប្រវត្តិរាល់ពេលប្ដូរទំព័រ (Route Change)
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [location.pathname]);

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

    window.addEventListener('scroll', handleScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, []);

  // ✅ ប្រសិនបើកំពុងផ្ទៀងផ្ទាត់ Token លើកដំបូង (មិនទាន់មាន Cache សោះ) បង្ហាញផ្ទៃពណ៌ទឹកប៊ិចចាស់ ជៀសវាងអេក្រង់ស
  if (loading && !user) {
    return <div className="min-h-screen w-full bg-slate-950" />;
  }

  // ✅ កំណត់សិទ្ធិតួនាទីរបស់អ្នកប្រើប្រាស់ (Role Resolver - គាំទ្រទាំងលេខ និងអក្សរ)
  const getUserRole = () => {
    const rawRole =
      user?.role?.role_name ||
      user?.role?.name ||
      user?.role_name ||
      (typeof user?.role === 'string' ? user.role : '') ||
      '';
    const r = String(rawRole).trim().toLowerCase();
    const roleIdNum = Number(user?.role_id);

    if (r.includes('admin') || roleIdNum === 1) return 'admin';
    if (r.includes('teacher') || roleIdNum === 2) return 'teacher';
    if (r.includes('student') || roleIdNum === 3) return 'student';

    if (typeof hasRole === 'function') {
      if (hasRole('Admin')) return 'admin';
      if (hasRole('Teacher')) return 'teacher';
      if (hasRole('Student')) return 'student';
    }
    return '';
  };

  const role = getUserRole();

  const getDashboardPath = () => {
    if (!user) return '/';
    return '/dashboard';
  };

  const renderRoleDashboard = () => {
    if (role === 'admin') return <AdminDashboard />;
    if (role === 'teacher') return <TeacherDashboard />;
    return <StudentDashboard />;
  };

  // If user is not logged in, show auth pages without layout on clean root '/'
  if (!user) {
    return (
      <Suspense fallback={<div className="min-h-screen w-full bg-slate-950" />}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // ✅ User is logged in: Navbar និង Sidebar បង្ហាញភ្លាមៗ 100% ខណៈផ្ទៃកណ្ដាលប្ដូរទំព័រយ៉ាងរលូន
  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-gray-50 dark:bg-slate-950">
      {/* 1. Navbar ពេញអេក្រង់ 100% ដល់គែមស្ដាំបំផុត គ្មាន Scrollbar មកបាំង */}
      <div className="w-full shrink-0 z-40">
        <Navbar />
      </div>

      {/* 2. ផ្ទៃខាងក្រោម Navbar (Sidebar + Main Content ដែលអាច Scroll បានយ៉ាងរលូន) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />
        <main
          ref={mainScrollRef}
          id="app-main-scroll"
          className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 pb-20 md:pb-6 min-w-0"
        >
          <Suspense fallback={null}>
            <Routes>
              <Route
                path="/"
                element={
                  <RootDashboardEntry>{renderRoleDashboard()}</RootDashboardEntry>
                }
              />
              <Route
                path="/login"
                element={<Navigate to="/dashboard" replace />}
              />
              <Route
                path="/register"
                element={<Navigate to="/dashboard" replace />}
              />

              {/* ========================================================== */}
              {/* 📌 ១. CLEAN UNIFIED ROUTES (គ្មាន /admin, /teacher, /student) */}
              {/* ========================================================== */}
              <Route path="/dashboard" element={renderRoleDashboard()} />

              <Route
                path="/courses"
                element={
                  role === 'admin' ? (
                    <ManageCourses />
                  ) : role === 'teacher' ? (
                    <TeacherManageCourses />
                  ) : (
                    <StudentCourses />
                  )
                }
              />

              {/* Admin Exclusive Clean Routes */}
              <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
                <Route path="/teachers" element={<ManageTeachers />} />
                <Route
                  path="/users"
                  element={<Navigate to="/students/year-1" replace />}
                />
                <Route
                  path="/students/year-1"
                  element={<ManageStudentsYear1 />}
                />
                <Route
                  path="/students/year-2"
                  element={<ManageStudentsYear2 />}
                />
                <Route
                  path="/students/year-3"
                  element={<ManageStudentsYear3 />}
                />
                <Route
                  path="/students/year-4"
                  element={<ManageStudentsYear4 />}
                />
                <Route path="/reports" element={<AdminReports />} />
              </Route>

              {/* Admin & Teacher Shared Clean Routes */}
              <Route
                element={<ProtectedRoute allowedRoles={['Admin', 'Teacher']} />}
              >
                <Route path="/departments" element={<ManageDepartments />} />
                <Route
                  path="/students"
                  element={
                    role === 'admin' ? (
                      <Navigate to="/students/year-1" replace />
                    ) : (
                      <TeacherManageStudents />
                    )
                  }
                />
              </Route>

              {/* Teacher & Student Shared Clean Routes */}
              <Route
                element={<ProtectedRoute allowedRoles={['Teacher', 'Student']} />}
              >
                <Route
                  path="/lessons"
                  element={
                    role === 'teacher' ? <ManageLessons /> : <StudentLessons />
                  }
                />
                <Route
                  path="/assignments"
                  element={
                    role === 'teacher' ? (
                      <TeacherManageAssignments />
                    ) : (
                      <StudentAssignments />
                    )
                  }
                />
                <Route
                  path="/quizzes"
                  element={
                    role === 'teacher' ? (
                      <TeacherManageQuizzes />
                    ) : (
                      <StudentQuizzes />
                    )
                  }
                />
                <Route
                  path="/attendance"
                  element={
                    role === 'teacher' ? <ManageAttendance /> : <ViewAttendance />
                  }
                />
                <Route
                  path="/scores"
                  element={
                    role === 'teacher' ? <TeacherManageGrades /> : <ViewScores />
                  }
                />
                <Route
                  path="/grades"
                  element={
                    role === 'teacher' ? <TeacherManageGrades /> : <ViewScores />
                  }
                />
              </Route>

              {/* ========================================================== */}
              {/* 📌 ២. AUTO-REDIRECT ពី URL ចាស់ៗមកកាន់ URL ថ្មីស្អាតដោយស្វ័យប្រវត្តិ */}
              {/* ========================================================== */}
              <Route
                path="/admin/dashboard"
                element={<Navigate to="/dashboard" replace />}
              />
              <Route
                path="/admin/courses"
                element={<Navigate to="/courses" replace />}
              />
              <Route
                path="/admin/departments"
                element={<Navigate to="/departments" replace />}
              />
              <Route
                path="/admin/teachers"
                element={<Navigate to="/teachers" replace />}
              />
              <Route
                path="/admin/users"
                element={<Navigate to="/students/year-1" replace />}
              />
              <Route
                path="/admin/students"
                element={<Navigate to="/students/year-1" replace />}
              />
              <Route
                path="/admin/students/year-1"
                element={<Navigate to="/students/year-1" replace />}
              />
              <Route
                path="/admin/students/year-2"
                element={<Navigate to="/students/year-2" replace />}
              />
              <Route
                path="/admin/students/year-3"
                element={<Navigate to="/students/year-3" replace />}
              />
              <Route
                path="/admin/students/year-4"
                element={<Navigate to="/students/year-4" replace />}
              />
              <Route
                path="/admin/reports"
                element={<Navigate to="/reports" replace />}
              />

              <Route
                path="/teacher/dashboard"
                element={<Navigate to="/dashboard" replace />}
              />
              <Route
                path="/teacher/courses"
                element={<Navigate to="/courses" replace />}
              />
              <Route
                path="/teacher/lessons"
                element={<Navigate to="/lessons" replace />}
              />
              <Route
                path="/teacher/assignments"
                element={<Navigate to="/assignments" replace />}
              />
              <Route
                path="/teacher/quizzes"
                element={<Navigate to="/quizzes" replace />}
              />
              <Route
                path="/teacher/attendance"
                element={<Navigate to="/attendance" replace />}
              />
              <Route
                path="/teacher/scores"
                element={<Navigate to="/scores" replace />}
              />
              <Route
                path="/teacher/grades"
                element={<Navigate to="/grades" replace />}
              />
              <Route
                path="/teacher/students"
                element={<Navigate to="/students" replace />}
              />
              <Route
                path="/teacher/departments"
                element={<Navigate to="/departments" replace />}
              />

              <Route
                path="/student/dashboard"
                element={<Navigate to="/dashboard" replace />}
              />
              <Route
                path="/student/courses"
                element={<Navigate to="/courses" replace />}
              />
              <Route
                path="/student/lessons"
                element={<Navigate to="/lessons" replace />}
              />
              <Route
                path="/student/attendance"
                element={<Navigate to="/attendance" replace />}
              />
              <Route
                path="/student/scores"
                element={<Navigate to="/scores" replace />}
              />
              <Route
                path="/student/grades"
                element={<Navigate to="/grades" replace />}
              />
              <Route
                path="/student/assignments"
                element={<Navigate to="/assignments" replace />}
              />
              <Route
                path="/student/quizzes"
                element={<Navigate to="/quizzes" replace />}
              />

              {/* Fallback */}
              <Route
                path="*"
                element={<Navigate to={getDashboardPath()} replace />}
              />
            </Routes>
          </Suspense>
        </main>
      </div>

      <BottomNav />
    </div>
  );
};

// Main App Component
function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <Router
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AppContent />
        </Router>
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;
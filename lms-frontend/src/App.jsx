// src/App.jsx
import React, { useEffect, useRef } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
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

// ✅ HELPER COMPONENT: អនុញ្ញាតឱ្យ Browser ចាប់យកឈ្មោះ Domain សុទ្ធ (/) ពេលវាយលើ Address Bar សិន ហើយពេលចុច Enter ចូលដល់ផ្ទាំង Dashboard ទើបលោតពាក្យ /dashboard មកតាមក្រោយ
const RootDashboardEntry = ({ children }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/dashboard', { replace: true });
    }, 150);
    return () => clearTimeout(timer);
  }, [navigate]);

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

  // 🔴 ទីតាំងដែលធ្វើឱ្យចេញអេក្រង់ស (White Screen) ពីមុន ត្រូវបានដោះស្រាយដោយជំនួសផ្ទាំង Loading
  if (loading && !user) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-14 w-14 border-t-4 border-b-4 border-blue-600 mb-5 shadow-sm"></div>
        <p className="text-gray-600 dark:text-gray-300 font-extrabold text-sm tracking-widest animate-pulse">
          កំពុងរៀបចំទិន្នន័យ...
        </p>
      </div>
    );
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

  // ✅ ប្រើប្រាស់ផ្លូវរួមស្អាតតែមួយ '/dashboard' សម្រាប់គ្រប់តួនាទីទាំងអស់
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
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // ✅ User is logged in: Navbar លាតពេញអេក្រង់ 100% នៅខាងលើ ហើយផ្ទៃខាងក្រោមជាអ្នក Scroll
  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-gray-50 dark:bg-slate-950 animate-fadeIn">
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
          <Routes>
            {/* ✅ ពេលវាយ Domain ចុច Enter ចូលដល់ផ្ទាំង Dashboard ទើបលោតពាក្យ /dashboard មក */}
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
// src/components/common/ProtectedRoute.jsx
import React, { useMemo } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// ✅ អានព័ត៌មាន User/Teacher និង Token ពីទាំង sessionStorage និង localStorage ភ្លាមៗក្នុង 0ms
const readCachedUserSync = () => {
  try {
    const token =
      sessionStorage.getItem('token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('auth_token');
    if (!token) return null;

    const raw =
      sessionStorage.getItem('user') ||
      sessionStorage.getItem('auth_user') ||
      localStorage.getItem('user') ||
      localStorage.getItem('auth_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.user || parsed?.data || parsed;
    }

    const rawTeacher =
      sessionStorage.getItem('teacher') || localStorage.getItem('teacher');
    if (rawTeacher) {
      const parsedTeacher = JSON.parse(rawTeacher);
      return {
        ...parsedTeacher,
        role_id: parsedTeacher.role_id || 2,
        role: 'Teacher',
        teacher: parsedTeacher,
      };
    }
    return null;
  } catch {
    return null;
  }
};

// ✅ ស្រង់យកតួនាទីគោល ('admin' | 'teacher' | 'student') ឱ្យត្រឹមត្រូវគ្រប់ទម្រង់ API
const normalizeRoleKey = (userObj, teacherObj, hasRoleFn) => {
  if (userObj) {
    const rawRole =
      userObj?.role?.role_name ||
      userObj?.role?.name ||
      userObj?.role_name ||
      (typeof userObj?.role === 'string' ? userObj.role : '') ||
      '';
    const r = String(rawRole).trim().toLowerCase();
    const roleIdNum = Number(userObj?.role_id);

    if (r.includes('admin') || roleIdNum === 1) return 'admin';
    if (
      r.includes('teacher') ||
      roleIdNum === 2 ||
      Boolean(teacherObj) ||
      Boolean(userObj?.teacher)
    ) {
      return 'teacher';
    }
    if (
      r.includes('student') ||
      roleIdNum === 3 ||
      Boolean(userObj?.student)
    ) {
      return 'student';
    }
    if (r) return r;
  }

  if (teacherObj) return 'teacher';

  if (typeof hasRoleFn === 'function') {
    if (hasRoleFn('Admin')) return 'admin';
    if (hasRoleFn('Teacher')) return 'teacher';
    if (hasRoleFn('Student')) return 'student';
  }

  return '';
};

const ProtectedRoute = ({ allowedRoles, children }) => {
  const {
    user: contextUser,
    teacher: contextTeacher,
    isAuthenticated,
    loading,
    hasRole,
  } = useAuth();
  const location = useLocation();

  // ✅ ប្រើប្រាស់ User ពី Context ឬអានផ្ទាល់ពី Storage ភ្លាមៗក្នុង 0 វិនាទី
  const effectiveUser = useMemo(
    () => contextUser || readCachedUserSync() || contextTeacher,
    [contextUser, contextTeacher, isAuthenticated, location.pathname]
  );

  const hasValidToken = useMemo(() => {
    try {
      return Boolean(
        sessionStorage.getItem('token') ||
          localStorage.getItem('token') ||
          localStorage.getItem('auth_token')
      );
    } catch {
      return false;
    }
  }, [isAuthenticated, location.pathname]);

  const hasValidSession = Boolean(
    isAuthenticated ||
      (hasValidToken &&
        effectiveUser &&
        (effectiveUser.id ||
          effectiveUser.user_id ||
          effectiveUser.teacher?.id ||
          effectiveUser.student?.id ||
          effectiveUser.email))
  );

  if (loading && !hasValidSession) {
    return null;
  }

  if (!hasValidSession) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const userRoleKey = normalizeRoleKey(effectiveUser, contextTeacher, hasRole);

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    const isAllowed = allowedRoles.some((allowed) => {
      const target = String(allowed).trim().toLowerCase();
      return (
        Boolean(target) &&
        (userRoleKey === target || userRoleKey.includes(target))
      );
    });

    if (!isAllowed) {
      if (
        userRoleKey === 'admin' ||
        userRoleKey === 'teacher' ||
        userRoleKey === 'student'
      ) {
        if (location.pathname !== '/dashboard') {
          return <Navigate to="/dashboard" replace />;
        }
        return children ? children : <Outlet />;
      }
      return <Navigate to="/login" state={{ from: location }} replace />;
    }
  }

  return children ? children : <Outlet />;
};

export default React.memo(ProtectedRoute);
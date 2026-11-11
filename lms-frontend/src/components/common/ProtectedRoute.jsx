// src/components/common/ProtectedRoute.jsx
import React, { useMemo } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// ✅ អានព័ត៌មាន User និង Token ពី LocalStorage ភ្លាមៗក្នុង 0ms ដើម្បីកុំឱ្យរាំងស្ទះទំព័រពេល Refresh
const readCachedUserSync = () => {
  try {
    const token =
      localStorage.getItem('token') || localStorage.getItem('auth_token');
    if (!token) return null;

    const raw =
      localStorage.getItem('user') || localStorage.getItem('auth_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user || parsed?.data || parsed;
  } catch {
    return null;
  }
};

// ✅ ស្រង់យកតួនាទីគោល ('admin' | 'teacher' | 'student') ឱ្យត្រឹមត្រូវគ្រប់ទម្រង់ API និង role_id (ទាំងលេខ និងអក្សរ)
const normalizeRoleKey = (userObj, hasRoleFn) => {
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
    if (r.includes('teacher') || roleIdNum === 2) return 'teacher';
    if (r.includes('student') || roleIdNum === 3) return 'student';
    if (r) return r;
  }

  if (typeof hasRoleFn === 'function') {
    if (hasRoleFn('Admin')) return 'admin';
    if (hasRoleFn('Teacher')) return 'teacher';
    if (hasRoleFn('Student')) return 'student';
  }

  return '';
};

const ProtectedRoute = ({ allowedRoles, children }) => {
  const { user: contextUser, isAuthenticated, loading, hasRole } = useAuth();
  const location = useLocation();

  // ✅ ប្រើប្រាស់ User ពី Context ឬអានផ្ទាល់ពី LocalStorage ភ្លាមៗក្នុង 0 វិនាទី (មិនបាច់លោត Loading Spinner)
  const effectiveUser = useMemo(
    () => contextUser || readCachedUserSync(),
    [contextUser, isAuthenticated, location.pathname]
  );

  const hasValidToken = useMemo(() => {
    try {
      return Boolean(
        localStorage.getItem('token') || localStorage.getItem('auth_token')
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

  // បើកំពុងផ្ទុក ហើយមិនទាន់មានទិន្នន័យក្នុងម៉ាស៊ីនសោះ ទើបរង់ចាំបន្តិចដោយមិនលោតផ្ទាំងវិលរំខានភ្នែក
  if (loading && !hasValidSession) {
    return null;
  }

  if (!hasValidSession) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const userRoleKey = normalizeRoleKey(effectiveUser, hasRole);

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    const isAllowed = allowedRoles.some((allowed) => {
      const target = String(allowed).trim().toLowerCase();
      return (
        Boolean(target) &&
        (userRoleKey === target || userRoleKey.includes(target))
      );
    });

    if (!isAllowed) {
      // ✅ បញ្ជូនទៅកាន់ '/dashboard' រួមតែមួយគត់ (Clean URL) ប្រសិនបើមានតួនាទីត្រឹមត្រូវ និងមិនទាន់ស្ថិតនៅលើ '/dashboard'
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
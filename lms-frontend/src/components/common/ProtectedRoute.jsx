// src/components/common/ProtectedRoute.jsx
import React, { useMemo } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// ✅ អានព័ត៌មាន User ពី LocalStorage ភ្លាមៗក្នុង 0ms ដើម្បីកុំឱ្យរាំងស្ទះទំព័រពេល Refresh ឬពេលសិស្សចូលច្រើន
const readCachedUserSync = () => {
  try {
    const raw =
      localStorage.getItem('user') || localStorage.getItem('auth_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user || parsed?.data || parsed;
  } catch {
    return null;
  }
};

// ✅ ស្រង់យកតួនាទីគោល ('admin' | 'teacher' | 'student') ឱ្យត្រឹមត្រូវគ្រប់ទម្រង់ API និង role_id
const normalizeRoleKey = (userObj) => {
  if (!userObj) return '';
  const rawRole =
    userObj?.role?.role_name ||
    userObj?.role?.name ||
    userObj?.role_name ||
    (typeof userObj?.role === 'string' ? userObj.role : '') ||
    '';
  const r = String(rawRole).trim().toLowerCase();

  if (r.includes('admin') || userObj?.role_id === 1) return 'admin';
  if (r.includes('teacher') || userObj?.role_id === 2) return 'teacher';
  if (r.includes('student') || userObj?.role_id === 3) return 'student';
  return r;
};

const ProtectedRoute = ({ allowedRoles }) => {
  const { user: contextUser, isAuthenticated, loading } = useAuth();

  // ✅ ប្រើប្រាស់ User ពី Context ឬអានផ្ទាល់ពី LocalStorage ភ្លាមៗក្នុង 0 វិនាទី (មិនបាច់លោត Loading Spinner)
  const effectiveUser = useMemo(
    () => contextUser || readCachedUserSync(),
    [contextUser]
  );

  const hasValidSession = Boolean(
    isAuthenticated ||
      (effectiveUser &&
        (effectiveUser.id || effectiveUser.user_id || effectiveUser.email))
  );

  // បើកំពុងផ្ទុក ហើយមិនទាន់មានទិន្នន័យក្នុងម៉ាស៊ីនសោះ ទើបរង់ចាំបន្តិចដោយមិនលោតផ្ទាំងវិលរំខានភ្នែក
  if (loading && !hasValidSession) {
    return null;
  }

  if (!hasValidSession) {
    return <Navigate to="/login" replace />;
  }

  const userRoleKey = normalizeRoleKey(effectiveUser);

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    const isAllowed = allowedRoles.some((allowed) => {
      const target = String(allowed).trim().toLowerCase();
      return userRoleKey === target || userRoleKey.includes(target);
    });

    if (!isAllowed) {
      // ✅ បញ្ជូនទៅកាន់ '/dashboard' រួមតែមួយគត់ (Clean URL) ប្រសិនបើមានតួនាទីត្រឹមត្រូវ
      if (
        userRoleKey === 'admin' ||
        userRoleKey === 'teacher' ||
        userRoleKey === 'student'
      ) {
        return <Navigate to="/dashboard" replace />;
      }
      return <Navigate to="/login" replace />;
    }
  }

  return <Outlet />;
};

export default React.memo(ProtectedRoute);
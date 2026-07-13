// src/context/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await api.get('/user');
      const userData = response.data.user;
      const teacherData = response.data.teacher || null;
      
      console.log('User Data from API:', userData);
      console.log('Teacher Data from API:', teacherData);
      
      setUser(userData);
      setTeacher(teacherData);
      
      if (teacherData) {
        localStorage.setItem('teacher', JSON.stringify(teacherData));
      } else {
        localStorage.removeItem('teacher');
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await api.post('/login', { email, password });
      const { token, user, teacher: teacherData, message } = response.data;
      
      console.log('Login Response - User:', user);
      console.log('Login Response - Teacher:', teacherData);
      
      localStorage.setItem('token', token);
      setToken(token);
      setUser(user);
      
      if (teacherData) {
        setTeacher(teacherData);
        localStorage.setItem('teacher', JSON.stringify(teacherData));
      } else {
        setTeacher(null);
        localStorage.removeItem('teacher');
      }
      
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      return { success: true };
    } catch (error) {
      console.error('Login error:', error.response?.data);
      return { 
        success: false, 
        error: error.response?.data?.message || 'ការចូលប្រព័ន្ធបរាជ័យ' 
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await api.post('/register', userData);
      const { token, user, message } = response.data;
      
      localStorage.setItem('token', token);
      setToken(token);
      setUser(user);
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'ការបង្កើតគណនីបរាជ័យ' 
      };
    }
  };

  const logout = async () => {
    try {
      await api.post('/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('teacher');
      setToken(null);
      setUser(null);
      setTeacher(null);
      delete api.defaults.headers.common['Authorization'];
    }
  };

  const hasRole = (roleName) => {
    return user?.role?.role_name === roleName;
  };

  const getTeacherData = () => {
    return teacher || JSON.parse(localStorage.getItem('teacher') || 'null');
  };

  // មុខងារទាញយកឈ្មោះពេញ
  const getFullName = () => {
    if (hasRole('Teacher') && teacher) {
      return `${teacher.first_name || teacher.teacher_first_name || ''} ${teacher.last_name || teacher.teacher_last_name || ''}`.trim() || user?.first_name + ' ' + user?.last_name;
    }
    return `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
  };

  // មុខងារទាញយកអ៊ីមែល
  const getEmail = () => {
    if (hasRole('Teacher') && teacher) {
      return teacher.email || teacher.teacher_email || user?.email;
    }
    return user?.email;
  };

  return (
    <AuthContext.Provider value={{
      user,
      teacher: getTeacherData(),
      loading,
      login,
      register,
      logout,
      hasRole,
      isAuthenticated: !!user,
      getTeacherData,
      getFullName,
      getEmail,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
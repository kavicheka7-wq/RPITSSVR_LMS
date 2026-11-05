// src/services/metadataService.js
import api from './api';

let departmentsPromise = null;
let rolesPromise = null;
let coursesPromise = null;

/**
 * Get cached departments or fetch from API if not already cached.
 * Uses promise caching to avoid duplicate requests when multiple components mount simultaneously.
 * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data.
 * @returns {Promise<Array>}
 */
export const getCachedDepartments = async (forceRefresh = false) => {
  if (forceRefresh || !departmentsPromise) {
    departmentsPromise = api.get('/admin/departments')
      .then((res) => res.data?.data || res.data || [])
      .catch((err) => {
        departmentsPromise = null; // Do not cache failed requests
        throw err;
      });
  }
  return departmentsPromise;
};

/**
 * Get cached roles or fetch from API if not already cached.
 * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data.
 * @returns {Promise<Array>}
 */
export const getCachedRoles = async (forceRefresh = false) => {
  if (forceRefresh || !rolesPromise) {
    rolesPromise = api.get('/roles')
      .then((res) => res.data?.data || res.data || [])
      .catch((err) => {
        rolesPromise = null;
        throw err;
      });
  }
  return rolesPromise;
};

/**
 * Get cached courses or fetch from API if not already cached.
 * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data.
 * @returns {Promise<Array>}
 */
export const getCachedCourses = async (forceRefresh = false) => {
  if (forceRefresh || !coursesPromise) {
    coursesPromise = api.get('/admin/courses')
      .then((res) => res.data?.data || res.data || [])
      .catch((err) => {
        coursesPromise = null;
        throw err;
      });
  }
  return coursesPromise;
};

/**
 * Clear cached departments (e.g. after adding, updating, or deleting a department).
 */
export const clearDepartmentsCache = () => {
  departmentsPromise = null;
};

/**
 * Clear cached courses (e.g. after adding, updating, or deleting a course).
 */
export const clearCoursesCache = () => {
  coursesPromise = null;
};

/**
 * Clear all metadata caches.
 */
export const clearMetadataCache = () => {
  departmentsPromise = null;
  rolesPromise = null;
  coursesPromise = null;
};

export default {
  getCachedDepartments,
  getCachedRoles,
  getCachedCourses,
  clearDepartmentsCache,
  clearCoursesCache,
  clearMetadataCache,
};

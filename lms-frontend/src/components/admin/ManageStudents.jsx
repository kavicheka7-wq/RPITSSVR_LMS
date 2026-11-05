// // src/components/admin/ManageStudents.jsx
// import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
// import api from '../../services/api';
// import { getCachedDepartments, getCachedRoles, getCachedCourses } from '../../services/metadataService';
// import { toast } from 'react-toastify';
// import { useLanguage } from '../../context/LanguageContext';
// import * as XLSX from 'xlsx';
// import { 
//   PencilSquareIcon, 
//   TrashIcon, 
//   PlusIcon, 
//   UserGroupIcon,
//   XMarkIcon,
//   MagnifyingGlassIcon,
//   AcademicCapIcon,
//   BookOpenIcon,
//   ArrowDownTrayIcon,
//   ArrowUpTrayIcon,
//   DocumentArrowDownIcon,
//   CheckCircleIcon,
//   ExclamationCircleIcon,
//   ExclamationTriangleIcon
// } from '@heroicons/react/24/outline';

// const CACHE_KEY_STUDENTS = 'cached_admin_students_page1';
// const CACHE_KEY_STUDENTS_META = 'cached_admin_students_meta';

// const ManageStudents = () => {
//   const { t } = useLanguage();

//   // ✅ អានទិន្នន័យពី Cache មកបង្ហាញភ្លាមៗក្នុងពេល 0 វិនាទី
//   const [students, setStudents] = useState(() => {
//     try {
//       const cached = localStorage.getItem(CACHE_KEY_STUDENTS);
//       return cached ? JSON.parse(cached) : [];
//     } catch {
//       return [];
//     }
//   });

//   const [loading, setLoading] = useState(students.length === 0);
//   const [showModal, setShowModal] = useState(false);
//   const [editingStudent, setEditingStudent] = useState(null);
//   const [departments, setDepartments] = useState([]);
//   const [studentRoleId, setStudentRoleId] = useState(null);
//   const [searchTerm, setSearchTerm] = useState('');
//   const [debouncedSearch, setDebouncedSearch] = useState('');
//   const [previewImage, setPreviewImage] = useState(null);
  
//   // ✅ Ref សម្រាប់ផ្តាច់ API Request ចាស់ៗពេលវាយ Search លឿនៗ
//   const abortControllerRef = useRef(null);
  
//   // ✅ Pagination States
//   const [page, setPage] = useState(1);
//   const [perPage] = useState(15);
//   const [meta, setMeta] = useState(() => {
//     try {
//       const cached = localStorage.getItem(CACHE_KEY_STUDENTS_META);
//       return cached ? JSON.parse(cached) : { current_page: 1, last_page: 1, total: 0, per_page: 15 };
//     } catch {
//       return { current_page: 1, last_page: 1, total: 0, per_page: 15 };
//     }
//   });
  
//   // Custom Delete Modal States
//   const [showDeleteModal, setShowDeleteModal] = useState(false);
//   const [studentToDelete, setStudentToDelete] = useState(null);

//   // Import states
//   const [showImportModal, setShowImportModal] = useState(false);
//   const [importPreview, setImportPreview] = useState([]);
//   const [isImporting, setIsImporting] = useState(false);
  
//   // States for student course enrollments
//   const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
//   const [selectedStudent, setSelectedStudent] = useState(null);
//   const [studentEnrollments, setStudentEnrollments] = useState([]);
//   const [allCourses, setAllCourses] = useState([]);
//   const [loadingEnrollments, setLoadingEnrollments] = useState(false);
//   const [selectedCourseToEnroll, setSelectedCourseToEnroll] = useState('');
  
//   const [formData, setFormData] = useState({
//     first_name: '',
//     last_name: '',
//     email: '',
//     password: '',
//     status: 'active',
//     gender: 'Male',
//     phone: '',
//     student_code: '',
//     department_id: '',
//     batch_year: '',
//     degree_level: '',
//     study_shift: 'Monday-Friday',
//     date_of_birth: '',
//     address: '',
//     profile_image: null,
//   });

//   // ✅ កែសម្រួល Debounce សម្រាប់ Search ឱ្យដើរលឿន (150ms) និងទាញ Cache ភ្លាមពេលលុបអក្សរ
//   useEffect(() => {
//     if (!searchTerm.trim()) {
//       setDebouncedSearch('');
//       setPage(1);
//       try {
//         const cached = localStorage.getItem(CACHE_KEY_STUDENTS);
//         const cachedMeta = localStorage.getItem(CACHE_KEY_STUDENTS_META);
//         if (cached) setStudents(JSON.parse(cached));
//         if (cachedMeta) setMeta(JSON.parse(cachedMeta));
//       } catch {}
//       return;
//     }

//     const timer = setTimeout(() => {
//       setDebouncedSearch(searchTerm.trim());
//       setPage(1); // Reset page ពេល search ផ្លាស់ប្តូរ
//     }, 150);
//     return () => clearTimeout(timer);
//   }, [searchTerm]);

//   // ✅ Instant Local Search: ចម្រាញ់ទិន្នន័យភ្លាមៗក្នុងពេល 0 វិនាទី ពេលអ្នកប្រើកំពុងវាយអក្សរ
//   const displayedStudents = useMemo(() => {
//     if (!searchTerm.trim()) return students;
//     const q = searchTerm.toLowerCase().trim();
//     return students.filter((student) => {
//       const fullName = `${student.first_name || ''} ${student.last_name || ''}`.toLowerCase();
//       const reverseName = `${student.last_name || ''} ${student.first_name || ''}`.toLowerCase();
//       return (
//         fullName.includes(q) ||
//         reverseName.includes(q) ||
//         student.first_name?.toLowerCase().includes(q) ||
//         student.last_name?.toLowerCase().includes(q) ||
//         student.email?.toLowerCase().includes(q) ||
//         student.student_code?.toLowerCase().includes(q) ||
//         student.batch_year?.toLowerCase().includes(q)
//       );
//     });
//   }, [students, searchTerm]);

//   // ✅ Initial Load (Metadata only, does not block student table)
//   useEffect(() => {
//     const loadInitialData = async () => {
//       try {
//         await Promise.all([
//           fetchDepartments(),
//           fetchStudentRole()
//         ]);
//       } catch (error) {
//         console.error("Error loading initial metadata", error);
//       }
//     };
//     loadInitialData();
//   }, []);

//   // ✅ Fetch students ពេល page ឬ debouncedSearch ផ្លាស់ប្តូរ
//   useEffect(() => {
//     fetchStudents();
//   }, [page, debouncedSearch]);

//   const fetchStudents = async () => {
//     // ផ្តាច់ Request ចាស់ចោលភ្លាម បើអ្នកប្រើវាយអក្សរថ្មីទៀត
//     if (abortControllerRef.current) {
//       abortControllerRef.current.abort();
//     }
//     const controller = new AbortController();
//     abortControllerRef.current = controller;

//     if (students.length === 0) setLoading(true);
//     try {
//       const response = await api.get('/admin/students', {
//         params: {
//           page,
//           per_page: perPage,
//           search: debouncedSearch,
//         },
//         signal: controller.signal,
//       });
//       const studentList = response.data.data || [];
//       const studentMeta = response.data.meta || { current_page: 1, last_page: 1, total: 0, per_page: perPage };
//       setStudents(studentList);
//       setMeta(studentMeta);

//       // Cache page 1 when no search query
//       if (page === 1 && !debouncedSearch) {
//         try {
//           localStorage.setItem(CACHE_KEY_STUDENTS, JSON.stringify(studentList));
//           localStorage.setItem(CACHE_KEY_STUDENTS_META, JSON.stringify(studentMeta));
//         } catch (e) {
//           console.warn('Failed to cache students:', e);
//         }
//       }
//     } catch (error) {
//       if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
//         return; // មិនបង្ហាញ Error ទេ ពេល Request ត្រូវបានផ្តាច់ដោយសារការវាយ Search ថ្មី
//       }
//       console.error('Error fetching students:', error);
//       toast.error(t('មិនអាចទាញយកទិន្នន័យសិស្សបានទេ', 'Cannot fetch students data'));
//     } finally {
//       if (!controller.signal.aborted) {
//         setLoading(false);
//       }
//     }
//   };

//   const fetchDepartments = async () => {
//     try {
//       const data = await getCachedDepartments();
//       setDepartments(data || []);
//     } catch (error) {
//       console.error('Error fetching departments:', error);
//     }
//   };

//   const fetchStudentRole = async () => {
//     try {
//       const rolesData = await getCachedRoles();
//       const studentRole = rolesData.find(r => r.role_name === 'Student' || r.name === 'Student');
//       if (studentRole) {
//         setStudentRoleId(studentRole.id);
//       }
//     } catch (error) {
//       console.error('Error fetching student role:', error);
//     }
//   };

//   const handleInputChange = (e) => {
//     const { name, value } = e.target;
//     setFormData({ ...formData, [name]: value });
//   };

//   const handleFileChange = (e) => {
//     const file = e.target.files[0];
//     if (file) {
//       setFormData({ ...formData, profile_image: file });
//       const reader = new FileReader();
//       reader.onloadend = () => setPreviewImage(reader.result);
//       reader.readAsDataURL(file);
//     }
//   };

//   // ✅ កែសម្រួល handleSubmit៖ បង្កើត និងកែប្រែសិស្សដោយ Update State លើអេក្រង់ភ្លាមៗ (មិនហៅ fetchStudents ឡើងវិញ)
//   const handleSubmit = async (e) => {
//     e.preventDefault();
    
//     if (!studentRoleId) {
//       toast.error(t('មិនអាចទាញយកតួនាទីសិស្សបានទេ', 'Cannot fetch student role'));
//       return;
//     }

//     try {
//       if (editingStudent) {
//         const formDataToSend = new FormData();
//         Object.keys(formData).forEach(key => {
//           if (key === 'profile_image') {
//             if (formData[key] instanceof File) formDataToSend.append(key, formData[key]);
//           } else if (formData[key] !== null && formData[key] !== undefined && formData[key] !== '') {
//             formDataToSend.append(key, formData[key]);
//           }
//         });
//         formDataToSend.append('role_id', studentRoleId);
//         if (!formData.password) formDataToSend.delete('password');
//         formDataToSend.append('_method', 'PUT');
        
//         const response = await api.post(`/admin/students/${editingStudent.id}`, formDataToSend, {
//           headers: { 'Content-Type': 'multipart/form-data' },
//         });
//         const updatedStudent = response.data.data;

//         setStudents(prev => {
//           const newList = prev.map(s => s.id === editingStudent.id ? updatedStudent : s);
//           if (page === 1 && !debouncedSearch) {
//             try { localStorage.setItem(CACHE_KEY_STUDENTS, JSON.stringify(newList)); } catch (e) {}
//           }
//           return newList;
//         });

//         toast.success(t('បានកែប្រែព័ត៌មានសិស្សដោយជោគជ័យ', 'Student updated successfully'));
//       } else {
//         const formDataToSend = new FormData();
//         Object.keys(formData).forEach(key => {
//           if (formData[key] !== null && formData[key] !== undefined && formData[key] !== '') {
//             formDataToSend.append(key, formData[key]);
//           }
//         });
//         formDataToSend.append('role_id', studentRoleId);
//         if (!formData.profile_image) formDataToSend.delete('profile_image');
        
//         const response = await api.post('/admin/students', formDataToSend, {
//           headers: { 'Content-Type': 'multipart/form-data' },
//         });
//         const newStudent = response.data.data;

//         setStudents(prev => {
//           const newList = [newStudent, ...prev].slice(0, perPage);
//           if (page === 1 && !debouncedSearch) {
//             try { localStorage.setItem(CACHE_KEY_STUDENTS, JSON.stringify(newList)); } catch (e) {}
//           }
//           return newList;
//         });
//         setMeta(prev => {
//           const newMeta = { ...prev, total: (prev.total || 0) + 1 };
//           try { localStorage.setItem(CACHE_KEY_STUDENTS_META, JSON.stringify(newMeta)); } catch (e) {}
//           return newMeta;
//         });

//         toast.success(t('បានបន្ថែមសិស្សដោយជោគជ័យ', 'Student created successfully'));
//       }
      
//       setShowModal(false);
//       resetForm();
      
//     } catch (error) {
//       console.error('Submit error:', error.response?.data);
//       if (error.response?.data?.errors) {
//         const errors = error.response.data.errors;
//         const errorMessages = Object.values(errors).flat().join('\n');
//         toast.error(errorMessages);
//       } else {
//         toast.error(error.response?.data?.message || t('ការធ្វើប្រតិបត្តិការបានបរាជ័យ', 'Operation failed'));
//       }
//     }
//   };

//   const handleDeleteClick = (student) => {
//     setStudentToDelete(student);
//     setShowDeleteModal(true);
//   };

//   // ✅ កែសម្រួល confirmDelete៖ លុបឈ្មោះសិស្សចេញពីអេក្រង់ និងបិទ Modal ភ្លាមៗក្នុង 0 វិនាទី (Optimistic UI)
//   const confirmDelete = async () => {
//     if (!studentToDelete) return;
    
//     const deletedId = studentToDelete.id;
//     const previousStudents = [...students];
//     const previousMeta = { ...meta };

//     setShowDeleteModal(false);
//     setStudentToDelete(null);

//     setStudents(prev => {
//       const newList = prev.filter(s => s.id !== deletedId);
//       if (page === 1 && !debouncedSearch) {
//         try { localStorage.setItem(CACHE_KEY_STUDENTS, JSON.stringify(newList)); } catch (e) {}
//       }
//       return newList;
//     });
//     setMeta(prev => {
//       const newMeta = { ...prev, total: Math.max(0, (prev.total || 1) - 1) };
//       try { localStorage.setItem(CACHE_KEY_STUDENTS_META, JSON.stringify(newMeta)); } catch (e) {}
//       return newMeta;
//     });

//     try {
//       await api.delete(`/admin/students/${deletedId}`);
//       toast.success(t('បានលុបសិស្សដោយជោគជ័យ', 'Student deleted successfully'));
//     } catch (error) {
//       setStudents(previousStudents);
//       setMeta(previousMeta);
//       toast.error(error.response?.data?.message || t('មិនអាចលុបសិស្សបានទេ', 'Cannot delete student'));
//     }
//   };

//   const openEnrollmentModal = async (student) => {
//     setSelectedStudent(student);
//     setShowEnrollmentModal(true);
//     try {
//       const enrollmentsRes = await api.get(`/admin/students/${student.id}/enrollments`);
//       setStudentEnrollments(enrollmentsRes.data.data || []);
//       const coursesData = await getCachedCourses();
//       setAllCourses(coursesData || []);
//       setSelectedCourseToEnroll('');
//     } catch (error) {
//       console.error('Error fetching enrollment details:', error);
//       toast.error(t('មិនអាចទាញយកព័ត៌មានចុះឈ្មោះបានទេ', 'Cannot fetch enrollment details'));
//     }
//   };

//   const handleEnrollCourse = async (e) => {
//     e.preventDefault();
//     if (!selectedCourseToEnroll) {
//       toast.error(t('សូមជ្រើសរើសមុខវិជ្ជា', 'Please select a course'));
//       return;
//     }
    
//     try {
//       await api.post(`/admin/students/${selectedStudent.id}/enrollments`, {
//         course_ids: [parseInt(selectedCourseToEnroll)]
//       });
//       toast.success(t('បានចុះឈ្មោះមុខវិជ្ជាដោយជោគជ័យ', 'Course enrolled successfully'));
//       const enrollmentsRes = await api.get(`/admin/students/${selectedStudent.id}/enrollments`);
//       setStudentEnrollments(enrollmentsRes.data.data || []);
//       setSelectedCourseToEnroll('');
//     } catch (error) {
//       toast.error(error.response?.data?.message || t('មិនអាចចុះឈ្មោះមុខវិជ្ជាបានទេ', 'Cannot enroll course'));
//     }
//   };

//   const handleUnenrollCourse = async (courseId) => {
//     if (window.confirm(t('តើអ្នកប្រាកដថាចង់លុបមុខវិជ្ជានេះចេញពីសិស្សនេះមែនទេ?', 'Are you sure you want to unenroll student from this course?'))) {
//       try {
//         await api.delete(`/admin/students/${selectedStudent.id}/enrollments/${courseId}`);
//         toast.success(t('បានលុបមុខវិជ្ជាចេញពីសិស្សដោយជោគជ័យ', 'Course unenrolled successfully'));
//         const enrollmentsRes = await api.get(`/admin/students/${selectedStudent.id}/enrollments`);
//         setStudentEnrollments(enrollmentsRes.data.data || []);
//       } catch (error) {
//         toast.error(t('មិនអាចលុបមុខវិជ្ជាចេញពីសិស្សបានទេ', 'Cannot unenroll course'));
//       }
//     }
//   };

//   const resetForm = () => {
//     setFormData({
//       first_name: '', last_name: '', email: '', password: '', status: 'active',
//       gender: 'Male', phone: '', student_code: '', department_id: '',
//       batch_year: '', degree_level: '', study_shift: 'Monday-Friday',
//       date_of_birth: '', address: '', profile_image: null,
//     });
//     setPreviewImage(null);
//     setEditingStudent(null);
//   };

//   const openCreateModal = () => {
//     resetForm();
//     setShowModal(true);
//   };

//   const openEditModal = (student) => {
//     setEditingStudent(student);
//     setFormData({
//       first_name: student.first_name || '',
//       last_name: student.last_name || '',
//       email: student.email || '',
//       password: '',
//       status: student.user?.status || 'active',
//       gender: student.gender || 'Male',
//       phone: student.phone || '',
//       student_code: student.student_code || '',
//       department_id: student.department_id || '',
//       batch_year: student.batch_year || '',
//       degree_level: student.degree_level || '',
//       study_shift: student.study_shift || 'Monday-Friday',
//       date_of_birth: student.date_of_birth || '',
//       address: student.address || '',
//       profile_image: null,
//     });
//     setPreviewImage(student.profile_image ? getProfileImageUrl(student.profile_image) : null);
//     setShowModal(true);
//   };

//   const handleExportExcel = async () => {
//     try {
//       toast.info(t('កំពុងរៀបចំទិន្នន័យសម្រាប់នាំចេញ...', 'Preparing data for export...'));

//       const response = await api.get('/admin/students/export-all', {
//         responseType: 'blob',
//       });

//       const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }));
//       const link = document.createElement('a');
//       link.href = url;
//       link.setAttribute('download', `Students_List_${new Date().toISOString().slice(0, 10)}.csv`);
//       document.body.appendChild(link);
//       link.click();
//       link.remove();
//       window.URL.revokeObjectURL(url);

//       toast.success(t('បាននាំចេញទិន្នន័យសិស្សជោគជ័យ', 'Exported successfully'));
//     } catch (error) {
//       console.error('Export error:', error);
//       toast.error(t('បរាជ័យក្នុងការនាំចេញ', 'Failed to export'));
//     }
//   };

//   const handleDownloadTemplate = () => {
//     const templateData = [
//       {
//         'first_name': 'Chan', 'last_name': 'Vichai', 'email': 'chan.vichai@example.com',
//         'phone': '012345678', 'gender': 'Male', 'student_code': 'STU-2026-0001',
//         'department': departments[0]?.department_name || 'Computer Science',
//         'batch_year': 'Batch 15', 'degree_level': 'Bachelor Degree',
//         'study_shift': 'Monday-Friday', 'address': 'Phnom Penh',
//         'date_of_birth': '2004-03-10', 'password': 'Password123'
//       },
//     ];

//     const worksheet = XLSX.utils.json_to_sheet(templateData);
//     worksheet['!cols'] = [
//       { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 10 },
//       { wch: 18 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 18 },
//       { wch: 20 }, { wch: 15 }, { wch: 15 }
//     ];

//     const workbook = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
//     XLSX.writeFile(workbook, 'student_import_template.xlsx');
//     toast.success(t('បានទាញយកទម្រង់គំរូ Excel ដោយជោគជ័យ', 'Downloaded Excel sample template successfully'));
//   };

//   const findDepartmentId = (deptNameOrCode) => {
//     if (!deptNameOrCode) return null;
//     const search = deptNameOrCode.toString().trim().toLowerCase();
//     const found = departments.find(d => 
//       (d.department_name && d.department_name.toLowerCase() === search) ||
//       (d.department_code && d.department_code.toLowerCase() === search) ||
//       (d.name && d.name.toLowerCase() === search) ||
//       (d.id && d.id.toString() === search)
//     );
//     return found ? found.id : null;
//   };

//   const normalizeHeaderKey = (key) => {
//     const k = key.toString().trim().toLowerCase();
//     if (k.includes('first') || k.includes('នាមខ្លួន')) return 'first_name';
//     if (k.includes('last') || k.includes('នាមត្រកូល')) return 'last_name';
//     if (k.includes('email') || k.includes('អ៊ីមែល')) return 'email';
//     if (k.includes('phone') || k.includes('ទូរស័ព្ទ')) return 'phone';
//     if (k.includes('code') || k.includes('អត្តលេខ')) return 'student_code';
//     if (k.includes('gender') || k.includes('ភេទ')) return 'gender';
//     if (k.includes('department') || k.includes('ដេប៉ាតឺម៉ង់')) return 'department';
//     if (k.includes('batch') || k.includes('ជំនាន់')) return 'batch_year';
//     if (k.includes('degree') || k.includes('កម្រិត')) return 'degree_level';
//     if (k.includes('shift') || k.includes('វេន')) return 'study_shift';
//     if (k.includes('address') || k.includes('អាសយដ្ឋាន')) return 'address';
//     if (k.includes('birth') || k.includes('កំណើត') || k.includes('dob')) return 'date_of_birth';
//     if (k.includes('password') || k.includes('ពាក្យសម្ងាត់')) return 'password';
//     if (k.includes('status') || k.includes('ស្ថានភាព')) return 'status';
//     return key;
//   };

//   const handleFileUpload = (e) => {
//     const file = e.target.files[0];
//     if (!file) return;

//     const reader = new FileReader();
//     reader.onload = (evt) => {
//       setTimeout(() => {
//         try {
//           const data = evt.target.result;
//           const workbook = XLSX.read(data, { type: 'array' });
//           const worksheet = workbook.Sheets[workbook.SheetNames[0]];
//           const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

//           if (!rawJson || rawJson.length === 0) {
//             toast.warning(t('ឯកសារ Excel គ្មានទិន្នន័យទេ', 'Excel file contains no data'));
//             return;
//           }

//           const existingEmails = new Set(students.map(s => s.email?.toLowerCase()));
//           const fileEmails = new Set();

//           const parsedRows = rawJson.map((row, idx) => {
//             const item = {};
//             Object.keys(row).forEach(k => {
//               item[normalizeHeaderKey(k)] = row[k]?.toString().trim();
//             });

//             const errors = [];
//             if (!item.first_name) errors.push(t('ខ្វះនាមខ្លួន', 'Missing First Name'));
//             if (!item.last_name) errors.push(t('ខ្វះនាមត្រកូល', 'Missing Last Name'));
//             if (!item.email) {
//               errors.push(t('ខ្វះអ៊ីមែល', 'Missing Email'));
//             } else {
//               const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//               if (!emailRegex.test(item.email)) {
//                 errors.push(t('អ៊ីមែលមិនត្រឹមត្រូវ', 'Invalid Email Format'));
//               } else if (existingEmails.has(item.email.toLowerCase())) {
//                 errors.push(t('អ៊ីមែលនេះមានក្នុងប្រព័ន្ធរួចហើយ', 'Email already exists'));
//               } else if (fileEmails.has(item.email.toLowerCase())) {
//                 errors.push(t('អ៊ីមែលស្ទួនក្នុងឯកសារនេះ', 'Duplicate email in file'));
//               } else {
//                 fileEmails.add(item.email.toLowerCase());
//               }
//             }

//             let gender = item.gender;
//             if (gender === 'ប្រុស' || gender === 'Male' || gender === 'M') gender = 'Male';
//             else if (gender === 'ស្រី' || gender === 'Female' || gender === 'F') gender = 'Female';
//             else if (gender) gender = 'Other';
//             else gender = 'Male';

//             let studyShift = item.study_shift;
//             if (studyShift === 'ចន្ទ-សុក្រ' || studyShift === 'Monday-Friday') studyShift = 'Monday-Friday';
//             else if (studyShift === 'សៅរ៍-អាទិត្យ' || studyShift === 'Saturday-Sunday') studyShift = 'Saturday-Sunday';
//             else studyShift = 'Monday-Friday';

//             return {
//               rowIndex: idx + 2,
//               raw: row,
//               data: {
//                 first_name: item.first_name || '',
//                 last_name: item.last_name || '',
//                 email: item.email || '',
//                 phone: item.phone || '',
//                 gender: gender,
//                 student_code: item.student_code || '',
//                 department_id: findDepartmentId(item.department),
//                 batch_year: item.batch_year || '',
//                 degree_level: item.degree_level || '',
//                 study_shift: studyShift,
//                 address: item.address || '',
//                 date_of_birth: item.date_of_birth || '',
//                 password: item.password || '12345678',
//                 status: item.status || 'active'
//               },
//               isValid: errors.length === 0,
//               errors
//             };
//           });

//           setImportPreview(parsedRows);
//         } catch (err) {
//           console.error('File parsing error:', err);
//           toast.error(t('មិនអាចអានឯកសារ Excel បានទេ', 'Cannot read Excel file'));
//         }
//       }, 0);
//     };
//     reader.readAsArrayBuffer(file);
//   };

//   const handleConfirmImport = async () => {
//     if (!importPreview || importPreview.length === 0) return;
//     const validItems = importPreview.filter(r => r.isValid).map(r => r.data);

//     if (validItems.length === 0) {
//       toast.warning(t('គ្មានទិន្នន័យត្រឹមត្រូវសម្រាប់នាំចូលទេ', 'No valid data to import'));
//       return;
//     }

//     setIsImporting(true);
//     try {
//       const response = await api.post('/admin/students/import', { students: validItems });
//       try {
//         localStorage.removeItem(CACHE_KEY_STUDENTS);
//         localStorage.removeItem(CACHE_KEY_STUDENTS_META);
//       } catch (e) {}
//       toast.success(response.data?.message || t(`បាននាំចូលសិស្ស ${validItems.length} នាក់ដោយជោគជ័យ`, `Imported ${validItems.length} students successfully`));
//       setShowImportModal(false);
//       setImportPreview([]);
//       fetchStudents();
//     } catch (error) {
//       toast.error(error.response?.data?.message || t('ការនាំចូលទិន្នន័យបានបរាជ័យ', 'Failed to import data'));
//     } finally {
//       setIsImporting(false);
//     }
//   };

//   const getStudyShiftLabel = (shift) => {
//     const shifts = {
//       'Monday-Friday': t('ចន្ទ-សុក្រ', 'Monday-Friday'),
//       'Saturday-Sunday': t('សៅរ៍-អាទិត្យ', 'Saturday-Sunday')
//     };
//     return shifts[shift] || shift || '—';
//   };

//   const getDegreeLevelLabel = (level) => {
//     const levels = {
//       'Associate Degree': t('បរិញ្ញាបត្ររង', 'Associate Degree'),
//       'Bachelor Degree': t('បរិញ្ញាបត្រ', 'Bachelor Degree'),
//       'Master Degree': t('បរិញ្ញាបត្រជាន់ខ្ពស់', 'Master Degree')
//     };
//     return levels[level] || level || '—';
//   };

//   const getProfileImageUrl = (imagePath) => {
//     if (!imagePath) return null;
//     if (imagePath.startsWith('http')) return imagePath;
//     const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
//     return `${baseUrl}/storage/${imagePath}`;
//   };

//   return (
//     <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen space-y-6">
      
//       {/* Header Banner */}
//       <div className="relative overflow-hidden rounded-3xl bg-linear-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-8 shadow-xl border border-blue-900">
//         <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none"></div>
//         <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        
//         <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
//           <div className="space-y-3">
//             <h1 className="text-[28px] sm:text-3xl font-extrabold tracking-tight">
//               {t('គ្រប់គ្រងសិស្ស', 'Manage Students')}
//             </h1>
//             <p className="text-blue-200/80 text-sm max-w-xl font-medium">
//               {t('បន្ថែម និងគ្រប់គ្រងគណនីសិស្សក្នុងប្រព័ន្ធ លុប កែប្រែ ឬនាំចូលពី Excel ។', 'Add and manage student accounts in the system, edit, delete, or import from Excel.')}
//             </p>
//           </div>

//           <div className="flex flex-wrap items-center gap-3 shrink-0">
//             <button onClick={handleExportExcel} className="inline-flex items-center justify-center px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer">
//               <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
//               {t('នាំចេញ Excel', 'Export Excel')}
//             </button>
            
//             <button
//               onClick={() => { setImportPreview([]); setShowImportModal(true); }}
//               className="inline-flex items-center justify-center px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer"
//             >
//               <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
//               {t('នាំចូល Excel', 'Import Excel')}
//             </button>
            
//             <button onClick={openCreateModal} className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer">
//               <PlusIcon className="h-5 w-5 mr-2" />
//               {t('បន្ថែមសិស្ស', 'Add Student')}
//             </button>
//           </div>
//         </div>
//       </div>

//       {/* Search Box */}
//       <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:flex-row gap-5 items-center justify-between">
//         <div className="relative w-full shrink-0">
//           <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
//           <input
//             type="text"
//             placeholder={t('ស្វែងរកតាមឈ្មោះ អ៊ីមែល អត្តលេខ ឬជំនាន់...', 'Search by name, email, code or batch...')}
//             value={searchTerm}
//             onChange={(e) => setSearchTerm(e.target.value)}
//             className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50/50 hover:bg-gray-50 focus:bg-white font-medium text-gray-800 transition-all shadow-sm"
//           />
//         </div>
//       </div>

//       {/* Main Table */}
//       <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
//         <div className="px-6 py-5 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-4">
//           <div className="flex items-center gap-3">
//             <h2 className="text-[18px] font-extrabold text-gray-900">{t('បញ្ជីសិស្ស', 'Students List')}</h2>
//             <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-100">
//               {searchTerm.trim() ? displayedStudents.length : (meta.total || 0)} {t('នាក់', 'Students')}
//             </span>
//           </div>
//         </div>

//         <div className="overflow-x-auto">
//           <table className="min-w-full divide-y divide-gray-100">
//             <thead className="bg-gray-50 border-b border-gray-100">
//               <tr>
//                 <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t('សិស្ស', 'Student')}</th>
//                 <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t('អត្តលេខ', 'Student Code')}</th>
//                 <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t('អ៊ីមែល', 'Email')}</th>
//                 <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t('ដេប៉ាតឺម៉ង់', 'Department')}</th>
//                 <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t('វេនសិក្សា', 'Study Shift')}</th>
//                 <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t('ស្ថានភាព', 'Status')}</th>
//                 <th className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t('សកម្មភាព', 'Actions')}</th>
//               </tr>
//             </thead>
//             <tbody className="bg-white divide-y divide-gray-100">
//               {displayedStudents.length === 0 && loading ? (
//                 [...Array(6)].map((_, i) => (
//                   <tr key={`skel-std-${i}`} className="animate-pulse">
//                     <td className="px-6 py-4 flex items-center gap-3">
//                       <div className="h-10 w-10 rounded-full bg-gray-200 shrink-0"></div>
//                       <div className="space-y-1.5">
//                         <div className="h-4 w-32 bg-gray-200 rounded"></div>
//                         <div className="h-3 w-16 bg-gray-100 rounded"></div>
//                       </div>
//                     </td>
//                     <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded"></div></td>
//                     <td className="px-6 py-4"><div className="h-4 w-36 bg-gray-200 rounded"></div></td>
//                     <td className="px-6 py-4"><div className="h-4 w-28 bg-gray-200 rounded"></div></td>
//                     <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded"></div></td>
//                     <td className="px-6 py-4"><div className="h-5 w-16 bg-gray-200 rounded-full"></div></td>
//                     <td className="px-6 py-4 text-center"><div className="h-8 w-16 bg-gray-200 rounded-xl mx-auto"></div></td>
//                   </tr>
//                 ))
//               ) : displayedStudents.length === 0 ? (
//                 <tr>
//                   <td colSpan="7" className="px-6 py-16 text-center text-gray-500">
//                     <div className="flex flex-col items-center">
//                       <UserGroupIcon className="h-16 w-16 text-gray-300 mb-3" />
//                       <p className="font-bold text-gray-600 text-base">
//                         {searchTerm ? t('មិនឃើញលទ្ធផលស្វែងរក', 'No search results found') : t('មិនទាន់មានសិស្សនៅឡើយទេ', 'No students available yet')}
//                       </p>
//                     </div>
//                   </td>
//                 </tr>
//               ) : (
//                     displayedStudents.map((student) => (
//                       <tr key={student.id} className="hover:bg-blue-50/30 transition-colors">
//                         <td className="px-6 py-4 whitespace-nowrap">
//                           <div className="flex items-center">
//                             <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold overflow-hidden shrink-0 shadow-sm">
//                               {student.profile_image ? (
//                                 <img 
//                                   src={getProfileImageUrl(student.profile_image)}
//                                   alt={`${student.first_name} ${student.last_name}`}
//                                   className="h-full w-full object-cover rounded-full"
//                                   onError={(e) => {
//                                     e.target.style.display = 'none';
//                                     e.target.parentElement.innerHTML = `<span>${student.first_name?.charAt(0) || ''}${student.last_name?.charAt(0) || ''}</span>`;
//                                   }}
//                                 />
//                               ) : (
//                                 <span>{student.first_name?.charAt(0) || ''}{student.last_name?.charAt(0) || ''}</span>
//                               )}
//                             </div>
//                             <div className="ml-3">
//                               <div className="text-sm font-extrabold text-gray-900">
//                                 {student.first_name} {student.last_name}
//                               </div>
//                               <div className="text-xs text-gray-500 font-medium">
//                                 {getDegreeLevelLabel(student.degree_level) || '—'}
//                               </div>
//                             </div>
//                           </div>
//                         </td>
//                         <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-600">
//                           {student.student_code || '—'}
//                         </td>
//                         <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">
//                           {student.email}
//                         </td>
//                         <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">
//                           {student.department?.name || student.department?.department_name || '—'}
//                         </td>
//                         <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">
//                           {getStudyShiftLabel(student.study_shift)}
//                         </td>
//                         <td className="px-6 py-4 whitespace-nowrap">
//                           <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold border ${
//                             student.user?.status === 'active' 
//                               ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
//                               : 'bg-rose-50 text-rose-700 border-rose-100'
//                           }`}>
//                             {student.user?.status === 'active' ? t('សកម្ម', 'Active') : t('អសកម្ម', 'Inactive')}
//                           </span>
//                         </td>
//                         <td className="px-6 py-4 whitespace-nowrap text-center">
//                           <div className="flex items-center justify-center space-x-2">
//                             <button
//                               onClick={() => openEnrollmentModal(student)}
//                               className="p-2 text-emerald-600 hover:text-emerald-900 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 rounded-xl transition-all"
//                               title={t('ចុះឈ្មោះមុខវិជ្ជា', 'Manage Courses')}
//                             >
//                               <BookOpenIcon className="h-5 w-5" />
//                             </button>
//                             <button
//                               onClick={() => openEditModal(student)}
//                               className="p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-xl transition-all"
//                               title={t('កែប្រែ', 'Edit')}
//                             >
//                               <PencilSquareIcon className="h-5 w-5" />
//                             </button>
//                             <button
//                               onClick={() => handleDeleteClick(student)}
//                               className="p-2 text-rose-600 hover:text-rose-900 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition-all"
//                               title={t('លុប', 'Delete')}
//                             >
//                               <TrashIcon className="h-5 w-5" />
//                             </button>
//                           </div>
//                         </td>
//                       </tr>
//                     ))
//                   )}
//                 </tbody>
//               </table>
//             </div>

//             {/* ✅ Pagination */}
//             {meta.last_page > 1 && (
//               <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
//                 <p className="text-xs font-bold text-gray-600">
//                   {t('ទំព័រ', 'Page')} {meta.current_page} / {meta.last_page} ({meta.total} {t('នាក់', 'total')})
//                 </p>
//                 <div className="flex items-center gap-2">
//                   <button
//                     onClick={() => setPage(p => Math.max(1, p - 1))}
//                     disabled={meta.current_page === 1}
//                     className="px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
//                   >
//                     {t('មុន', 'Previous')}
//                   </button>
//                   {[...Array(Math.min(5, meta.last_page))].map((_, i) => {
//                     const pageNum = i + 1;
//                     return (
//                       <button
//                         key={pageNum}
//                         onClick={() => setPage(pageNum)}
//                         className={`px-3 py-2 text-xs font-bold rounded-xl transition-all ${
//                           meta.current_page === pageNum
//                             ? 'bg-blue-900 text-white'
//                             : 'bg-white border border-gray-200 hover:bg-gray-50'
//                         }`}
//                       >
//                         {pageNum}
//                       </button>
//                     );
//                   })}
//                   <button
//                     onClick={() => setPage(p => Math.min(meta.last_page, p + 1))}
//                     disabled={meta.current_page === meta.last_page}
//                     className="px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
//                   >
//                     {t('បន្ទាប់', 'Next')}
//                   </button>
//                 </div>
//               </div>
//             )}
//         </div>

//       {/* Modal - Create/Edit Student */}
//       {showModal && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
//           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">
//             <div className="flex justify-between items-center p-6 sm:p-8 border-b border-gray-100">
//               <h2 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
//                 <span className="bg-indigo-100 text-indigo-600 p-2.5 rounded-xl border border-indigo-200">
//                   <UserGroupIcon className="h-6 w-6" />
//                 </span>
//                 {editingStudent ? t('កែប្រែសិស្ស', 'Edit Student') : t('បន្ថែមសិស្សថ្មី', 'Add New Student')}
//               </h2>
//               <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
//                 <XMarkIcon className="h-6 w-6" />
//               </button>
//             </div>
            
//             <div className="p-6 sm:p-8 overflow-y-auto flex-1">
//               <form id="studentForm" onSubmit={handleSubmit} className="space-y-5">
//                 <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center gap-2">
//                   <AcademicCapIcon className="h-5 w-5 text-indigo-600" />
//                   <span className="text-sm text-indigo-700 font-medium">
//                     <strong>{t('តួនាទី៖', 'Role:')}</strong> {t('សិស្ស (កំណត់ដោយស្វ័យប្រវត្តិ)', 'Student (Auto-assigned)')}
//                   </span>
//                 </div>

//                 {/* ✅ កន្លែងដាក់រូបភាពរាងមូល (Circular Profile Image Upload) */}
//                 <div className="flex flex-col items-center justify-center py-2">
//                   <div className="relative group">
//                     <div className="h-24 w-24 rounded-full bg-indigo-50 border-2 border-dashed border-indigo-300 flex items-center justify-center overflow-hidden shadow-sm">
//                       {previewImage ? (
//                         <img
//                           src={previewImage}
//                           alt="Preview"
//                           className="h-full w-full object-cover rounded-full"
//                         />
//                       ) : (
//                         <span className="text-2xl font-extrabold text-indigo-400">
//                           {formData.first_name?.charAt(0) || formData.last_name?.charAt(0)
//                             ? `${formData.first_name?.charAt(0) || ''}${formData.last_name?.charAt(0) || ''}`
//                             : '+'}
//                         </span>
//                       )}
//                     </div>
//                     <label
//                       htmlFor="profile_image_input"
//                       className="mt-2 inline-block text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer text-center w-full"
//                     >
//                       {t('ជ្រើសរើសរូបភាព', 'Choose Photo')}
//                     </label>
//                     <input
//                       id="profile_image_input"
//                       type="file"
//                       accept="image/*"
//                       onChange={handleFileChange}
//                       className="hidden"
//                     />
//                   </div>
//                 </div>

//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('នាមខ្លួន', 'First Name')} <span className="text-rose-500">*</span></label>
//                     <input type="text" name="first_name" required value={formData.first_name} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('នាមត្រកូល', 'Last Name')} <span className="text-rose-500">*</span></label>
//                     <input type="text" name="last_name" required value={formData.last_name} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('អ៊ីមែល', 'Email')} <span className="text-rose-500">*</span></label>
//                     <input type="email" name="email" required value={formData.email} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('លេខទូរស័ព្ទ', 'Phone Number')}</label>
//                     <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm" placeholder="+855" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('អត្តលេខសិស្ស', 'Student Code')}</label>
//                     <input type="text" name="student_code" value={formData.student_code} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm" placeholder="STU-2026-0001" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('ភេទ', 'Gender')} <span className="text-rose-500">*</span></label>
//                     <select name="gender" required value={formData.gender} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white">
//                       <option value="Male">{t('ប្រុស', 'Male')}</option>
//                       <option value="Female">{t('ស្រី', 'Female')}</option>
//                       <option value="Other">{t('ផ្សេងៗ', 'Other')}</option>
//                     </select>
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('ថ្ងៃខែឆ្នាំកំណើត', 'Date of Birth')}</label>
//                     <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('ដេប៉ាតឺម៉ង់', 'Department')}</label>
//                     <select name="department_id" value={formData.department_id} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white">
//                       <option value="">{t('ជ្រើសរើសដេប៉ាតឺម៉ង់', 'Select Department')}</option>
//                       {departments.map((dept) => (
//                         <option key={dept.id} value={dept.id}>{dept.name || dept.department_name}</option>
//                       ))}
//                     </select>
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('ជំនាន់/ឆ្នាំសិក្សា', 'Batch / Academic Year')}</label>
//                     <input type="text" name="batch_year" value={formData.batch_year} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm" placeholder="e.g. Batch 15, Year 1" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('កម្រិតសិក្សា', 'Degree Level')}</label>
//                     <select name="degree_level" value={formData.degree_level} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white">
//                       <option value="">{t('ជ្រើសរើសកម្រិត', 'Select Level')}</option>
//                       <option value="Associate Degree">{t('បរិញ្ញាបត្ររង', 'Associate Degree')}</option>
//                       <option value="Bachelor Degree">{t('បរិញ្ញាបត្រ', 'Bachelor Degree')}</option>
//                       <option value="Master Degree">{t('បរិញ្ញាបត្រជាន់ខ្ពស់', 'Master Degree')}</option>
//                     </select>
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('វេនសិក្សា', 'Study Shift')} <span className="text-rose-500">*</span></label>
//                     <select name="study_shift" required value={formData.study_shift} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white">
//                       <option value="Monday-Friday">{t('ចន្ទ-សុក្រ', 'Monday-Friday')}</option>
//                       <option value="Saturday-Sunday">{t('សៅរ៍-អាទិត្យ', 'Saturday-Sunday')}</option>
//                     </select>
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('អាសយដ្ឋាន', 'Address')}</label>
//                     <textarea rows="1" name="address" value={formData.address} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all resize-none shadow-sm" placeholder={t('អាសយដ្ឋានបច្ចុប្បន្ន...', 'Current address...')} />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">
//                       {editingStudent ? t('ពាក្យសម្ងាត់ (ទុកឲ្យទទេ ដើម្បីរក្សាដដែល)', 'Password (Leave blank to keep)') : t('ពាក្យសម្ងាត់', 'Password')} {!editingStudent && <span className="text-rose-500">*</span>}
//                     </label>
//                     <input type="password" name="password" required={!editingStudent} value={formData.password} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm" placeholder="••••••••" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-bold text-gray-700 mb-1.5">{t('ស្ថានភាព', 'Status')}</label>
//                     <select name="status" value={formData.status} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium transition-all shadow-sm bg-white">
//                       <option value="active">{t('សកម្ម', 'Active')}</option>
//                       <option value="inactive">{t('អសកម្ម', 'Inactive')}</option>
//                     </select>
//                   </div>
//                 </div>
//               </form>
//             </div>
              
//             <div className="p-6 sm:p-8 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50 shrink-0">
//               <button type="button" onClick={() => setShowModal(false)} className="px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer">
//                 {t('បោះបង់', 'Cancel')}
//               </button>
//               <button type="submit" form="studentForm" className="px-6 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md flex items-center gap-2 cursor-pointer">
//                 <UserGroupIcon className="h-5 w-5" />
//                 {editingStudent ? t('រក្សាទុកការកែប្រែ', 'Save Changes') : t('បង្កើតសិស្ស', 'Create Student')}
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* Modal - Manage Enrollments */}
//       {showEnrollmentModal && selectedStudent && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
//           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
//             <div className="flex justify-between items-center p-6 sm:p-8 border-b border-gray-100">
//               <div>
//                 <h2 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
//                   <span className="bg-emerald-100 text-emerald-600 p-2.5 rounded-xl border border-emerald-200">
//                     <BookOpenIcon className="h-6 w-6" />
//                   </span>
//                   {t('ចុះឈ្មោះមុខវិជ្ជា', 'Manage Courses')}
//                 </h2>
//                 <p className="text-xs text-gray-500 font-medium mt-1">
//                   {t('សិស្ស៖', 'Student:')} <span className="font-extrabold text-gray-800">{selectedStudent.first_name} {selectedStudent.last_name}</span> ({selectedStudent.student_code || t('គ្មានអត្តលេខ', 'No Code')})
//                 </p>
//               </div>
//               <button onClick={() => setShowEnrollmentModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
//                 <XMarkIcon className="h-6 w-6" />
//               </button>
//             </div>

//             <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6">
//               <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 shadow-sm">
//                 <h3 className="text-sm font-extrabold text-gray-800 mb-3 flex items-center gap-1.5">
//                   <PlusIcon className="h-4 w-4 text-emerald-600" />
//                   {t('ចុះឈ្មោះមុខវិជ្ជាថ្មី', 'Enroll New Course')}
//                 </h3>
                
//                 {allCourses.filter(c => !studentEnrollments.some(e => e.course_id === c.id)).length === 0 ? (
//                   <p className="text-xs font-bold text-gray-400 italic bg-white border border-gray-200 rounded-xl p-4 text-center">
//                     {t('សិស្សបានចុះឈ្មោះគ្រប់មុខវិជ្ជាដែលមានរួចរាល់ហើយ។', 'All available courses enrolled.')}
//                   </p>
//                 ) : (
//                   <form onSubmit={handleEnrollCourse} className="flex flex-col sm:flex-row gap-3">
//                     <div className="flex-1">
//                       <select value={selectedCourseToEnroll} onChange={(e) => setSelectedCourseToEnroll(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium transition-all bg-white text-sm shadow-sm">
//                         <option value="">{t('ជ្រើសរើសមុខវិជ្ជាដើម្បីចុះឈ្មោះ...', 'Select course to enroll...')}</option>
//                         {allCourses
//                           .filter(course => !studentEnrollments.some(e => e.course_id === course.id))
//                           .map(course => (
//                             <option key={course.id} value={course.id}>
//                               {course.course_code} - {course.course_name} ({course.credit} {t('ក្រេឌីត', 'Credits')})
//                             </option>
//                           ))}
//                       </select>
//                     </div>
//                     <button type="submit" className="px-6 py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 shadow-sm transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer">
//                       <PlusIcon className="h-5 w-5" />
//                       {t('ចុះឈ្មោះចូលរៀន', 'Enroll')}
//                     </button>
//                   </form>
//                 )}
//               </div>

//               <div>
//                 <h3 className="text-sm font-extrabold text-gray-800 mb-3 flex items-center gap-1.5">
//                   <AcademicCapIcon className="h-4 w-4 text-indigo-600" />
//                   {t('មុខវិជ្ជាកំពុងសិក្សា', 'Enrolled Courses')} ({studentEnrollments.length})
//                 </h3>
                
//                 {studentEnrollments.length === 0 ? (
//                   <div className="text-center py-10 bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
//                     <BookOpenIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
//                     <p className="text-sm text-gray-500 font-bold">{t('មិនទាន់បានចុះឈ្មោះមុខវិជ្ជាណាមួយនៅឡើយទេ', 'No courses enrolled yet')}</p>
//                   </div>
//                 ) : (
//                   <div className="space-y-3 max-h-62.5 overflow-y-auto pr-1">
//                     {studentEnrollments.map((enrollment) => {
//                       const teacher = enrollment.course?.teacher;
//                       const teacherImage = teacher?.profile_image || teacher?.avatar || teacher?.user?.profile_image;
//                       const teacherInitials = teacher
//                         ? `${teacher.first_name?.charAt(0) || ''}${teacher.last_name?.charAt(0) || ''}`
//                         : 'T';

//                       return (
//                         <div key={enrollment.id} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl hover:border-indigo-300 transition-all shadow-sm">
//                           <div className="flex items-start gap-3">
//                             {/* ✅ ប្តូរពីការចាប់កូដមុខវិជ្ជា មកចាប់រូបភាពលោកគ្រូជំនួសវិញ */}
//                             <div className="h-10 w-10 rounded-full bg-indigo-500 text-white flex items-center justify-center shrink-0 font-extrabold text-xs overflow-hidden shadow-sm">
//                               {teacherImage ? (
//                                 <img
//                                   src={getProfileImageUrl(teacherImage)}
//                                   alt={teacher ? `${teacher.first_name} ${teacher.last_name}` : 'Teacher'}
//                                   className="h-full w-full object-cover rounded-full"
//                                   onError={(e) => {
//                                     e.target.style.display = 'none';
//                                     e.target.parentElement.innerHTML = `<span>${teacherInitials}</span>`;
//                                   }}
//                                 />
//                               ) : (
//                                 <span>{teacherInitials}</span>
//                               )}
//                             </div>
//                             <div>
//                               <h4 className="text-sm font-extrabold text-gray-900 leading-snug">
//                                 {enrollment.course?.course_name || t('ឈ្មោះមុខវិជ្ជា', 'Course Name')}
//                               </h4>
//                               <p className="text-xs font-medium text-gray-500 mt-0.5">
//                                 {t('គ្រូ៖', 'Teacher:')} <span className="text-gray-700 font-bold">{teacher ? `${teacher.first_name} ${teacher.last_name}` : '—'}</span> &bull; {enrollment.course?.credit || 3} {t('ក្រេឌីត', 'Credits')}
//                               </p>
//                             </div>
//                           </div>
                          
//                           <button onClick={() => handleUnenrollCourse(enrollment.course_id)} className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all cursor-pointer" title={t('លុបមុខវិជ្ជាចេញ', 'Remove Course')}>
//                             <TrashIcon className="h-5 w-5" />
//                           </button>
//                         </div>
//                       );
//                     })}
//                   </div>
//                 )}
//               </div>
//             </div>

//             <div className="p-6 sm:p-8 border-t border-gray-100 flex justify-end bg-gray-50/50 shrink-0">
//               <button onClick={() => setShowEnrollmentModal(false)} className="px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer">
//                 {t('បិទផ្ទាំង', 'Close')}
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* Modal - Import Excel (ដូចដើម មិនបានកែ) */}
//       {showImportModal && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
//           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
//             <div className="flex justify-between items-center p-5 border-b border-gray-100">
//               <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
//                 <span className="bg-emerald-100 text-emerald-600 p-2 rounded-xl border border-emerald-200">
//                   <ArrowUpTrayIcon className="h-5 w-5" />
//                 </span>
//                 {t('នាំចូលទិន្នន័យពី Excel', 'Import from Excel')}
//               </h2>
//               <button onClick={() => { setShowImportModal(false); setImportPreview([]); }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
//                 <XMarkIcon className="h-5 w-5" />
//               </button>
//             </div>

//             <div className="p-5 overflow-y-auto flex-1 space-y-5">
//               <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
//                 <div>
//                   <h4 className="font-extrabold text-emerald-900 text-sm">{t('ណែនាំសម្រាប់ការនាំចូល៖', 'Import Instructions:')}</h4>
//                   <p className="text-xs font-medium text-emerald-700 mt-1">{t('សូមទាញយកទម្រង់គំរូ Excel ហើយបំពេញព័ត៌មានឱ្យបានត្រឹមត្រូវ។', 'Please download the template and fill in correctly.')}</p>
//                 </div>
//                 <button type="button" onClick={handleDownloadTemplate} className="inline-flex items-center px-4 py-2 bg-white border border-emerald-300 text-emerald-800 text-xs font-bold rounded-lg hover:bg-emerald-100 transition-all shrink-0 shadow-sm cursor-pointer">
//                   <DocumentArrowDownIcon className="h-4 w-4 mr-1.5 text-emerald-600" />
//                   {t('ទាញយកគំរូ', 'Template')}
//                 </button>
//               </div>

//               <div>
//                 <label className="block text-sm font-bold text-gray-700 mb-2">{t('ជ្រើសរើស ឬទម្លាក់ឯកសារ Excel (.xlsx, .xls)', 'Select or drop Excel file')}</label>
//                 <div className="relative group">
//                   <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
//                   <div className="border-2 border-dashed border-emerald-300 rounded-xl py-6 px-4 flex flex-col items-center justify-center text-center bg-emerald-50/40 group-hover:bg-emerald-50 group-hover:border-emerald-500 transition-all duration-300 shadow-sm">
//                     <div className="p-2.5 bg-emerald-100 rounded-full mb-3 group-hover:scale-110 transition-transform duration-300 shadow-sm border border-emerald-200">
//                       <ArrowUpTrayIcon className="h-6 w-6 text-emerald-600" />
//                     </div>
//                     <h3 className="text-sm font-extrabold text-emerald-900 mb-1.5">{t('ចុចទីនេះ ឬទាញឯកសារទម្លាក់ទីនេះ', 'Click to upload or drag and drop')}</h3>
//                   </div>
//                 </div>
//               </div>

//               {importPreview.length > 0 && (
//                 <div className="space-y-3">
//                   <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
//                     <span className="bg-gray-100 text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200">
//                       {t('សរុប៖', 'Total:')} {importPreview.length} {t('ជួរ', 'rows')}
//                     </span>
//                     <div className="flex gap-2">
//                       <span className="bg-emerald-50 text-emerald-700 px-2 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-1">
//                         <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
//                         {importPreview.filter(r => r.isValid).length}
//                       </span>
//                       {importPreview.filter(r => !r.isValid).length > 0 && (
//                         <span className="bg-rose-50 text-rose-700 px-2 py-1.5 rounded-lg border border-rose-100 flex items-center gap-1">
//                           <ExclamationCircleIcon className="h-4 w-4 text-rose-600" />
//                           {importPreview.filter(r => !r.isValid).length}
//                         </span>
//                       )}
//                     </div>
//                   </div>

//                   <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
//                     <table className="min-w-full divide-y divide-gray-200 text-xs">
//                       <thead className="bg-gray-50 sticky top-0">
//                         <tr>
//                           <th className="px-3 py-2 text-left font-bold text-gray-500">{t('ជួរ', 'Row')}</th>
//                           <th className="px-3 py-2 text-left font-bold text-gray-500">{t('ឈ្មោះ', 'Name')}</th>
//                           <th className="px-3 py-2 text-left font-bold text-gray-500">{t('អត្តលេខសិស្ស', 'Student Code')}</th>
//                           <th className="px-3 py-2 text-left font-bold text-gray-500">{t('ស្ថានភាព', 'Status')}</th>
//                         </tr>
//                       </thead>
//                       <tbody className="bg-white divide-y divide-gray-100">
//                         {importPreview.map((row) => (
//                           <tr key={row.rowIndex} className={row.isValid ? 'hover:bg-gray-50' : 'bg-rose-50/50'}>
//                             <td className="px-3 py-2 font-mono text-gray-500">#{row.rowIndex}</td>
//                             <td className="px-3 py-2 font-extrabold text-gray-900 truncate max-w-30">
//                               {row.data.first_name} {row.data.last_name}
//                             </td>
//                             <td className="px-3 py-2 text-gray-600 font-medium">{row.data.student_code || '—'}</td>
//                             <td className="px-3 py-2">
//                               {row.isValid ? (
//                                 <span className="text-emerald-600 font-bold flex items-center">
//                                   <CheckCircleIcon className="h-4 w-4 mr-1" /> {t('ត្រឹមត្រូវ', 'Valid')}
//                                 </span>
//                               ) : (
//                                 <span className="text-rose-600 font-bold flex items-center" title={row.errors.join(', ')}>
//                                   <ExclamationCircleIcon className="h-4 w-4 mr-1" /> {t('មានកំហុស', 'Error')}
//                                 </span>
//                               )}
//                             </td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 </div>
//               )}
//             </div>

//             <div className="p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50 shrink-0">
//               <button type="button" onClick={() => { setShowImportModal(false); setImportPreview([]); }} className="px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer">
//                 {t('បោះបង់', 'Cancel')}
//               </button>
//               <button
//                 type="button"
//                 disabled={isImporting || importPreview.filter(r => r.isValid).length === 0}
//                 onClick={handleConfirmImport}
//                 className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-md flex items-center gap-2 cursor-pointer"
//               >
//                 <ArrowUpTrayIcon className="h-5 w-5" />
//                 {isImporting ? t('កំពុងនាំចូល...', 'Importing...') : `${t('នាំចូលទិន្នន័យ', 'Import Data')} (${importPreview.filter(r => r.isValid).length})`}
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* Delete Confirmation Modal */}
//       {showDeleteModal && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
//           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fadeIn">
//             <div className="flex items-center text-rose-600 mb-5">
//               <div className="p-2 bg-rose-100 rounded-full mr-3 border border-rose-200">
//                 <ExclamationTriangleIcon className="h-6 w-6" />
//               </div>
//               <h3 className="text-xl font-extrabold">{t('បញ្ជាក់ការលុប', 'Confirm Deletion')}</h3>
//             </div>
//             <p className="text-sm font-medium text-gray-600 mb-6 leading-relaxed">
//               {t('តើលោកអ្នកប្រាកដជាចង់លុបគណនីសិស្សឈ្មោះ', 'Are you sure you want to delete student')} «<span className="font-extrabold text-gray-900">{studentToDelete?.first_name} {studentToDelete?.last_name}</span>» {t('នេះមែនទេ?', 'this student?')}
//               <br /><br />
//               <span className="text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100 block">
//                 {t('* ទិន្នន័យ ការចុះឈ្មោះ និងប្រវត្តិរបស់សិស្សនេះនឹងត្រូវបាត់បង់ពីប្រព័ន្ធ។', '* Data, enrollments, and history of this student will be lost.')}
//               </span>
//             </p>
//             <div className="flex justify-end space-x-3">
//               <button onClick={() => { setShowDeleteModal(false); setStudentToDelete(null); }} className="px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all cursor-pointer">
//                 {t('បោះបង់', 'Cancel')}
//               </button>
//               <button onClick={confirmDelete} className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-all shadow-md cursor-pointer">
//                 {t('លុបចោល', 'Delete')}
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default ManageStudents;
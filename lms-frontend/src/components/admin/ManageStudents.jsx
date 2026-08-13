import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useLanguage } from '../../context/LanguageContext';
import * as XLSX from 'xlsx';
import { 
  PencilIcon, 
  TrashIcon, 
  PlusIcon, 
  UserGroupIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  AcademicCapIcon,
  PhotoIcon,
  BookOpenIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  DocumentArrowDownIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

const ManageStudents = () => {
  const { t, language } = useLanguage();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [studentRoleId, setStudentRoleId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  
  // Import states
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  
  // States for student course enrollments
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentEnrollments, setStudentEnrollments] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [selectedCourseToEnroll, setSelectedCourseToEnroll] = useState('');
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    status: 'active',
    gender: 'Male',
    phone: '',
    student_code: '',
    department_id: '',
    batch_year: '',
    degree_level: '',
    study_shift: 'Monday-Friday',
    date_of_birth: '',
    address: '',
    profile_image: null,
  });

  // ប្រើ Promise.all ដើម្បីឱ្យទាញទិន្នន័យលឿន
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchStudents(false), // ហៅដោយមិនបាច់ set loading ជាន់គ្នា
          fetchDepartments(),
          fetchStudentRole()
        ]);
      } catch (error) {
        console.error("Error loading initial data", error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  const fetchStudents = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await api.get('/admin/students');
      setStudents(response.data.data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast.error(t('មិនអាចទាញយកទិន្នន័យសិស្សបានទេ', 'Cannot fetch students data'));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/admin/departments');
      setDepartments(response.data.data || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
      toast.error(t('មិនអាចទាញយកទិន្នន័យជំនាញបានទេ', 'Cannot fetch departments data'));
    }
  };

  const fetchStudentRole = async () => {
    try {
      const response = await api.get('/roles');
      const rolesData = response.data.data || response.data;
      const studentRole = rolesData.find(r => r.role_name === 'Student');
      if (studentRole) {
        setStudentRoleId(studentRole.id);
      }
    } catch (error) {
      console.error('Error fetching student role:', error);
      toast.error(t('មិនអាចទាញយកតួនាទីសិស្សបានទេ', 'Cannot fetch student role'));
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData({
        ...formData,
        profile_image: file
      });
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!studentRoleId) {
      toast.error(t('មិនអាចទាញយកតួនាទីសិស្សបានទេ', 'Cannot fetch student role'));
      return;
    }

    try {
      let response;
      
      if (editingStudent) {
        const formDataToSend = new FormData();
        
        Object.keys(formData).forEach(key => {
          if (key === 'profile_image') {
            if (formData[key] instanceof File) {
              formDataToSend.append(key, formData[key]);
            }
          } else if (formData[key] !== null && formData[key] !== undefined && formData[key] !== '') {
            formDataToSend.append(key, formData[key]);
          }
        });
        
        formDataToSend.append('role_id', studentRoleId);
        
        if (!formData.password) {
          formDataToSend.delete('password');
        }
        
        formDataToSend.append('_method', 'PUT');
        
        response = await api.post(`/admin/students/${editingStudent.id}`, formDataToSend, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        toast.success(t('បានកែប្រែព័ត៌មានសិស្សដោយជោគជ័យ', 'Student updated successfully'));
        
      } else {
        const formDataToSend = new FormData();
        
        Object.keys(formData).forEach(key => {
          if (formData[key] !== null && formData[key] !== undefined && formData[key] !== '') {
            formDataToSend.append(key, formData[key]);
          }
        });
        
        formDataToSend.append('role_id', studentRoleId);
        
        if (!formData.profile_image) {
          formDataToSend.delete('profile_image');
        }
        
        response = await api.post('/admin/students', formDataToSend, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        toast.success(t('បានបន្ថែមសិស្សដោយជោគជ័យ', 'Student created successfully'));
      }
      
      setShowModal(false);
      resetForm();
      fetchStudents(true);
      localStorage.setItem('studentsUpdated', Date.now().toString());
      window.dispatchEvent(new Event('storage'));
      
    } catch (error) {
      console.error('Submit error:', error.response?.data);
      
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        const errorMessages = Object.values(errors).flat().join('\n');
        toast.error(errorMessages);
      } else {
        toast.error(error.response?.data?.message || t('ការធ្វើប្រតិបត្តិការបានបរាជ័យ', 'Operation failed'));
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('តើអ្នកប្រាកដថាចង់លុបសិស្សនេះមែនទេ?', 'Are you sure you want to delete this student?'))) {
      try {
        await api.delete(`/admin/students/${id}`);
        toast.success(t('បានលុបសិស្សដោយជោគជ័យ', 'Student deleted successfully'));
        localStorage.setItem('studentDeleted', Date.now().toString());
        window.dispatchEvent(new Event('storage'));
        fetchStudents(true);
      } catch (error) {
        toast.error(error.response?.data?.message || t('មិនអាចលុបសិស្សបានទេ', 'Cannot delete student'));
      }
    }
  };

  const openEnrollmentModal = async (student) => {
    setSelectedStudent(student);
    setShowEnrollmentModal(true);
    setLoadingEnrollments(true);
    try {
      const enrollmentsRes = await api.get(`/admin/students/${student.id}/enrollments`);
      setStudentEnrollments(enrollmentsRes.data.data || []);
      
      const coursesRes = await api.get('/admin/courses');
      setAllCourses(coursesRes.data.data || coursesRes.data || []);
      
      setSelectedCourseToEnroll('');
    } catch (error) {
      console.error('Error fetching enrollment details:', error);
      toast.error(t('មិនអាចទាញយកព័ត៌មានចុះឈ្មោះបានទេ', 'Cannot fetch enrollment details'));
    } finally {
      setLoadingEnrollments(false);
    }
  };

  const handleEnrollCourse = async (e) => {
    e.preventDefault();
    if (!selectedCourseToEnroll) {
      toast.error(t('សូមជ្រើសរើសមុខវិជ្ជា', 'Please select a course'));
      return;
    }
    
    try {
      setLoadingEnrollments(true);
      await api.post(`/admin/students/${selectedStudent.id}/enrollments`, {
        course_ids: [parseInt(selectedCourseToEnroll)]
      });
      toast.success(t('បានចុះឈ្មោះមុខវិជ្ជាដោយជោគជ័យ', 'Course enrolled successfully'));
      
      const enrollmentsRes = await api.get(`/admin/students/${selectedStudent.id}/enrollments`);
      setStudentEnrollments(enrollmentsRes.data.data || []);
      setSelectedCourseToEnroll('');
    } catch (error) {
      console.error('Error enrolling student:', error);
      toast.error(error.response?.data?.message || t('មិនអាចចុះឈ្មោះមុខវិជ្ជាបានទេ', 'Cannot enroll course'));
    } finally {
      setLoadingEnrollments(false);
    }
  };

  const handleUnenrollCourse = async (courseId) => {
    if (window.confirm(t('តើអ្នកប្រាកដថាចង់លុបមុខវិជ្ជានេះចេញពីសិស្សនេះមែនទេ?', 'Are you sure you want to unenroll student from this course?'))) {
      try {
        setLoadingEnrollments(true);
        await api.delete(`/admin/students/${selectedStudent.id}/enrollments/${courseId}`);
        toast.success(t('បានលុបមុខវិជ្ជាចេញពីសិស្សដោយជោគជ័យ', 'Course unenrolled successfully'));
        
        const enrollmentsRes = await api.get(`/admin/students/${selectedStudent.id}/enrollments`);
        setStudentEnrollments(enrollmentsRes.data.data || []);
      } catch (error) {
        console.error('Error unenrolling student:', error);
        toast.error(t('មិនអាចលុបមុខវិជ្ជាចេញពីសិស្សបានទេ', 'Cannot unenroll course'));
      } finally {
        setLoadingEnrollments(false);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      status: 'active',
      gender: 'Male',
      phone: '',
      student_code: '',
      department_id: '',
      batch_year: '',
      degree_level: '',
      study_shift: 'Monday-Friday',
      date_of_birth: '',
      address: '',
      profile_image: null,
    });
    setPreviewImage(null);
    setEditingStudent(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (student) => {
    setEditingStudent(student);
    setFormData({
      first_name: student.first_name || '',
      last_name: student.last_name || '',
      email: student.email || '',
      password: '',
      status: student.user?.status || 'active',
      gender: student.gender || 'Male',
      phone: student.phone || '',
      student_code: student.student_code || '',
      department_id: student.department_id || '',
      batch_year: student.batch_year || '',
      degree_level: student.degree_level || '',
      study_shift: student.study_shift || 'Monday-Friday',
      date_of_birth: student.date_of_birth || '',
      address: student.address || '',
      profile_image: null,
    });
    setPreviewImage(null);
    setShowModal(true);
  };

  // Export Excel Functionality
  const handleExportExcel = async () => {
    try {
      toast.info(t('កំពុងរៀបចំទិន្នន័យសម្រាប់នាំចេញ...', 'Preparing data for export...'));
      let dataToExport = students;
      
      try {
        const response = await api.get('/admin/students/export-all');
        if (response.data?.data && Array.isArray(response.data.data)) {
          dataToExport = response.data.data;
        }
      } catch (err) {
        console.log('Export all API fallback to current state data');
      }

      if (!dataToExport || dataToExport.length === 0) {
        toast.warning(t('គ្មានទិន្នន័យសិស្សសម្រាប់នាំចេញទេ', 'No student data to export'));
        return;
      }

      const formattedData = dataToExport.map((s, index) => ({
        [t('ល.រ (No)', 'No')]: index + 1,
        [t('អត្តលេខសិស្ស (Student Code)', 'Student Code')]: s.student_code || '',
        [t('នាមខ្លួន (First Name)', 'First Name')]: s.first_name || '',
        [t('នាមត្រកូល (Last Name)', 'Last Name')]: s.last_name || '',
        [t('ភេទ (Gender)', 'Gender')]: s.gender === 'Male' ? t('ប្រុស', 'Male') : s.gender === 'Female' ? t('ស្រី', 'Female') : (s.gender || ''),
        [t('អ៊ីមែល (Email)', 'Email')]: s.email || '',
        [t('លេខទូរស័ព្ទ (Phone)', 'Phone')]: s.phone || '',
        [t('ដេប៉ាតឺម៉ង់ (Department)', 'Department')]: s.department?.department_name || s.department?.name || '',
        [t('ជំនាន់/ឆ្នាំសិក្សា (Batch Year)', 'Batch Year')]: s.batch_year || '',
        [t('កម្រិតសិក្សា (Degree Level)', 'Degree Level')]: s.degree_level || '',
        [t('វេនសិក្សា (Study Shift)', 'Study Shift')]: s.study_shift === 'Monday-Friday' ? t('ចន្ទ-សុក្រ', 'Monday-Friday') : s.study_shift === 'Saturday-Sunday' ? t('សៅរ៍-អាទិត្យ', 'Saturday-Sunday') : (s.study_shift || ''),
        [t('អាសយដ្ឋាន (Address)', 'Address')]: s.address || '',
        [t('ថ្ងៃខែឆ្នាំកំណើត (DOB)', 'Date of Birth')]: s.date_of_birth || '',
        [t('ស្ថានភាព (Status)', 'Status')]: s.user?.status === 'active' || s.status === 'active' ? t('សកម្ម', 'Active') : t('អសកម្ម', 'Inactive')
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedData);
      
      const colWidths = [
        { wch: 8 },  // No
        { wch: 20 }, // Code
        { wch: 18 }, // First Name
        { wch: 18 }, // Last Name
        { wch: 12 }, // Gender
        { wch: 30 }, // Email
        { wch: 16 }, // Phone
        { wch: 25 }, // Department
        { wch: 18 }, // Batch Year
        { wch: 20 }, // Degree Level
        { wch: 18 }, // Study Shift
        { wch: 25 }, // Address
        { wch: 16 }, // DOB
        { wch: 12 }, // Status
      ];
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Students_List_${today}.xlsx`);
      toast.success(t('បាននាំចេញទិន្នន័យសិស្សជា Excel ដោយជោគជ័យ', 'Exported student data to Excel successfully'));
    } catch (error) {
      console.error('Export Excel error:', error);
      toast.error(t('បរាជ័យក្នុងការនាំចេញ Excel', 'Failed to export Excel'));
    }
  };

  // Download Excel Sample Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'first_name': 'Chan',
        'last_name': 'Vichai',
        'email': 'chan.vichai@example.com',
        'phone': '012345678',
        'gender': 'Male',
        'student_code': 'STU-2026-0001',
        'department': departments[0]?.department_name || departments[0]?.name || 'Computer Science',
        'batch_year': 'Batch 15',
        'degree_level': 'Bachelor Degree',
        'study_shift': 'Monday-Friday',
        'address': 'Phnom Penh',
        'date_of_birth': '2004-03-10',
        'password': 'Password123'
      },
      {
        'first_name': 'Sok',
        'last_name': 'Sreyleak',
        'email': 'sok.sreyleak@example.com',
        'phone': '098765432',
        'gender': 'Female',
        'student_code': 'STU-2026-0002',
        'department': departments[1]?.department_name || departments[1]?.name || 'Information Technology',
        'batch_year': 'Batch 15',
        'degree_level': 'Bachelor Degree',
        'study_shift': 'Saturday-Sunday',
        'address': 'Kandal',
        'date_of_birth': '2005-07-22',
        'password': 'Password123'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const colWidths = [
      { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 },
      { wch: 10 }, { wch: 18 }, { wch: 25 }, { wch: 15 },
      { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 15 }, { wch: 15 }
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, 'student_import_template.xlsx');
    toast.success(t('បានទាញយកទម្រង់គំរូ Excel ដោយជោគជ័យ', 'Downloaded Excel sample template successfully'));
  };

  // Helper for matching department
  const findDepartmentId = (deptNameOrCode) => {
    if (!deptNameOrCode) return null;
    const search = deptNameOrCode.toString().trim().toLowerCase();
    const found = departments.find(d => 
      (d.department_name && d.department_name.toLowerCase() === search) ||
      (d.department_code && d.department_code.toLowerCase() === search) ||
      (d.name && d.name.toLowerCase() === search) ||
      (d.id && d.id.toString() === search)
    );
    return found ? found.id : null;
  };

  // Helper to normalize Excel column keys
  const normalizeHeaderKey = (key) => {
    const k = key.toString().trim().toLowerCase();
    if (k.includes('first') || k.includes('នាមខ្លួន')) return 'first_name';
    if (k.includes('last') || k.includes('នាមត្រកូល')) return 'last_name';
    if (k.includes('email') || k.includes('អ៊ីមែល')) return 'email';
    if (k.includes('phone') || k.includes('ទូរស័ព្ទ')) return 'phone';
    if (k.includes('code') || k.includes('អត្តលេខ')) return 'student_code';
    if (k.includes('gender') || k.includes('ភេទ')) return 'gender';
    if (k.includes('department') || k.includes('ដេប៉ាតឺម៉ង់')) return 'department';
    if (k.includes('batch') || k.includes('ជំនាន់')) return 'batch_year';
    if (k.includes('degree') || k.includes('កម្រិត')) return 'degree_level';
    if (k.includes('shift') || k.includes('វេន')) return 'study_shift';
    if (k.includes('address') || k.includes('អាសយដ្ឋាន')) return 'address';
    if (k.includes('birth') || k.includes('កំណើត') || k.includes('dob')) return 'date_of_birth';
    if (k.includes('password') || k.includes('ពាក្យសម្ងាត់')) return 'password';
    if (k.includes('status') || k.includes('ស្ថានភាព')) return 'status';
    return key;
  };

  // Parse Excel file for Import
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          toast.warning(t('ឯកសារ Excel គ្មានទិន្នន័យទេ', 'Excel file contains no data'));
          return;
        }

        const existingEmails = new Set(students.map(s => s.email?.toLowerCase()));
        const fileEmails = new Set();

        const parsedRows = rawJson.map((row, idx) => {
          const item = {};
          Object.keys(row).forEach(k => {
            const normalizedKey = normalizeHeaderKey(k);
            item[normalizedKey] = row[k]?.toString().trim();
          });

          const errors = [];
          if (!item.first_name) errors.push(t('ខ្វះនាមខ្លួន', 'Missing First Name'));
          if (!item.last_name) errors.push(t('ខ្វះនាមត្រកូល', 'Missing Last Name'));
          if (!item.email) {
            errors.push(t('ខ្វះអ៊ីមែល', 'Missing Email'));
          } else {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(item.email)) {
              errors.push(t('អ៊ីមែលមិនត្រឹមត្រូវ', 'Invalid Email Format'));
            } else if (existingEmails.has(item.email.toLowerCase())) {
              errors.push(t('អ៊ីមែលនេះមានក្នុងប្រព័ន្ធរួចហើយ', 'Email already exists'));
            } else if (fileEmails.has(item.email.toLowerCase())) {
              errors.push(t('អ៊ីមែលស្ទួនក្នុងឯកសារនេះ', 'Duplicate email in file'));
            } else {
              fileEmails.add(item.email.toLowerCase());
            }
          }

          let gender = item.gender;
          if (gender === 'ប្រុស' || gender === 'Male' || gender === 'M') gender = 'Male';
          else if (gender === 'ស្រី' || gender === 'Female' || gender === 'F') gender = 'Female';
          else if (gender) gender = 'Other';
          else gender = 'Male';

          let studyShift = item.study_shift;
          if (studyShift === 'ចន្ទ-សុក្រ' || studyShift === 'Monday-Friday') studyShift = 'Monday-Friday';
          else if (studyShift === 'សៅរ៍-អាទិត្យ' || studyShift === 'Saturday-Sunday') studyShift = 'Saturday-Sunday';
          else studyShift = 'Monday-Friday';

          const deptId = findDepartmentId(item.department);

          return {
            rowIndex: idx + 2,
            raw: row,
            data: {
              first_name: item.first_name || '',
              last_name: item.last_name || '',
              email: item.email || '',
              phone: item.phone || '',
              gender: gender,
              student_code: item.student_code || '',
              department_id: deptId,
              department_name: item.department || '',
              batch_year: item.batch_year || '',
              degree_level: item.degree_level || '',
              study_shift: studyShift,
              address: item.address || '',
              date_of_birth: item.date_of_birth || '',
              password: item.password || '12345678',
              status: item.status || 'active'
            },
            isValid: errors.length === 0,
            errors
          };
        });

        setImportPreview(parsedRows);
      } catch (err) {
        console.error('File parsing error:', err);
        toast.error(t('មិនអាចអានឯកសារ Excel បានទេ សូមពិនិត្យមើលទម្រង់ឯកសារ', 'Cannot read Excel file, please check format'));
      }
    };
    reader.readAsBinaryString(file);
  };

  // Submit Import to backend API
  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.length === 0) return;
    const validItems = importPreview.filter(r => r.isValid).map(r => r.data);

    if (validItems.length === 0) {
      toast.warning(t('គ្មានទិន្នន័យត្រឹមត្រូវសម្រាប់នាំចូលទេ', 'No valid data to import'));
      return;
    }

    setIsImporting(true);
    try {
      const response = await api.post('/admin/students/import', { students: validItems });
      toast.success(response.data?.message || t(`បាននាំចូលសិស្ស ${validItems.length} នាក់ដោយជោគជ័យ`, `Imported ${validItems.length} students successfully`));
      localStorage.setItem('studentsUpdated', Date.now().toString());
      window.dispatchEvent(new Event('storage'));
      setShowImportModal(false);
      setImportPreview([]);
      fetchStudents(true);
    } catch (error) {
      console.error('Import submit error:', error);
      toast.error(error.response?.data?.message || t('ការនាំចូលទិន្នន័យបានបរាជ័យ', 'Failed to import data'));
    } finally {
      setIsImporting(false);
    }
  };

  const filteredStudents = students.filter(student => {
    const search = searchTerm.toLowerCase();
    return (
      student.first_name?.toLowerCase()?.includes(search) ||
      student.last_name?.toLowerCase()?.includes(search) ||
      student.email?.toLowerCase()?.includes(search) ||
      student.student_code?.toLowerCase()?.includes(search) ||
      student.batch_year?.toLowerCase()?.includes(search)
    );
  });

  const getStudyShiftLabel = (shift) => {
    const shifts = {
      'Monday-Friday': t('ចន្ទ-សុក្រ', 'Monday-Friday'),
      'Saturday-Sunday': t('សៅរ៍-អាទិត្យ', 'Saturday-Sunday')
    };
    return shifts[shift] || shift || '—';
  };

  const getDegreeLevelLabel = (level) => {
    const levels = {
      'Associate Degree': t('បរិញ្ញាបត្ររង', 'Associate Degree'),
      'Bachelor Degree': t('បរិញ្ញាបត្រ', 'Bachelor Degree'),
      'Master Degree': t('បរិញ្ញាបត្រជាន់ខ្ពស់', 'Master Degree')
    };
    return levels[level] || level || '—';
  };

  const getProfileImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http')) {
      return imagePath;
    }
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    return `${baseUrl}/storage/${imagePath}`;
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                <UserGroupIcon className="h-6 w-6" />
              </span>
              {t('គ្រប់គ្រងសិស្ស', 'Manage Students')}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{t('បន្ថែម និងគ្រប់គ្រងគណនីសិស្សក្នុងប្រព័ន្ធ', 'Add and manage student accounts in the system')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-emerald-700 transition-all hover:shadow-md cursor-pointer"
              title={t('នាំចេញបញ្ជីសិស្សជា Excel', 'Export student list to Excel')}
            >
              <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
              {t('នាំចេញ Excel', 'Export Excel')}
            </button>
            <button
              onClick={() => {
                setImportPreview([]);
                setShowImportModal(true);
              }}
              className="inline-flex items-center justify-center px-4 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-amber-700 transition-all hover:shadow-md cursor-pointer"
              title={t('នាំចូលទិន្នន័យសិស្សពី Excel', 'Import student data from Excel')}
            >
              <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
              {t('នាំចូល Excel', 'Import Excel')}
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition-all hover:shadow-md cursor-pointer"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              {t('បន្ថែមសិស្ស', 'Add Student')}
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('ស្វែងរកតាមឈ្មោះ អ៊ីមែល អត្តលេខ ឬជំនាន់...', 'Search by name, email, code or batch...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="h-20 w-20 rounded-full border-t-2 border-b-2 border-indigo-100"></div>
            <div className="absolute top-0 left-0 h-20 w-20 rounded-full border-t-2 border-indigo-600 animate-spin"></div>
          </div>
          <p className="mt-6 text-base font-medium text-gray-600">{t('កំពុងផ្ទុកទិន្នន័យសិស្ស...', 'Loading students data...')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('សូមរង់ចាំមួយភ្លែត', 'Please wait a moment')}</p>
        </div>
      ) : (
        /* Students Table */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('សិស្ស', 'Student')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('អត្តលេខ', 'Student Code')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('អ៊ីមែល', 'Email')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ដេប៉ាតឺម៉ង់', 'Department')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('វេនសិក្សា', 'Study Shift')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ស្ថានភាព', 'Status')}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('សកម្មភាព', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-14 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <UserGroupIcon className="h-16 w-16 text-gray-300 mb-3" />
                        <p className="font-medium">
                          {searchTerm ? t('មិនឃើញលទ្ធផលស្វែងរក', 'No search results found') : t('មិនទាន់មានសិស្សនៅឡើយទេ', 'No students available yet')}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          {searchTerm ? t('សូមប្តូរពាក្យស្វែងរក', 'Please try a different search term') : t('ចុច "បន្ថែមសិស្ស" ដើម្បីចាប់ផ្តើម', 'Click "Add Student" to get started')}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
                            {student.profile_image ? (
                              <img 
                                src={getProfileImageUrl(student.profile_image)}
                                alt={`${student.first_name} ${student.last_name}`}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.parentElement.innerHTML = `<span>${student.first_name?.charAt(0) || ''}${student.last_name?.charAt(0) || ''}</span>`;
                                }}
                              />
                            ) : (
                              <span>{student.first_name?.charAt(0) || ''}{student.last_name?.charAt(0) || ''}</span>
                            )}
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {student.first_name} {student.last_name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {getDegreeLevelLabel(student.degree_level) || '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {student.student_code || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {student.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {student.department?.name || student.department?.department_name || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {getStudyShiftLabel(student.study_shift)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                          student.user?.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {student.user?.status === 'active' ? t('សកម្ម', 'Active') : t('អសកម្ម', 'Inactive')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => openEnrollmentModal(student)}
                            className="p-2 text-emerald-600 hover:text-emerald-900 hover:bg-emerald-50 rounded-xl transition-all"
                            title={t('ចុះឈ្មោះមុខវិជ្ជា (Manage Courses)', 'Manage Courses')}
                          >
                            <BookOpenIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => openEditModal(student)}
                            className="p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all"
                            title={t('កែប្រែ', 'Edit')}
                          >
                            <PencilIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(student.id)}
                            className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-xl transition-all"
                            title={t('លុប', 'Delete')}
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {filteredStudents.length > 0 && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-sm text-gray-600">
                {t('បង្ហាញ', 'Showing')} <span className="font-medium text-gray-900">{filteredStudents.length}</span> {t('នាក់', 'students')} 
                {students.length !== filteredStudents.length && (
                  <span> {t('ក្នុងចំណោម', 'out of')} <span className="font-medium text-gray-900">{students.length}</span> {t('នាក់', 'total')}</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL - កែតម្រូវផ្ទាំងខ្មៅឱ្យស្រាលជាងមុន */}
      {/* ========================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 p-8 max-h-[90vh] overflow-y-auto animate-scaleIn">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                  <UserGroupIcon className="h-5 w-5" />
                </span>
                {editingStudent ? t('កែប្រែសិស្ស', 'Edit Student') : t('បន្ថែមសិស្សថ្មី', 'Add New Student')}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                <AcademicCapIcon className="h-5 w-5 text-green-600" />
                <span className="text-sm text-green-700">
                  <strong>{t('តួនាទី៖', 'Role:')}</strong> {t('សិស្ស (កំណត់ដោយស្វ័យប្រវត្តិ)', 'Student (Auto-assigned)')}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Row 1: First Name & Last Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('នាមខ្លួន', 'First Name')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    required
                    value={formData.first_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('នាមត្រកូល', 'Last Name')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    required
                    value={formData.last_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder=""
                  />
                </div>

                {/* Row 2: Email & Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('អ៊ីមែល', 'Email')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('លេខទូរស័ព្ទ', 'Phone Number')}
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="+855"
                  />
                </div>

                {/* Row 3: Student Code & Gender */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('អត្តលេខសិស្ស', 'Student Code')}
                  </label>
                  <input
                    type="text"
                    name="student_code"
                    value={formData.student_code}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="STU-2026-0001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('ភេទ', 'Gender')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="gender"
                    required
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="Male">{t('ប្រុស', 'Male')}</option>
                    <option value="Female">{t('ស្រី', 'Female')}</option>
                    <option value="Other">{t('ផ្សេងៗ', 'Other')}</option>
                  </select>
                </div>

                {/* Row 4: Date of Birth & Department */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('ថ្ងៃខែឆ្នាំកំណើត', 'Date of Birth')}
                  </label>
                  <input
                    type="date"
                    name="date_of_birth"
                    value={formData.date_of_birth}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('ដេប៉ាតឺម៉ង់', 'Department')}
                  </label>
                  <select
                    name="department_id"
                    value={formData.department_id}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="">{t('ជ្រើសរើសដេប៉ាតឺម៉ង់', 'Select Department')}</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name || dept.department_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Row 5: Batch Year & Degree Level */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('ជំនាន់/ឆ្នាំសិក្សា', 'Batch / Academic Year')}
                  </label>
                  <input
                    type="text"
                    name="batch_year"
                    value={formData.batch_year}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="e.g. Batch 15, Year 1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('កម្រិតសិក្សា', 'Degree Level')}
                  </label>
                  <select
                    name="degree_level"
                    value={formData.degree_level}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="">{t('ជ្រើសរើសកម្រិត', 'Select Level')}</option>
                    <option value="Associate Degree">{t('បរិញ្ញាបត្ររង', 'Associate Degree')}</option>
                    <option value="Bachelor Degree">{t('បរិញ្ញាបត្រ', 'Bachelor Degree')}</option>
                    <option value="Master Degree">{t('បរិញ្ញាបត្រជាន់ខ្ពស់', 'Master Degree')}</option>
                  </select>
                </div>

                {/* Row 6: Study Shift & Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('វេនសិក្សា', 'Study Shift')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="study_shift"
                    required
                    value={formData.study_shift}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="Monday-Friday">{t('ចន្ទ-សុក្រ', 'Monday-Friday')}</option>
                    <option value="Saturday-Sunday">{t('សៅរ៍-អាទិត្យ', 'Saturday-Sunday')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('អាសយដ្ឋាន', 'Address')}
                  </label>
                  <textarea
                    rows="2"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                    placeholder={t('អាសយដ្ឋានបច្ចុប្បន្ន...', 'Current address...')}
                  />
                </div>

                {/* Row 8: Password & Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {editingStudent ? t('ពាក្យសម្ងាត់ (ទុកឲ្យទទេ ដើម្បីរក្សាដដែល)', 'Password (Leave blank to keep unchanged)') : t('ពាក្យសម្ងាត់', 'Password')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    name="password"
                    required={!editingStudent}
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('ស្ថានភាព', 'Status')}
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="active">{t('សកម្ម', 'Active')}</option>
                    <option value="inactive">{t('អសកម្ម', 'Inactive')}</option>
                  </select>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
                >
                  {t('បោះបង់', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2"
                >
                  <UserGroupIcon className="h-5 w-5" />
                  {editingStudent ? t('រក្សាទុក', 'Save Changes') : t('បង្កើតសិស្ស', 'Create Student')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL - គ្រប់គ្រងការចុះឈ្មោះចូលរៀន (Manage Enrollments) */}
      {/* ========================================== */}
      {showEnrollmentModal && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 p-8 max-h-[90vh] overflow-y-auto flex flex-col animate-scaleIn">
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-gray-100 mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="bg-emerald-100 text-emerald-600 p-2 rounded-xl">
                    <BookOpenIcon className="h-5 w-5" />
                  </span>
                  {t('ចុះឈ្មោះមុខវិជ្ជា (Manage Courses)', 'Manage Courses')}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {t('សិស្ស៖', 'Student:')} <span className="font-semibold text-gray-700">{selectedStudent.first_name} {selectedStudent.last_name}</span> ({selectedStudent.student_code || t('គ្មានអត្តលេខ', 'No Code')})
                </p>
              </div>
              <button
                onClick={() => setShowEnrollmentModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {loadingEnrollments && studentEnrollments.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
              </div>
            ) : (
              <div className="space-y-6 flex-1 overflow-y-auto pr-1">
                {/* section 1: Add new enrollment */}
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
                    <PlusIcon className="h-4 w-4 text-emerald-600" />
                    {t('ចុះឈ្មោះមុខវិជ្ជាថ្មី (Enroll New Course)', 'Enroll New Course')}
                  </h3>
                  
                  {allCourses.filter(c => !studentEnrollments.some(e => e.course_id === c.id)).length === 0 ? (
                    <p className="text-xs text-gray-500 italic bg-white border border-gray-200 rounded-xl p-3 text-center">
                      {t('សិស្សបានចុះឈ្មោះគ្រប់មុខវិជ្ជាដែលមានរួចរាល់ហើយ។ (All available courses enrolled)', 'All available courses enrolled')}
                    </p>
                  ) : (
                    <form onSubmit={handleEnrollCourse} className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <select
                          value={selectedCourseToEnroll}
                          onChange={(e) => setSelectedCourseToEnroll(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-white text-sm"
                        >
                          <option value="">{t('ជ្រើសរើសមុខវិជ្ជាដើម្បីចុះឈ្មោះ...', 'Select course to enroll...')}</option>
                          {allCourses
                            .filter(course => !studentEnrollments.some(e => e.course_id === course.id))
                            .map(course => (
                              <option key={course.id} value={course.id}>
                                {course.course_code} - {course.course_name} ({course.credit} {t('ក្រេឌីត', 'Credits')} / {course.teacher ? `${course.teacher.first_name} ${course.teacher.last_name}` : t('គ្មានគ្រូ', 'No Teacher')})
                              </option>
                            ))}
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="px-6 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 shadow-sm transition-all hover:shadow-md flex items-center justify-center gap-2 flex-shrink-0"
                      >
                        <PlusIcon className="h-4 w-4" />
                        {t('ចុះឈ្មោះចូលរៀន', 'Enroll Course')}
                      </button>
                    </form>
                  )}
                </div>

                {/* section 2: Current enrollments list */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
                    <AcademicCapIcon className="h-4 w-4 text-indigo-600" />
                    {t('មុខវិជ្ជាកំពុងសិក្សា', 'Enrolled Courses')} ({studentEnrollments.length})
                  </h3>
                  
                  {studentEnrollments.length === 0 ? (
                    <div className="text-center py-10 border border-dashed border-gray-200 rounded-2xl">
                      <BookOpenIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 font-medium">{t('មិនទាន់បានចុះឈ្មោះមុខវិជ្ជាណាមួយនៅឡើយទេ', 'No courses enrolled yet')}</p>
                      <p className="text-xs text-gray-400 mt-1">{t('សូមជ្រើសរើសមុខវិជ្ជាខាងលើដើម្បីចុះឈ្មោះចូលរៀន', 'Please select a course above to enroll')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {studentEnrollments.map((enrollment) => (
                        <div 
                          key={enrollment.id} 
                          className="flex items-center justify-between p-4 bg-white border border-gray-150 rounded-2xl hover:shadow-sm hover:border-gray-300 transition-all"
                        >
                          <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0 font-medium text-xs font-mono">
                              {enrollment.course?.course_code || 'Sub'}
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 leading-snug">
                                {enrollment.course?.course_name || t('ឈ្មោះមុខវិជ្ជា', 'Course Name')}
                              </h4>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {t('គ្រូទទួលបន្ទុក៖', 'Teacher:')} <span className="text-gray-700">{enrollment.course?.teacher ? `${enrollment.course.teacher.first_name} ${enrollment.course.teacher.last_name}` : '—'}</span> &bull; {enrollment.course?.credit || 3} {t('ក្រេឌីត', 'Credits')}
                              </p>
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => handleUnenrollCourse(enrollment.course_id)}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all"
                            title={t('លុបមុខវិជ្ជាចេញ', 'Remove Course')}
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowEnrollmentModal(false)}
                className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
              >
                {t('រួចរាល់', 'Done')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL - នាំចូលទិន្នន័យ Excel (Import Excel) */}
      {/* ========================================== */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl mx-4 p-8 max-h-[90vh] overflow-y-auto flex flex-col animate-scaleIn">
            <div className="flex justify-between items-center pb-4 border-b border-gray-100 mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="bg-amber-100 text-amber-600 p-2 rounded-xl">
                    <ArrowUpTrayIcon className="h-5 w-5" />
                  </span>
                  {t('នាំចូលទិន្នន័យសិស្សពី Excel (Import Students)', 'Import Students from Excel')}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {t('ជ្រើសរើសឯកសារ Excel (.xlsx, .xls) ដើម្បីបញ្ចូលសិស្សច្រើននាក់ក្នុងពេលតែមួយ', 'Select Excel file (.xlsx, .xls) to import multiple students at once')}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportPreview([]);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6 flex-1">
              {/* Template Download banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <DocumentArrowDownIcon className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-amber-900">{t('ទាញយកទម្រង់គំរូ (Download Template)', 'Download Template')}</h3>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {t('ទាញយកទម្រង់គំរូ Excel ដើម្បីបំពេញព័ត៌មានសិស្សឱ្យបានត្រឹមត្រូវមុនពេល Upload', 'Download Excel sample template to fill student details correctly before uploading')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-xl hover:bg-amber-700 transition-all shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  {t('ទាញយកទម្រង់គំរូ', 'Download Template')}
                </button>
              </div>

              {/* File upload input */}
              <div className="border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-2xl p-6 text-center transition-all bg-gray-50/50 hover:bg-indigo-50/20">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  id="excel-file-input"
                  className="hidden"
                />
                <label htmlFor="excel-file-input" className="cursor-pointer flex flex-col items-center justify-center">
                  <ArrowUpTrayIcon className="h-10 w-10 text-indigo-500 mb-2 animate-bounce" />
                  <span className="text-sm font-medium text-gray-700">{t('ចុចទីនេះដើម្បីជ្រើសរើសឯកសារ Excel', 'Click here to select Excel file')}</span>
                  <span className="text-xs text-gray-400 mt-1">{t('គាំទ្រតែប្រភេទ .xlsx និង .xls ប៉ុណ្ណោះ', 'Supports .xlsx and .xls files only')}</span>
                </label>
              </div>

              {/* Preview section */}
              {importPreview.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                      {t('លទ្ធផលពិនិត្យមើលទិន្នន័យ', 'Data Preview Result')} ({importPreview.length} {t('ជួរ', 'rows')})
                    </h3>
                    <div className="flex gap-3 text-xs">
                      <span className="text-emerald-600 font-medium flex items-center gap-1">
                        <CheckCircleIcon className="h-4 w-4" />
                        {t('ត្រឹមត្រូវ:', 'Valid:')} {importPreview.filter(r => r.isValid).length}
                      </span>
                      <span className="text-rose-600 font-medium flex items-center gap-1">
                        <ExclamationCircleIcon className="h-4 w-4" />
                        {t('មានកំហុស:', 'Errors:')} {importPreview.filter(r => !r.isValid).length}
                      </span>
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-xl overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">{t('ជួរ #', 'Row #')}</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">{t('ឈ្មោះ', 'Name')}</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">{t('អ៊ីមែល', 'Email')}</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">{t('អត្តលេខ', 'Student Code')}</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">{t('ដេប៉ាតឺម៉ង់', 'Department')}</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">{t('ស្ថានភាព', 'Status')}</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {importPreview.map((row, idx) => (
                          <tr key={idx} className={row.isValid ? 'hover:bg-gray-50' : 'bg-rose-50/60'}>
                            <td className="px-3 py-2 whitespace-nowrap font-mono">{row.rowIndex}</td>
                            <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                              {row.data.first_name} {row.data.last_name}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-600">{row.data.email}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-600">{row.data.student_code || '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                              {row.data.department_name || '—'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                  <CheckCircleIcon className="h-3.5 w-3.5" /> {t('ត្រឹមត្រូវ', 'Valid')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-rose-600 font-medium" title={row.errors.join(', ')}>
                                  <ExclamationCircleIcon className="h-3.5 w-3.5" /> {row.errors.join(', ')}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportPreview([]);
                }}
                className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                {t('បោះបង់', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={isImporting || importPreview.filter(r => r.isValid).length === 0}
                onClick={handleConfirmImport}
                className="px-6 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-xl hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {t('កំពុងនាំចូល...', 'Importing...')}
                  </>
                ) : (
                  <>
                    <ArrowUpTrayIcon className="h-4 w-4" />
                    {t('បញ្ជាក់ការនាំចូល', 'Confirm Import')} ({importPreview.filter(r => r.isValid).length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageStudents;
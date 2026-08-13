// src/components/admin/ManageTeachers.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useLanguage } from '../../context/LanguageContext';
import * as XLSX from 'xlsx';
import { 
  PencilIcon, 
  TrashIcon, 
  PlusIcon, 
  AcademicCapIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  DocumentArrowDownIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

const ManageTeachers = () => {
  const { t } = useLanguage();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [teacherRoleId, setTeacherRoleId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Import states
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [isImporting, setIsImporting] = useState(false);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    status: 'active',
    gender: '',
    phone: '',
    teacher_code: '',
    department_id: '',
    specialization: '',
    employment_type: 'Full-time',
    date_of_birth: '',
  });

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchTeachers(),
          fetchDepartments(),
          fetchTeacherRole()
        ]);
      } catch (error) {
        console.error("Error loading initial data", error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  const fetchTeachers = async () => {
    try {
      const response = await api.get('/admin/teachers');
      setTeachers(response.data.data.data || response.data.data || []);
    } catch (error) {
      console.error('Error fetching teachers:', error);
      toast.error(t('មិនអាចទាញយកបញ្ជីគ្រូបង្រៀនបានទេ', 'Cannot fetch teachers list'));
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/admin/departments');
      setDepartments(response.data.data || response.data || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
      toast.error(t('មិនអាចទាញយកបញ្ជីដេប៉ាតឺម៉ង់បានទេ', 'Cannot fetch departments list'));
    }
  };

  const fetchTeacherRole = async () => {
    try {
      const response = await api.get('/roles');
      const rolesData = response.data.data || response.data;
      const teacherRole = rolesData.find(r => r.role_name === 'Teacher');
      if (teacherRole) {
        setTeacherRoleId(teacherRole.id);
      }
    } catch (error) {
      console.error('Error fetching teacher role:', error);
      toast.error(t('មិនអាចទាញយកតួនាទីគ្រូបង្រៀនបានទេ', 'Cannot fetch teacher role'));
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const payload = { 
      ...formData,
      role_id: teacherRoleId
    };
    
    if (editingTeacher && !payload.password) {
      delete payload.password;
    }

    try {
      if (editingTeacher) {
        await api.put(`/admin/teachers/${editingTeacher.id}`, payload);
        toast.success(t('បានកែប្រែព័ត៌មានគ្រូបង្រៀនដោយជោគជ័យ', 'Teacher updated successfully'));
        localStorage.setItem('teachersUpdated', Date.now().toString());
        window.dispatchEvent(new Event('storage'));
      } else {
        await api.post('/admin/teachers', payload);
        toast.success(t('បានបន្ថែមគ្រូបង្រៀនដោយជោគជ័យ', 'Teacher added successfully'));
        localStorage.setItem('teachersUpdated', Date.now().toString());
        window.dispatchEvent(new Event('storage'));
      }
      setShowModal(false);
      resetForm();
      fetchTeachers();
    } catch (error) {
      console.error('Submit error:', error.response?.data);
      toast.error(error.response?.data?.message || t('ការធ្វើប្រតិបត្តិការបានបរាជ័យ', 'Operation failed'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('តើអ្នកប្រាកដថាចង់លុបគ្រូបង្រៀននេះមែនទេ?', 'Are you sure you want to delete this teacher?'))) {
      try {
        await api.delete(`/admin/teachers/${id}`);
        toast.success(t('បានលុបគ្រូបង្រៀនដោយជោគជ័យ', 'Teacher deleted successfully'));
        localStorage.setItem('teacherDeleted', Date.now().toString());
        window.dispatchEvent(new Event('storage'));
        fetchTeachers();
      } catch (error) {
        toast.error(error.response?.data?.message || t('មិនអាចលុបគ្រូបង្រៀនបានទេ', 'Cannot delete teacher'));
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
      gender: '',
      phone: '',
      teacher_code: '',
      department_id: '',
      specialization: '',
      employment_type: 'Full-time',
      date_of_birth: '',
    });
    setEditingTeacher(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      first_name: teacher.first_name || '',
      last_name: teacher.last_name || '',
      email: teacher.email || '',
      password: '',
      status: teacher.user?.status || teacher.status || 'active',
      gender: teacher.gender || '',
      phone: teacher.phone || '',
      teacher_code: teacher.teacher_code || '',
      department_id: teacher.department_id || '',
      specialization: teacher.specialization || '',
      employment_type: teacher.employment_type || 'Full-time',
      date_of_birth: teacher.date_of_birth || '',
    });
    setShowModal(true);
  };

  // Export Excel Functionality
  const handleExportExcel = async () => {
    try {
      toast.info(t('កំពុងរៀបចំទិន្នន័យសម្រាប់នាំចេញ...', 'Preparing data for export...'));
      let dataToExport = teachers;
      
      try {
        const response = await api.get('/admin/teachers/export-all');
        if (response.data?.data && Array.isArray(response.data.data)) {
          dataToExport = response.data.data;
        }
      } catch (err) {
        console.log('Export all API fallback to current state data');
      }

      if (!dataToExport || dataToExport.length === 0) {
        toast.warning(t('គ្មានទិន្នន័យគ្រូបង្រៀនសម្រាប់នាំចេញទេ', 'No teacher data to export'));
        return;
      }

      const formattedData = dataToExport.map((tItem, index) => ({
        [t('ល.រ (No)', 'No')]: index + 1,
        [t('អត្តលេខគ្រូ (Teacher Code)', 'Teacher Code')]: tItem.teacher_code || '',
        [t('នាមខ្លួន (First Name)', 'First Name')]: tItem.first_name || '',
        [t('នាមត្រកូល (Last Name)', 'Last Name')]: tItem.last_name || '',
        [t('ភេទ (Gender)', 'Gender')]: tItem.gender === 'Male' ? t('ប្រុស', 'Male') : tItem.gender === 'Female' ? t('ស្រី', 'Female') : (tItem.gender || ''),
        [t('អ៊ីមែល (Email)', 'Email')]: tItem.email || '',
        [t('លេខទូរស័ព្ទ (Phone)', 'Phone')]: tItem.phone || '',
        [t('ដេប៉ាតឺម៉ង់ (Department)', 'Department')]: tItem.department?.department_name || tItem.department?.name || '',
        [t('ឯកទេស (Specialization)', 'Specialization')]: tItem.specialization || '',
        [t('ប្រភេទការងារ (Employment Type)', 'Employment Type')]: tItem.employment_type || '',
        [t('ថ្ងៃខែឆ្នាំកំណើត (DOB)', 'Date of Birth')]: tItem.date_of_birth || '',
        [t('ស្ថានភាព (Status)', 'Status')]: tItem.user?.status === 'active' || tItem.status === 'active' ? t('សកម្ម', 'Active') : t('អសកម្ម', 'Inactive')
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
        { wch: 22 }, // Specialization
        { wch: 18 }, // Employment
        { wch: 16 }, // DOB
        { wch: 12 }, // Status
      ];
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Teachers');

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Teachers_List_${today}.xlsx`);
      toast.success(t('បាននាំចេញទិន្នន័យគ្រូបង្រៀនជា Excel ដោយជោគជ័យ', 'Exported teacher data to Excel successfully'));
    } catch (error) {
      console.error('Export Excel error:', error);
      toast.error(t('បរាជ័យក្នុងការនាំចេញ Excel', 'Failed to export Excel'));
    }
  };

  // Download Excel Sample Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'first_name': 'Sok',
        'last_name': 'Dara',
        'email': 'sok.dara@example.com',
        'phone': '012345678',
        'gender': 'Male',
        'teacher_code': 'TCH-2026-0001',
        'department': departments[0]?.department_name || departments[0]?.name || 'Computer Science',
        'specialization': 'Web Development',
        'employment_type': 'Full-time',
        'date_of_birth': '1990-05-15',
        'password': 'Password123'
      },
      {
        'first_name': 'Keo',
        'last_name': 'Bopha',
        'email': 'keo.bopha@example.com',
        'phone': '098765432',
        'gender': 'Female',
        'teacher_code': 'TCH-2026-0002',
        'department': departments[1]?.department_name || departments[1]?.name || 'Information Technology',
        'specialization': 'Cyber Security',
        'employment_type': 'Part-time',
        'date_of_birth': '1992-08-20',
        'password': 'Password123'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const colWidths = [
      { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 },
      { wch: 10 }, { wch: 18 }, { wch: 25 }, { wch: 20 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, 'teacher_import_template.xlsx');
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
    if (k.includes('code') || k.includes('អត្តលេខ')) return 'teacher_code';
    if (k.includes('gender') || k.includes('ភេទ')) return 'gender';
    if (k.includes('department') || k.includes('ដេប៉ាតឺម៉ង់')) return 'department';
    if (k.includes('specialization') || k.includes('ឯកទេស')) return 'specialization';
    if (k.includes('employment') || k.includes('ការងារ')) return 'employment_type';
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

        const existingEmails = new Set(teachers.map(tItem => tItem.email?.toLowerCase()));
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

          const deptId = findDepartmentId(item.department);

          return {
            rowIndex: idx + 2,
            raw: row,
            data: {
              first_name: item.first_name || '',
              last_name: item.last_name || '',
              email: item.email || '',
              phone: item.phone || '',
              gender: gender || '',
              teacher_code: item.teacher_code || '',
              department_id: deptId,
              department_name: item.department || '',
              specialization: item.specialization || '',
              employment_type: item.employment_type || 'Full-time',
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
      const response = await api.post('/admin/teachers/import', { teachers: validItems });
      toast.success(response.data?.message || t(`បាននាំចូលគ្រូបង្រៀន ${validItems.length} នាក់ដោយជោគជ័យ`, `Imported ${validItems.length} teachers successfully`));
      localStorage.setItem('teachersUpdated', Date.now().toString());
      window.dispatchEvent(new Event('storage'));
      setShowImportModal(false);
      setImportPreview([]);
      fetchTeachers();
    } catch (error) {
      console.error('Import submit error:', error);
      toast.error(error.response?.data?.message || t('ការនាំចូលទិន្នន័យបានបរាជ័យ', 'Failed to import data'));
    } finally {
      setIsImporting(false);
    }
  };

  // Filter teachers based on search
  const filteredTeachers = teachers.filter(teacher => {
    const search = searchTerm.toLowerCase();
    return (
      teacher.first_name?.toLowerCase().includes(search) ||
      teacher.last_name?.toLowerCase().includes(search) ||
      teacher.email?.toLowerCase().includes(search) ||
      teacher.teacher_code?.toLowerCase().includes(search) ||
      teacher.specialization?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                <AcademicCapIcon className="h-6 w-6" />
              </span>
              {t('គ្រប់គ្រងគ្រូបង្រៀន', 'Manage Teachers')}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{t('បន្ថែម និងគ្រប់គ្រងគណនីគ្រូបង្រៀនក្នុងប្រព័ន្ធ', 'Add and manage teacher accounts in the system')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-emerald-700 transition-all hover:shadow-md cursor-pointer"
              title={t('នាំចេញបញ្ជីគ្រូបង្រៀនជា Excel', 'Export teacher list to Excel')}
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
              title={t('នាំចូលទិន្នន័យគ្រូបង្រៀនពី Excel', 'Import teacher data from Excel')}
            >
              <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
              {t('នាំចូល Excel', 'Import Excel')}
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition-all hover:shadow-md cursor-pointer"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              {t('បន្ថែមគ្រូបង្រៀន', 'Add Teacher')}
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
            placeholder={t('ស្វែងរកតាមឈ្មោះ អ៊ីមែល អត្តលេខ ឬឯកទេស...', 'Search by name, email, code or specialization...')}
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
          <p className="mt-6 text-base font-medium text-gray-600">{t('កំពុងផ្ទុកទិន្នន័យគ្រូបង្រៀន...', 'Loading teachers data...')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('សូមរង់ចាំមួយភ្លែត', 'Please wait a moment')}</p>
        </div>
      ) : (
        /* Teachers Table */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('គ្រូបង្រៀន', 'Teacher')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('អត្តលេខ', 'Teacher Code')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('អ៊ីមែល', 'Email')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ដេប៉ាតឺម៉ង់', 'Department')}
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
                {filteredTeachers?.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-14 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <AcademicCapIcon className="h-16 w-16 text-gray-300 mb-3" />
                        <p className="font-medium">
                          {searchTerm ? t('មិនឃើញលទ្ធផលស្វែងរក', 'No search results found') : t('មិនទាន់មានគ្រូបង្រៀននៅឡើយទេ', 'No teachers available yet')}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          {searchTerm ? t('សូមប្តូរពាក្យស្វែងរក', 'Please try a different search term') : t('ចុច "បន្ថែមគ្រូបង្រៀន" ឬ "នាំចូល Excel" ដើម្បីចាប់ផ្តើម', 'Click "Add Teacher" or "Import Excel" to get started')}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTeachers?.map((teacher) => (
                    <tr key={teacher.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
                            {teacher.profile_image ? (
                              <img 
                                src={teacher.profile_image} 
                                alt="Profile" 
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.parentElement.innerHTML = `<span>${teacher.first_name?.[0] || ''}${teacher.last_name?.[0] || ''}</span>`;
                                }}
                              />
                            ) : (
                              <span>{teacher.first_name?.[0] || ''}{teacher.last_name?.[0] || ''}</span>
                            )}
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {teacher.first_name} {teacher.last_name}
                            </div>
                            <div className="text-xs text-gray-500">{teacher.specialization || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {teacher.teacher_code || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {teacher.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {teacher.department?.department_name || teacher.department?.name || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                          teacher.user?.status === 'active' || teacher.status === 'active'
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {teacher.user?.status === 'active' || teacher.status === 'active' ? t('សកម្ម', 'Active') : t('អសកម្ម', 'Inactive')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => openEditModal(teacher)}
                            className="p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all"
                            title={t('កែប្រែ', 'Edit')}
                          >
                            <PencilIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(teacher.id)}
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
          
          {/* Footer count */}
          {!loading && filteredTeachers.length > 0 && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-sm text-gray-600">
                {t('បង្ហាញ', 'Showing')} <span className="font-medium text-gray-900">{filteredTeachers.length}</span> {t('នាក់', 'teachers')} 
                {teachers.length !== filteredTeachers.length && (
                  <span> {t('ក្នុងចំណោម', 'out of')} <span className="font-medium text-gray-900">{teachers.length}</span> {t('នាក់', 'total')}</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modal - Create/Edit Teacher */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 p-8 max-h-[90vh] overflow-y-auto animate-scaleIn">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                  <AcademicCapIcon className="h-5 w-5" />
                </span>
                {editingTeacher ? t('កែប្រែគ្រូបង្រៀន', 'Edit Teacher') : t('បន្ថែមគ្រូបង្រៀនថ្មី', 'Add New Teacher')}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center gap-2">
                <AcademicCapIcon className="h-5 w-5 text-purple-600" />
                <span className="text-sm text-purple-700">
                  <strong>{t('តួនាទី៖', 'Role:')}</strong> {t('គ្រូបង្រៀន (កំណត់ដោយស្វ័យប្រវត្តិ)', 'Teacher (Auto-assigned)')}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                  />
                </div>

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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('អត្តលេខគ្រូ', 'Teacher Code')}
                  </label>
                  <input
                    type="text"
                    name="teacher_code"
                    value={formData.teacher_code}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="TCH-2026-0001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('ភេទ', 'Gender')}
                  </label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="">{t('ជ្រើសរើស', 'Select Gender')}</option>
                    <option value="Male">{t('ប្រុស', 'Male')}</option>
                    <option value="Female">{t('ស្រី', 'Female')}</option>
                    <option value="Other">{t('ផ្សេងៗ', 'Other')}</option>
                  </select>
                </div>

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
                    {departments?.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.department_name || dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('ឯកទេស', 'Specialization')}
                  </label>
                  <input
                    type="text"
                    name="specialization"
                    value={formData.specialization}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="ឧ. Network, Web Development"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('ប្រភេទការងារ', 'Employment Type')}
                  </label>
                  <select
                    name="employment_type"
                    value={formData.employment_type}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="Full-time">{t('ពេញម៉ោង', 'Full-time')}</option>
                    <option value="Part-time">{t('ក្រៅម៉ោង', 'Part-time')}</option>
                    <option value="Contract">{t('កិច្ចសន្យា', 'Contract')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {editingTeacher ? t('ពាក្យសម្ងាត់ (ទុកឲ្យទទេ ដើម្បីរក្សាដដែល)', 'Password (Leave blank to keep unchanged)') : t('ពាក្យសម្ងាត់', 'Password')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    name="password"
                    required={!editingTeacher}
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
                  <AcademicCapIcon className="h-5 w-5" />
                  {editingTeacher ? t('រក្សាទុក', 'Save Changes') : t('បង្កើតគ្រូបង្រៀន', 'Create Teacher')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Import Excel */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 p-8 max-h-[90vh] overflow-y-auto animate-scaleIn">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="bg-amber-100 text-amber-600 p-2 rounded-xl">
                  <ArrowUpTrayIcon className="h-5 w-5" />
                </span>
                {t('នាំចូលទិន្នន័យគ្រូបង្រៀនពី Excel', 'Import Teachers from Excel')}
              </h2>
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

            <div className="space-y-6">
              {/* Instructions & Template Download */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-semibold text-amber-900 text-sm">{t('ណែនាំសម្រាប់ការនាំចូល៖', 'Import Instructions:')}</h4>
                  <p className="text-xs text-amber-700 mt-1">
                    {t('សូមទាញយកទម្រង់គំរូ Excel ហើយបំពេញព័ត៌មានគ្រូបង្រៀនតាមច្បាប់ (នាមខ្លួន, នាមត្រកូល, អ៊ីមែល គឺត្រូវតែបំពេញ)។', 'Please download the Excel template and fill in required teacher fields (First Name, Last Name, Email).')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center px-4 py-2 bg-white border border-amber-300 text-amber-800 text-xs font-semibold rounded-xl hover:bg-amber-100 transition-all shrink-0 shadow-sm cursor-pointer"
                >
                  <DocumentArrowDownIcon className="h-4 w-4 mr-1.5 text-amber-600" />
                  {t('ទាញយកទម្រង់គំរូ Excel', 'Download Excel Template')}
                </button>
              </div>

              {/* Upload Input Box */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('ជ្រើសរើស ឬទម្លាក់ឯកសារ Excel (.xlsx, .xls, .csv)', 'Select or drop Excel file (.xlsx, .xls, .csv)')}
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2.5 file:px-4
                    file:rounded-xl file:border-0
                    file:text-sm file:font-semibold
                    file:bg-amber-50 file:text-amber-700
                    hover:file:bg-amber-100
                    border border-gray-300 rounded-xl p-2 cursor-pointer"
                />
              </div>

              {/* Preview Section */}
              {importPreview.length > 0 && (
                <div className="space-y-4">
                  {/* Summary Bar */}
                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                    <span className="bg-gray-100 text-gray-800 px-3 py-1.5 rounded-xl">
                      {t('សរុប៖', 'Total:')} {importPreview.length} {t('ជួរ', 'rows')}
                    </span>
                    <span className="bg-green-100 text-green-800 px-3 py-1.5 rounded-xl flex items-center gap-1">
                      <CheckCircleIcon className="h-4 w-4 text-green-600" />
                      {t('ត្រឹមត្រូវ៖', 'Valid:')} {importPreview.filter(r => r.isValid).length} {t('ជួរ', 'rows')}
                    </span>
                    {importPreview.filter(r => !r.isValid).length > 0 && (
                      <span className="bg-red-100 text-red-800 px-3 py-1.5 rounded-xl flex items-center gap-1">
                        <ExclamationCircleIcon className="h-4 w-4 text-red-600" />
                        {t('មានកំហុស៖', 'Errors:')} {importPreview.filter(r => !r.isValid).length} {t('ជួរ', 'rows')}
                      </span>
                    )}
                  </div>

                  {/* Table Preview */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500">{t('ជួរ', 'Row')}</th>
                          <th className="px-3 py-2 text-left text-gray-500">{t('ឈ្មោះ', 'Name')}</th>
                          <th className="px-3 py-2 text-left text-gray-500">{t('អ៊ីមែល', 'Email')}</th>
                          <th className="px-3 py-2 text-left text-gray-500">{t('អត្តលេខ', 'Teacher Code')}</th>
                          <th className="px-3 py-2 text-left text-gray-500">{t('ដេប៉ាតឺម៉ង់', 'Department')}</th>
                          <th className="px-3 py-2 text-left text-gray-500">{t('ស្ថានភាពពិនិត្យ', 'Validation Status')}</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {importPreview.map((row) => (
                          <tr key={row.rowIndex} className={row.isValid ? 'hover:bg-gray-50' : 'bg-red-50/50'}>
                            <td className="px-3 py-2 font-mono text-gray-600">#{row.rowIndex}</td>
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {row.data.first_name} {row.data.last_name}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{row.data.email}</td>
                            <td className="px-3 py-2 text-gray-600">{row.data.teacher_code || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">
                              {departments.find(d => d.id === row.data.department_id)?.department_name || row.data.department_name || '—'}
                            </td>
                            <td className="px-3 py-2">
                              {row.isValid ? (
                                <span className="inline-flex items-center text-green-700 font-medium">
                                  <CheckCircleIcon className="h-4 w-4 mr-1 text-green-600" />
                                  {t('ត្រឹមត្រូវ', 'Valid')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-red-600 font-medium">
                                  <ExclamationCircleIcon className="h-4 w-4 mr-1 text-red-500" />
                                  {row.errors.join(', ')}
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

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
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
                  className="px-5 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <ArrowUpTrayIcon className="h-5 w-5" />
                  {isImporting ? t('កំពុងនាំចូល...', 'Importing...') : `${t('នាំចូលទិន្នន័យ', 'Import Data')} (${importPreview.filter(r => r.isValid).length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageTeachers;
// src/components/admin/ManageStudents.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { 
  PencilIcon, 
  TrashIcon, 
  PlusIcon, 
  UserGroupIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  AcademicCapIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';

const ManageStudents = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [studentRoleId, setStudentRoleId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
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

  useEffect(() => {
    fetchStudents();
    fetchDepartments();
    fetchStudentRole();
  }, []);

  const fetchStudents = async () => {
    try {
      const response = await api.get('/admin/students');
      setStudents(response.data.data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast.error('មិនអាចទាញយកទិន្នន័យសិស្សបានទេ');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/admin/departments');
      setDepartments(response.data.data || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchStudentRole = async () => {
    try {
      const response = await api.get('/roles');
      const rolesData = response.data.data || response.data;
      const studentRole = rolesData.find(r => r.role_name === 'Student');
      if (studentRole) {
        setStudentRoleId(studentRole.id);
        console.log('Student Role ID:', studentRole.id);
      }
    } catch (error) {
      console.error('Error fetching student role:', error);
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
      // បង្កើត preview URL
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
      toast.error('មិនអាចទាញយកតួនាទីសិស្សបានទេ');
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
        toast.success('បានកែប្រែព័ត៌មានសិស្សដោយជោគជ័យ');
        
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
        toast.success('បានបន្ថែមសិស្សដោយជោគជ័យ');
      }
      
      console.log('Response:', response.data);
      
      setShowModal(false);
      resetForm();
      fetchStudents();
      localStorage.setItem('studentsUpdated', Date.now().toString());
      window.dispatchEvent(new Event('storage'));
      
    } catch (error) {
      console.error('Submit error:', error.response?.data);
      
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        const errorMessages = Object.values(errors).flat().join('\n');
        toast.error(errorMessages);
      } else {
        toast.error(error.response?.data?.message || 'ការធ្វើប្រតិបត្តិការបានបរាជ័យ');
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('តើអ្នកប្រាកដថាចង់លុបសិស្សនេះមែនទេ?')) {
      try {
        await api.delete(`/admin/students/${id}`);
        toast.success('បានលុបសិស្សដោយជោគជ័យ');
        localStorage.setItem('studentDeleted', Date.now().toString());
        window.dispatchEvent(new Event('storage'));
        fetchStudents();
      } catch (error) {
        toast.error(error.response?.data?.message || 'មិនអាចលុបសិស្សបានទេ');
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
      'Monday-Friday': 'ចន្ទ-សុក្រ',
      'Saturday-Sunday': 'សៅរ៍-អាទិត្យ'
    };
    return shifts[shift] || shift;
  };

  const getDegreeLevelLabel = (level) => {
    const levels = {
      'Associate Degree': 'បរិញ្ញាបត្ររង',
      'Bachelor Degree': 'បរិញ្ញាបត្រ',
      'Master Degree': 'បរិញ្ញាបត្រជាន់ខ្ពស់'
    };
    return levels[level] || level;
  };

  // ==============================================
  // មុខងារទាញយក URL រូបភាព
  // ==============================================
  const getProfileImageUrl = (imagePath) => {
    if (!imagePath) return null;
    // ប្រសិនបើរូបភាពជា URL ពេញលេញ
    if (imagePath.startsWith('http')) {
      return imagePath;
    }
    // ប្រសិនបើរូបភាពត្រូវបានរក្សាទុកក្នុង storage
    return `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/storage/${imagePath}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">កំពុងផ្ទុកទិន្នន័យ...</p>
        </div>
      </div>
    );
  }

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
              គ្រប់គ្រងសិស្ស
            </h1>
            <p className="text-sm text-gray-500 mt-1">បន្ថែម និងគ្រប់គ្រងគណនីសិស្សក្នុងប្រព័ន្ធ</p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition-all hover:shadow-md"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            បន្ថែមសិស្ស
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="ស្វែងរកតាមឈ្មោះ អ៊ីមែល អត្តលេខ ឬជំនាន់..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  សិស្ស
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  រូបភាព
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  អត្តលេខ
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  អ៊ីមែល
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ដេប៉ាតឺម៉ង់
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  វេនសិក្សា
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ស្ថានភាព
                </th>
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  សកម្មភាព
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-14 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <UserGroupIcon className="h-16 w-16 text-gray-300 mb-3" />
                      <p className="font-medium">
                        {searchTerm ? 'មិនឃើញលទ្ធផលស្វែងរក' : 'មិនទាន់មានសិស្សនៅឡើយទេ'}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {searchTerm ? 'សូមប្តូរពាក្យស្វែងរក' : 'ចុច "បន្ថែមសិស្ស" ដើម្បីចាប់ផ្តើម'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-green-500 to-teal-500 flex items-center justify-center text-white font-medium text-sm shadow-sm">
                          {student.first_name?.charAt(0)}{student.last_name?.charAt(0)}
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      {student.profile_image ? (
                        <img 
                          src={getProfileImageUrl(student.profile_image)}
                          alt={student.first_name}
                          className="h-10 w-10 rounded-full object-cover border-2 border-gray-200"
                          onError={(e) => {
                            e.target.src = ''; // ប្រសិនបើរូបភាពផ្ទុកមិនបាន
                            e.target.className = 'hidden'; // លាក់ img
                          }}
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <PhotoIcon className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
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
                        {student.user?.status === 'active' ? 'សកម្ម' : 'អសកម្ម'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => openEditModal(student)}
                          className="p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all"
                          title="កែប្រែ"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(student.id)}
                          className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-xl transition-all"
                          title="លុប"
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
              បង្ហាញ <span className="font-medium text-gray-900">{filteredStudents.length}</span> នាក់ 
              {students.length !== filteredStudents.length && (
                <span> ក្នុងចំណោម <span className="font-medium text-gray-900">{students.length}</span> នាក់</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Modal - Create/Edit Student (ដូចដើម) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                  <UserGroupIcon className="h-5 w-5" />
                </span>
                {editingStudent ? 'កែប្រែសិស្ស' : 'បន្ថែមសិស្សថ្មី'}
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
                  <strong>តួនាទី៖</strong> សិស្ស (កំណត់ដោយស្វ័យប្រវត្តិ)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Row 1: First Name & Last Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    នាមខ្លួន <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    required
                    value={formData.first_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="ឧ. សុខ"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    នាមត្រកូល <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    required
                    value={formData.last_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="ឧ. សិស្ស"
                  />
                </div>

                {/* Row 2: Email & Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    អ៊ីមែល <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="student@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    លេខទូរស័ព្ទ
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="+855 12 345 678"
                  />
                </div>

                {/* Row 3: Student Code & Gender */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    អត្តលេខសិស្ស
                  </label>
                  <input
                    type="text"
                    name="student_code"
                    value={formData.student_code}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="STU-2024-0001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    ភេទ <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="gender"
                    required
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="Male">ប្រុស</option>
                    <option value="Female">ស្រី</option>
                    <option value="Other">ផ្សេងៗ</option>
                  </select>
                </div>

                {/* Row 4: Date of Birth & Department */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    ថ្ងៃខែឆ្នាំកំណើត
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
                    ដេប៉ាតឺម៉ង់
                  </label>
                  <select
                    name="department_id"
                    value={formData.department_id}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="">ជ្រើសរើសដេប៉ាតឺម៉ង់</option>
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
                    ជំនាន់/ឆ្នាំសិក្សា
                  </label>
                  <input
                    type="text"
                    name="batch_year"
                    value={formData.batch_year}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="ឧ. Batch 15, Year 1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    កម្រិតសិក្សា
                  </label>
                  <select
                    name="degree_level"
                    value={formData.degree_level}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="">ជ្រើសរើសកម្រិត</option>
                    <option value="Associate Degree">បរិញ្ញាបត្ររង</option>
                    <option value="Bachelor Degree">បរិញ្ញាបត្រ</option>
                    <option value="Master Degree">បរិញ្ញាបត្រជាន់ខ្ពស់</option>
                  </select>
                </div>

                {/* Row 6: Study Shift & Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    វេនសិក្សា <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="study_shift"
                    required
                    value={formData.study_shift}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="Monday-Friday">ចន្ទ-សុក្រ</option>
                    <option value="Saturday-Sunday">សៅរ៍-អាទិត្យ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    អាសយដ្ឋាន
                  </label>
                  <textarea
                    rows="2"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                    placeholder="អាសយដ្ឋានបច្ចុប្បន្ន..."
                  />
                </div>

                {/* Row 7: Profile Image */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <PhotoIcon className="h-5 w-5 inline mr-1 text-gray-500" />
                    រូបភាពប្រវត្តិរូប
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <input
                        type="file"
                        name="profile_image"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                      />
                    </div>
                    {previewImage && (
                      <div className="shrink-0">
                        <img 
                          src={previewImage} 
                          alt="Preview" 
                          className="h-16 w-16 rounded-full object-cover border-2 border-indigo-200"
                        />
                      </div>
                    )}
                  </div>
                  {editingStudent && editingStudent.profile_image && !previewImage && (
                    <p className="mt-1 text-xs text-gray-500">
                      រូបភាពបច្ចុប្បន្ន: {editingStudent.profile_image}
                    </p>
                  )}
                </div>

                {/* Row 8: Password & Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {editingStudent ? 'ពាក្យសម្ងាត់ (ទុកឲ្យទទេ ដើម្បីរក្សាដដែល)' : 'ពាក្យសម្ងាត់'} <span className="text-red-500">*</span>
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
                    ស្ថានភាព
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="active">សកម្ម</option>
                    <option value="inactive">អសកម្ម</option>
                  </select>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2"
                >
                  <UserGroupIcon className="h-5 w-5" />
                  {editingStudent ? 'រក្សាទុក' : 'បង្កើតសិស្ស'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageStudents;
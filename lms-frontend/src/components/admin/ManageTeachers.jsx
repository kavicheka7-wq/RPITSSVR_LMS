// src/components/admin/ManageTeachers.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { 
  PencilIcon, 
  TrashIcon, 
  PlusIcon, 
  AcademicCapIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const ManageTeachers = () => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [teacherRoleId, setTeacherRoleId] = useState(null); // រក្សាទុក role_id របស់ Teacher
  const [searchTerm, setSearchTerm] = useState('');
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

// ប្ដូរ useEffect មកប្រើទម្រង់ Promise.all វិញ
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true); // លោត Loading តែម្ដងគត់នៅដើមទី
      try {
        // ហៅ API ទាំង ៣ ឲ្យរត់ព្រមគ្នា ដើម្បីចំណេញពេល
        await Promise.all([
          fetchTeachers(),
          fetchDepartments(),
          fetchTeacherRole()
        ]);
      } catch (error) {
        console.error("Error loading initial data", error);
      } finally {
        setLoading(false); // បិទ Loading វិញពេល API ទាំង ៣ ដើរចប់
      }
    };

    loadInitialData();
  }, []);

  // កែប្រែ fetchTeachers ដោយដក setLoading ចេញ ព្រោះយើងបានដាក់វាក្នុង useEffect រួចហើយ
  const fetchTeachers = async () => {
    try {
      const response = await api.get('/admin/teachers');
      setTeachers(response.data.data.data || []);
    } catch (error) {
      console.error('Error fetching teachers:', error);
      toast.error('មិនអាចទាញយកបញ្ជីគ្រូបង្រៀនបានទេ');
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/admin/departments');
      setDepartments(response.data.data || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
      toast.error('មិនអាចទាញយកបញ្ជីដេប៉ាតឺម៉ង់បានទេ');
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
      toast.error('មិនអាចទាញយកតួនាទីគ្រូបង្រៀនបានទេ');
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
    
    // ប្រើ teacherRoleId ដែលទាញយកដោយស្វ័យប្រវត្តិ
    const payload = { 
      ...formData,
      role_id: teacherRoleId // បន្ថែម role_id ដោយស្វ័យប្រវត្តិ
    };
    
    if (editingTeacher && !payload.password) {
      delete payload.password;
    }

    try {
      if (editingTeacher) {
        await api.put(`/admin/teachers/${editingTeacher.id}`, payload);
        toast.success('បានកែប្រែព័ត៌មានគ្រូបង្រៀនដោយជោគជ័យ');
        localStorage.setItem('teachersUpdated', Date.now().toString());
        window.dispatchEvent(new Event('storage'));
      } else {
        await api.post('/admin/teachers', payload);
        toast.success('បានបន្ថែមគ្រូបង្រៀនដោយជោគជ័យ');
        localStorage.setItem('teachersUpdated', Date.now().toString());
        window.dispatchEvent(new Event('storage'));
      }
      setShowModal(false);
      resetForm();
      fetchTeachers();
    } catch (error) {
      console.error('Submit error:', error.response?.data);
      toast.error(error.response?.data?.message || 'ការធ្វើប្រតិបត្តិការបានបរាជ័យ');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('តើអ្នកប្រាកដថាចង់លុបគ្រូបង្រៀននេះមែនទេ?')) {
      try {
        await api.delete(`/admin/teachers/${id}`);
        toast.success('បានលុបគ្រូបង្រៀនដោយជោគជ័យ');
        localStorage.setItem('teacherDeleted', Date.now().toString());
        window.dispatchEvent(new Event('storage'));
        fetchTeachers();
      } catch (error) {
        toast.error(error.response?.data?.message || 'មិនអាចលុបគ្រូបង្រៀនបានទេ');
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
      status: teacher.user?.status || 'active',
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                <AcademicCapIcon className="h-6 w-6" />
              </span>
              គ្រប់គ្រងគ្រូបង្រៀន
            </h1>
            <p className="text-sm text-gray-500 mt-1">បន្ថែម និងគ្រប់គ្រងគណនីគ្រូបង្រៀនក្នុងប្រព័ន្ធ</p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition-all hover:shadow-md"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            បន្ថែមគ្រូបង្រៀន
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="ស្វែងរកតាមឈ្មោះ អ៊ីមែល អត្តលេខ ឬឯកទេស..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* === បន្ថែមផ្នែក Loading === */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="h-20 w-20 rounded-full border-t-2 border-b-2 border-indigo-100"></div>
            <div className="absolute top-0 left-0 h-20 w-20 rounded-full border-t-2 border-indigo-600 animate-spin"></div>
          </div>
          <p className="mt-6 text-base font-medium text-gray-600">កំពុងផ្ទុកទិន្នន័យគ្រូបង្រៀន...</p>
          <p className="text-sm text-gray-400 mt-1">សូមរង់ចាំមួយភ្លែត</p>
        </div>
      ) : (
        /* Teachers Table - បង្ហាញតែពេល loading ចប់ */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    គ្រូបង្រៀន
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
                    ស្ថានភាព
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    សកម្មភាព
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
                          {searchTerm ? 'មិនឃើញលទ្ធផលស្វែងរក' : 'មិនទាន់មានគ្រូបង្រៀននៅឡើយទេ'}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          {searchTerm ? 'សូមប្តូរពាក្យស្វែងរក' : 'ចុច "បន្ថែមគ្រូបង្រៀន" ដើម្បីចាប់ផ្តើម'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTeachers?.map((teacher) => (
                    <tr key={teacher.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {/* កូដទាញរូបភាព Profile របស់គ្រូបង្រៀន */}
                          <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
                              {teacher.profile_image ? (
                                <img 
                                  src={teacher.profile_image} 
                                  alt="Profile" 
                                  className="h-full w-full object-cover"
                                  onError={(e) => {
                                    // បើរូបភាព Error ឲ្យវាលោតមកបង្ហាញអក្សរកាត់វិញ
                                    e.target.style.display = 'none';
                                    e.target.parentElement.innerHTML = `<span>${teacher.first_name[0]}${teacher.last_name[0]}</span>`;
                                  }}
                                />
                              ) : (
                                <span>{teacher.first_name[0]}{teacher.last_name[0]}</span>
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
                          teacher.user?.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {teacher.user?.status === 'active' ? 'សកម្ម' : 'អសកម្ម'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => openEditModal(teacher)}
                            className="p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all"
                            title="កែប្រែ"
                          >
                            < PencilIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(teacher.id)}
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
          
          {/* Footer with count */}
          {!loading && filteredTeachers.length > 0 && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-sm text-gray-600">
                បង្ហាញ <span className="font-medium text-gray-900">{filteredTeachers.length}</span> នាក់ 
                {teachers.length !== filteredTeachers.length && (
                  <span> ក្នុងចំណោម <span className="font-medium text-gray-900">{teachers.length}</span> នាក់</span>
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
                {editingTeacher ? 'កែប្រែគ្រូបង្រៀន' : 'បន្ថែមគ្រូបង្រៀនថ្មី'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* បង្ហាញព័ត៌មានថាតួនាទីត្រូវបានកំណត់ដោយស្វ័យប្រវត្តិ */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center gap-2">
                <AcademicCapIcon className="h-5 w-5 text-purple-600" />
                <span className="text-sm text-purple-700">
                  <strong>តួនាទី៖</strong> គ្រូបង្រៀន (កំណត់ដោយស្វ័យប្រវត្តិ)
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
                    placeholder=""
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
                    placeholder=""
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
                    placeholder=""
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
                    placeholder="+855|"
                  />
                </div>

                {/* Row 3: Teacher Code & Gender */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    អត្តលេខគ្រូ
                  </label>
                  <input
                    type="text"
                    name="teacher_code"
                    value={formData.teacher_code}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="TCH-2024-0001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    ភេទ
                  </label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="">ជ្រើសរើស</option>
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
                    {departments?.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.department_name || dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Row 5: Specialization & Employment Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    ឯកទេស
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
                    ប្រភេទការងារ
                  </label>
                  <select
                    name="employment_type"
                    value={formData.employment_type}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="Full-time">ពេញម៉ោង</option>
                    <option value="Part-time">ក្រៅម៉ោង</option>
                    <option value="Contract">កិច្ចសន្យា</option>
                  </select>
                </div>

                {/* Row 6: Password & Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {editingTeacher ? 'ពាក្យសម្ងាត់ (ទុកឲ្យទទេ ដើម្បីរក្សាដដែល)' : 'ពាក្យសម្ងាត់'} <span className="text-red-500">*</span>
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
                  <AcademicCapIcon className="h-5 w-5" />
                  {editingTeacher ? 'រក្សាទុក' : 'បង្កើតគ្រូបង្រៀន'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageTeachers;
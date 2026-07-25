// src/components/common/Navbar.jsx
import React, { useState, Fragment, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Menu, Transition, Dialog } from '@headlessui/react';
import { 
  Bars3Icon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  AcademicCapIcon,
  XMarkIcon,
  CameraIcon,
  PencilIcon,
  EnvelopeIcon,
  PhoneIcon,
  UserIcon,
  BuildingOfficeIcon,
  KeyIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  CalendarIcon,
  EyeIcon,
  EyeSlashIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import { toast } from 'react-toastify';
import logo from '../../assets/image/PRIT.png';

const Navbar = () => {
  const { user, logout, setUser } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    profile_image: '',
  });
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    new_password_confirmation: '',
  });
  const fileInputRef = useRef(null);

  const getRoleName = (roleName) => {
    if (language === 'km') {
      switch(roleName) {
        case 'Admin': return 'អ្នកគ្រប់គ្រង';
        case 'Teacher': return 'គ្រូបង្រៀន';
        case 'Student': return 'សិស្ស';
        default: return roleName;
      }
    }
    return roleName;
  };

  const getProfileImage = () => {
    if (user?.profile_image) {
      return user.profile_image;
    }
    if (user?.teacher?.profile_image) {
      return user.teacher.profile_image;
    }
    if (user?.student?.profile_image) {
      return user.student.profile_image;
    }
    const name = user?.first_name || user?.name || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a365d&color=fff&size=128&bold=true`;
  };

  const getUserInitials = () => {
    const first = user?.first_name?.[0] || user?.name?.[0] || '';
    const last = user?.last_name?.[0] || '';
    return (first + last).toUpperCase() || 'U';
  };

  const openProfileModal = () => {
    setProfileData({
      first_name: user?.first_name || user?.name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone: user?.phone || user?.teacher?.phone || user?.student?.phone || '',
      profile_image: getProfileImage(),
    });
    setIsProfileModalOpen(true);
  };

  const closeProfileModal = () => {
    setIsProfileModalOpen(false);
    setIsEditing(false);
  };

  const openSettingsModal = () => {
    setPasswordData({
      current_password: '',
      new_password: '',
      new_password_confirmation: '',
    });
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setIsSettingsModalOpen(true);
  };

  const closeSettingsModal = () => {
    setIsSettingsModalOpen(false);
    setPasswordData({
      current_password: '',
      new_password: '',
      new_password_confirmation: '',
    });
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData({
      ...passwordData,
      [name]: value
    });
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    
    if (passwordData.new_password !== passwordData.new_password_confirmation) {
      toast.error(t('ពាក្យសម្ងាត់ថ្មីមិនត្រូវគ្នា', 'New passwords do not match'));
      return;
    }

    if (passwordData.new_password.length < 6) {
      toast.error(t('ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងតិច 6 តួ', 'New password must be at least 6 characters'));
      return;
    }

    setLoading(true);
    try {
      const response = await api.put('/user/update-password', {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
        new_password_confirmation: passwordData.new_password_confirmation,
      });

      if (response.data) {
        toast.success(t('បានកែប្រែពាក្យសម្ងាត់ដោយជោគជ័យ', 'Password updated successfully'));
        closeSettingsModal();
      }
    } catch (error) {
      console.error('Password update error:', error);
      const errorMsg = error.response?.data?.message || t('មិនអាចកែប្រែពាក្យសម្ងាត់បានទេ', 'Cannot update password');
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error(t('សូមជ្រើសរើសឯកសាររូបភាពប៉ុណ្ណោះ', 'Please select an image file only'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('រូបភាពមិនអាចធំជាង 5MB', 'Image cannot be larger than 5MB'));
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('profile_image', file);
      
      const role = user?.role?.role_name || user?.role || '';
      let endpoint = '';
      
      if (role === 'Teacher' || role === 'teacher') {
        endpoint = '/teacher/profile/update-image';
      } else if (role === 'Student' || role === 'student') {
        endpoint = '/student/profile/update-image';
      } else {
        endpoint = '/user/profile/update-image';
      }

      const response = await api.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data) {
        const updatedUser = { ...user };
        if (response.data.profile_image) {
          updatedUser.profile_image = response.data.profile_image;
          if (updatedUser.teacher) {
            updatedUser.teacher.profile_image = response.data.profile_image;
          }
          if (updatedUser.student) {
            updatedUser.student.profile_image = response.data.profile_image;
          }
        }
        
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        
        setProfileData({
          ...profileData,
          profile_image: response.data.profile_image,
        });
        
        toast.success(t('បានដូររូបភាពដោយជោគជ័យ', 'Profile image updated successfully'));
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.message || t('មិនអាចដូររូបភាពបានទេ', 'Cannot update profile image'));
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async () => {
    setLoading(true);
    try {
      const role = user?.role?.role_name || user?.role || '';
      let endpoint = '';
      
      if (role === 'Teacher' || role === 'teacher') {
        endpoint = '/teacher/profile/update';
      } else if (role === 'Student' || role === 'student') {
        endpoint = '/student/profile/update';
      } else {
        endpoint = '/user/profile/update';
      }

      const response = await api.put(endpoint, {
        first_name: profileData.first_name,
        last_name: profileData.last_name,
        email: profileData.email,
        phone: profileData.phone,
      });

      if (response.data) {
        const updatedUser = { ...user, ...response.data };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        toast.success(t('បានកែប្រែព័ត៌មានដោយជោគជ័យ', 'Profile updated successfully'));
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Update error:', error);
      toast.error(error.response?.data?.message || t('មិនអាចកែប្រែព័ត៌មានបានទេ', 'Cannot update profile'));
    } finally {
      setLoading(false);
    }
  };

  const getUserDisplayName = () => {
    if (user?.first_name && user?.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    return user?.name || user?.email || 'User';
  };

  const getUserEmail = () => {
    return user?.email || '';
  };

  const getUserPhone = () => {
    return user?.phone || user?.teacher?.phone || user?.student?.phone || '';
  };

  const getUserRole = () => {
    return user?.role?.role_name || user?.role || '';
  };

  const getUserCreatedAt = () => {
    if (user?.created_at) {
      return new Date(user.created_at).toLocaleDateString('km-KH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    return '—';
  };

  return (
    <>
      <nav className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 border-b border-blue-700/30 shadow-xl sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="shrink-0 flex items-center">
                <img 
                  src={logo} 
                  alt="PRIT Logo" 
                  className="h-10 w-auto object-contain drop-shadow-lg"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    const fallback = document.getElementById('logo-fallback');
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div id="logo-fallback" style={{ display: 'none' }} className="h-10 w-10 bg-blue-700 rounded-full flex items-center justify-center shadow-lg ring-2 ring-yellow-400/50">
                  <AcademicCapIcon className="h-5 w-5 text-yellow-300" />
                </div>
                <h1 className="ml-3 text-xl font-bold text-white tracking-tight drop-shadow-md">
                  LMS College
                </h1>
              </div>
            </div>

            <div className="hidden sm:ml-6 sm:flex sm:items-center space-x-4">
              {/* Language Toggle Button */}
              <button
                onClick={toggleLanguage}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700/50 hover:bg-blue-600/50 rounded-xl border border-blue-500/30 transition-all text-white text-sm font-medium"
              >
                <GlobeAltIcon className="h-4 w-4" />
                <span>{language === 'km' ? 'ខ្មែរ' : 'English'}</span>
              </button>

              <Menu as="div" className="relative ml-3">
                <Menu.Button className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:ring-offset-2 focus:ring-offset-blue-900 transition-all hover:ring-2 hover:ring-yellow-400/30">
                  <div className="h-9 w-9 rounded-full bg-blue-700/50 backdrop-blur-sm flex items-center justify-center text-white font-medium text-sm shadow-lg overflow-hidden border-2 border-yellow-400/30 hover:border-yellow-400/60 transition-all">
                    {getProfileImage() ? (
                      <img 
                        src={getProfileImage()} 
                        alt="Profile" 
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.parentElement.innerHTML = `<span>${getUserInitials()}</span>`;
                        }}
                      />
                    ) : (
                      <span className="font-bold text-white">{getUserInitials()}</span>
                    )}
                  </div>
                  <ChevronDownIcon className="h-4 w-4 ml-1 text-yellow-300/70" />
                </Menu.Button>
                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="origin-top-right absolute right-0 mt-2 w-56 rounded-2xl shadow-2xl py-1 bg-white ring-1 ring-black/5 focus:outline-none overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                      <p className="text-sm font-semibold text-gray-900">{getUserDisplayName()}</p>
                      <p className="text-xs text-gray-500">{getUserEmail()}</p>
                    </div>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={openProfileModal}
                          className={`${active ? 'bg-blue-50 text-blue-700' : 'text-gray-700'} flex w-full items-center px-4 py-2.5 text-sm transition-colors`}
                        >
                          <UserCircleIcon className={`h-5 w-5 mr-3 ${active ? 'text-blue-500' : 'text-gray-400'}`} />
                          {t('ប្រវត្តិរូប', 'Profile')}
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={openSettingsModal}
                          className={`${active ? 'bg-blue-50 text-blue-700' : 'text-gray-700'} flex w-full items-center px-4 py-2.5 text-sm transition-colors`}
                        >
                          <Cog6ToothIcon className={`h-5 w-5 mr-3 ${active ? 'text-blue-500' : 'text-gray-400'}`} />
                          {t('ការកំណត់', 'Settings')}
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={logout}
                          className={`${active ? 'bg-red-50 text-red-600' : 'text-red-500'} flex w-full items-center px-4 py-2.5 text-sm border-t border-gray-100 transition-colors`}
                        >
                          <ArrowRightOnRectangleIcon className={`h-5 w-5 mr-3 ${active ? 'text-red-500' : 'text-red-400'}`} />
                          {t('ចាកចេញ', 'Logout')}
                        </button>
                      )}
                    </Menu.Item>
                  </Menu.Items>
                </Transition>
              </Menu>
            </div>

            <div className="flex items-center sm:hidden gap-2">
              <button
                onClick={toggleLanguage}
                className="p-2 rounded-xl text-yellow-300/70 hover:text-yellow-300 hover:bg-blue-800/50 transition-all"
              >
                <GlobeAltIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-xl text-yellow-300/70 hover:text-yellow-300 hover:bg-blue-800/50 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 transition-all"
              >
                <Bars3Icon className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="sm:hidden border-t border-blue-700/30 bg-blue-900/95 backdrop-blur-sm">
            <div className="pt-2 pb-3 space-y-1">
              <div className="px-4 py-3 bg-blue-800/50">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-blue-700/50 flex items-center justify-center text-white font-medium text-sm overflow-hidden border-2 border-yellow-400/30">
                    {getProfileImage() ? (
                      <img 
                        src={getProfileImage()} 
                        alt="Profile" 
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.parentElement.innerHTML = `<span>${getUserInitials()}</span>`;
                        }}
                      />
                    ) : (
                      <span>{getUserInitials()}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {getUserDisplayName()}
                    </p>
                    <p className="text-xs text-yellow-300/70">{getUserEmail()}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-400/20 text-yellow-300 border border-yellow-400/30">
                    {getRoleName(getUserRole())}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  openProfileModal();
                }}
                className="block w-full text-left px-4 py-3 text-base font-medium text-yellow-300/80 hover:text-yellow-300 hover:bg-blue-800/50 transition-colors"
              >
                <UserCircleIcon className="h-5 w-5 inline mr-2" />
                {t('ប្រវត្តិរូប', 'Profile')}
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  openSettingsModal();
                }}
                className="block w-full text-left px-4 py-3 text-base font-medium text-yellow-300/80 hover:text-yellow-300 hover:bg-blue-800/50 transition-colors"
              >
                <Cog6ToothIcon className="h-5 w-5 inline mr-2" />
                {t('ការកំណត់', 'Settings')}
              </button>
              <button
                onClick={logout}
                className="block w-full text-left px-4 py-3 text-base font-medium text-red-400/80 hover:text-red-300 hover:bg-blue-800/50 transition-colors"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5 inline mr-2" />
                {t('ចាកចេញ', 'Logout')}
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Profile Modal */}
      <Dialog
        as="div"
        className="relative z-50"
        open={isProfileModalOpen}
        onClose={closeProfileModal}
      >
        <Transition
          show={isProfileModalOpen}
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        </Transition>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition
              show={isProfileModalOpen}
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-3xl bg-white p-6 text-left align-middle shadow-2xl transition-all">
                <div className="flex justify-between items-center border-b border-gray-200 pb-4">
                  <Dialog.Title as="h3" className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <div className="h-8 w-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                      <UserCircleIcon className="h-5 w-5 text-white" />
                    </div>
                    {t('ប្រវត្តិរូប', 'Profile')}
                  </Dialog.Title>
                  <button
                    onClick={closeProfileModal}
                    className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="mt-6">
                  <div className="flex flex-col items-center mb-6">
                    <div className="relative group">
                      <div className="h-32 w-32 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-4xl font-bold shadow-xl ring-4 ring-blue-100 overflow-hidden">
                        {profileData.profile_image ? (
                          <img
                            src={profileData.profile_image}
                            alt="Profile"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              const fallback = e.target.parentElement;
                              const initials = getUserInitials();
                              fallback.innerHTML = `<span>${initials}</span>`;
                            }}
                          />
                        ) : (
                          <span>{getUserInitials()}</span>
                        )}
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                        className="absolute bottom-0 right-0 p-2.5 bg-blue-600 rounded-full text-white hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl transform hover:scale-110 disabled:opacity-50"
                      >
                        <CameraIcon className="h-4 w-4" />
                      </button>
                    </div>
                    {loading && (
                      <div className="mt-2 text-sm text-blue-600">
                        <svg className="animate-spin inline h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t('កំពុងដូររូបភាព...', 'Updating image...')}
                      </div>
                    )}
                    <h4 className="mt-3 text-lg font-semibold text-gray-900">
                      {profileData.first_name} {profileData.last_name}
                    </h4>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
                      {getRoleName(getUserRole())}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100/50">
                      <div className="flex items-center gap-3">
                        <UserIcon className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="text-xs text-gray-500">{t('ឈ្មោះពេញ', 'Full Name')}</p>
                          <p className="text-sm font-medium text-gray-900">
                            {profileData.first_name} {profileData.last_name}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100/50">
                      <div className="flex items-center gap-3">
                        <EnvelopeIcon className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="text-xs text-gray-500">{t('អ៊ីមែល', 'Email')}</p>
                          <p className="text-sm font-medium text-gray-900">{profileData.email}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100/50">
                      <div className="flex items-center gap-3">
                        <PhoneIcon className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="text-xs text-gray-500">{t('លេខទូរស័ព្ទ', 'Phone')}</p>
                          <p className="text-sm font-medium text-gray-900">
                            {profileData.phone || '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100/50">
                      <div className="flex items-center gap-3">
                        <BuildingOfficeIcon className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="text-xs text-gray-500">{t('តួនាទី', 'Role')}</p>
                          <p className="text-sm font-medium text-gray-900">
                            {getRoleName(getUserRole())}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-xl p-4 border border-blue-100/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">{t('ស្ថានភាពគណនី', 'Account Status')}</p>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5"></span>
                          {t('សកម្ម', 'Active')}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{t('សមាជិកចាប់តាំងពី', 'Member Since')}</p>
                        <p className="text-sm font-medium text-gray-900">
                          {getUserCreatedAt()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className="flex items-center gap-2 px-4 py-2.5 border border-blue-600 text-blue-600 hover:bg-blue-50 rounded-xl text-sm font-medium transition-colors"
                    >
                      <PencilIcon className="h-4 w-4" />
                      {isEditing ? t('បោះបង់', 'Cancel') : t('កែប្រែ', 'Edit')}
                    </button>
                    <button
                      onClick={closeProfileModal}
                      className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 rounded-xl text-sm font-medium transition-colors shadow-lg hover:shadow-xl"
                    >
                      {t('បិទ', 'Close')}
                    </button>
                  </div>

                  {isEditing && (
                    <div className="mt-4 p-4 border-2 border-blue-200 rounded-xl bg-blue-50">
                      <p className="text-sm text-blue-700 mb-3">
                        <span className="font-semibold">💡 {t('កំពុងកែប្រែ', 'Editing')}:</span> {t('កែប្រែព័ត៌មានផ្ទាល់ខ្លួនរបស់អ្នក', 'Edit your personal information')}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder={t('នាមខ្លួន', 'First Name')}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          value={profileData.first_name}
                          onChange={(e) => setProfileData({...profileData, first_name: e.target.value})}
                        />
                        <input
                          type="text"
                          placeholder={t('នាមត្រកូល', 'Last Name')}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          value={profileData.last_name}
                          onChange={(e) => setProfileData({...profileData, last_name: e.target.value})}
                        />
                        <input
                          type="email"
                          placeholder={t('អ៊ីមែល', 'Email')}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          value={profileData.email}
                          onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                        />
                        <input
                          type="tel"
                          placeholder={t('លេខទូរស័ព្ទ', 'Phone')}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          value={profileData.phone}
                          onChange={(e) => setProfileData({...profileData, phone: e.target.value})}
                        />
                      </div>
                      <button
                        onClick={handleProfileUpdate}
                        disabled={loading}
                        className="mt-3 w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:from-blue-700 hover:to-indigo-700 transition-colors disabled:opacity-50"
                      >
                        {loading ? t('កំពុងរក្សាទុក...', 'Saving...') : t('រក្សាទុកការកែប្រែ', 'Save Changes')}
                      </button>
                    </div>
                  )}
                </div>
              </Dialog.Panel>
            </Transition>
          </div>
        </div>
      </Dialog>

      {/* Settings Modal */}
      <Dialog
        as="div"
        className="relative z-50"
        open={isSettingsModalOpen}
        onClose={closeSettingsModal}
      >
        <Transition
          show={isSettingsModalOpen}
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        </Transition>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition
              show={isSettingsModalOpen}
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-3xl bg-white p-6 text-left align-middle shadow-2xl transition-all">
                <div className="flex justify-between items-center border-b border-gray-200 pb-4">
                  <Dialog.Title as="h3" className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <div className="h-8 w-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                      <Cog6ToothIcon className="h-5 w-5 text-white" />
                    </div>
                    {t('ការកំណត់', 'Settings')}
                  </Dialog.Title>
                  <button
                    onClick={closeSettingsModal}
                    className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="mt-6">
                  {/* Language Selection */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <GlobeAltIcon className="h-5 w-5 text-blue-600" />
                      {t('ភាសា', 'Language')}
                    </h4>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          if (language !== 'km') {
                            toggleLanguage();
                          }
                        }}
                        className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all font-medium ${
                          language === 'km'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <span>ខ្មែរ</span>
                          {language === 'km' && (
                            <span className="text-sm text-blue-600">✓</span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          if (language !== 'en') {
                            toggleLanguage();
                          }
                        }}
                        className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all font-medium ${
                          language === 'en'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <span>English</span>
                          {language === 'en' && (
                            <span className="text-sm text-blue-600">✓</span>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* User Information Section */}
                  <div className="mb-6 border-t border-gray-200 pt-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <UserGroupIcon className="h-5 w-5 text-blue-600" />
                      {t('ព័ត៌មានគណនី', 'Account Information')}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                        <p className="text-xs text-gray-500">{t('ឈ្មោះពេញ', 'Full Name')}</p>
                        <p className="text-sm font-medium text-gray-900">{getUserDisplayName()}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                        <p className="text-xs text-gray-500">{t('អ៊ីមែល', 'Email')}</p>
                        <p className="text-sm font-medium text-gray-900">{getUserEmail()}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                        <p className="text-xs text-gray-500">{t('តួនាទី', 'Role')}</p>
                        <p className="text-sm font-medium text-gray-900">{getRoleName(getUserRole())}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                        <p className="text-xs text-gray-500">{t('លេខទូរស័ព្ទ', 'Phone')}</p>
                        <p className="text-sm font-medium text-gray-900">{getUserPhone() || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Password Change Section */}
                  <div className="border-t border-gray-200 pt-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <KeyIcon className="h-5 w-5 text-blue-600" />
                      {t('កែប្រែពាក្យសម្ងាត់', 'Change Password')}
                    </h4>
                    <form onSubmit={handlePasswordUpdate} className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t('ពាក្យសម្ងាត់បច្ចុប្បន្ន', 'Current Password')} <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showCurrentPassword ? 'text' : 'password'}
                            name="current_password"
                            required
                            value={passwordData.current_password}
                            onChange={handlePasswordChange}
                            placeholder={t('បញ្ចូលពាក្យសម្ងាត់បច្ចុប្បន្ន', 'Enter current password')}
                            className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {showCurrentPassword ? (
                              <EyeSlashIcon className="h-5 w-5" />
                            ) : (
                              <EyeIcon className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t('ពាក្យសម្ងាត់ថ្មី', 'New Password')} <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            name="new_password"
                            required
                            value={passwordData.new_password}
                            onChange={handlePasswordChange}
                            placeholder={t('បញ្ចូលពាក្យសម្ងាត់ថ្មី (យ៉ាងតិច 6 តួ)', 'Enter new password (min 6 characters)')}
                            className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {showNewPassword ? (
                              <EyeSlashIcon className="h-5 w-5" />
                            ) : (
                              <EyeIcon className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t('បញ្ជាក់ពាក្យសម្ងាត់ថ្មី', 'Confirm New Password')} <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            name="new_password_confirmation"
                            required
                            value={passwordData.new_password_confirmation}
                            onChange={handlePasswordChange}
                            placeholder={t('បញ្ជាក់ពាក្យសម្ងាត់ថ្មី', 'Confirm new password')}
                            className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {showConfirmPassword ? (
                              <EyeSlashIcon className="h-5 w-5" />
                            ) : (
                              <EyeIcon className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-3">
                        <button
                          type="button"
                          onClick={closeSettingsModal}
                          className="px-4 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-medium transition-colors"
                        >
                          {t('បោះបង់', 'Cancel')}
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 rounded-xl text-sm font-medium transition-colors shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center gap-2"
                        >
                          <ShieldCheckIcon className="h-4 w-4" />
                          {loading ? t('កំពុងរក្សាទុក...', 'Saving...') : t('ផ្លាស់ប្តូរពាក្យសម្ងាត់', 'Change Password')}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition>
          </div>
        </div>
      </Dialog>
    </>
  );
};

export default Navbar;
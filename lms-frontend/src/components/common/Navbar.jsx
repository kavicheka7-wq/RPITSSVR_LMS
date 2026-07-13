// src/components/common/Navbar.jsx
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { 
  Bars3Icon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

const Navbar = () => {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const getRoleNameKhmer = (roleName) => {
    switch(roleName) {
      case 'Admin': return 'អ្នកគ្រប់គ្រង';
      case 'Teacher': return 'គ្រូបង្រៀន';
      case 'Student': return 'សិស្ស';
      default: return roleName;
    }
  };

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="shrink-0 flex items-center">
              <div className="h-10 w-10 bg-primary-700 rounded-full flex items-center justify-center shadow-sm ring-2 ring-accent-400 ring-offset-2">
                <AcademicCapIcon className="h-5 w-5 text-accent-300" />
              </div>
              <h1 className="ml-3 text-xl font-bold text-primary-800 tracking-tight">
                LMS College
              </h1>
            </div>
          </div>
          
          <div className="hidden sm:ml-6 sm:flex sm:items-center space-x-4">
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-50 rounded-xl">
              <span className="text-sm font-medium text-gray-700">
                {user?.first_name} {user?.last_name}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-100 text-accent-800">
                {getRoleNameKhmer(user?.role?.role_name)}
              </span>
            </div>
            
            <Menu as="div" className="relative ml-3">
              <Menu.Button className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all hover:ring-2 hover:ring-primary-200">
                <div className="h-9 w-9 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium text-sm shadow-sm">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </div>
                <ChevronDownIcon className="h-4 w-4 ml-1 text-gray-400" />
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
                <Menu.Items className="origin-top-right absolute right-0 mt-2 w-56 rounded-2xl shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">{user?.first_name} {user?.last_name}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                  </div>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        className={`${
                          active ? 'bg-gray-50' : ''
                        } flex w-full items-center px-4 py-2.5 text-sm text-gray-700 transition-colors`}
                      >
                        <UserCircleIcon className="h-5 w-5 mr-3 text-gray-400" />
                        ប្រវត្តិរូប
                      </button>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        className={`${
                          active ? 'bg-gray-50' : ''
                        } flex w-full items-center px-4 py-2.5 text-sm text-gray-700 transition-colors`}
                      >
                        <Cog6ToothIcon className="h-5 w-5 mr-3 text-gray-400" />
                        ការកំណត់
                      </button>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={logout}
                        className={`${
                          active ? 'bg-red-50' : ''
                        } flex w-full items-center px-4 py-2.5 text-sm text-red-600 border-t border-gray-100 transition-colors`}
                      >
                        <ArrowRightOnRectangleIcon className="h-5 w-5 mr-3" />
                        ចាកចេញ
                      </button>
                    )}
                  </Menu.Item>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-xl text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 transition-all"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="sm:hidden border-t border-gray-100">
          <div className="pt-2 pb-3 space-y-1">
            <div className="px-4 py-3 bg-gray-50">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium text-sm">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {user?.first_name} {user?.last_name}
                  </p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
              </div>
              <span className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                {getRoleNameKhmer(user?.role?.role_name)}
              </span>
            </div>
            <button
              onClick={logout}
              className="block w-full text-left px-4 py-3 text-base font-medium text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 inline mr-2" />
              ចាកចេញ
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
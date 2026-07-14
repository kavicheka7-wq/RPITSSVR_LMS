<?php
// app/Http/Controllers/Api/AdminController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Department;
use App\Models\Course;
use App\Models\Role;
use App\Models\Teacher;
use App\Models\Student;
use App\Models\Enrollment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    public function __construct()
    {
        $this->middleware(['auth:sanctum', 'role:Admin']);
    }

    // --- User Management ---

    public function getUsers(Request $request)
    {
        $users = User::with('role')->paginate($request->per_page ?? 10);
        return response()->json($users);
    }

    public function createUser(Request $request)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|unique:users',
            'password' => 'required|min:8',
            'role_id' => 'required|exists:roles,id',
            'gender' => 'nullable|in:Male,Female,Other',
            'phone' => 'nullable|string|max:20',
            'status' => 'nullable|in:active,inactive',
        ]);

        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = $validated['status'] ?? 'active';

        $user = User::create($validated);

        return response()->json([
            'user' => $user,
            'message' => 'User created successfully'
        ], 201);
    }

    public function updateUser(Request $request, $id)
    {
        $user = User::findOrFail($id);

        $validated = $request->validate([
            'first_name' => 'sometimes|string|max:100',
            'last_name' => 'sometimes|string|max:100',
            'email' => ['sometimes', 'email', Rule::unique('users')->ignore($user->id)],
            'password' => 'nullable|min:8',
            'role_id' => 'sometimes|exists:roles,id',
            'gender' => 'nullable|in:Male,Female,Other',
            'phone' => 'nullable|string|max:20',
            'status' => 'nullable|in:active,inactive',
        ]);

        if (!empty($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $user->update($validated);

        return response()->json([
            'user' => $user,
            'message' => 'User updated successfully'
        ]);
    }

    public function deleteUser($id)
    {
        $user = User::findOrFail($id);
        $user->delete();

        return response()->json([
            'message' => 'User deleted successfully'
        ]);
    }

    // --- Course Management ---

    public function getCourses(Request $request)
    {
        $courses = Course::with(['department', 'teacher'])->paginate($request->per_page ?? 10);
        return response()->json($courses);
    }

    public function createCourse(Request $request)
    {
        $validated = $request->validate([
            'course_code' => 'required|string|max:50|unique:courses',
            'course_name' => 'required|string|max:255',
            'credit' => 'required|integer|min:1|max:6',
            'description' => 'nullable|string',
            'department_id' => 'required|exists:departments,id',
            'teacher_id' => 'required|exists:users,id',
        ]);

        $course = Course::create($validated);

        return response()->json([
            'course' => $course,
            'message' => 'Course created successfully'
        ], 201);
    }

    public function updateCourse(Request $request, $id)
    {
        $course = Course::findOrFail($id);

        $validated = $request->validate([
            'course_code' => ['sometimes', 'string', 'max:50', Rule::unique('courses')->ignore($course->id)],
            'course_name' => 'sometimes|string|max:255',
            'credit' => 'sometimes|integer|min:1|max:6',
            'description' => 'nullable|string',
            'department_id' => 'sometimes|exists:departments,id',
            'teacher_id' => 'sometimes|exists:users,id',
        ]);

        $course->update($validated);

        return response()->json([
            'course' => $course,
            'message' => 'Course updated successfully'
        ]);
    }

    public function deleteCourse($id)
    {
        $course = Course::findOrFail($id);
        
        if ($course->enrollments()->exists()) {
            return response()->json([
                'message' => 'Cannot delete course with enrolled students'
            ], 400);
        }

        $course->delete();

        return response()->json([
            'message' => 'Course deleted successfully'
        ]);
    }

    // --- System Statistics ---

    public function getStats()
    {
        // ==============================================
        // រាប់ចំនួនពីតារាងនីមួយៗ
        // ==============================================
        
        // 1. ចំនួនអ្នកប្រើប្រាស់សរុប
        $totalUsers = User::count();
        
        // 2. ចំនួនសិស្ស (ពីតារាង students)
        $totalStudents = Student::count();
        
        // 3. ចំនួនគ្រូបង្រៀន (ពីតារាង teachers)
        $totalTeachers = Teacher::count();
        
        // 4. ចំនួនមុខវិជ្ជា (ពីតារាង courses)
        $totalCourses = Course::count();
        
        // 5. ចំនួនជំនាញ (ពីតារាង departments)
        $totalDepartments = Department::count();
        
        // 6. ចំនួនអ្នកគ្រប់គ្រង
        $adminRole = Role::where('role_name', 'Admin')->first();
        $totalAdmins = $adminRole ? User::where('role_id', $adminRole->id)->count() : 0;
        
        // 7. ចំនួនការចុះឈ្មោះរៀន
        $totalEnrollments = Enrollment::count();

        $stats = [
            'total_users' => $totalUsers,
            'total_students' => $totalStudents,
            'total_teachers' => $totalTeachers,
            'total_courses' => $totalCourses,
            'total_departments' => $totalDepartments,
            'total_admins' => $totalAdmins,
            'total_enrollments' => $totalEnrollments,
        ];

        return response()->json($stats);
    }

    // --- System Settings ---

    public function getSystemSettings()
    {
        return response()->json([
            'site_name' => 'LMS College',
            'timezone' => 'UTC',
            'date_format' => 'Y-m-d',
            'time_format' => 'H:i',
        ]);
    }

    public function updateSystemSettings(Request $request)
    {
        return response()->json([
            'message' => 'Settings updated successfully'
        ]);
    }
}
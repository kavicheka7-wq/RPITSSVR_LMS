<?php

namespace App\Http\Controllers\Api;
use Illuminate\Support\Facades\Cache;
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
    // --- User Management ---

    public function getUsers(Request $request)
    {
        // ✅ កែសម្រួល៖ បន្ថែម search និង select តែ columns ដែលចាំបាច់
        $query = User::with(['role:id,role_name'])
            ->select(['id', 'first_name', 'last_name', 'email', 'phone', 'gender', 'status', 'role_id', 'created_at']);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "{$search}%")
                  ->orWhere('last_name', 'like', "{$search}%")
                  ->orWhere('email', 'like', "{$search}%");
            });
        }

        $users = $query->orderBy('id', 'desc')
            ->paginate($request->per_page ?? 15);

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

        // ✅ លុប Cache ពេលបង្កើត User ថ្មី
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

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

        // ✅ លុប Cache ពេលកែប្រែ User
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'user' => $user,
            'message' => 'User updated successfully'
        ]);
    }

    public function deleteUser($id)
    {
        $user = User::findOrFail($id);
        $user->delete();

        // ✅ លុប Cache ពេលលុប User
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => 'User deleted successfully'
        ]);
    }

    // --- System Statistics ---

    public function getStats()
    {
        // ✅ កែសម្រួល៖ បង្កើន Cache Time ពី ២ វិនាទី ទៅ ៥ នាទី (៣០០ វិនាទី)
        $stats = Cache::remember('admin_dashboard_stats', 300, function () {
            $studentRole = Role::where('role_name', 'Student')->first();
            $adminRole = Role::where('role_name', 'Admin')->first();

            $totalStudents = Student::count();
            if ($totalStudents === 0) {
                $totalStudents = $studentRole ? User::where('role_id', $studentRole->id)->count() : 0;
            }

            return [
                'total_users' => User::count(),
                'total_students' => $totalStudents,
                'total_teachers' => Teacher::count(),
                'total_admins' => $adminRole ? User::where('role_id', $adminRole->id)->count() : 0,
                'total_courses' => Course::count(),
                'total_departments' => Department::count(),
                'total_enrollments' => Enrollment::count(),
            ];
        });

        return response()->json($stats);
    }

    // --- System Settings ---

    public function getSystemSettings()
    {
        return response()->json([
            'site_name' => 'LMS RPITSSVR',
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
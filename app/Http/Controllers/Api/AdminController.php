<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Department;
use App\Models\Enrollment;
use App\Models\Role;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    // --- User Management ---

    public function getUsers(Request $request)
    {
        // ✅ បន្ថែម profile_image និងការស្វែងរកគ្រប់ជ្រុងជ្រោយ (ឈ្មោះ អ៊ីមែល ទូរស័ព្ទ និង filter តាម role_id)
        $query = User::with(['role:id,role_name'])
            ->select([
                'id',
                'first_name',
                'last_name',
                'email',
                'phone',
                'gender',
                'profile_image',
                'status',
                'role_id',
                'created_at',
            ]);

        if ($request->filled('role_id')) {
            $query->where('role_id', $request->role_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere(DB::raw("CONCAT(first_name, ' ', last_name)"), 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $perPage = max(1, min(200, (int) ($request->per_page ?? 15)));
        $users = $query->orderBy('id', 'desc')->paginate($perPage);

        return response()->json($users);
    }

    public function createUser(Request $request)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8',
            'role_id' => 'required|exists:roles,id',
            'gender' => 'nullable|in:Male,Female,Other',
            'phone' => 'nullable|string|max:20',
            'status' => 'nullable|in:active,inactive',
        ]);

        $validated['first_name'] = trim($validated['first_name']);
        $validated['last_name'] = trim($validated['last_name']);
        $validated['email'] = strtolower(trim($validated['email']));
        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = $validated['status'] ?? 'active';

        $user = User::create($validated);
        $user->load('role:id,role_name');

        // ✅ លុប Cache ពេលបង្កើត User ថ្មី
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'user' => $user,
            'message' => 'User created successfully',
        ], 201);
    }

    public function updateUser(Request $request, $id)
    {
        $user = User::findOrFail($id);

        $validated = $request->validate([
            'first_name' => 'sometimes|string|max:100',
            'last_name' => 'sometimes|string|max:100',
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => 'nullable|string|min:8',
            'role_id' => 'sometimes|exists:roles,id',
            'gender' => 'nullable|in:Male,Female,Other',
            'phone' => 'nullable|string|max:20',
            'status' => 'nullable|in:active,inactive',
        ]);

        if (isset($validated['first_name'])) {
            $validated['first_name'] = trim($validated['first_name']);
        }
        if (isset($validated['last_name'])) {
            $validated['last_name'] = trim($validated['last_name']);
        }
        if (isset($validated['email'])) {
            $validated['email'] = strtolower(trim($validated['email']));
        }

        if (!empty($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $user->update($validated);
        $user->load('role:id,role_name');

        // ✅ ធ្វើបច្ចុប្បន្នភាពឈ្មោះ និងអ៊ីមែលក្នុងតារាង Teacher ឬ Student ប្រសិនបើមានភ្ជាប់គ្នា
        if ($user->teacher) {
            $user->teacher->update(array_filter([
                'first_name' => $validated['first_name'] ?? null,
                'last_name' => $validated['last_name'] ?? null,
                'email' => $validated['email'] ?? null,
                'phone' => $validated['phone'] ?? null,
                'gender' => $validated['gender'] ?? null,
            ], fn ($v) => !is_null($v)));
        }

        if ($user->student) {
            $user->student->update(array_filter([
                'first_name' => $validated['first_name'] ?? null,
                'last_name' => $validated['last_name'] ?? null,
                'email' => $validated['email'] ?? null,
                'phone' => $validated['phone'] ?? null,
                'gender' => $validated['gender'] ?? null,
            ], fn ($v) => !is_null($v)));
        }

        // ✅ លុប Cache ពេលកែប្រែ User
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'user' => $user,
            'message' => 'User updated successfully',
        ]);
    }

    public function deleteUser(Request $request, $id)
    {
        $user = User::with('role')->findOrFail($id);

        // ✅ ១. ការពារមិនឱ្យ Admin លុបគណនីខ្លួនឯងដែលកំពុងប្រើប្រាស់
        $currentAuthId = $request->user()?->id ?? auth()->id();
        if ($currentAuthId && (int) $currentAuthId === (int) $user->id) {
            return response()->json([
                'message' => 'អ្នកមិនអាចលុបគណនីរបស់ខ្លួនឯងដែលកំពុងប្រើប្រាស់បានទេ!',
            ], 422);
        }

        // ✅ ២. ការពារមិនឱ្យលុបគណនី Admin ចុងក្រោយគេក្នុងប្រព័ន្ធ
        $isUserAdmin = (int) $user->role_id === 1 ||
            stripos((string) ($user->role?->role_name ?? ''), 'admin') !== false;

        if ($isUserAdmin) {
            $adminCount = User::where('role_id', $user->role_id)->count();
            if ($adminCount <= 1) {
                return response()->json([
                    'message' => 'មិនអាចលុបគណនីអ្នកគ្រប់គ្រង (Admin) ចុងក្រោយគេក្នុងប្រព័ន្ធបានទេ!',
                ], 422);
            }
        }

        DB::transaction(function () use ($user) {
            Teacher::where('user_id', $user->id)->delete();
            Student::where('user_id', $user->id)->delete();
            $user->delete();
        });

        // ✅ លុប Cache ពេលលុប User
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => 'User deleted successfully',
        ]);
    }

    // --- System Statistics ---

    public function getStats()
    {
        // ✅ Cache Time ៥ នាទី (៣០០ វិនាទី) និងគាំទ្រការរាប់ចំនួនគ្រប់ករណី
        $stats = Cache::remember('admin_dashboard_stats', 300, function () {
            $adminRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%admin%'])->first();
            $teacherRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%teacher%'])->first();
            $studentRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%student%'])->first();

            $adminRoleId = $adminRole?->id ?? 1;
            $teacherRoleId = $teacherRole?->id ?? 2;
            $studentRoleId = $studentRole?->id ?? 3;

            $totalStudents = Student::count();
            if ($totalStudents === 0) {
                $totalStudents = User::where('role_id', $studentRoleId)->count();
            }

            $totalTeachers = Teacher::count();
            if ($totalTeachers === 0) {
                $totalTeachers = User::where('role_id', $teacherRoleId)->count();
            }

            return [
                'total_users' => User::count(),
                'total_students' => $totalStudents,
                'total_teachers' => $totalTeachers,
                'total_admins' => User::where('role_id', $adminRoleId)->count(),
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
        $defaults = [
            'site_name' => 'LMS RPITSSVR',
            'timezone' => config('app.timezone', 'Asia/Phnom_Penh'),
            'date_format' => 'Y-m-d',
            'time_format' => 'H:i',
        ];

        $saved = Cache::get('lms_system_settings', []);

        return response()->json(array_merge($defaults, is_array($saved) ? $saved : []));
    }

    public function updateSystemSettings(Request $request)
    {
        $validated = $request->validate([
            'site_name' => 'sometimes|string|max:150',
            'timezone' => 'sometimes|string|max:64',
            'date_format' => 'sometimes|string|max:32',
            'time_format' => 'sometimes|string|max:32',
        ]);

        $current = Cache::get('lms_system_settings', []);
        $updated = array_merge(is_array($current) ? $current : [], $validated);
        Cache::forever('lms_system_settings', $updated);

        return response()->json([
            'settings' => $updated,
            'message' => 'Settings updated successfully',
        ]);
    }
}
<?php
// app/Http/Controllers/Api/AdminTeacherController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\Teacher;
use App\Models\User;
use App\Models\Department;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Cache; // បន្ថែមការហៅ Cache មកប្រើប្រាស់

class AdminTeacherController extends Controller
{
    /**
     * Display a listing of all teachers
     * GET /admin/teachers
     */
    public function index(Request $request) // បន្ថែម Request សម្រាប់ទទួលយក per_page
    {
        $perPage = $request->per_page ?? 10; // កំណត់ចំនួនកំណត់ត្រាក្នុងមួយទំព័រ (លំនាំដើម ១០)

        $teachers = Teacher::with(['department', 'user', 'role'])
            ->orderBy('first_name')
            ->paginate($perPage); // ប្ដូរពី get() ទៅជា paginate() ដើម្បីកុំឱ្យយឺតពេលមានទិន្នន័យច្រើន

        return response()->json([
            'data' => $teachers,
            'message' => 'បានទាញយកបញ្ជីគ្រូបង្រៀនដោយជោគជ័យ'
        ]);
    }

    /**
     * Store a newly created teacher
     * POST /admin/teachers
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'gender' => 'nullable|in:Male,Female,Other',
            'date_of_birth' => 'nullable|date',
            'email' => 'required|email|unique:users,email|unique:teachers,email',
            'phone' => 'nullable|string|max:20',
            'password' => 'required|string|min:6',
            'status' => 'nullable|in:active,inactive',
            'department_id' => 'nullable|exists:departments,id',
            'teacher_code' => 'nullable|string|max:50|unique:teachers,teacher_code',
            'specialization' => 'nullable|string|max:255',
            'employment_type' => 'nullable|in:Full-time,Part-time,Contract',
        ]);

        // Get Teacher role
        $teacherRole = Role::where('role_name', 'Teacher')->firstOrFail();

        $teacher = DB::transaction(function () use ($validated, $teacherRole) {
            // 1. Create user account
            $user = User::create([
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'phone' => $validated['phone'] ?? null,
                'gender' => $validated['gender'] ?? null,
                'status' => $validated['status'] ?? 'active',
                'role_id' => $teacherRole->id,  // កំណត់ role ក្នុង users
            ]);

            // 2. Create teacher profile (with role_id)
            $teacher = Teacher::create([
                'user_id' => $user->id,
                'role_id' => $teacherRole->id,  // រក្សា role_id ក្នុង teachers
                'teacher_code' => $validated['teacher_code'] ?? $this->generateTeacherCode(),
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'gender' => $validated['gender'] ?? null,
                'date_of_birth' => $validated['date_of_birth'] ?? null,
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? null,
                'department_id' => $validated['department_id'] ?? null,
                'specialization' => $validated['specialization'] ?? null,
                'employment_type' => $validated['employment_type'] ?? 'Full-time','Part-time','Contract',
            ]);

            return $teacher->load(['department', 'user', 'role']);
        });

        // លុប Cache ពេលមានការបង្កើតគ្រូថ្មី ដើម្បីឱ្យ Dashboard ធ្វើបច្ចុប្បន្នភាពទិន្នន័យ
        Cache::forget('admin_dashboard_stats');

        return response()->json([
            'message' => 'បានបង្កើតគណនីគ្រូបង្រៀនដោយជោគជ័យ',
            'data' => $teacher
        ], 201);
    }

    /**
     * Display the specified teacher
     * GET /admin/teachers/{teacher}
     */
    public function show(Teacher $teacher)
    {
        return response()->json([
            'data' => $teacher->load(['department', 'user', 'role']),
            'message' => 'បានទាញយកទិន្នន័យគ្រូបង្រៀនដោយជោគជ័យ'
        ]);
    }

    /**
     * Update the specified teacher
     * PUT /admin/teachers/{teacher}
     */
    public function update(Request $request, Teacher $teacher)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'gender' => 'nullable|in:Male,Female,Other',
            'date_of_birth' => 'nullable|date',
            'email' => [
                'required',
                'email',
                Rule::unique('users', 'email')->ignore($teacher->user_id),
                Rule::unique('teachers', 'email')->ignore($teacher->id),
            ],
            'phone' => 'nullable|string|max:20',
            'password' => 'nullable|string|min:6',
            'status' => 'nullable|in:active,inactive',
            'department_id' => 'nullable|exists:departments,id',
            'teacher_code' => [
                'nullable',
                'string',
                'max:50',
                Rule::unique('teachers', 'teacher_code')->ignore($teacher->id),
            ],
            'specialization' => 'nullable|string|max:255',
            'employment_type' => 'nullable|in:Full-time,Part-time,Contract',
        ]);

        DB::transaction(function () use ($validated, $teacher) {
            // Update User
            $userData = [
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? $teacher->user->phone,
                'gender' => $validated['gender'] ?? $teacher->user->gender,
                'status' => $validated['status'] ?? $teacher->user->status,
            ];

            if (!empty($validated['password'])) {
                $userData['password'] = Hash::make($validated['password']);
            }

            $teacher->user->update($userData);

            // Update Teacher (keep role_id)
            $teacher->update([
                'teacher_code' => $validated['teacher_code'] ?? $teacher->teacher_code,
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'gender' => $validated['gender'] ?? $teacher->gender,
                'date_of_birth' => $validated['date_of_birth'] ?? $teacher->date_of_birth,
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? $teacher->phone,
                'department_id' => $validated['department_id'] ?? $teacher->department_id,
                'specialization' => $validated['specialization'] ?? $teacher->specialization,
                'employment_type' => $validated['employment_type'] ?? $teacher->employment_type,
            ]);
        });

        return response()->json([
            'message' => 'បានកែប្រែព័ត៌មានគ្រូបង្រៀនដោយជោគជ័យ',
            'data' => $teacher->fresh(['department', 'user', 'role'])
        ]);
    }

    /**
     * Remove the specified teacher
     * DELETE /admin/teachers/{teacher}
     */
    public function destroy(Teacher $teacher)
    {
        $teacherName = $teacher->first_name . ' ' . $teacher->last_name;
        
        // Delete user (cascade will delete teacher)
        $teacher->user->delete();

        // លុប Cache ពេលមានការលុបគ្រូចេញ ដើម្បីឱ្យ Dashboard ធ្វើបច្ចុប្បន្នភាពទិន្នន័យ
        Cache::forget('admin_dashboard_stats');

        return response()->json([
            'message' => "បានលុបគណនីគ្រូបង្រៀន '{$teacherName}' ដោយជោគជ័យ"
        ]);
    }

    /**
     * Get all teachers for export without pagination
     * GET /admin/teachers/export-all
     */
    public function exportAll()
    {
        $teachers = Teacher::with(['department', 'user', 'role'])
            ->orderBy('first_name')
            ->get();

        return response()->json([
            'data' => $teachers,
            'message' => 'បានទាញយកទិន្នន័យគ្រូបង្រៀនទាំងអស់ដោយជោគជ័យ'
        ]);
    }

    /**
     * Import multiple teachers
     * POST /admin/teachers/import
     */
    public function import(Request $request)
    {
        $request->validate([
            'teachers' => 'required|array|min:1',
            'teachers.*.first_name' => 'required|string|max:100',
            'teachers.*.last_name' => 'required|string|max:100',
            'teachers.*.email' => 'required|email',
        ]);

        $teacherRole = Role::where('role_name', 'Teacher')->firstOrFail();
        $importedCount = 0;
        $skipped = [];

        DB::transaction(function () use ($request, $teacherRole, &$importedCount, &$skipped) {
            foreach ($request->teachers as $index => $item) {
                // Check duplicate email in users or teachers
                $emailExists = User::where('email', $item['email'])->exists() || Teacher::where('email', $item['email'])->exists();
                if ($emailExists) {
                    $skipped[] = [
                        'row' => $index + 1,
                        'email' => $item['email'],
                        'reason' => 'អ៊ីមែលនេះមានរួចហើយ (Email already exists)'
                    ];
                    continue;
                }

                $password = !empty($item['password']) ? $item['password'] : '12345678';
                $gender = in_array($item['gender'] ?? '', ['Male', 'Female', 'Other']) ? $item['gender'] : null;
                $employmentType = in_array($item['employment_type'] ?? '', ['Full-time', 'Part-time', 'Contract']) ? $item['employment_type'] : 'Full-time';
                $status = in_array($item['status'] ?? '', ['active', 'inactive']) ? $item['status'] : 'active';

                $user = User::create([
                    'first_name' => $item['first_name'],
                    'last_name' => $item['last_name'],
                    'email' => $item['email'],
                    'password' => Hash::make($password),
                    'phone' => $item['phone'] ?? null,
                    'gender' => $gender,
                    'status' => $status,
                    'role_id' => $teacherRole->id,
                ]);

                Teacher::create([
                    'user_id' => $user->id,
                    'role_id' => $teacherRole->id,
                    'teacher_code' => !empty($item['teacher_code']) ? $item['teacher_code'] : $this->generateTeacherCode(),
                    'first_name' => $item['first_name'],
                    'last_name' => $item['last_name'],
                    'gender' => $gender,
                    'date_of_birth' => !empty($item['date_of_birth']) ? $item['date_of_birth'] : null,
                    'email' => $item['email'],
                    'phone' => $item['phone'] ?? null,
                    'department_id' => $item['department_id'] ?? null,
                    'specialization' => $item['specialization'] ?? null,
                    'employment_type' => $employmentType,
                ]);

                $importedCount++;
            }
        });

        Cache::forget('admin_dashboard_stats');

        return response()->json([
            'message' => "នាំចូលគ្រូបង្រៀនចំនួន {$importedCount} នាក់ដោយជោគជ័យ",
            'imported_count' => $importedCount,
            'skipped' => $skipped
        ]);
    }

    /**
     * Generate unique teacher code
     */
    private function generateTeacherCode()
    {
        $year = date('Y');
        $count = Teacher::count() + 1;
        return 'TCH-' . $year . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
    }
}
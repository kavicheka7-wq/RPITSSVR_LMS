<?php

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
use Illuminate\Support\Facades\Cache;

class AdminTeacherController extends Controller
{
    /**
     * Display a listing of all teachers
     * GET /admin/teachers
     */
    public function index(Request $request)
    {
        $perPage = $request->per_page ?? 15;

        // ✅ កែសម្រួល៖ select columns ចាំបាច់ និង search support
        $query = Teacher::with([
            'department:id,department_name',
            'user:id,status,email',
            'role:id,role_name'
        ])->select([
            'id', 'user_id', 'role_id', 'department_id',
            'teacher_code', 'first_name', 'last_name', 'gender',
            'date_of_birth', 'email', 'phone', 'profile_image',
            'specialization', 'employment_type', 'created_at'
        ]);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "{$search}%")
                  ->orWhere('last_name', 'like', "{$search}%")
                  ->orWhere('teacher_code', 'like', "{$search}%")
                  ->orWhere('email', 'like', "{$search}%");
            });
        }

        $teachers = $query->orderBy('first_name')->paginate($perPage);

        return response()->json([
            'data' => $teachers->items(),
            'meta' => [
                'current_page' => $teachers->currentPage(),
                'last_page' => $teachers->lastPage(),
                'per_page' => $teachers->perPage(),
                'total' => $teachers->total(),
            ],
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

        $teacherRole = Role::where('role_name', 'Teacher')->firstOrFail();

        $teacher = DB::transaction(function () use ($validated, $teacherRole) {
            $user = User::create([
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'phone' => $validated['phone'] ?? null,
                'gender' => $validated['gender'] ?? null,
                'status' => $validated['status'] ?? 'active',
                'role_id' => $teacherRole->id,
            ]);

            $teacher = Teacher::create([
                'user_id' => $user->id,
                'role_id' => $teacherRole->id,
                'teacher_code' => $validated['teacher_code'] ?? $this->generateTeacherCode(),
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'gender' => $validated['gender'] ?? null,
                'date_of_birth' => $validated['date_of_birth'] ?? null,
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? null,
                'department_id' => $validated['department_id'] ?? null,
                'specialization' => $validated['specialization'] ?? null,
                'employment_type' => $validated['employment_type'] ?? 'Full-time',
            ]);

            return $teacher->load(['department', 'user', 'role']);
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

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
                'required', 'email',
                Rule::unique('users', 'email')->ignore($teacher->user_id),
                Rule::unique('teachers', 'email')->ignore($teacher->id),
            ],
            'phone' => 'nullable|string|max:20',
            'password' => 'nullable|string|min:6',
            'status' => 'nullable|in:active,inactive',
            'department_id' => 'nullable|exists:departments,id',
            'teacher_code' => [
                'nullable', 'string', 'max:50',
                Rule::unique('teachers', 'teacher_code')->ignore($teacher->id),
            ],
            'specialization' => 'nullable|string|max:255',
            'employment_type' => 'nullable|in:Full-time,Part-time,Contract',
        ]);

        DB::transaction(function () use ($validated, $teacher) {
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

        $teacher->user->delete();

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => "បានលុបគណនីគ្រូបង្រៀន '{$teacherName}' ដោយជោគជ័យ"
        ]);
    }

    /**
     * Get all teachers for export without pagination
     * GET /admin/teachers/export-all
     */
    public function exportAll(Request $request)
    {
        if ($request->query('format') === 'json') {
            $teachers = [];
            Teacher::with([
                'department:id,department_name',
                'user:id,status,email',
                'role:id,role_name'
            ])
            ->select([
                'id', 'user_id', 'role_id', 'department_id',
                'teacher_code', 'first_name', 'last_name', 'gender',
                'date_of_birth', 'email', 'phone',
                'specialization', 'employment_type'
            ])
            ->orderBy('first_name')
            ->chunk(500, function ($chunk) use (&$teachers) {
                foreach ($chunk as $teacher) {
                    $teachers[] = $teacher;
                }
            });

            return response()->json([
                'data' => $teachers,
                'message' => 'បានទាញយកទិន្នន័យគ្រូបង្រៀនទាំងអស់ដោយជោគជ័យ'
            ]);
        }

        $filename = 'Teachers_List_' . date('Y-m-d') . '.csv';
        $headers = [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
            'Pragma' => 'no-cache',
            'Cache-Control' => 'must-revalidate, post-check=0, pre-check=0',
            'Expires' => '0',
        ];

        return response()->stream(function () {
            $handle = fopen('php://output', 'w');
            // Write UTF-8 BOM so Microsoft Excel correctly renders Khmer Unicode characters
            fprintf($handle, chr(0xEF) . chr(0xBB) . chr(0xBF));

            fputcsv($handle, [
                'No',
                'Teacher Code',
                'First Name',
                'Last Name',
                'Gender',
                'Email',
                'Phone',
                'Department',
                'Specialization',
                'Employment Type',
                'Date of Birth',
                'Status'
            ]);

            $index = 1;
            Teacher::with([
                'department:id,department_name',
                'user:id,status,email',
                'role:id,role_name'
            ])
            ->select([
                'id', 'user_id', 'role_id', 'department_id',
                'teacher_code', 'first_name', 'last_name', 'gender',
                'date_of_birth', 'email', 'phone',
                'specialization', 'employment_type'
            ])
            ->orderBy('first_name')
            ->chunk(500, function ($teachers) use ($handle, &$index) {
                foreach ($teachers as $t) {
                    $gender = $t->gender === 'Male' ? 'ប្រុស (Male)' : ($t->gender === 'Female' ? 'ស្រី (Female)' : ($t->gender ?? ''));
                    $status = ($t->user->status ?? $t->status) === 'active' ? 'សកម្ម (Active)' : 'អសកម្ម (Inactive)';

                    fputcsv($handle, [
                        $index++,
                        $t->teacher_code ?? '',
                        $t->first_name ?? '',
                        $t->last_name ?? '',
                        $gender,
                        $t->email ?? '',
                        $t->phone ?? '',
                        $t->department->department_name ?? '',
                        $t->specialization ?? '',
                        $t->employment_type ?? '',
                        $t->date_of_birth ?? '',
                        $status
                    ]);
                }
            });

            fclose($handle);
        }, 200, $headers);
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
            // ✅ កែសម្រួល៖ ទាញ Emails ដែលមានរួច ក្នុង Query តែម្តង
            $emails = collect($request->teachers)->pluck('email')->filter()->toArray();
            $existingEmails = User::whereIn('email', $emails)->pluck('email')
                ->merge(Teacher::whereIn('email', $emails)->pluck('email'))
                ->unique()
                ->toArray();

            foreach ($request->teachers as $index => $item) {
                if (in_array($item['email'], $existingEmails)) {
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
        Cache::forget('admin_overview_report');

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
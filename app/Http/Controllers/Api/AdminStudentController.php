<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Enrollment;
use App\Models\Role;
use App\Models\Student;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class AdminStudentController extends Controller
{
    /**
     * បម្លែងរូបភាពដែលបានបង្ហោះ ទៅជា Base64 Data URI (ការពារបាត់រូបលើ Railway)
     */
    private function encodeUploadedImageToBase64($file): ?string
    {
        if (!$file || !$file->isValid()) {
            return null;
        }
        $mime = $file->getMimeType() ?: 'image/jpeg';
        $contents = file_get_contents($file->getRealPath());
        if ($contents === false) {
            return null;
        }
        return 'data:' . $mime . ';base64,' . base64_encode($contents);
    }

    /**
     * បម្លែងគ្រប់ទម្រង់ថ្ងៃខែឆ្នាំកំណើត (30-04-2005, 30/04/2005, លេខខ្មែរ, ឬលេខ Excel) ទៅជា YYYY-MM-DD សម្រាប់ MySQL
     */
    private function normalizeDateOfBirth($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        $str = trim((string) $value);
        if ($str === '' || $str === '-' || strtolower($str) === 'null' || strtolower($str) === 'n/a') {
            return null;
        }

        // បម្លែងលេខខ្មែរ (០-៩) ទៅជាលេខសากล (0-9)
        $str = str_replace(
            ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'],
            ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
            $str
        );

        // 1. ករណីជាលេខ Serial Date របស់ Excel (ឧទាហរណ៍ 38472)
        if (is_numeric($str) && (float) $str > 1000 && (float) $str < 100000) {
            return gmdate('Y-m-d', ((int) round((float) $str) - 25569) * 86400);
        }

        // 2. ករណីទម្រង់ DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY (ឧទាហរណ៍ 30-04-2005)
        if (preg_match('/^(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{4})$/', $str, $m)) {
            $first = (int) $m[1];
            $second = (int) $m[2];
            $year = (int) $m[3];
            $day = ($second > 12 && $first <= 12) ? $second : $first;
            $month = ($second > 12 && $first <= 12) ? $first : $second;
            if (checkdate($month, $day, $year)) {
                return sprintf('%04d-%02d-%02d', $year, $month, $day);
            }
        }

        // 3. ករណីទម្រង់ YYYY-MM-DD ឬ YYYY/MM/DD
        if (preg_match('/^(\d{4})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{1,2})/', $str, $m)) {
            if (checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
                return sprintf('%04d-%02d-%02d', (int) $m[1], (int) $m[2], (int) $m[3]);
            }
        }

        try {
            return Carbon::parse(str_replace('/', '-', $str))->format('Y-m-d');
        } catch (\Throwable $e) {
            return null;
        }
    }

    public function index(Request $request)
    {
        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $search = trim((string) $request->input('search', ''));

        // ✅ select columns ចាំបាច់ និងប្រើ with() ត្រឹមត្រូវ
        $query = Student::with([
            'department:id,department_name',
            'user:id,status,email,profile_image',
            'role:id,role_name',
        ])->select([
            'id', 'user_id', 'role_id', 'department_id',
            'student_code', 'first_name', 'last_name', 'gender',
            'date_of_birth', 'email', 'phone', 'profile_image',
            'batch_year', 'degree_level', 'study_shift', 'address',
            'created_at',
        ]);

        if ($request->filled('department_id')) {
            $query->where('department_id', $request->input('department_id'));
        }

        if ($request->filled('study_shift')) {
            $query->where('study_shift', $request->input('study_shift'));
        }

        // ✅ ច្រោះតាមឆ្នាំសិក្សា (ដាក់មុន paginate ដើម្បីឱ្យដំណើរការត្រឹមត្រូវ)
        if ($request->filled('year')) {
            $y = trim((string) $request->input('year'));
            if (preg_match('/([1-4])/', $y, $m)) {
                $y = $m[1];
            }
            $khmerNumerals = ['1' => '១', '2' => '២', '3' => '៣', '4' => '៤'];
            $khNum = $khmerNumerals[$y] ?? $y;

            $query->where(function ($q) use ($y, $khNum) {
                $q->where('batch_year', $y)
                  ->orWhere('batch_year', $khNum)
                  ->orWhere('batch_year', 'LIKE', "%Year {$y}%")
                  ->orWhere('batch_year', 'LIKE', "%Year{$y}%")
                  ->orWhere('batch_year', 'LIKE', "%ឆ្នាំទី{$khNum}%")
                  ->orWhere('batch_year', 'LIKE', "%ឆ្នាំទី {$khNum}%")
                  ->orWhere('batch_year', 'LIKE', "%ឆ្នាំទី{$y}%")
                  ->orWhere('batch_year', 'LIKE', "%ឆ្នាំទី {$y}%");
            });
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere(DB::raw("CONCAT(first_name, ' ', last_name)"), 'like', "%{$search}%")
                  ->orWhere('student_code', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $students = $query->orderBy('id', 'desc')->paginate($perPage);

        return response()->json([
            'data' => $students->items(),
            'meta' => [
                'current_page' => $students->currentPage(),
                'last_page' => $students->lastPage(),
                'per_page' => $students->perPage(),
                'total' => $students->total(),
            ],
            'message' => 'បានទាញយកបញ្ជីសិស្សដោយជោគជ័យ',
        ]);
    }

    public function store(Request $request)
    {
        if ($request->filled('date_of_birth')) {
            $request->merge(['date_of_birth' => $this->normalizeDateOfBirth($request->input('date_of_birth'))]);
        }

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'gender' => 'required|in:Male,Female,Other',
            'date_of_birth' => 'nullable|date',
            'email' => 'required|email|unique:users,email|unique:students,email',
            'phone' => 'nullable|string|max:20',
            'password' => 'required|string|min:6',
            'status' => 'nullable|in:active,inactive',
            'department_id' => 'nullable|exists:departments,id',
            'student_code' => 'nullable|string|max:50|unique:students,student_code',
            'batch_year' => 'nullable|string|max:50',
            'degree_level' => 'nullable|string|max:100',
            'study_shift' => 'nullable|in:Monday-Friday,Saturday-Sunday',
            'address' => 'nullable|string',
            'role_id' => 'required|exists:roles,id',
            'profile_image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        $student = DB::transaction(function () use ($validated, $request) {
            $profileImagePath = null;
            if ($request->hasFile('profile_image')) {
                $profileImagePath = $this->encodeUploadedImageToBase64($request->file('profile_image'));
            }

            $cleanEmail = strtolower(trim($validated['email']));
            $cleanFirst = trim($validated['first_name']);
            $cleanLast = trim($validated['last_name']);

            $user = User::create([
                'first_name' => $cleanFirst,
                'last_name' => $cleanLast,
                'email' => $cleanEmail,
                'password' => Hash::make($validated['password']),
                'phone' => $validated['phone'] ?? null,
                'gender' => $validated['gender'] ?? null,
                'status' => $validated['status'] ?? 'active',
                'role_id' => $validated['role_id'],
                'profile_image' => $profileImagePath,
            ]);

            $student = Student::create([
                'user_id' => $user->id,
                'role_id' => $validated['role_id'],
                'student_code' => !empty($validated['student_code'])
                    ? trim($validated['student_code'])
                    : $this->generateStudentCode(),
                'first_name' => $cleanFirst,
                'last_name' => $cleanLast,
                'gender' => $validated['gender'],
                'date_of_birth' => $this->normalizeDateOfBirth($validated['date_of_birth'] ?? null),
                'email' => $cleanEmail,
                'phone' => $validated['phone'] ?? null,
                'department_id' => $validated['department_id'] ?? null,
                'batch_year' => $validated['batch_year'] ?? null,
                'degree_level' => $validated['degree_level'] ?? null,
                'study_shift' => $validated['study_shift'] ?? 'Monday-Friday',
                'address' => $validated['address'] ?? null,
                'profile_image' => $profileImagePath,
            ]);

            return $student->load(['department', 'user', 'role']);
        });

        // ✅ លុប Cache ពេលបង្កើតសិស្សថ្មី
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => 'បានបង្កើតគណនីសិស្សដោយជោគជ័យ',
            'data' => $student,
        ], 201);
    }

    public function update(Request $request, Student $student)
    {
        if ($request->filled('date_of_birth')) {
            $request->merge(['date_of_birth' => $this->normalizeDateOfBirth($request->input('date_of_birth'))]);
        }

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'gender' => 'required|in:Male,Female,Other',
            'date_of_birth' => 'nullable|date',
            'email' => [
                'required', 'email',
                Rule::unique('users', 'email')->ignore($student->user_id),
                Rule::unique('students', 'email')->ignore($student->id),
            ],
            'phone' => 'nullable|string|max:20',
            'password' => 'nullable|string|min:6',
            'status' => 'nullable|in:active,inactive',
            'department_id' => 'nullable|exists:departments,id',
            'student_code' => [
                'nullable', 'string', 'max:50',
                Rule::unique('students', 'student_code')->ignore($student->id),
            ],
            'batch_year' => 'nullable|string|max:50',
            'degree_level' => 'nullable|string|max:100',
            'study_shift' => 'nullable|in:Monday-Friday,Saturday-Sunday',
            'address' => 'nullable|string',
            'role_id' => 'required|exists:roles,id',
            'profile_image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        DB::transaction(function () use ($validated, $request, $student) {
            $profileImagePath = $student->profile_image;
            if ($request->hasFile('profile_image')) {
                if (
                    $student->profile_image &&
                    !str_starts_with($student->profile_image, 'data:') &&
                    !str_starts_with($student->profile_image, 'http')
                ) {
                    Storage::disk('public')->delete($student->profile_image);
                }
                $encoded = $this->encodeUploadedImageToBase64($request->file('profile_image'));
                if ($encoded) {
                    $profileImagePath = $encoded;
                }
            }

            $cleanEmail = strtolower(trim($validated['email']));
            $cleanFirst = trim($validated['first_name']);
            $cleanLast = trim($validated['last_name']);

            if ($student->user) {
                $userData = [
                    'first_name' => $cleanFirst,
                    'last_name' => $cleanLast,
                    'email' => $cleanEmail,
                    'phone' => $validated['phone'] ?? $student->user->phone,
                    'gender' => $validated['gender'] ?? $student->user->gender,
                    'status' => $validated['status'] ?? $student->user->status,
                    'role_id' => $validated['role_id'],
                    'profile_image' => $profileImagePath,
                ];

                if (!empty($validated['password'])) {
                    $userData['password'] = Hash::make($validated['password']);
                }

                $student->user->update($userData);
            }

            $student->update([
                'student_code' => !empty($validated['student_code'])
                    ? trim($validated['student_code'])
                    : $student->student_code,
                'first_name' => $cleanFirst,
                'last_name' => $cleanLast,
                'gender' => $validated['gender'],
                'date_of_birth' => array_key_exists('date_of_birth', $validated)
                    ? $this->normalizeDateOfBirth($validated['date_of_birth'])
                    : $student->date_of_birth,
                'email' => $cleanEmail,
                'phone' => $validated['phone'] ?? $student->phone,
                'department_id' => $validated['department_id'] ?? $student->department_id,
                'batch_year' => $validated['batch_year'] ?? $student->batch_year,
                'degree_level' => $validated['degree_level'] ?? $student->degree_level,
                'study_shift' => $validated['study_shift'] ?? $student->study_shift,
                'address' => $validated['address'] ?? $student->address,
                'role_id' => $validated['role_id'],
                'profile_image' => $profileImagePath,
            ]);
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => 'បានកែប្រែព័ត៌មានសិស្សដោយជោគជ័យ',
            'data' => $student->fresh(['department', 'user', 'role']),
        ]);
    }

    public function destroy(Student $student)
    {
        $studentName = trim($student->first_name . ' ' . $student->last_name);

        if (
            $student->profile_image &&
            !str_starts_with($student->profile_image, 'data:') &&
            !str_starts_with($student->profile_image, 'http')
        ) {
            Storage::disk('public')->delete($student->profile_image);
        }

        DB::transaction(function () use ($student) {
            $targetUser = $student->user;
            $student->delete();
            if ($targetUser) {
                $targetUser->delete();
            }
        });

        // ✅ លុប Cache ពេលលុបសិស្ស
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => "បានលុបគណនីសិស្ស '{$studentName}' ដោយជោគជ័យ",
        ]);
    }

    public function getEnrollments(Student $student)
    {
        try {
            $enrollments = Enrollment::with('course.teacher')
                ->where('student_id', $student->user_id)
                ->get();

            // ✅ ទាញយករូបភាពគ្រូពីតារាង teachers មកភ្ជាប់ បើក្នុង course.teacher គ្មានរូបភាព
            $enrollments->each(function ($enrollment) {
                $teacher = $enrollment->course?->teacher;
                if ($teacher && empty($teacher->profile_image)) {
                    $teacherRecord = DB::table('teachers')
                        ->where('user_id', $teacher->id)
                        ->orWhere('email', $teacher->email)
                        ->first();

                    if ($teacherRecord && !empty($teacherRecord->profile_image)) {
                        $teacher->profile_image = $teacherRecord->profile_image;
                    }
                }
            });

            return response()->json([
                'data' => $enrollments,
                'message' => 'បានទាញយកបញ្ជីការចុះឈ្មោះដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching student enrollments: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យចុះឈ្មោះ',
            ], 500);
        }
    }

    public function enrollStudent(Request $request, Student $student)
    {
        try {
            $validated = $request->validate([
                'course_ids' => 'required|array',
                'course_ids.*' => 'required|exists:courses,id',
            ]);

            $enrolledCourses = [];
            foreach ($validated['course_ids'] as $courseId) {
                $exists = Enrollment::where('student_id', $student->user_id)
                    ->where('course_id', $courseId)
                    ->exists();

                if (!$exists) {
                    $enrollment = Enrollment::create([
                        'student_id' => $student->user_id,
                        'course_id' => $courseId,
                        'enrolled_date' => now(),
                        'status' => 'active',
                    ]);

                    $loadedEnrollment = $enrollment->load('course.teacher');

                    // ✅ ភ្ជាប់រូបភាពគ្រូពីតារាង teachers ពេលចុះឈ្មោះមុខវិជ្ជាថ្មី
                    $teacher = $loadedEnrollment->course?->teacher;
                    if ($teacher && empty($teacher->profile_image)) {
                        $teacherRecord = DB::table('teachers')
                            ->where('user_id', $teacher->id)
                            ->orWhere('email', $teacher->email)
                            ->first();

                        if ($teacherRecord && !empty($teacherRecord->profile_image)) {
                            $teacher->profile_image = $teacherRecord->profile_image;
                        }
                    }

                    $enrolledCourses[] = $loadedEnrollment;
                }
            }

            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

            return response()->json([
                'data' => $enrolledCourses,
                'message' => 'បានចុះឈ្មោះមុខវិជ្ជាជូនសិស្សដោយជោគជ័យ',
            ], 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Error enrolling student: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការចុះឈ្មោះមុខវិជ្ជាឱ្យសិស្ស: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get all students for export without pagination
     * GET /admin/students/export-all
     */
    public function exportAll(Request $request)
    {
        if ($request->query('format') === 'json') {
            $students = [];
            Student::with([
                'department:id,department_name',
                'user:id,status,email,profile_image',
                'role:id,role_name',
            ])
                ->select([
                    'id', 'user_id', 'role_id', 'department_id',
                    'student_code', 'first_name', 'last_name', 'gender',
                    'date_of_birth', 'email', 'phone', 'profile_image',
                    'batch_year', 'degree_level', 'study_shift', 'address',
                    'created_at',
                ])
                ->orderBy('id', 'asc')
                ->chunk(500, function ($chunk) use (&$students) {
                    foreach ($chunk as $student) {
                        if (empty($student->profile_image) && !empty($student->user?->profile_image)) {
                            $student->profile_image = $student->user->profile_image;
                        }
                        $students[] = $student;
                    }
                });

            return response()->json([
                'data' => $students,
                'message' => 'បានទាញយកទិន្នន័យសិស្សទាំងអស់ដោយជោគជ័យ',
            ]);
        }

        $filename = 'Students_List_' . date('Y-m-d') . '.csv';
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
                'Student Code',
                'First Name',
                'Last Name',
                'Gender',
                'Email',
                'Phone',
                'Department',
                'Batch Year',
                'Degree Level',
                'Study Shift',
                'Address',
                'Date of Birth',
                'Status',
            ]);

            $index = 1;
            Student::with([
                'department:id,department_name',
                'user:id,status,email',
                'role:id,role_name',
            ])
                ->select([
                    'id', 'user_id', 'role_id', 'department_id',
                    'student_code', 'first_name', 'last_name', 'gender',
                    'date_of_birth', 'email', 'phone',
                    'batch_year', 'degree_level', 'study_shift', 'address',
                ])
                ->orderBy('id', 'asc')
                ->chunk(500, function ($students) use ($handle, &$index) {
                    foreach ($students as $s) {
                        $gender = $s->gender === 'Male'
                            ? 'ប្រុស (Male)'
                            : ($s->gender === 'Female' ? 'ស្រី (Female)' : ($s->gender ?? ''));
                        $status = ($s->user->status ?? $s->status ?? 'active') === 'active'
                            ? 'សកម្ម (Active)'
                            : 'អសកម្ម (Inactive)';

                        fputcsv($handle, [
                            $index++,
                            $s->student_code ?? '',
                            $s->first_name ?? '',
                            $s->last_name ?? '',
                            $gender,
                            $s->email ?? '',
                            $s->phone ?? '',
                            $s->department->department_name ?? '',
                            $s->batch_year ?? '',
                            $s->degree_level ?? '',
                            $s->study_shift ?? '',
                            $s->address ?? '',
                            $s->date_of_birth ?? '',
                            $status,
                        ]);
                    }
                });

            fclose($handle);
        }, 200, $headers);
    }

    /**
     * Import multiple students
     * POST /admin/students/import
     */
    public function import(Request $request)
    {
        $request->validate([
            'students' => 'required|array|min:1',
            'students.*.first_name' => 'required|string|max:100',
            'students.*.last_name' => 'required|string|max:100',
            'students.*.email' => 'required|email',
        ]);

        $studentRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%student%'])->first()
            ?? Role::find(3);
        $studentRoleId = $studentRole?->id ?? 3;

        $importedCount = 0;
        $skipped = [];

        DB::transaction(function () use ($request, $studentRoleId, &$importedCount, &$skipped) {
            // ✅ ទាញ Emails ដែលមានរួច ក្នុង Query តែម្តង
            $emails = collect($request->students)
                ->pluck('email')
                ->filter()
                ->map(fn ($e) => strtolower(trim($e)))
                ->toArray();

            $existingEmails = User::whereIn('email', $emails)->pluck('email')
                ->merge(Student::whereIn('email', $emails)->pluck('email'))
                ->map(fn ($e) => strtolower(trim($e)))
                ->unique()
                ->toArray();

            foreach ($request->students as $index => $item) {
                $cleanEmail = strtolower(trim($item['email']));

                if (in_array($cleanEmail, $existingEmails, true)) {
                    $skipped[] = [
                        'row' => $index + 1,
                        'email' => $item['email'],
                        'reason' => 'អ៊ីមែលនេះមានរួចហើយ (Email already exists)',
                    ];
                    continue;
                }

                $existingEmails[] = $cleanEmail;

                $password = !empty($item['password']) ? $item['password'] : '12345678';
                $gender = in_array($item['gender'] ?? '', ['Male', 'Female', 'Other']) ? $item['gender'] : 'Male';
                $studyShift = in_array($item['study_shift'] ?? '', ['Monday-Friday', 'Saturday-Sunday'])
                    ? $item['study_shift']
                    : 'Monday-Friday';
                $status = in_array($item['status'] ?? '', ['active', 'inactive']) ? $item['status'] : 'active';

                $cleanFirst = trim($item['first_name']);
                $cleanLast = trim($item['last_name']);

                $user = User::create([
                    'first_name' => $cleanFirst,
                    'last_name' => $cleanLast,
                    'email' => $cleanEmail,
                    'password' => Hash::make($password),
                    'phone' => $item['phone'] ?? null,
                    'gender' => $gender,
                    'status' => $status,
                    'role_id' => $studentRoleId,
                ]);

                $requestedCode = !empty($item['student_code']) ? trim($item['student_code']) : null;
                if ($requestedCode && Student::where('student_code', $requestedCode)->exists()) {
                    $requestedCode = null;
                }

                Student::create([
                    'user_id' => $user->id,
                    'role_id' => $studentRoleId,
                    'student_code' => $requestedCode ?: $this->generateStudentCode(),
                    'first_name' => $cleanFirst,
                    'last_name' => $cleanLast,
                    'gender' => $gender,
                    'date_of_birth' => $this->normalizeDateOfBirth($item['date_of_birth'] ?? null),
                    'email' => $cleanEmail,
                    'phone' => $item['phone'] ?? null,
                    'department_id' => $item['department_id'] ?? null,
                    'batch_year' => $item['batch_year'] ?? null,
                    'degree_level' => $item['degree_level'] ?? null,
                    'study_shift' => $studyShift,
                    'address' => $item['address'] ?? null,
                ]);

                $importedCount++;
            }
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => "នាំចូលសិស្សចំនួន {$importedCount} នាក់ដោយជោគជ័យ",
            'imported_count' => $importedCount,
            'skipped' => $skipped,
        ]);
    }

    /**
     * បង្កើតអត្តលេខសិស្សដោយស្វ័យប្រវត្តិដោយមិនឱ្យស្ទួនគ្នាដាច់ខាត
     */
    private function generateStudentCode(): string
    {
        $year = date('Y');
        $nextNum = (int) Student::max('id') + 1;
        do {
            $code = 'STU-' . $year . '-' . str_pad((string) $nextNum, 4, '0', STR_PAD_LEFT);
            $nextNum++;
        } while (Student::where('student_code', $code)->exists());

        return $code;
    }

    /**
     * ដំឡើងថ្នាក់សិស្ស (Bulk Promote Students)
     */
    public function promoteStudents(Request $request)
    {
        $request->validate([
            'student_ids' => 'required|array|min:1',
            'student_ids.*' => 'integer|exists:students,id',
            'target_year' => 'required|string|max:50',
        ]);

        try {
            DB::beginTransaction();

            $promotedCount = Student::whereIn('id', $request->student_ids)
                ->update([
                    'batch_year' => $request->target_year,
                    'updated_at' => now(),
                ]);

            DB::commit();

            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

            return response()->json([
                'success' => true,
                'message' => "បានដំឡើងថ្នាក់សិស្សចំនួន {$promotedCount} នាក់ ទៅកាន់ «{$request->target_year}» ដោយជោគជ័យ។",
                'promoted_count' => $promotedCount,
            ], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('ការដំឡើងថ្នាក់សិស្សបរាជ័យ៖ ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'មានបញ្ហាក្នុងការដំឡើងថ្នាក់សិស្ស។ សូមព្យាយាមម្តងទៀត។',
            ], 500);
        }
    }

    /**
     * ដកការចុះឈ្មោះមុខវិជ្ជាចេញពីសិស្ស (Unenroll Course)
     */
    public function unenrollStudent(Student $student, $courseId)
    {
        try {
            $enrollment = Enrollment::where('student_id', $student->user_id)
                ->where('course_id', $courseId)
                ->first();

            if (!$enrollment) {
                return response()->json(['message' => 'រកមិនឃើញទិន្នន័យនៃការចុះឈ្មោះនេះទេ'], 404);
            }

            $enrollment->delete();

            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

            return response()->json([
                'success' => true,
                'message' => 'បានលុបមុខវិជ្ជាចេញពីសិស្សដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Error unenrolling student course: ' . $e->getMessage());

            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបមុខវិជ្ជាសិស្ស។ សូមព្យាយាមម្តងទៀត។',
            ], 500);
        }
    }
}
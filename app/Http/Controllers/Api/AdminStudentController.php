<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\Student;
use App\Models\User;
use App\Models\Department;
use App\Models\Enrollment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Cache;

class AdminStudentController extends Controller
{
    public function index(Request $request)
    {
        $perPage = $request->input('per_page', 15);
        $search = $request->input('search');

        // ✅ កែសម្រួល៖ select columns ចាំបាច់ និងប្រើ with() ត្រឹមត្រូវ
        $query = Student::with([
            'department:id,department_name',
            'user:id,status,email',
            'role:id,role_name'
        ])->select([
            'id', 'user_id', 'role_id', 'department_id',
            'student_code', 'first_name', 'last_name', 'gender',
            'date_of_birth', 'email', 'phone', 'profile_image',
            'batch_year', 'degree_level', 'study_shift', 'address',
            'created_at'
        ]);

        if (!empty($search)) {
            // ✅ កែសម្រួល៖ ប្រើ LIKE '%search%' តែខាងចុង ដើម្បីឱ្យ Index ដំណើរការ
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "{$search}%")
                  ->orWhere('last_name', 'like', "{$search}%")
                  ->orWhere('student_code', 'like', "{$search}%")
                  ->orWhere('email', 'like', "{$search}%");
            });
        }

        $students = $query->orderBy('id', 'desc')->paginate($perPage);

        // នៅក្នុងអនុគមន៍ index(Request $request) នៃ AdminStudentController.php
if ($request->filled('year')) {
    $y = $request->input('year'); // ឧ. '1', '2', '3', '4'
    $khmerNumerals = ['1' => '១', '2' => '២', '3' => '៣', '4' => '៤'];
    $khNum = $khmerNumerals[$y] ?? $y;

    $query->where(function ($q) use ($y, $khNum) {
        $q->where('batch_year', $y)
          ->orWhere('batch_year', $khNum)
          ->orWhere('batch_year', 'LIKE', "%Year {$y}%")
          ->orWhere('batch_year', 'LIKE', "%Year{$y}%")
          ->orWhere('batch_year', 'LIKE', "%ឆ្នាំទី{$khNum}%")
          ->orWhere('batch_year', 'LIKE', "%ឆ្នាំទី {$khNum}%")
          ->orWhere('batch_year', 'LIKE', "%ឆ្នាំទី{$y}%");
    });
}
        return response()->json([
            'data' => $students->items(),
            'meta' => [
                'current_page' => $students->currentPage(),
                'last_page' => $students->lastPage(),
                'per_page' => $students->perPage(),
                'total' => $students->total(),
            ],
            'message' => 'បានទាញយកបញ្ជីសិស្សដោយជោគជ័យ'
        ]);
    }

    public function store(Request $request)
    {
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
            'profile_image' => 'nullable|image|mimes:jpeg,png,jpg,gif|max:2048',
        ]);

        $student = DB::transaction(function () use ($validated, $request) {
            $user = User::create([
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'phone' => $validated['phone'] ?? null,
                'gender' => $validated['gender'] ?? null,
                'status' => $validated['status'] ?? 'active',
                'role_id' => $validated['role_id'],
            ]);

            $profileImagePath = null;
            if ($request->hasFile('profile_image')) {
                $file = $request->file('profile_image');
                $filename = time() . '_' . $file->getClientOriginalName();
                $profileImagePath = $file->storeAs('student_profiles', $filename, 'public');
            }

            $student = Student::create([
                'user_id' => $user->id,
                'role_id' => $validated['role_id'],
                'student_code' => $validated['student_code'] ?? $this->generateStudentCode(),
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'gender' => $validated['gender'],
                'date_of_birth' => $validated['date_of_birth'] ?? null,
                'email' => $validated['email'],
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
            'data' => $student
        ], 201);
    }

    public function update(Request $request, Student $student)
    {
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
            'profile_image' => 'nullable|image|mimes:jpeg,png,jpg,gif|max:2048',
        ]);

        DB::transaction(function () use ($validated, $request, $student) {
            $userData = [
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? $student->user->phone,
                'gender' => $validated['gender'] ?? $student->user->gender,
                'status' => $validated['status'] ?? $student->user->status,
                'role_id' => $validated['role_id'],
            ];

            if (!empty($validated['password'])) {
                $userData['password'] = Hash::make($validated['password']);
            }

            $student->user->update($userData);

            $profileImagePath = $student->profile_image;
            if ($request->hasFile('profile_image')) {
                if ($student->profile_image) {
                    Storage::disk('public')->delete($student->profile_image);
                }
                $file = $request->file('profile_image');
                $filename = time() . '_' . $file->getClientOriginalName();
                $profileImagePath = $file->storeAs('student_profiles', $filename, 'public');
            }

            $student->update([
                'student_code' => $validated['student_code'] ?? $student->student_code,
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'gender' => $validated['gender'],
                'date_of_birth' => $validated['date_of_birth'] ?? $student->date_of_birth,
                'email' => $validated['email'],
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

        return response()->json([
            'message' => 'បានកែប្រែព័ត៌មានសិស្សដោយជោគជ័យ',
            'data' => $student->fresh(['department', 'user', 'role'])
        ]);
    }

    public function destroy(Student $student)
    {
        $studentName = $student->first_name . ' ' . $student->last_name;

        if ($student->profile_image) {
            Storage::disk('public')->delete($student->profile_image);
        }

        $student->user->delete();

        // ✅ លុប Cache ពេលលុបសិស្ស
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => "បានលុបគណនីសិស្ស '{$studentName}' ដោយជោគជ័យ"
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
                'message' => 'បានទាញយកបញ្ជីការចុះឈ្មោះដោយជោគជ័យ'
            ]);
        } catch (\Exception $e) {
            \Log::error('Error fetching student enrollments: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យចុះឈ្មោះ'
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

            return response()->json([
                'data' => $enrolledCourses,
                'message' => 'បានចុះឈ្មោះមុខវិជ្ជាជូនសិស្សដោយជោគជ័យ'
            ], 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            \Log::error('Error enrolling student: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការចុះឈ្មោះមុខវិជ្ជាឱ្យសិស្ស: ' . $e->getMessage()
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
                'user:id,status,email',
                'role:id,role_name'
            ])
            ->select([
                'id', 'user_id', 'role_id', 'department_id',
                'student_code', 'first_name', 'last_name', 'gender',
                'date_of_birth', 'email', 'phone',
                'batch_year', 'degree_level', 'study_shift', 'address'
            ])
            ->orderBy('first_name')
            ->chunk(500, function ($chunk) use (&$students) {
                foreach ($chunk as $student) {
                    $students[] = $student;
                }
            });

            return response()->json([
                'data' => $students,
                'message' => 'បានទាញយកទិន្នន័យសិស្សទាំងអស់ដោយជោគជ័យ'
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
                'Status'
            ]);

            $index = 1;
            Student::with([
                'department:id,department_name',
                'user:id,status,email',
                'role:id,role_name'
            ])
            ->select([
                'id', 'user_id', 'role_id', 'department_id',
                'student_code', 'first_name', 'last_name', 'gender',
                'date_of_birth', 'email', 'phone',
                'batch_year', 'degree_level', 'study_shift', 'address'
            ])
            ->orderBy('first_name')
            ->chunk(500, function ($students) use ($handle, &$index) {
                foreach ($students as $s) {
                    $gender = $s->gender === 'Male' ? 'ប្រុស (Male)' : ($s->gender === 'Female' ? 'ស្រី (Female)' : ($s->gender ?? ''));
                    $status = ($s->user->status ?? $s->status) === 'active' ? 'សកម្ម (Active)' : 'អសកម្ម (Inactive)';

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
                        $status
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

        $studentRole = Role::where('role_name', 'Student')->firstOrFail();
        $importedCount = 0;
        $skipped = [];

        DB::transaction(function () use ($request, $studentRole, &$importedCount, &$skipped) {
            // ✅ កែសម្រួល៖ ទាញ Emails ដែលមានរួច ក្នុង Query តែម្តង
            $emails = collect($request->students)->pluck('email')->filter()->toArray();
            $existingEmails = User::whereIn('email', $emails)->pluck('email')
                ->merge(Student::whereIn('email', $emails)->pluck('email'))
                ->unique()
                ->toArray();

            foreach ($request->students as $index => $item) {
                if (in_array($item['email'], $existingEmails)) {
                    $skipped[] = [
                        'row' => $index + 1,
                        'email' => $item['email'],
                        'reason' => 'អ៊ីមែលនេះមានរួចហើយ (Email already exists)'
                    ];
                    continue;
                }

                $password = !empty($item['password']) ? $item['password'] : '12345678';
                $gender = in_array($item['gender'] ?? '', ['Male', 'Female', 'Other']) ? $item['gender'] : 'Male';
                $studyShift = in_array($item['study_shift'] ?? '', ['Monday-Friday', 'Saturday-Sunday']) ? $item['study_shift'] : 'Monday-Friday';
                $status = in_array($item['status'] ?? '', ['active', 'inactive']) ? $item['status'] : 'active';

                $user = User::create([
                    'first_name' => $item['first_name'],
                    'last_name' => $item['last_name'],
                    'email' => $item['email'],
                    'password' => Hash::make($password),
                    'phone' => $item['phone'] ?? null,
                    'gender' => $gender,
                    'status' => $status,
                    'role_id' => $studentRole->id,
                ]);

                Student::create([
                    'user_id' => $user->id,
                    'role_id' => $studentRole->id,
                    'student_code' => !empty($item['student_code']) ? $item['student_code'] : $this->generateStudentCode(),
                    'first_name' => $item['first_name'],
                    'last_name' => $item['last_name'],
                    'gender' => $gender,
                    'date_of_birth' => !empty($item['date_of_birth']) ? $item['date_of_birth'] : null,
                    'email' => $item['email'],
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
            'skipped' => $skipped
        ]);
    }

    private function generateStudentCode()
    {
        $year = date('Y');
        $count = Student::count() + 1;
        return 'STU-' . $year . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
    }

    /**
     * ដំឡើងថ្នាក់សិស្ស (Bulk Promote Students)
     */
    public function promoteStudents(Request $request)
    {
        // ១. ត្រួតពិនិត្យទិន្នន័យដែលផ្ញើមកពី React
        $request->validate([
            'student_ids' => 'required|array|min:1',
            'student_ids.*' => 'integer|exists:students,id', // ពិនិត្យថា ID ទាំងនេះពិតជាមានក្នុង Table students
            'target_year' => 'required|string|max:50',
        ]);

        try {
            DB::beginTransaction();

            // ២. ធ្វើការ Update Field `batch_year` របស់សិស្សទាំងអស់ដែលបានបញ្ជូន ID មក
            $promotedCount = Student::whereIn('id',$request->student_ids)
                ->update([
                    'batch_year' => $request->target_year,
                    'updated_at' => now() // Update ម៉ោងបច្ចុប្បន្ន
                ]);

            DB::commit();

            // ៣. បញ្ជូនសារជោគជ័យទៅកាន់ React វិញ
            return response()->json([
                'success' => true,
                'message' => "បានដំឡើងថ្នាក់សិស្សចំនួន {$promotedCount} នាក់ ទៅកាន់ «{$request->target_year}» ដោយជោគជ័យ។",
                'promoted_count' => $promotedCount
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('ការដំឡើងថ្នាក់សិស្សបរាជ័យ៖ ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'មានបញ្ហាក្នុងការដំឡើងថ្នាក់សិស្ស។ សូមព្យាយាមម្តងទៀត។'
            ], 500);
        }
    }

    /**
     * ដកការចុះឈ្មោះមុខវិជ្ជាចេញពីសិស្ស (Unenroll Course)
     */
    public function unenrollStudent(Student $student, $courseId)
    {
        try {
            // ស្វែងរកទិន្នន័យដែលបានចុះឈ្មោះ ដោយផ្អែកលើ user_id របស់សិស្ស និង course_id
            $enrollment = Enrollment::where('student_id', $student->user_id)
                                    ->where('course_id', $courseId)
                                    ->first();

            if (!$enrollment) {
                return response()->json(['message' => 'រកមិនឃើញទិន្នន័យនៃការចុះឈ្មោះនេះទេ'], 404);
            }

            // ធ្វើការលុប
            $enrollment->delete();

            return response()->json([
                'success' => true,
                'message' => 'បានលុបមុខវិជ្ជាចេញពីសិស្សដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error unenrolling student course: ' . $e->getMessage());
            
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបមុខវិជ្ជាសិស្ស។ សូមព្យាយាមម្តងទៀត។'
            ], 500);
        }
    }
}
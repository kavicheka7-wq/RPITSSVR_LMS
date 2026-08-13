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
    public function index()
    {
        $students = Student::with(['department', 'user', 'role'])
            ->orderBy('first_name')
            ->get();

        return response()->json([
            'data' => $students,
            'message' => 'បានទាញយកបញ្ជីសិស្សដោយជោគជ័យ'
        ]);
    }

    public function store(Request $request)
    {
        // ពិនិត្យមើលទិន្នន័យដែលបានផ្ញើ
        \Log::info('Student Store Request:', $request->all());
        
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
            // 1. Create user account
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

            // 2. Handle profile image upload
            $profileImagePath = null;
            if ($request->hasFile('profile_image')) {
                $file = $request->file('profile_image');
                $filename = time() . '_' . $file->getClientOriginalName();
                $profileImagePath = $file->storeAs('student_profiles', $filename, 'public');
                \Log::info('Profile image uploaded:', ['path' => $profileImagePath]);
            }

            // 3. Create student profile
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

            \Log::info('Student created:', ['student' => $student]);

            return $student->load(['department', 'user', 'role']);
        });

        return response()->json([
            'message' => 'បានបង្កើតគណនីសិស្សដោយជោគជ័យ',
            'data' => $student
        ], 201);
    }

    public function update(Request $request, Student $student)
    {
        \Log::info('Student Update Request:', $request->all());
        
        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'gender' => 'required|in:Male,Female,Other',
            'date_of_birth' => 'nullable|date',
            'email' => [
                'required',
                'email',
                Rule::unique('users', 'email')->ignore($student->user_id),
                Rule::unique('students', 'email')->ignore($student->id),
            ],
            'phone' => 'nullable|string|max:20',
            'password' => 'nullable|string|min:6',
            'status' => 'nullable|in:active,inactive',
            'department_id' => 'nullable|exists:departments,id',
            'student_code' => [
                'nullable',
                'string',
                'max:50',
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
            // Update User
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

            // Handle profile image upload
            $profileImagePath = $student->profile_image;
            if ($request->hasFile('profile_image')) {
                // Delete old image if exists
                if ($student->profile_image) {
                    Storage::disk('public')->delete($student->profile_image);
                }
                $file = $request->file('profile_image');
                $filename = time() . '_' . $file->getClientOriginalName();
                $profileImagePath = $file->storeAs('student_profiles', $filename, 'public');
                \Log::info('Profile image updated:', ['path' => $profileImagePath]);
            }

            // Update Student
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

            \Log::info('Student updated:', ['student' => $student]);
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
                    $enrolledCourses[] = $enrollment->load('course.teacher');
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

    public function unenrollStudent(Student $student, $courseId)
    {
        try {
            $deleted = Enrollment::where('student_id', $student->user_id)
                ->where('course_id', $courseId)
                ->delete();

            if ($deleted) {
                return response()->json([
                    'message' => 'បានលុបការចុះឈ្មោះមុខវិជ្ជាដោយជោគជ័យ'
                ]);
            } else {
                return response()->json([
                    'message' => 'រកមិនឃើញការចុះឈ្មោះមុខវិជ្ជានេះទេ'
                ], 404);
            }
        } catch (\Exception $e) {
            \Log::error('Error unenrolling student: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបការចុះឈ្មោះមុខវិជ្ជា'
            ], 500);
        }
    }

    /**
     * Get all students for export without pagination
     * GET /admin/students/export-all
     */
    public function exportAll()
    {
        $students = Student::with(['department', 'user', 'role'])
            ->orderBy('first_name')
            ->get();

        return response()->json([
            'data' => $students,
            'message' => 'បានទាញយកទិន្នន័យសិស្សទាំងអស់ដោយជោគជ័យ'
        ]);
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
            foreach ($request->students as $index => $item) {
                // Check duplicate email in users or students
                $emailExists = User::where('email', $item['email'])->exists() || Student::where('email', $item['email'])->exists();
                if ($emailExists) {
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
}
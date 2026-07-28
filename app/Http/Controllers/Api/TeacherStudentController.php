<?php
// app/Http/Controllers/Api/TeacherStudentController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Department;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TeacherStudentController extends Controller
{
    /**
     * Get all students in the same department as the teacher
     * GET /teacher/students
     */
    public function index()
    {
        try {
            $teacher = Auth::user()->teacher;
            
            if (!$teacher) {
                return response()->json([
                    'message' => 'អ្នកមិនមែនជាគ្រូបង្រៀនទេ'
                ], 403);
            }

            // ==========================================
            // ទាញយកដេប៉ាតឺម៉ង់របស់គ្រូ
            // ==========================================
            $teacherDepartmentId = $teacher->department_id;
            
            // ប្រសិនបើគ្រូមិនមានដេប៉ាតឺម៉ង់
            if (!$teacherDepartmentId) {
                return response()->json([
                    'data' => [],
                    'total' => 0,
                    'message' => 'គ្រូបង្រៀនមិនទាន់មានដេប៉ាតឺម៉ង់ទេ'
                ]);
            }

            // ==========================================
            // ទាញយកសិស្សដែលមានដេប៉ាតឺម៉ង់ដូចគ្នានឹងគ្រូ
            // ==========================================
            $students = Student::with(['department', 'user', 'role'])
                ->where('department_id', $teacherDepartmentId)
                ->orderBy('first_name')
                ->get();

            // ប្រសិនបើគ្មានសិស្ស
            if ($students->isEmpty()) {
                return response()->json([
                    'data' => [],
                    'total' => 0,
                    'teacher_department' => $teacher->department ? [
                        'id' => $teacher->department->id,
                        'name' => $teacher->department->department_name,
                    ] : null,
                    'message' => 'មិនមានសិស្សក្នុងដេប៉ាតឺម៉ង់នេះទេ'
                ]);
            }

            // ==========================================
            // រៀបចំទិន្នន័យសិស្ស
            // ==========================================
            $studentsWithDept = $students->map(function ($student) {
                return [
                    'id' => $student->id,
                    'user_id' => $student->user_id,
                    'role_id' => $student->role_id,
                    'student_code' => $student->student_code,
                    'first_name' => $student->first_name,
                    'last_name' => $student->last_name,
                    'gender' => $student->gender,
                    'date_of_birth' => $student->date_of_birth,
                    'email' => $student->email,
                    'phone' => $student->phone,
                    'batch_year' => $student->batch_year,
                    'degree_level' => $student->degree_level,
                    'study_shift' => $student->study_shift,
                    'address' => $student->address,
                    'profile_image' => $student->profile_image,
                    'department_id' => $student->department_id,
                    'department' => $student->department ? [
                        'id' => $student->department->id,
                        'name' => $student->department->department_name,
                        'department_name' => $student->department->department_name,
                        'description' => $student->department->description,
                    ] : null,
                    'user' => $student->user ? [
                        'id' => $student->user->id,
                        'status' => $student->user->status,
                        'email' => $student->user->email,
                    ] : null,
                    'role' => $student->role ? [
                        'id' => $student->role->id,
                        'role_name' => $student->role->role_name,
                    ] : null,
                    'status' => $student->user ? $student->user->status : 'inactive',
                    'created_at' => $student->created_at,
                    'updated_at' => $student->updated_at,
                ];
            });

            return response()->json([
                'data' => $studentsWithDept,
                'total' => $studentsWithDept->count(),
                'teacher_department' => $teacher->department ? [
                    'id' => $teacher->department->id,
                    'name' => $teacher->department->department_name,
                ] : null,
                'message' => 'បានទាញយកបញ្ជីសិស្សដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error fetching teacher students: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យសិស្ស: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get student count for teacher dashboard (based on department)
     * GET /teacher/students/count
     */
    public function getCount()
    {
        try {
            $teacher = Auth::user()->teacher;
            
            if (!$teacher) {
                return response()->json([
                    'total_students' => 0,
                    'course_stats' => [],
                    'department_stats' => [],
                    'message' => 'អ្នកមិនមែនជាគ្រូបង្រៀនទេ'
                ], 403);
            }

            $teacherDepartmentId = $teacher->department_id;

            if (!$teacherDepartmentId) {
                return response()->json([
                    'total_students' => 0,
                    'course_stats' => [],
                    'department_stats' => [],
                    'message' => 'គ្រូបង្រៀនមិនទាន់មានដេប៉ាតឺម៉ង់ទេ'
                ]);
            }

            // ==========================================
            // 1. រាប់ចំនួនសិស្សសរុបក្នុងដេប៉ាតឺម៉ង់
            // ==========================================
            $totalStudents = Student::where('department_id', $teacherDepartmentId)->count();

            // ==========================================
            // 2. រាប់ចំនួនសិស្សតាមភេទ
            // ==========================================
            $maleStudents = Student::where('department_id', $teacherDepartmentId)
                ->where('gender', 'Male')
                ->count();
            
            $femaleStudents = Student::where('department_id', $teacherDepartmentId)
                ->where('gender', 'Female')
                ->count();

            // ==========================================
            // 3. រាប់ចំនួនសិស្សតាមកម្រិតសិក្សា
            // ==========================================
            $degreeStats = Student::where('department_id', $teacherDepartmentId)
                ->select('degree_level', \DB::raw('count(*) as total'))
                ->groupBy('degree_level')
                ->get()
                ->map(function ($item) {
                    return [
                        'degree_level' => $item->degree_level,
                        'total' => $item->total,
                    ];
                });

            // ==========================================
            // 4. រាប់ចំនួនសិស្សតាមវេនសិក្សា
            // ==========================================
            $shiftStats = Student::where('department_id', $teacherDepartmentId)
                ->select('study_shift', \DB::raw('count(*) as total'))
                ->groupBy('study_shift')
                ->get()
                ->map(function ($item) {
                    return [
                        'study_shift' => $item->study_shift,
                        'total' => $item->total,
                    ];
                });

            // ==========================================
            // 5. រាប់ចំនួនសិស្សតាមជំនាន់
            // ==========================================
            $batchStats = Student::where('department_id', $teacherDepartmentId)
                ->select('batch_year', \DB::raw('count(*) as total'))
                ->groupBy('batch_year')
                ->get()
                ->map(function ($item) {
                    return [
                        'batch_year' => $item->batch_year,
                        'total' => $item->total,
                    ];
                });

            // ==========================================
            // 6. ស្ថិតិតាមដេប៉ាតឺម៉ង់
            // ==========================================
            $departmentStats = Department::withCount('students')
                ->having('students_count', '>', 0)
                ->get()
                ->map(function ($department) {
                    return [
                        'department_id' => $department->id,
                        'department_name' => $department->department_name,
                        'student_count' => $department->students_count,
                    ];
                });

            return response()->json([
                'total_students' => $totalStudents,
                'male_students' => $maleStudents,
                'female_students' => $femaleStudents,
                'degree_stats' => $degreeStats,
                'shift_stats' => $shiftStats,
                'batch_stats' => $batchStats,
                'department_stats' => $departmentStats,
                'teacher_department' => $teacher->department ? [
                    'id' => $teacher->department->id,
                    'name' => $teacher->department->department_name,
                ] : null,
                'message' => 'បានទាញយកចំនួនសិស្សដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error fetching student count: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកចំនួនសិស្ស: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Search students by name or student code (only in teacher's department)
     * GET /teacher/students/search?q=keyword
     */
    public function search(Request $request)
    {
        try {
            $keyword = $request->query('q');
            $teacher = Auth::user()->teacher;
            $teacherDepartmentId = $teacher->department_id;

            if (empty($keyword)) {
                return $this->index();
            }

            if (!$teacherDepartmentId) {
                return response()->json([
                    'data' => [],
                    'total' => 0,
                    'message' => 'គ្រូបង្រៀនមិនទាន់មានដេប៉ាតឺម៉ង់ទេ'
                ]);
            }

            $students = Student::with(['department', 'user', 'role'])
                ->where('department_id', $teacherDepartmentId)
                ->where(function ($query) use ($keyword) {
                    $query->where('first_name', 'LIKE', "%{$keyword}%")
                          ->orWhere('last_name', 'LIKE', "%{$keyword}%")
                          ->orWhere('email', 'LIKE', "%{$keyword}%")
                          ->orWhere('student_code', 'LIKE', "%{$keyword}%")
                          ->orWhere('batch_year', 'LIKE', "%{$keyword}%");
                })
                ->orderBy('first_name')
                ->get();

            $studentsWithDept = $students->map(function ($student) {
                return [
                    'id' => $student->id,
                    'student_code' => $student->student_code,
                    'first_name' => $student->first_name,
                    'last_name' => $student->last_name,
                    'email' => $student->email,
                    'batch_year' => $student->batch_year,
                    'degree_level' => $student->degree_level,
                    'study_shift' => $student->study_shift,
                    'profile_image' => $student->profile_image,
                    'department_id' => $student->department_id,
                    'department' => $student->department ? [
                        'id' => $student->department->id,
                        'name' => $student->department->department_name,
                    ] : null,
                    'user' => $student->user ? [
                        'id' => $student->user->id,
                        'status' => $student->user->status,
                    ] : null,
                    'status' => $student->user ? $student->user->status : 'inactive',
                ];
            });

            return response()->json([
                'data' => $studentsWithDept,
                'keyword' => $keyword,
                'total' => $studentsWithDept->count(),
                'teacher_department' => $teacher->department ? [
                    'id' => $teacher->department->id,
                    'name' => $teacher->department->department_name,
                ] : null,
                'message' => 'បានស្វែងរកសិស្សដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error searching students: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការស្វែងរកសិស្ស'
            ], 500);
        }
    }

    /**
     * Get student by ID (only if in teacher's department)
     * GET /teacher/students/{studentId}
     */
    public function show($studentId)
    {
        try {
            $teacher = Auth::user()->teacher;
            $teacherDepartmentId = $teacher->department_id;

            if (!$teacherDepartmentId) {
                return response()->json([
                    'message' => 'គ្រូបង្រៀនមិនទាន់មានដេប៉ាតឺម៉ង់ទេ'
                ], 404);
            }

            $student = Student::with(['department', 'user', 'role'])
                ->where('department_id', $teacherDepartmentId)
                ->findOrFail($studentId);

            return response()->json([
                'data' => [
                    'id' => $student->id,
                    'student_code' => $student->student_code,
                    'first_name' => $student->first_name,
                    'last_name' => $student->last_name,
                    'gender' => $student->gender,
                    'date_of_birth' => $student->date_of_birth,
                    'email' => $student->email,
                    'phone' => $student->phone,
                    'batch_year' => $student->batch_year,
                    'degree_level' => $student->degree_level,
                    'study_shift' => $student->study_shift,
                    'address' => $student->address,
                    'profile_image' => $student->profile_image,
                    'department_id' => $student->department_id,
                    'department' => $student->department ? [
                        'id' => $student->department->id,
                        'name' => $student->department->department_name,
                        'department_name' => $student->department->department_name,
                        'description' => $student->department->description,
                    ] : null,
                    'user' => $student->user ? [
                        'id' => $student->user->id,
                        'status' => $student->user->status,
                    ] : null,
                    'role' => $student->role ? [
                        'id' => $student->role->id,
                        'role_name' => $student->role->role_name,
                    ] : null,
                    'status' => $student->user ? $student->user->status : 'inactive',
                ],
                'message' => 'បានទាញយកព័ត៌មានសិស្សដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error fetching student details: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យសិស្ស'
            ], 500);
        }
    }
}
<?php
// app/Http/Controllers/Api/TeacherStudentController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Department;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class TeacherStudentController extends Controller
{
    /**
     * ទាញយកបញ្ជី ID របស់គ្រូបង្រៀន (ទាំង teachers.id និង users.id)
     */
    private function getTeacherIds()
    {
        $teacher = Auth::user() ? Auth::user()->teacher : null;
        return array_values(array_unique(array_filter([
            $teacher ? (int) $teacher->id : null,
            Auth::id() ? (int) Auth::id() : null,
        ])));
    }

    /**
     * ទាញយកបញ្ជីដេប៉ាតឺម៉ង់របស់គ្រូបង្រៀន និងដេប៉ាតឺម៉ង់នៃមុខវិជ្ជាដែលគ្រូបង្រៀន
     */
    private function getTeacherDepartmentIds()
    {
        $teacher = Auth::user() ? Auth::user()->teacher : null;
        $deptIds = [];
        if ($teacher && $teacher->department_id) {
            $deptIds[] = (int) $teacher->department_id;
        }

        $courseDeptIds = Course::whereIn('teacher_id', $this->getTeacherIds())
            ->whereNotNull('department_id')
            ->pluck('department_id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->toArray();

        return array_values(array_unique(array_merge($deptIds, $courseDeptIds)));
    }

    /**
     * បង្កើតតារាងផ្គូផ្គងរវាង course_id និងបញ្ជី students.id ដែលបានចុះឈ្មោះក្នុងមុខវិជ្ជានីមួយៗយ៉ាងត្រឹមត្រូវ ១០០%
     */
    private function buildCourseToStudentIdsMap(array $courseIds)
    {
        if (empty($courseIds)) {
            return [];
        }

        $allStudents = Student::all(['id', 'user_id', 'department_id']);
        $studentsById = $allStudents->keyBy('id');
        $studentsByUserId = $allStudents->whereNotNull('user_id')->keyBy('user_id');

        $enrollments = Enrollment::whereIn('course_id', $courseIds)
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', 'active')
                  ->orWhere('status', '');
            })
            ->get(['course_id', 'student_id']);

        if ($enrollments->isEmpty()) {
            $enrollments = Enrollment::whereIn('course_id', $courseIds)
                ->get(['course_id', 'student_id']);
        }

        // ពិនិត្យមើលថាតើតារាង enrollments រក្សាទុក student_id ជា students.id ដាច់ដោយឡែកឬអត់
        $onlyMatchesStudentPK = false;
        foreach ($enrollments as $enr) {
            $v = (int) $enr->student_id;
            if (isset($studentsById[$v]) && !isset($studentsByUserId[$v])) {
                $onlyMatchesStudentPK = true;
                break;
            }
        }

        $courseMap = [];
        foreach ($courseIds as $cid) {
            $courseMap[(int) $cid] = [];
        }

        foreach ($enrollments as $enr) {
            $cid = (int) $enr->course_id;
            $val = (int) $enr->student_id;

            $resolvedStudentId = null;

            // ✅ អាទិភាពទី១៖ ផ្គូផ្គងតាម users.id ជាមុន (ព្រោះ Course::students() ភ្ជាប់ជាមួយ users.id)
            if (!$onlyMatchesStudentPK && isset($studentsByUserId[$val])) {
                $resolvedStudentId = (int) $studentsByUserId[$val]->id;
            } elseif (isset($studentsById[$val])) {
                $resolvedStudentId = (int) $studentsById[$val]->id;
            } elseif (isset($studentsByUserId[$val])) {
                $resolvedStudentId = (int) $studentsByUserId[$val]->id;
            }

            if ($resolvedStudentId !== null) {
                $courseMap[$cid][] = $resolvedStudentId;
            }
        }

        foreach ($courseMap as $cid => $list) {
            $courseMap[$cid] = array_values(array_unique($list));
        }

        return $courseMap;
    }

    /**
     * Get all students in the teacher's department(s) + enrolled students
     * GET /teacher/students
     */
    public function index(?Request $request = null)
    {
        try {
            $teacherIds = $this->getTeacherIds();
            $teacherDeptIds = $this->getTeacherDepartmentIds();

            $teacherCourses = Course::whereIn('teacher_id', $teacherIds)
                ->get(['id', 'course_code', 'course_name', 'department_id']);

            $teacherCourseIds = $teacherCourses->pluck('id')
                ->map(function ($id) {
                    return (int) $id;
                })
                ->toArray();

            $coursesById = $teacherCourses->keyBy('id');
            $courseToStudentIdsMap = $this->buildCourseToStudentIdsMap($teacherCourseIds);

            $filterCourseId = $request ? $request->input('course_id') : null;

            // ✅ កំណត់បញ្ជី students.id ដែលត្រូវទាញយក (រួមបញ្ចូលទាំងសិស្សក្នុងដេប៉ាតឺម៉ង់របស់គ្រូទាំងអស់)
            if (!empty($filterCourseId)) {
                $targetCid = (int) $filterCourseId;
                $studentIds = $courseToStudentIdsMap[$targetCid] ?? [];
            } else {
                $enrolledAll = [];
                foreach ($courseToStudentIdsMap as $ids) {
                    $enrolledAll = array_merge($enrolledAll, $ids);
                }

                $deptStudentIds = [];
                if (!empty($teacherDeptIds)) {
                    $deptStudentIds = Student::whereIn('department_id', $teacherDeptIds)
                        ->pluck('id')
                        ->map(function ($id) {
                            return (int) $id;
                        })
                        ->toArray();
                }

                $studentIds = array_values(array_unique(array_merge($enrolledAll, $deptStudentIds)));
            }

            if (empty($studentIds)) {
                return response()->json([
                    'data' => [],
                    'total' => 0,
                    'course_students_map' => $courseToStudentIdsMap,
                    'message' => 'មិនទាន់មានសិស្សក្នុងដេប៉ាតឺម៉ង់ ឬមុខវិជ្ជានេះនៅឡើយទេ'
                ]);
            }

            $query = Student::with([
                'department:id,department_name',
                'user:id,status,email',
                'role:id,role_name'
            ])
            ->whereIn('id', $studentIds);

            // Server-side search filter
            $search = $request ? ($request->input('search') ?: $request->input('q')) : null;
            if ($search) {
                $query->where(function ($q) use ($search) {
                    $q->where('first_name', 'like', "%{$search}%")
                      ->orWhere('last_name', 'like', "%{$search}%")
                      ->orWhere('email', 'like', "%{$search}%")
                      ->orWhere('student_code', 'like', "%{$search}%")
                      ->orWhere('batch_year', 'like', "%{$search}%");
                });
            }

            $query->orderBy('id', 'asc');

            // Pagination support
            $perPage = $request ? $request->input('per_page') : null;
            $page = $request ? $request->input('page') : null;

            if ($perPage || $page) {
                $paginated = $query->paginate((int) ($perPage ?: 15));
                $students = collect($paginated->items());
                $total = $paginated->total();
            } else {
                $students = $query->get();
                $total = $students->count();
            }

            // បង្កើតបញ្ជីមុខវិជ្ជារបស់គ្រូដែលសិស្សម្នាក់ៗបានចុះឈ្មោះ
            $studentEnrolledCourses = [];
            foreach ($courseToStudentIdsMap as $cid => $sIds) {
                foreach ($sIds as $sid) {
                    $studentEnrolledCourses[(int) $sid][] = (int) $cid;
                }
            }

            $studentsWithDept = $students->map(function ($student) use ($studentEnrolledCourses, $coursesById) {
                $enrolledCourseIds = array_values(array_unique(
                    $studentEnrolledCourses[(int) $student->id] ?? []
                ));

                $enrolledCoursesList = [];
                foreach ($enrolledCourseIds as $cid) {
                    if (isset($coursesById[$cid])) {
                        $cObj = $coursesById[$cid];
                        $enrolledCoursesList[] = [
                            'id' => $cObj->id,
                            'course_code' => $cObj->course_code,
                            'course_name' => $cObj->course_name,
                        ];
                    }
                }

                $isEnrolledWithTeacher = count($enrolledCourseIds) > 0;

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
                    'enrolled_course_ids' => $enrolledCourseIds,
                    'course_ids' => $enrolledCourseIds,
                    'enrolled_courses_list' => $enrolledCoursesList,
                    'is_enrolled_with_teacher' => $isEnrolledWithTeacher,
                    'enrollment_status' => $isEnrolledWithTeacher ? 'enrolled' : 'not_enrolled',
                    'department' => $student->department ? [
                        'id' => $student->department->id,
                        'name' => $student->department->department_name,
                        'department_name' => $student->department->department_name,
                    ] : null,
                    'user' => $student->user ? [
                        'id' => $student->user->id,
                        'status' => $student->user->status,
                        'email' => $student->user->email,
                    ] : null,
                    'status' => $student->user ? $student->user->status : 'active',
                ];
            });

            $response = [
                'data' => $studentsWithDept,
                'total' => $total,
                'course_students_map' => $courseToStudentIdsMap,
                'message' => 'បានទាញយកបញ្ជីសិស្សដោយជោគជ័យ'
            ];

            if (isset($paginated)) {
                $response['meta'] = [
                    'current_page' => $paginated->currentPage(),
                    'last_page' => $paginated->lastPage(),
                    'per_page' => $paginated->perPage(),
                    'total' => $paginated->total(),
                ];
            }

            return response()->json($response);

        } catch (\Exception $e) {
            \Log::error('Error fetching teacher students: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យសិស្ស: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get student count for teacher dashboard
     * GET /teacher/students/count
     */
    public function getCount()
    {
        try {
            $teacherIds = $this->getTeacherIds();
            $teacherDeptIds = $this->getTeacherDepartmentIds();

            $courses = Course::whereIn('teacher_id', $teacherIds)->get(['id', 'course_code', 'course_name']);
            $courseIds = $courses->pluck('id')->map(function ($id) {
                return (int) $id;
            })->toArray();

            $courseMap = $this->buildCourseToStudentIdsMap($courseIds);
            $allEnrolled = [];
            foreach ($courseMap as $ids) {
                $allEnrolled = array_merge($allEnrolled, $ids);
            }

            $deptStudentIds = !empty($teacherDeptIds)
                ? Student::whereIn('department_id', $teacherDeptIds)->pluck('id')->map(fn($id) => (int) $id)->toArray()
                : [];

            $totalStudents = count(array_unique(array_merge($allEnrolled, $deptStudentIds)));

            $courseStats = [];
            foreach ($courses as $course) {
                $courseStats[] = [
                    'course_id' => $course->id,
                    'course_code' => $course->course_code,
                    'course_name' => $course->course_name,
                    'student_count' => count($courseMap[(int) $course->id] ?? [])
                ];
            }

            return response()->json([
                'total_students' => $totalStudents,
                'enrolled_students_count' => count(array_unique($allEnrolled)),
                'course_stats' => $courseStats,
                'message' => 'បានទាញយកចំនួនសិស្សដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error fetching student count: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកចំនួនសិស្ស: ' . $e->getMessage()
            ], 500);
        }
    }

    public function search(Request $request)
    {
        return $this->index($request);
    }

    public function show($studentId)
    {
        try {
            $student = Student::with(['department', 'user', 'role'])
                ->where('id', $studentId)
                ->orWhere('user_id', $studentId)
                ->firstOrFail();

            return response()->json([
                'data' => [
                    'id' => $student->id,
                    'user_id' => $student->user_id,
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
                    ] : null,
                    'status' => $student->user ? $student->user->status : 'active',
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
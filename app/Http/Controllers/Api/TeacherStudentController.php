<?php
// app/Http/Controllers/Api/TeacherStudentController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Department;
use App\Models\Enrollment;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class TeacherStudentController extends Controller
{
    /**
     * ✅ រក្សាទុកកំណត់ត្រាគ្រូក្នុង Request Memory ដើម្បីកុំឱ្យរត់ Query ស្ទួនៗ
     */
    private ?Teacher $cachedTeacher = null;
    private bool $teacherResolved = false;

    /**
     * ទាញយកកំណត់ត្រាគ្រូបង្រៀនពីតារាង teachers ដោយផ្អែកលើ user_id ឬ email (តែ ១ ដងគត់)
     */
    private function resolveTeacherRecord(): ?Teacher
    {
        $user = Auth::user();
        if (!$user) {
            return null;
        }

        if ($this->teacherResolved) {
            return $this->cachedTeacher;
        }

        if ($user->relationLoaded('teacher') && $user->teacher) {
            $this->cachedTeacher = $user->teacher;
            $this->teacherResolved = true;
            return $this->cachedTeacher;
        }

        $teacher = Teacher::select('id', 'user_id', 'department_id', 'first_name', 'last_name', 'email')
            ->where('user_id', $user->id)
            ->first();

        if (!$teacher && !empty($user->email)) {
            $teacher = Teacher::select('id', 'user_id', 'department_id', 'first_name', 'last_name', 'email')
                ->where('email', $user->email)
                ->first();
        }

        $this->cachedTeacher = $teacher;
        $this->teacherResolved = true;

        return $this->cachedTeacher;
    }

    /**
     * ទាញយកបញ្ជី ID របស់គ្រូបង្រៀន (ទាំង teachers.id និង users.id)
     */
    private function getTeacherIds(): array
    {
        $teacher = $this->resolveTeacherRecord();

        return array_values(array_unique(array_filter([
            $teacher ? (int) $teacher->id : null,
            Auth::id() ? (int) Auth::id() : null,
        ])));
    }

    /**
     * បង្កើតតារាងផ្គូផ្គងរវាង course_id និងបញ្ជី students.id ដែលបានចុះឈ្មោះក្នុងមុខវិជ្ជានីមួយៗយ៉ាងលឿនបំផុត
     */
    private function buildCourseToStudentIdsMap(array $courseIds): array
    {
        if (empty($courseIds)) {
            return [];
        }

        $courseMap = [];
        foreach ($courseIds as $cid) {
            $courseMap[(int) $cid] = [];
        }

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

        if ($enrollments->isEmpty()) {
            return $courseMap;
        }

        $rawEnrolledIds = $enrollments->pluck('student_id')
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        // ✅ ទាញតែសិស្សណាដែលពាក់ព័ន្ធនឹងការចុះឈ្មោះក្នុងមុខវិជ្ជាទាំងនេះប៉ុណ្ណោះ (មិនប្រើ Student::all() ទាញសិស្សទូទាំងសាលាទេ)
        $matchedStudents = Student::select('id', 'user_id', 'department_id')
            ->whereIn('id', $rawEnrolledIds)
            ->orWhereIn('user_id', $rawEnrolledIds)
            ->get();

        $studentsById = $matchedStudents->keyBy('id');
        $studentsByUserId = $matchedStudents->whereNotNull('user_id')->keyBy('user_id');

        $onlyMatchesStudentPK = false;
        foreach ($enrollments as $enr) {
            $v = (int) $enr->student_id;
            if (isset($studentsById[$v]) && !isset($studentsByUserId[$v])) {
                $onlyMatchesStudentPK = true;
                break;
            }
        }

        foreach ($enrollments as $enr) {
            $cid = (int) $enr->course_id;
            $val = (int) $enr->student_id;

            $resolvedStudentId = null;

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
            $teacher = $this->resolveTeacherRecord();
            $teacherIds = $this->getTeacherIds();

            // ✅ ទាញមុខវិជ្ជារបស់គ្រូតែ ១ ដងគត់ រួចស្រង់យកទាំង courseIds និង departmentIds
            $teacherCourses = Course::whereIn('teacher_id', $teacherIds)
                ->get(['id', 'course_code', 'course_name', 'department_id']);

            $teacherCourseIds = $teacherCourses->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->toArray();

            $deptIds = [];
            if ($teacher && $teacher->department_id) {
                $deptIds[] = (int) $teacher->department_id;
            }
            $courseDeptIds = $teacherCourses->pluck('department_id')
                ->filter()
                ->map(fn ($id) => (int) $id)
                ->toArray();
            $teacherDeptIds = array_values(array_unique(array_merge($deptIds, $courseDeptIds)));

            $coursesById = $teacherCourses->keyBy('id');
            $courseToStudentIdsMap = $this->buildCourseToStudentIdsMap($teacherCourseIds);

            $filterCourseId = $request ? $request->input('course_id') : null;

            if (!empty($filterCourseId) && $filterCourseId !== 'all') {
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
                        ->map(fn ($id) => (int) $id)
                        ->toArray();
                }

                $studentIds = array_values(array_unique(array_merge($enrolledAll, $deptStudentIds)));
            }

            if (empty($studentIds)) {
                return response()->json([
                    'data' => [],
                    'total' => 0,
                    'course_students_map' => $courseToStudentIdsMap,
                    'message' => 'មិនទាន់មានសិស្សក្នុងដេប៉ាតឺម៉ង់ ឬមុខវិជ្ជានេះនៅឡើយទេ',
                ]);
            }

            $query = Student::with([
                'department:id,department_name',
                'user:id,status,email,profile_image',
                'role:id,role_name',
            ])
                ->whereIn('id', $studentIds);

            if ($request && $request->filled('study_shift') && $request->study_shift !== 'all') {
                $query->where('study_shift', $request->study_shift);
            }

            // Server-side search filter
            $search = $request ? trim((string) ($request->input('search') ?: $request->input('q') ?: '')) : '';
            if ($search !== '') {
                $query->where(function ($q) use ($search) {
                    $q->where('first_name', 'like', "%{$search}%")
                      ->orWhere('last_name', 'like', "%{$search}%")
                      ->orWhere(DB::raw("CONCAT(first_name, ' ', last_name)"), 'like', "%{$search}%")
                      ->orWhere('email', 'like', "%{$search}%")
                      ->orWhere('phone', 'like', "%{$search}%")
                      ->orWhere('student_code', 'like', "%{$search}%")
                      ->orWhere('batch_year', 'like', "%{$search}%");
                });
            }

            $query->orderBy('id', 'asc');

            // Pagination support
            $perPage = $request ? $request->input('per_page') : null;
            $page = $request ? $request->input('page') : null;

            if ($perPage || $page) {
                $safePerPage = max(1, min(500, (int) ($perPage ?: 15)));
                $paginated = $query->paginate($safePerPage);
                $students = collect($paginated->items());
                $total = $paginated->total();
            } else {
                $students = $query->get();
                $total = $students->count();
            }

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
                $resolvedImage = $student->profile_image ?: ($student->user?->profile_image ?? null);

                return [
                    'id' => $student->id,
                    'user_id' => $student->user_id,
                    'role_id' => $student->role_id,
                    'student_code' => $student->student_code,
                    'first_name' => $student->first_name,
                    'last_name' => $student->last_name,
                    'gender' => $student->gender,
                    'date_of_birth' => $student->date_of_birth,
                    'email' => $student->email ?: ($student->user?->email ?? null),
                    'phone' => $student->phone,
                    'batch_year' => $student->batch_year,
                    'degree_level' => $student->degree_level,
                    'study_shift' => $student->study_shift ?? 'Monday-Friday',
                    'address' => $student->address,
                    'profile_image' => $resolvedImage,
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
                    // ✅ មិនដាក់រូបភាព Base64 ស្ទួននៅក្នុង user ម្ដងទៀតទេ (ព្រោះមាននៅលើ profile_image ខាងលើរួចហើយ) កាត់បន្ថយទំហំទិន្នន័យបាន ៥០% ភ្លាមៗ!
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
                'message' => 'បានទាញយកបញ្ជីសិស្សដោយជោគជ័យ',
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
            Log::error('Error fetching teacher students: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យសិស្ស: ' . $e->getMessage(),
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
            $teacher = $this->resolveTeacherRecord();
            $teacherIds = $this->getTeacherIds();

            $courses = Course::whereIn('teacher_id', $teacherIds)
                ->get(['id', 'course_code', 'course_name', 'department_id']);

            $courseIds = $courses->pluck('id')->map(fn ($id) => (int) $id)->toArray();

            $deptIds = [];
            if ($teacher && $teacher->department_id) {
                $deptIds[] = (int) $teacher->department_id;
            }
            $courseDeptIds = $courses->pluck('department_id')->filter()->map(fn ($id) => (int) $id)->toArray();
            $teacherDeptIds = array_values(array_unique(array_merge($deptIds, $courseDeptIds)));

            $courseMap = $this->buildCourseToStudentIdsMap($courseIds);
            $allEnrolled = [];
            foreach ($courseMap as $ids) {
                $allEnrolled = array_merge($allEnrolled, $ids);
            }

            $deptStudentIds = !empty($teacherDeptIds)
                ? Student::whereIn('department_id', $teacherDeptIds)->pluck('id')->map(fn ($id) => (int) $id)->toArray()
                : [];

            $totalStudents = count(array_unique(array_merge($allEnrolled, $deptStudentIds)));

            $courseStats = [];
            foreach ($courses as $course) {
                $courseStats[] = [
                    'course_id' => $course->id,
                    'course_code' => $course->course_code,
                    'course_name' => $course->course_name,
                    'student_count' => count($courseMap[(int) $course->id] ?? []),
                ];
            }

            return response()->json([
                'total_students' => $totalStudents,
                'enrolled_students_count' => count(array_unique($allEnrolled)),
                'course_stats' => $courseStats,
                'message' => 'បានទាញយកចំនួនសិស្សដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching student count: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកចំនួនសិស្ស: ' . $e->getMessage(),
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
            $student = Student::with([
                'department:id,department_name',
                'user:id,status,email,profile_image',
                'role:id,role_name',
            ])
                ->where(function ($q) use ($studentId) {
                    $q->where('id', $studentId)
                      ->orWhere('user_id', $studentId);
                })
                ->firstOrFail();

            $resolvedImage = $student->profile_image ?: ($student->user?->profile_image ?? null);

            return response()->json([
                'data' => [
                    'id' => $student->id,
                    'user_id' => $student->user_id,
                    'student_code' => $student->student_code,
                    'first_name' => $student->first_name,
                    'last_name' => $student->last_name,
                    'gender' => $student->gender,
                    'date_of_birth' => $student->date_of_birth,
                    'email' => $student->email ?: ($student->user?->email ?? null),
                    'phone' => $student->phone,
                    'batch_year' => $student->batch_year,
                    'degree_level' => $student->degree_level,
                    'study_shift' => $student->study_shift ?? 'Monday-Friday',
                    'address' => $student->address,
                    'profile_image' => $resolvedImage,
                    'department_id' => $student->department_id,
                    'department' => $student->department ? [
                        'id' => $student->department->id,
                        'name' => $student->department->department_name,
                        'department_name' => $student->department->department_name,
                    ] : null,
                    'status' => $student->user ? $student->user->status : 'active',
                ],
                'message' => 'បានទាញយកព័ត៌មានសិស្សដោយជោគជ័យ',
            ]);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'រកមិនឃើញព័ត៌មានសិស្សនេះទេ',
            ], 404);
        } catch (\Exception $e) {
            Log::error('Error fetching student details: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យសិស្ស',
            ], 500);
        }
    }
}
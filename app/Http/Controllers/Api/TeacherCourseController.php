<?php
// app/Http/Controllers/Api/TeacherCourseController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Department;
use App\Models\Teacher;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

class TeacherCourseController extends Controller
{
    /**
     * ✅ រក្សាទុកកំណត់ត្រាគ្រូក្នុង Request Memory ដើម្បីកុំឱ្យរត់ Query ស្ទួនៗ
     */
    private ?Teacher $cachedTeacher = null;
    private bool $teacherResolved = false;

    /**
     * ទាញយកកំណត់ត្រាគ្រូបង្រៀនពីតារាង teachers ដោយផ្អែកលើ user_id ឬ email (តែ ១ ដងគត់ក្នុង ១ Request)
     */
    private function resolveTeacherRecord($user = null): ?Teacher
    {
        $user = $user ?: Auth::user();
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
     * ទាញយកបញ្ជី ID របស់គ្រូបង្រៀន (គាំទ្រទាំង teachers.id និង users.id)
     */
    private function getTeacherIds($user = null): array
    {
        $user = $user ?: Auth::user();
        $teacher = $this->resolveTeacherRecord($user);

        return array_values(array_unique(array_filter([
            $teacher ? (int) $teacher->id : null,
            $user ? (int) $user->id : null,
        ])));
    }

    /**
     * រៀបចំទម្រង់ទិន្នន័យមុខវិជ្ជាឱ្យមានស្ថិតិគ្រប់គ្រាន់សម្រាប់ Frontend
     */
    private function formatCourseItem(Course $course): array
    {
        $studentsCount = (int) ($course->students_count ?? $course->enrollments_count ?? 0);

        return [
            'id' => $course->id,
            'course_code' => $course->course_code,
            'course_name' => $course->course_name,
            'credit' => (int) ($course->credit ?? 3),
            'description' => $course->description,
            'year' => $course->year ?? null,
            'semester' => $course->semester ?? null,
            'department_id' => $course->department_id,
            'department' => $course->department ? [
                'id' => $course->department->id,
                'name' => $course->department->department_name,
                'department_name' => $course->department->department_name,
            ] : null,
            'teacher_id' => $course->teacher_id,
            'students_count' => $studentsCount,
            'enrollments_count' => $studentsCount,
            'lessons_count' => (int) ($course->lessons_count ?? 0),
            'assignments_count' => (int) ($course->assignments_count ?? 0),
            'quizzes_count' => (int) ($course->quizzes_count ?? 0),
            'created_at' => $course->created_at,
            'updated_at' => $course->updated_at,
        ];
    }

    /**
     * Get all courses taught by the logged-in teacher
     * GET /teacher/courses
     */
    public function index(Request $request)
    {
        try {
            $user = Auth::user();
            $teacher = $this->resolveTeacherRecord($user);
            $teacherIds = $this->getTeacherIds($user);

            if (empty($teacherIds)) {
                return response()->json([
                    'message' => 'អ្នកមិនមែនជាគ្រូបង្រៀនទេ',
                ], 403);
            }

            $query = Course::with(['department:id,department_name,department_code'])
                ->withCount([
                    'enrollments as students_count' => function ($q) {
                        $q->where(function ($sub) {
                            $sub->whereNull('status')
                                ->orWhere('status', 'active')
                                ->orWhere('status', '');
                        });
                    },
                    'lessons',
                    'assignments',
                    'quizzes',
                ])
                ->whereIn('teacher_id', $teacherIds);

            if ($request->filled('department_id')) {
                $query->where('department_id', $request->department_id);
            }

            if ($request->filled('search')) {
                $keyword = trim((string) $request->search);
                $query->where(function ($q) use ($keyword) {
                    $q->where('course_name', 'LIKE', "%{$keyword}%")
                      ->orWhere('course_code', 'LIKE', "%{$keyword}%")
                      ->orWhere('description', 'LIKE', "%{$keyword}%")
                      ->orWhereHas('department', function ($dq) use ($keyword) {
                          $dq->where('department_name', 'LIKE', "%{$keyword}%");
                      });
                });
            }

            $courses = $query->orderBy('course_name')->get();

            $teacherName = $teacher
                ? trim($teacher->first_name . ' ' . $teacher->last_name)
                : trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? ''));

            if ($courses->isEmpty()) {
                return response()->json([
                    'data' => [],
                    'total' => 0,
                    'teacher_name' => $teacherName,
                    'message' => 'អ្នកមិនទាន់មានមុខវិជ្ជាបង្រៀននៅឡើយទេ',
                ]);
            }

            $coursesData = $courses->map(fn ($course) => $this->formatCourseItem($course));

            return response()->json([
                'data' => $coursesData->values()->all(),
                'total' => $coursesData->count(),
                'teacher_name' => $teacherName,
                'message' => 'បានទាញយកបញ្ជីមុខវិជ្ជាដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching teacher courses: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមុខវិជ្ជា: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get course details by ID (only if teacher owns it)
     * GET /teacher/courses/{courseId}
     */
    public function show($courseId)
    {
        try {
            $teacherIds = $this->getTeacherIds();

            if (empty($teacherIds)) {
                return response()->json(['message' => 'អ្នកមិនមានសិទ្ធិទេ'], 403);
            }

            $course = Course::with(['department:id,department_name,department_code'])
                ->withCount([
                    'enrollments as students_count' => function ($q) {
                        $q->where(function ($sub) {
                            $sub->whereNull('status')
                                ->orWhere('status', 'active')
                                ->orWhere('status', '');
                        });
                    },
                    'lessons',
                    'assignments',
                    'quizzes',
                ])
                ->whereIn('teacher_id', $teacherIds)
                ->findOrFail($courseId);

            return response()->json([
                'data' => $this->formatCourseItem($course),
                'message' => 'បានទាញយកព័ត៌មានមុខវិជ្ជាដោយជោគជ័យ',
            ]);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'រកមិនឃើញមុខវិជ្ជានេះទេ ឬអ្នកមិនមានសិទ្ធិចូលមើល',
            ], 404);
        } catch (\Exception $e) {
            Log::error('Error fetching course details: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមុខវិជ្ជា',
            ], 500);
        }
    }

    /**
     * Get course statistics for teacher
     * GET /teacher/courses/stats
     */
    public function getStats()
    {
        try {
            $user = Auth::user();
            $teacher = $this->resolveTeacherRecord($user);
            $teacherIds = $this->getTeacherIds($user);

            if (empty($teacherIds)) {
                return response()->json([
                    'message' => 'អ្នកមិនមែនជាគ្រូបង្រៀនទេ',
                ], 403);
            }

            $courses = Course::select('id', 'credit', 'department_id', 'teacher_id')
                ->whereIn('teacher_id', $teacherIds)
                ->get();

            $totalCourses = $courses->count();
            $totalCredits = (int) $courses->sum('credit');
            $avgCredits = $totalCourses > 0 ? round($totalCredits / $totalCourses, 1) : 0;

            $departmentStats = Department::withCount(['courses' => function ($query) use ($teacherIds) {
                $query->whereIn('teacher_id', $teacherIds);
            }])
                ->having('courses_count', '>', 0)
                ->get()
                ->map(function ($department) {
                    return [
                        'department_id' => $department->id,
                        'department_name' => $department->department_name,
                        'course_count' => (int) $department->courses_count,
                    ];
                })
                ->values();

            $teacherName = $teacher
                ? trim($teacher->first_name . ' ' . $teacher->last_name)
                : trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? ''));

            return response()->json([
                'total_courses' => $totalCourses,
                'total_credits' => $totalCredits,
                'avg_credits' => $avgCredits,
                'department_stats' => $departmentStats,
                'teacher_name' => $teacherName,
                'message' => 'បានទាញយកស្ថិតិមុខវិជ្ជាដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching course stats: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកស្ថិតិ',
            ], 500);
        }
    }

    /**
     * Search courses by name or code (only teacher's courses)
     * GET /teacher/courses/search?q=keyword
     */
    public function search(Request $request)
    {
        try {
            $keyword = trim((string) ($request->query('q') ?? $request->query('search') ?? ''));
            $teacherIds = $this->getTeacherIds();

            if (empty($teacherIds)) {
                return response()->json(['message' => 'អ្នកមិនមានសិទ្ធិទេ'], 403);
            }

            if ($keyword === '') {
                return $this->index($request);
            }

            $courses = Course::with(['department:id,department_name,department_code'])
                ->withCount([
                    'enrollments as students_count' => function ($q) {
                        $q->where(function ($sub) {
                            $sub->whereNull('status')
                                ->orWhere('status', 'active')
                                ->orWhere('status', '');
                        });
                    },
                    'lessons',
                    'assignments',
                    'quizzes',
                ])
                ->whereIn('teacher_id', $teacherIds)
                ->where(function ($query) use ($keyword) {
                    $query->where('course_name', 'LIKE', "%{$keyword}%")
                          ->orWhere('course_code', 'LIKE', "%{$keyword}%")
                          ->orWhere('description', 'LIKE', "%{$keyword}%")
                          ->orWhereHas('department', function ($q) use ($keyword) {
                              $q->where('department_name', 'LIKE', "%{$keyword}%");
                          });
                })
                ->orderBy('course_name')
                ->get();

            $coursesData = $courses->map(fn ($course) => $this->formatCourseItem($course));

            return response()->json([
                'data' => $coursesData->values()->all(),
                'keyword' => $keyword,
                'total' => $coursesData->count(),
                'message' => 'បានស្វែងរកមុខវិជ្ជាដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Error searching courses: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការស្វែងរកមុខវិជ្ជា',
            ], 500);
        }
    }
}
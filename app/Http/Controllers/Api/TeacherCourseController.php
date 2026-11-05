<?php
// app/Http/Controllers/Api/TeacherCourseController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Department;
use App\Models\Teacher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TeacherCourseController extends Controller
{
    /**
     * ទាញយកបញ្ជី ID របស់គ្រូបង្រៀន (គាំទ្រទាំង teachers.id និង users.id)
     */
    private function getTeacherIds()
    {
        $user = Auth::user();
        $teacher = $user ? $user->teacher : null;

        return array_values(array_unique(array_filter([
            $teacher ? (int) $teacher->id : null,
            $user ? (int) $user->id : null,
        ])));
    }

    /**
     * Get all courses taught by the logged-in teacher
     * GET /teacher/courses
     */
    public function index()
    {
        try {
            $user = Auth::user();
            $teacher = $user ? $user->teacher : null;
            $teacherIds = $this->getTeacherIds();

            if (empty($teacherIds)) {
                return response()->json([
                    'message' => 'អ្នកមិនមែនជាគ្រូបង្រៀនទេ'
                ], 403);
            }

            $courses = Course::with(['department'])
                ->whereIn('teacher_id', $teacherIds)
                ->orderBy('course_name')
                ->get();

            $teacherName = $teacher
                ? trim($teacher->first_name . ' ' . $teacher->last_name)
                : trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? ''));

            if ($courses->isEmpty()) {
                return response()->json([
                    'data' => [],
                    'total' => 0,
                    'teacher_name' => $teacherName,
                    'message' => 'អ្នកមិនទាន់មានមុខវិជ្ជាបង្រៀននៅឡើយទេ'
                ]);
            }

            $coursesData = $courses->map(function ($course) {
                return [
                    'id' => $course->id,
                    'course_code' => $course->course_code,
                    'course_name' => $course->course_name,
                    'credit' => $course->credit,
                    'description' => $course->description,
                    'department_id' => $course->department_id,
                    'department' => $course->department ? [
                        'id' => $course->department->id,
                        'name' => $course->department->department_name,
                        'department_name' => $course->department->department_name,
                    ] : null,
                    'teacher_id' => $course->teacher_id,
                    'created_at' => $course->created_at,
                    'updated_at' => $course->updated_at,
                ];
            });

            return response()->json([
                'data' => $coursesData,
                'total' => $coursesData->count(),
                'teacher_name' => $teacherName,
                'message' => 'បានទាញយកបញ្ជីមុខវិជ្ជាដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error fetching teacher courses: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមុខវិជ្ជា: ' . $e->getMessage()
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

            $course = Course::with(['department'])
                ->whereIn('teacher_id', $teacherIds)
                ->findOrFail($courseId);

            return response()->json([
                'data' => [
                    'id' => $course->id,
                    'course_code' => $course->course_code,
                    'course_name' => $course->course_name,
                    'credit' => $course->credit,
                    'description' => $course->description,
                    'department_id' => $course->department_id,
                    'department' => $course->department ? [
                        'id' => $course->department->id,
                        'name' => $course->department->department_name,
                        'department_name' => $course->department->department_name,
                    ] : null,
                    'created_at' => $course->created_at,
                    'updated_at' => $course->updated_at,
                ],
                'message' => 'បានទាញយកព័ត៌មានមុខវិជ្ជាដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error fetching course details: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមុខវិជ្ជា'
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
            $teacher = $user ? $user->teacher : null;
            $teacherIds = $this->getTeacherIds();

            if (empty($teacherIds)) {
                return response()->json([
                    'message' => 'អ្នកមិនមែនជាគ្រូបង្រៀនទេ'
                ], 403);
            }

            $courses = Course::whereIn('teacher_id', $teacherIds)->get();

            $totalCourses = $courses->count();
            $totalCredits = $courses->sum('credit');
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
                        'course_count' => $department->courses_count,
                    ];
                });

            $teacherName = $teacher
                ? trim($teacher->first_name . ' ' . $teacher->last_name)
                : trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? ''));

            return response()->json([
                'total_courses' => $totalCourses,
                'total_credits' => $totalCredits,
                'avg_credits' => $avgCredits,
                'department_stats' => $departmentStats,
                'teacher_name' => $teacherName,
                'message' => 'បានទាញយកស្ថិតិមុខវិជ្ជាដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error fetching course stats: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកស្ថិតិ'
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
            $keyword = $request->query('q');
            $teacherIds = $this->getTeacherIds();

            if (empty($teacherIds)) {
                return response()->json(['message' => 'អ្នកមិនមានសិទ្ធិទេ'], 403);
            }

            if (empty($keyword)) {
                return $this->index();
            }

            $courses = Course::with(['department'])
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

            $coursesData = $courses->map(function ($course) {
                return [
                    'id' => $course->id,
                    'course_code' => $course->course_code,
                    'course_name' => $course->course_name,
                    'credit' => $course->credit,
                    'description' => $course->description,
                    'department_id' => $course->department_id,
                    'department' => $course->department ? [
                        'id' => $course->department->id,
                        'name' => $course->department->department_name,
                        'department_name' => $course->department->department_name,
                    ] : null,
                ];
            });

            return response()->json([
                'data' => $coursesData,
                'keyword' => $keyword,
                'total' => $coursesData->count(),
                'message' => 'បានស្វែងរកមុខវិជ្ជាដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error searching courses: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការស្វែងរកមុខវិជ្ជា'
            ], 500);
        }
    }
}
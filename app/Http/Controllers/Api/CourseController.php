<?php
// app/Http/Controllers/Api/CourseController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Department;
use App\Models\Teacher; // បន្ថែម Model Teacher
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\DB;

class CourseController extends Controller
{
    /**
     * Display a listing of all courses
     * GET /admin/courses
     */
    public function index()
    {
        try {
            $courses = Course::with(['department', 'teacher'])
                ->orderBy('course_name')
                ->get();

            return response()->json([
                'data' => $courses,
                'message' => 'បានទាញយកបញ្ជីមុខវិជ្ជាដោយជោគជ័យ'
            ]);
        } catch (\Exception $e) {
            \Log::error('Error fetching courses: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមុខវិជ្ជា'
            ], 500);
        }
    }

    /**
     * Store a newly created course
     * POST /admin/courses
     */
    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'course_code' => 'required|string|max:50|unique:courses,course_code',
                'course_name' => 'required|string|max:255',
                'credit' => 'required|integer|min:1|max:6',
                'description' => 'nullable|string',
                'department_id' => 'required|exists:departments,id',
                'teacher_id' => 'required|exists:teachers,id', // 🔴 កែមកប្រើ teachers
            ]);

            $course = Course::create($validated);

            return response()->json([
                'message' => 'បានបង្កើតមុខវិជ្ជាដោយជោគជ័យ',
                'data' => $course->load(['department', 'teacher'])
            ], 201);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            \Log::error('Course store error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការបង្កើតមុខវិជ្ជា: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Display the specified course
     * GET /admin/courses/{course}
     */
    public function show(Course $course)
    {
        try {
            return response()->json([
                'data' => $course->load(['department', 'teacher']),
                'message' => 'បានទាញយកទិន្នន័យមុខវិជ្ជាដោយជោគជ័យ'
            ]);
        } catch (\Exception $e) {
            \Log::error('Error fetching course: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមុខវិជ្ជា'
            ], 500);
        }
    }

    /**
     * Update the specified course
     * PUT /admin/courses/{course}
     */
    public function update(Request $request, Course $course)
    {
        try {
            $validated = $request->validate([
                'course_code' => [
                    'required',
                    'string',
                    'max:50',
                    Rule::unique('courses', 'course_code')->ignore($course->id),
                ],
                'course_name' => 'required|string|max:255',
                'credit' => 'required|integer|min:1|max:6',
                'description' => 'nullable|string',
                'department_id' => 'required|exists:departments,id',
                'teacher_id' => 'required|exists:teachers,id', // 🔴 កែមកប្រើ teachers
            ]);

            $course->update($validated);

            return response()->json([
                'message' => 'បានកែប្រែមុខវិជ្ជាដោយជោគជ័យ',
                'data' => $course->fresh(['department', 'teacher'])
            ]);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            \Log::error('Course update error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការកែប្រែមុខវិជ្ជា: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Remove the specified course
     * DELETE /admin/courses/{course}
     */
    public function destroy(Course $course)
    {
        try {
            if ($course->enrollments()->exists()) {
                return response()->json([
                    'message' => 'មិនអាចលុបមុខវិជ្ជាដែលមានសិស្សចុះឈ្មោះរៀនបានទេ'
                ], 400);
            }

            $courseName = $course->course_name;
            $course->delete();

            return response()->json([
                'message' => "បានលុបមុខវិជ្ជា '{$courseName}' ដោយជោគជ័យ"
            ]);

        } catch (\Exception $e) {
            \Log::error('Course delete error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបមុខវិជ្ជា'
            ], 500);
        }
    }

    /**
     * Get courses by department
     * GET /admin/courses/department/{departmentId}
     */
    public function getCoursesByDepartment($departmentId)
    {
        try {
            $department = Department::findOrFail($departmentId);
            
            $courses = Course::with(['teacher'])
                ->where('department_id', $departmentId)
                ->orderBy('course_name')
                ->get();

            return response()->json([
                'data' => $courses,
                'department' => $department->department_name,
                'message' => 'បានទាញយកមុខវិជ្ជាតាមជំនាញដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error fetching courses by department: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យ'
            ], 500);
        }
    }

    /**
     * Get courses by teacher
     * GET /admin/courses/teacher/{teacherId}
     */
    public function getCoursesByTeacher($teacherId)
    {
        try {
            // 🔴 កែមកទាញយកពីតារាង teachers ផ្ទាល់
            $teacher = Teacher::findOrFail($teacherId);

            $courses = Course::with(['department'])
                ->where('teacher_id', $teacherId)
                ->orderBy('course_name')
                ->get();

            return response()->json([
                'data' => $courses,
                'teacher' => $teacher->first_name . ' ' . $teacher->last_name,
                'message' => 'បានទាញយកមុខវិជ្ជាតាមគ្រូបង្រៀនដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error fetching courses by teacher: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យ'
            ], 500);
        }
    }

    /**
     * Get course statistics
     * GET /admin/courses/stats
     */
    public function getStats()
    {
        try {
            $stats = [
                'total_courses' => Course::count(),
                'total_departments' => Department::count(),
                'courses_by_department' => Department::withCount('courses')
                    ->orderBy('courses_count', 'desc')
                    ->get()
                    ->map(function ($dept) {
                        return [
                            'department_name' => $dept->department_name,
                            'total_courses' => $dept->courses_count,
                        ];
                    }),
                'total_credits' => Course::sum('credit'),
                'avg_credits' => round(Course::avg('credit'), 1),
            ];

            return response()->json([
                'data' => $stats,
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
     * Search courses
     * GET /admin/courses/search?q=keyword
     */
    public function search(Request $request)
    {
        try {
            $keyword = $request->query('q');
            
            if (empty($keyword)) {
                return $this->index();
            }

            $courses = Course::with(['department', 'teacher'])
                ->where('course_name', 'LIKE', "%{$keyword}%")
                ->orWhere('course_code', 'LIKE', "%{$keyword}%")
                ->orWhere('description', 'LIKE', "%{$keyword}%")
                ->orWhereHas('department', function ($query) use ($keyword) {
                    $query->where('department_name', 'LIKE', "%{$keyword}%");
                })
                ->orWhereHas('teacher', function ($query) use ($keyword) {
                    // ដំណើរការធម្មតាព្រោះតារាង teachers មាន first_name និង last_name
                    $query->where('first_name', 'LIKE', "%{$keyword}%")
                          ->orWhere('last_name', 'LIKE', "%{$keyword}%");
                })
                ->orderBy('course_name')
                ->get();

            return response()->json([
                'data' => $courses,
                'keyword' => $keyword,
                'total' => $courses->count(),
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
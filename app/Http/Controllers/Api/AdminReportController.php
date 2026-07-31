<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\Course;
use App\Models\Department;
use App\Models\Enrollment;
use App\Models\Attendance;
use App\Models\Grade;
use App\Models\Lesson;
use App\Models\Assignment;
use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminReportController extends Controller
{
    /**
     * Get system overview report stats & distributions.
     */
    public function getOverviewReport(Request $request)
    {
        $totalStudents = Student::count();
        if ($totalStudents === 0) {
            $studentRole = Role::where('role_name', 'Student')->first();
            $totalStudents = $studentRole ? User::where('role_id', $studentRole->id)->count() : User::count();
        }

        $totalTeachers = Teacher::count();
        $totalCourses = Course::count();
        $totalDepartments = Department::count();
        $totalEnrollments = Enrollment::count();
        $totalLessons = Lesson::count();
        $totalAssignments = Assignment::count();

        // Overall Attendance Rate
        $totalAttendances = Attendance::count();
        $presentAttendances = Attendance::whereIn('status', ['present', 'Present'])->count();
        $overallAttendanceRate = $totalAttendances > 0 
            ? round(($presentAttendances / $totalAttendances) * 100, 1) 
            : 100;

        // Department breakdown
        $departments = Department::withCount(['courses', 'students', 'teachers'])->get();
        $departmentDistribution = $departments->map(function ($dept) {
            return [
                'id' => $dept->id,
                'department_name' => $dept->department_name,
                'department_code' => $dept->department_code,
                'students_count' => $dept->students_count ?? 0,
                'teachers_count' => $dept->teachers_count ?? 0,
                'courses_count' => $dept->courses_count ?? 0,
            ];
        });

        // Recent 6 Months Enrollment Trend
        $enrollmentTrend = Enrollment::select(
            DB::raw("DATE_FORMAT(created_at, '%Y-%m') as month"),
            DB::raw('count(*) as count')
        )
        ->where('created_at', '>=', now()->subMonths(6))
        ->groupBy('month')
        ->orderBy('month', 'asc')
        ->get();

        return response()->json([
            'stats' => [
                'total_students' => $totalStudents,
                'total_teachers' => $totalTeachers,
                'total_courses' => $totalCourses,
                'total_departments' => $totalDepartments,
                'total_enrollments' => $totalEnrollments,
                'total_lessons' => $totalLessons,
                'total_assignments' => $totalAssignments,
                'overall_attendance_rate' => $overallAttendanceRate,
            ],
            'department_distribution' => $departmentDistribution,
            'enrollment_trend' => $enrollmentTrend,
        ]);
    }

    /**
     * Get student enrollment report with filters.
     */
    public function getEnrollmentReport(Request $request)
    {
        $query = Enrollment::with(['student', 'course.department']);

        if ($request->filled('department_id')) {
            $query->whereHas('course', function ($q) use ($request) {
                $q->where('department_id', $request->department_id);
            });
        }

        if ($request->filled('course_id')) {
            $query->where('course_id', $request->course_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->whereHas('student', function ($sq) use ($search) {
                    $sq->where('first_name', 'like', "%{$search}%")
                       ->orWhere('last_name', 'like', "%{$search}%")
                       ->orWhere('email', 'like', "%{$search}%");
                })->orWhereHas('course', function ($cq) use ($search) {
                    $cq->where('course_name', 'like', "%{$search}%")
                       ->orWhere('course_code', 'like', "%{$search}%");
                });
            });
        }

        $allMatching = $query->get();

        $activeCount = $allMatching->where('status', 'active')->count();
        $completedCount = $allMatching->where('status', 'completed')->count();
        $droppedCount = $allMatching->whereIn('status', ['dropped', 'inactive', 'cancelled'])->count();

        $paginated = $query->orderBy('created_at', 'desc')->paginate($request->per_page ?? 15);

        $items = collect($paginated->items())->map(function ($enr) {
            $studentUser = $enr->student;
            $studentProfile = Student::where('user_id', $enr->student_id)->first();

            return [
                'id' => $enr->id,
                'student_id' => $enr->student_id,
                'student_name' => $studentUser ? ($studentUser->first_name . ' ' . $studentUser->last_name) : 'N/A',
                'student_code' => $studentProfile->student_code ?? ('STD-' . $enr->student_id),
                'email' => $studentUser->email ?? 'N/A',
                'course_name' => $enr->course->course_name ?? 'N/A',
                'course_code' => $enr->course->course_code ?? 'N/A',
                'department_name' => $enr->course->department->department_name ?? 'N/A',
                'status' => $enr->status ?? 'active',
                'enrolled_date' => $enr->enrolled_date ? $enr->enrolled_date->format('Y-m-d') : ($enr->created_at ? $enr->created_at->format('Y-m-d') : 'N/A'),
            ];
        });

        return response()->json([
            'summary' => [
                'total' => $allMatching->count(),
                'active' => $activeCount,
                'completed' => $completedCount,
                'dropped' => $droppedCount,
            ],
            'data' => $items,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ]
        ]);
    }

    /**
     * Get attendance breakdown report.
     */
    public function getAttendanceReport(Request $request)
    {
        $query = Attendance::with(['student', 'course.department']);

        if ($request->filled('department_id')) {
            $query->whereHas('course', function ($q) use ($request) {
                $q->where('department_id', $request->department_id);
            });
        }

        if ($request->filled('course_id')) {
            $query->where('course_id', $request->course_id);
        }

        if ($request->filled('date_from')) {
            $query->whereDate('attendance_date', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('attendance_date', '<=', $request->date_to);
        }

        $allRecords = $query->get();
        $totalRecords = $allRecords->count();

        $presentCount = $allRecords->whereIn('status', ['present', 'Present'])->count();
        $absentCount = $allRecords->whereIn('status', ['absent', 'Absent'])->count();
        $lateCount = $allRecords->whereIn('status', ['late', 'Late'])->count();
        $permissionCount = $allRecords->whereIn('status', ['permission', 'Permission'])->count();

        $rate = $totalRecords > 0 ? round(($presentCount / $totalRecords) * 100, 1) : 100;

        // Course Breakdown
        $courseBreakdown = Course::with('department')
            ->when($request->filled('department_id'), function ($q) use ($request) {
                $q->where('department_id', $request->department_id);
            })
            ->when($request->filled('course_id'), function ($q) use ($request) {
                $q->where('id', $request->course_id);
            })
            ->get()
            ->map(function ($course) use ($request) {
                $attQ = Attendance::where('course_id', $course->id);

                if ($request->filled('date_from')) {
                    $attQ->whereDate('attendance_date', '>=', $request->date_from);
                }
                if ($request->filled('date_to')) {
                    $attQ->whereDate('attendance_date', '<=', $request->date_to);
                }

                $cTotal = $attQ->count();
                $cPresent = (clone $attQ)->whereIn('status', ['present', 'Present'])->count();
                $cAbsent = (clone $attQ)->whereIn('status', ['absent', 'Absent'])->count();
                $cLate = (clone $attQ)->whereIn('status', ['late', 'Late'])->count();
                $cPermission = (clone $attQ)->whereIn('status', ['permission', 'Permission'])->count();
                $cRate = $cTotal > 0 ? round(($cPresent / $cTotal) * 100, 1) : 100;

                return [
                    'course_id' => $course->id,
                    'course_name' => $course->course_name,
                    'course_code' => $course->course_code,
                    'department_name' => $course->department->department_name ?? 'N/A',
                    'total' => $cTotal,
                    'present' => $cPresent,
                    'absent' => $cAbsent,
                    'late' => $cLate,
                    'permission' => $cPermission,
                    'rate' => $cRate,
                ];
            });

        return response()->json([
            'summary' => [
                'total_records' => $totalRecords,
                'present' => $presentCount,
                'absent' => $absentCount,
                'late' => $lateCount,
                'permission' => $permissionCount,
                'rate' => $rate,
            ],
            'course_breakdown' => $courseBreakdown,
        ]);
    }

    /**
     * Get academic performance & grades report.
     */
    public function getAcademicReport(Request $request)
    {
        $query = Grade::with(['student', 'course.department']);

        if ($request->filled('department_id')) {
            $query->whereHas('course', function ($q) use ($request) {
                $q->where('department_id', $request->department_id);
            });
        }

        if ($request->filled('course_id')) {
            $query->where('course_id', $request->course_id);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->whereHas('student', function ($sq) use ($search) {
                    $sq->where('first_name', 'like', "%{$search}%")
                       ->orWhere('last_name', 'like', "%{$search}%");
                })->orWhereHas('course', function ($cq) use ($search) {
                    $cq->where('course_name', 'like', "%{$search}%");
                });
            });
        }

        $allGrades = $query->get();

        $gradeCounts = [
            'A' => $allGrades->where('grade_letter', 'A')->count(),
            'B' => $allGrades->where('grade_letter', 'B')->count(),
            'C' => $allGrades->where('grade_letter', 'C')->count(),
            'D' => $allGrades->where('grade_letter', 'D')->count(),
            'F' => $allGrades->where('grade_letter', 'F')->count(),
        ];

        $avgAssignment = round($allGrades->avg('assignment_score') ?? 0, 1);
        $avgQuiz = round($allGrades->avg('quiz_score') ?? 0, 1);
        $avgFinal = round($allGrades->avg('final_score') ?? 0, 1);

        $gradeList = $allGrades->map(function ($g) {
            $studentUser = $g->student;
            $studentProfile = Student::where('user_id', $g->student_id)->first();

            return [
                'id' => $g->id,
                'student_name' => $studentUser ? ($studentUser->first_name . ' ' . $studentUser->last_name) : 'N/A',
                'student_code' => $studentProfile->student_code ?? ('STD-' . $g->student_id),
                'course_name' => $g->course->course_name ?? 'N/A',
                'course_code' => $g->course->course_code ?? 'N/A',
                'department_name' => $g->course->department->department_name ?? 'N/A',
                'assignment_score' => $g->assignment_score ?? 0,
                'quiz_score' => $g->quiz_score ?? 0,
                'final_score' => $g->final_score ?? 0,
                'grade_letter' => $g->grade_letter ?? 'N/A',
            ];
        });

        return response()->json([
            'summary' => [
                'total_graded' => $allGrades->count(),
                'avg_assignment' => $avgAssignment,
                'avg_quiz' => $avgQuiz,
                'avg_final' => $avgFinal,
                'grade_distribution' => $gradeCounts,
            ],
            'data' => $gradeList,
        ]);
    }
}

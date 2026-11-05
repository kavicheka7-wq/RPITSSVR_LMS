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
use Illuminate\Support\Facades\Cache;

class AdminReportController extends Controller
{
    /**
     * Get system overview report stats & distributions.
     */
    public function getOverviewReport(Request $request)
    {
        // ✅ កែសម្រួល៖ ប្រើ Cache សម្រាប់ Overview Report (៥ នាទី)
        $data = Cache::remember('admin_overview_report', 300, function () {
            $studentRole = Role::where('role_name', 'Student')->first();
            $totalStudents = Student::count();
            if ($totalStudents === 0) {
                $totalStudents = $studentRole ? User::where('role_id', $studentRole->id)->count() : 0;
            }

            $totalTeachers = Teacher::count();
            $totalCourses = Course::count();
            $totalDepartments = Department::count();
            $totalEnrollments = Enrollment::count();
            $totalLessons = Lesson::count();
            $totalAssignments = Assignment::count();

            // ✅ កែសម្រួល៖ ប្រើ Query តែម្តងសម្រាប់ Attendance Rate
            $attendanceStats = Attendance::selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('present', 'Present') THEN 1 ELSE 0 END) as present
            ")->first();

            $totalAttendances = $attendanceStats->total ?? 0;
            $presentAttendances = $attendanceStats->present ?? 0;
            $overallAttendanceRate = $totalAttendances > 0
                ? round(($presentAttendances / $totalAttendances) * 100, 1)
                : 100;

            // ✅ កែសម្រួល៖ ប្រើ withCount ជំនួស get() + map()
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

            return [
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
                'department_distribution' => $departmentDistribution->values()->all(),
                'enrollment_trend' => $enrollmentTrend->values()->all(),
            ];
        });

        return response()->json($data);
    }

    /**
     * Get student enrollment report with filters.
     */
    public function getEnrollmentReport(Request $request)
    {
        // ✅ កែសម្រួល៖ បង្កើត Base Query តែម្តង រួច Clone សម្រាប់រាប់ និង Paginate
        $baseQuery = Enrollment::query();

        if ($request->filled('department_id')) {
            $baseQuery->whereHas('course', function ($q) use ($request) {
                $q->where('department_id', $request->department_id);
            });
        }

        if ($request->filled('course_id')) {
            $baseQuery->where('course_id', $request->course_id);
        }

        if ($request->filled('status')) {
            $baseQuery->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $baseQuery->where(function ($q) use ($search) {
                $q->whereHas('student', function ($sq) use ($search) {
                    $sq->where('first_name', 'like', "{$search}%")
                       ->orWhere('last_name', 'like', "{$search}%")
                       ->orWhere('email', 'like', "{$search}%");
                })->orWhereHas('course', function ($cq) use ($search) {
                    $cq->where('course_name', 'like', "{$search}%")
                       ->orWhere('course_code', 'like', "{$search}%");
                });
            });
        }

        // ✅ កែសម្រួល៖ រាប់ដោយប្រើ clone (មិនទាញទិន្នន័យទាំងអស់ចូល Memory)
        $summary = [
            'total' => (clone $baseQuery)->count(),
            'active' => (clone $baseQuery)->where('status', 'active')->count(),
            'completed' => (clone $baseQuery)->where('status', 'completed')->count(),
            'dropped' => (clone $baseQuery)->whereIn('status', ['dropped', 'inactive', 'cancelled'])->count(),
        ];

        // ✅ កែសម្រួល៖ ប្រើ with() សម្រាប់ Eager Loading ព្រមទាំង select columns ចាំបាច់
        $paginated = $baseQuery
            ->with([
                'student:id,first_name,last_name,email',
                'course:id,course_name,course_code,department_id',
                'course.department:id,department_name',
            ])
            ->orderBy('created_at', 'desc')
            ->paginate($request->per_page ?? 15);

        // ✅ កែសម្រួល៖ ទាញ Student Profiles ទាំងអស់ក្នុង Query តែម្តង (ជៀសវាង N+1)
        $studentIds = collect($paginated->items())->pluck('student_id')->unique()->filter();
        $studentProfiles = Student::whereIn('user_id', $studentIds)
            ->select('user_id', 'student_code')
            ->get()
            ->keyBy('user_id');

        $items = collect($paginated->items())->map(function ($enr) use ($studentProfiles) {
            $studentUser = $enr->student;
            $studentProfile = $studentProfiles->get($enr->student_id);

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
                'enrolled_date' => $enr->enrolled_date
                    ? $enr->enrolled_date->format('Y-m-d')
                    : ($enr->created_at ? $enr->created_at->format('Y-m-d') : 'N/A'),
            ];
        });

        return response()->json([
            'summary' => $summary,
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
        // ✅ កែសម្រួល៖ បង្កើត Base Query តែម្តង
        $baseQuery = Attendance::query();

        if ($request->filled('department_id')) {
            $baseQuery->whereHas('course', function ($q) use ($request) {
                $q->where('department_id', $request->department_id);
            });
        }

        if ($request->filled('course_id')) {
            $baseQuery->where('course_id', $request->course_id);
        }

        if ($request->filled('date_from')) {
            $baseQuery->whereDate('attendance_date', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $baseQuery->whereDate('attendance_date', '<=', $request->date_to);
        }

        // ✅ កែសម្រួល៖ ប្រើ Query តែម្តងសម្រាប់ Summary ទាំងអស់ (ជំនួស get() + count())
        $summaryRaw = (clone $baseQuery)->selectRaw("
            COUNT(*) as total_records,
            SUM(CASE WHEN status IN ('present', 'Present') THEN 1 ELSE 0 END) as present,
            SUM(CASE WHEN status IN ('absent', 'Absent') THEN 1 ELSE 0 END) as absent,
            SUM(CASE WHEN status IN ('late', 'Late') THEN 1 ELSE 0 END) as late,
            SUM(CASE WHEN status IN ('permission', 'Permission') THEN 1 ELSE 0 END) as permission
        ")->first();

        $totalRecords = $summaryRaw->total_records ?? 0;
        $presentCount = $summaryRaw->present ?? 0;
        $absentCount = $summaryRaw->absent ?? 0;
        $lateCount = $summaryRaw->late ?? 0;
        $permissionCount = $summaryRaw->permission ?? 0;

        $rate = $totalRecords > 0 ? round(($presentCount / $totalRecords) * 100, 1) : 100;

        // ✅ កែសម្រួល៖ ប្រើ withCount ជំនួស N+1 Query ក្នុង map()
        // នេះជាចំណុចកែសម្រួលសំខាន់បំផុត!
        $coursesQuery = Course::with(['department:id,department_name', 'teacher:id,first_name,last_name,profile_image'])
            ->when($request->filled('department_id'), function ($q) use ($request) {
                $q->where('department_id', $request->department_id);
            })
            ->when($request->filled('course_id'), function ($q) use ($request) {
                $q->where('id', $request->course_id);
            });

        // បង្កើត Subquery សម្រាប់ Attendance Counts
        $attendanceSubquery = Attendance::selectRaw("
            course_id,
            COUNT(*) as total,
            SUM(CASE WHEN status IN ('present', 'Present') THEN 1 ELSE 0 END) as present,
            SUM(CASE WHEN status IN ('absent', 'Absent') THEN 1 ELSE 0 END) as absent,
            SUM(CASE WHEN status IN ('late', 'Late') THEN 1 ELSE 0 END) as late,
            SUM(CASE WHEN status IN ('permission', 'Permission') THEN 1 ELSE 0 END) as permission
        ")->groupBy('course_id');

        if ($request->filled('date_from')) {
            $attendanceSubquery->whereDate('attendance_date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $attendanceSubquery->whereDate('attendance_date', '<=', $request->date_to);
        }

        $courseBreakdown = $coursesQuery
            ->leftJoinSub($attendanceSubquery, 'att_stats', function ($join) {
                $join->on('courses.id', '=', 'att_stats.course_id');
            })
            ->select([
                'courses.id',
                'courses.course_name',
                'courses.course_code',
                'courses.department_id',
                'courses.teacher_id',
                DB::raw('COALESCE(att_stats.total, 0) as total'),
                DB::raw('COALESCE(att_stats.present, 0) as present'),
                DB::raw('COALESCE(att_stats.absent, 0) as absent'),
                DB::raw('COALESCE(att_stats.late, 0) as late'),
                DB::raw('COALESCE(att_stats.permission, 0) as permission'),
            ])
            ->get()
            ->map(function ($course) {
                $cTotal = $course->total;
                $cPresent = $course->present;
                $cRate = $cTotal > 0 ? round(($cPresent / $cTotal) * 100, 1) : 100;

                $teacherName = $course->teacher
                    ? trim(($course->teacher->first_name ?? '') . ' ' . ($course->teacher->last_name ?? ''))
                    : null;

                if (!$teacherName && isset($course->teacher->name)) {
                    $teacherName = $course->teacher->name;
                }

                return [
                    'course_id' => $course->id,
                    'course_name' => $course->course_name,
                    'course_code' => $course->course_code,
                    'department_name' => $course->department->department_name ?? 'N/A',
                    'teacher_name' => $teacherName ?: 'មិនស្គាល់គ្រូបង្រៀន',
                    'teacher_image' => $course->teacher->profile_image ?? null,
                    'total' => $cTotal,
                    'present' => $cPresent,
                    'absent' => $course->absent,
                    'late' => $course->late,
                    'permission' => $course->permission,
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
        // ✅ កែសម្រួល៖ បង្កើត Base Query តែម្តង
        $baseQuery = Grade::query();

        if ($request->filled('department_id')) {
            $baseQuery->whereHas('course', function ($q) use ($request) {
                $q->where('department_id', $request->department_id);
            });
        }

        if ($request->filled('course_id')) {
            $baseQuery->where('course_id', $request->course_id);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $baseQuery->where(function ($q) use ($search) {
                $q->whereHas('student', function ($sq) use ($search) {
                    $sq->where('first_name', 'like', "{$search}%")
                       ->orWhere('last_name', 'like', "{$search}%");
                })->orWhereHas('course', function ($cq) use ($search) {
                    $cq->where('course_name', 'like', "{$search}%");
                });
            });
        }

        // ✅ កែសម្រួល៖ ប្រើ Query តែម្តងសម្រាប់ Summary ទាំងអស់
        $summaryRaw = (clone $baseQuery)->selectRaw("
            COUNT(*) as total_graded,
            AVG(assignment_score) as avg_assignment,
            AVG(quiz_score) as avg_quiz,
            AVG(final_score) as avg_final,
            SUM(CASE WHEN grade_letter = 'A' THEN 1 ELSE 0 END) as grade_a,
            SUM(CASE WHEN grade_letter = 'B' THEN 1 ELSE 0 END) as grade_b,
            SUM(CASE WHEN grade_letter = 'C' THEN 1 ELSE 0 END) as grade_c,
            SUM(CASE WHEN grade_letter = 'D' THEN 1 ELSE 0 END) as grade_d,
            SUM(CASE WHEN grade_letter = 'F' THEN 1 ELSE 0 END) as grade_f
        ")->first();

        // ✅ កែសម្រួល៖ បន្ថែម Pagination សម្រាប់ទិន្នន័យតារាង
        // ប៉ុន្តែ Summary ខាងលើគណនាពី Query ទាំងមូល (មិនមែនតែ Page បច្ចុប្បន្នទេ)
        $paginated = (clone $baseQuery)
            ->with([
                'student:id,first_name,last_name,email',
                'course:id,course_name,course_code,department_id',
                'course.department:id,department_name',
            ])
            ->orderBy('id', 'desc')
            ->paginate($request->per_page ?? 50);

        // ✅ កែសម្រួល៖ ទាញ Student Profiles ទាំងអស់ក្នុង Query តែម្តង (ជៀសវាង N+1)
        $studentIds = collect($paginated->items())->pluck('student_id')->unique()->filter();
        $studentProfiles = Student::whereIn('user_id', $studentIds)
            ->select('user_id', 'student_code')
            ->get()
            ->keyBy('user_id');

        $gradeList = collect($paginated->items())->map(function ($g) use ($studentProfiles) {
            $studentUser = $g->student;
            $studentProfile = $studentProfiles->get($g->student_id);

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
                'total_graded' => $summaryRaw->total_graded ?? 0,
                'avg_assignment' => round($summaryRaw->avg_assignment ?? 0, 1),
                'avg_quiz' => round($summaryRaw->avg_quiz ?? 0, 1),
                'avg_final' => round($summaryRaw->avg_final ?? 0, 1),
                'grade_distribution' => [
                    'A' => $summaryRaw->grade_a ?? 0,
                    'B' => $summaryRaw->grade_b ?? 0,
                    'C' => $summaryRaw->grade_c ?? 0,
                    'D' => $summaryRaw->grade_d ?? 0,
                    'F' => $summaryRaw->grade_f ?? 0,
                ],
            ],
            'data' => $gradeList,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ]);
    }
}
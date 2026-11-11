<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Assignment;
use App\Models\Attendance;
use App\Models\Course;
use App\Models\Department;
use App\Models\Enrollment;
use App\Models\Grade;
use App\Models\Lesson;
use App\Models\Role;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AdminReportController extends Controller
{
    /**
     * Get system overview report stats & distributions.
     */
    public function getOverviewReport(Request $request)
    {
        // ✅ ប្រើ Cache សម្រាប់ Overview Report (៥ នាទី)
        $data = Cache::remember('admin_overview_report', 300, function () {
            $studentRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%student%'])->first();
            $teacherRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%teacher%'])->first();

            $studentRoleId = $studentRole?->id ?? 3;
            $teacherRoleId = $teacherRole?->id ?? 2;

            $totalStudents = Student::count();
            if ($totalStudents === 0) {
                $totalStudents = User::where('role_id', $studentRoleId)->count();
            }

            $totalTeachers = Teacher::count();
            if ($totalTeachers === 0) {
                $totalTeachers = User::where('role_id', $teacherRoleId)->count();
            }

            $totalCourses = Course::count();
            $totalDepartments = Department::count();
            $totalEnrollments = Enrollment::count();
            $totalLessons = Lesson::count();
            $totalAssignments = Assignment::count();

            // ✅ ប្រើ Query តែម្តងសម្រាប់ Attendance Rate
            $attendanceStats = Attendance::selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN LOWER(status) = 'present' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN LOWER(status) = 'late' THEN 1 ELSE 0 END) as late,
                SUM(CASE WHEN LOWER(status) = 'permission' THEN 1 ELSE 0 END) as permission
            ")->first();

            $totalAttendances = (int) ($attendanceStats->total ?? 0);
            $presentAttendances = (int) ($attendanceStats->present ?? 0);
            $lateAttendances = (int) ($attendanceStats->late ?? 0);
            $permissionAttendances = (int) ($attendanceStats->permission ?? 0);

            $effectiveAttended = $presentAttendances + $lateAttendances + ($permissionAttendances * 0.5);
            $overallAttendanceRate = $totalAttendances > 0
                ? min(100, round(($effectiveAttended / $totalAttendances) * 100, 1))
                : 100;

            // ✅ ប្រើ withCount ជំនួស get() + map()
            $departments = Department::withCount(['courses', 'students', 'teachers'])->get();
            $departmentDistribution = $departments->map(function ($dept) {
                return [
                    'id' => $dept->id,
                    'department_name' => $dept->department_name,
                    'department_code' => $dept->department_code,
                    'students_count' => (int) ($dept->students_count ?? 0),
                    'teachers_count' => (int) ($dept->teachers_count ?? 0),
                    'courses_count' => (int) ($dept->courses_count ?? 0),
                ];
            });

            // Recent 6 Months Enrollment Trend
            $enrollmentTrend = Enrollment::select(
                DB::raw("DATE_FORMAT(created_at, '%Y-%m') as month"),
                DB::raw('COUNT(*) as count')
            )
                ->where('created_at', '>=', now()->subMonths(6))
                ->groupBy('month')
                ->orderBy('month', 'asc')
                ->get()
                ->map(function ($row) {
                    return [
                        'month' => $row->month,
                        'count' => (int) $row->count,
                    ];
                });

            return [
                'stats' => [
                    'total_students' => (int) $totalStudents,
                    'total_teachers' => (int) $totalTeachers,
                    'total_courses' => (int) $totalCourses,
                    'total_departments' => (int) $totalDepartments,
                    'total_enrollments' => (int) $totalEnrollments,
                    'total_lessons' => (int) $totalLessons,
                    'total_assignments' => (int) $totalAssignments,
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
        // ✅ បង្កើត Base Query តែម្តង រួច Clone សម្រាប់រាប់ និង Paginate
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
            $search = trim($request->search);
            $matchedStudentUserIds = Student::where('student_code', 'like', "%{$search}%")
                ->pluck('user_id')
                ->filter()
                ->all();

            $baseQuery->where(function ($q) use ($search, $matchedStudentUserIds) {
                if (!empty($matchedStudentUserIds)) {
                    $q->orWhereIn('student_id', $matchedStudentUserIds);
                }
                $q->orWhereHas('student', function ($sq) use ($search) {
                    $sq->where('first_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%")
                        ->orWhere(DB::raw("CONCAT(first_name, ' ', last_name)"), 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                })->orWhereHas('course', function ($cq) use ($search) {
                    $cq->where('course_name', 'like', "%{$search}%")
                        ->orWhere('course_code', 'like', "%{$search}%");
                });
            });
        }

        // ✅ រាប់ដោយប្រើ clone (មិនទាញទិន្នន័យទាំងអស់ចូល Memory)
        $summary = [
            'total' => (int) (clone $baseQuery)->count(),
            'active' => (int) (clone $baseQuery)->where('status', 'active')->count(),
            'completed' => (int) (clone $baseQuery)->where('status', 'completed')->count(),
            'dropped' => (int) (clone $baseQuery)->whereIn('status', ['dropped', 'inactive', 'cancelled'])->count(),
        ];

        $perPage = max(1, min(200, (int) ($request->per_page ?? 15)));

        // ✅ ប្រើ with() សម្រាប់ Eager Loading ព្រមទាំង select columns ចាំបាច់
        $paginated = $baseQuery
            ->with([
                'student:id,first_name,last_name,email,profile_image',
                'course:id,course_name,course_code,department_id',
                'course.department:id,department_name',
            ])
            ->orderBy('created_at', 'desc')
            ->paginate($perPage);

        // ✅ ទាញ Student Profiles ទាំងអស់ក្នុង Query តែម្តង (ជៀសវាង N+1)
        $studentIds = collect($paginated->items())->pluck('student_id')->unique()->filter();
        $studentProfiles = Student::whereIn('user_id', $studentIds)
            ->select('id', 'user_id', 'student_code', 'batch_year', 'study_shift', 'profile_image')
            ->get()
            ->keyBy('user_id');

        $items = collect($paginated->items())->map(function ($enr) use ($studentProfiles) {
            $studentUser = $enr->student;
            $studentProfile = $studentProfiles->get($enr->student_id);

            $enrolledDateStr = 'N/A';
            $rawDate = $enr->enrolled_date ?? $enr->created_at;
            if ($rawDate) {
                try {
                    $enrolledDateStr = Carbon::parse($rawDate)->format('Y-m-d');
                } catch (\Throwable $e) {
                    $enrolledDateStr = substr((string) $rawDate, 0, 10);
                }
            }

            return [
                'id' => $enr->id,
                'student_id' => $enr->student_id,
                'student_name' => $studentUser
                    ? trim(($studentUser->first_name ?? '') . ' ' . ($studentUser->last_name ?? ''))
                    : 'N/A',
                'student_code' => $studentProfile->student_code ?? ('STD-' . $enr->student_id),
                'student_image' => $studentProfile->profile_image ?? $studentUser->profile_image ?? null,
                'batch_year' => $studentProfile->batch_year ?? null,
                'study_shift' => $studentProfile->study_shift ?? 'Monday-Friday',
                'email' => $studentUser->email ?? 'N/A',
                'course_name' => $enr->course->course_name ?? 'N/A',
                'course_code' => $enr->course->course_code ?? 'N/A',
                'department_name' => $enr->course->department->department_name ?? 'N/A',
                'status' => $enr->status ?? 'active',
                'enrolled_date' => $enrolledDateStr,
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
            ],
        ]);
    }

    /**
     * Get attendance breakdown report.
     */
    public function getAttendanceReport(Request $request)
    {
        // ✅ បង្កើត Base Query តែម្តង
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

        // ✅ ប្រើ Query តែម្តងសម្រាប់ Summary ទាំងអស់
        $summaryRaw = (clone $baseQuery)->selectRaw("
            COUNT(*) as total_records,
            SUM(CASE WHEN LOWER(status) = 'present' THEN 1 ELSE 0 END) as present,
            SUM(CASE WHEN LOWER(status) = 'absent' THEN 1 ELSE 0 END) as absent,
            SUM(CASE WHEN LOWER(status) = 'late' THEN 1 ELSE 0 END) as late,
            SUM(CASE WHEN LOWER(status) = 'permission' THEN 1 ELSE 0 END) as permission
        ")->first();

        $totalRecords = (int) ($summaryRaw->total_records ?? 0);
        $presentCount = (int) ($summaryRaw->present ?? 0);
        $absentCount = (int) ($summaryRaw->absent ?? 0);
        $lateCount = (int) ($summaryRaw->late ?? 0);
        $permissionCount = (int) ($summaryRaw->permission ?? 0);

        $effectiveAttended = $presentCount + $lateCount + ($permissionCount * 0.5);
        $rate = $totalRecords > 0
            ? min(100, round(($effectiveAttended / $totalRecords) * 100, 1))
            : 100;

        $coursesQuery = Course::with(['department:id,department_name', 'teacher'])
            ->when($request->filled('department_id'), function ($q) use ($request) {
                $q->where('department_id', $request->department_id);
            })
            ->when($request->filled('course_id'), function ($q) use ($request) {
                $q->where('courses.id', $request->course_id);
            });

        // បង្កើត Subquery សម្រាប់ Attendance Counts
        $attendanceSubquery = Attendance::selectRaw("
            course_id,
            COUNT(*) as total,
            SUM(CASE WHEN LOWER(status) = 'present' THEN 1 ELSE 0 END) as present,
            SUM(CASE WHEN LOWER(status) = 'absent' THEN 1 ELSE 0 END) as absent,
            SUM(CASE WHEN LOWER(status) = 'late' THEN 1 ELSE 0 END) as late,
            SUM(CASE WHEN LOWER(status) = 'permission' THEN 1 ELSE 0 END) as permission
        ")->groupBy('course_id');

        if ($request->filled('date_from')) {
            $attendanceSubquery->whereDate('attendance_date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $attendanceSubquery->whereDate('attendance_date', '<=', $request->date_to);
        }

        // ទាញបញ្ជីគ្រូបង្រៀនពីតារាង teachers ទុកផ្គូផ្គងរូបថត និងឈ្មោះបន្ថែមក្នុង Query តែម្តង
        $teachersByUserId = Teacher::select('id', 'user_id', 'first_name', 'last_name', 'profile_image')
            ->get()
            ->keyBy('user_id');

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
            ->map(function ($course) use ($teachersByUserId) {
                $cTotal = (int) $course->total;
                $cPresent = (int) $course->present;
                $cAbsent = (int) $course->absent;
                $cLate = (int) $course->late;
                $cPermission = (int) $course->permission;

                $cEffective = $cPresent + $cLate + ($cPermission * 0.5);
                $cRate = $cTotal > 0 ? min(100, round(($cEffective / $cTotal) * 100, 1)) : 100;

                $relTeacher = $course->teacher;
                $extTeacher = $teachersByUserId->get($course->teacher_id);

                $teacherName = $relTeacher
                    ? trim(($relTeacher->first_name ?? '') . ' ' . ($relTeacher->last_name ?? ''))
                    : null;

                if (!$teacherName && $extTeacher) {
                    $teacherName = trim(($extTeacher->first_name ?? '') . ' ' . ($extTeacher->last_name ?? ''));
                }

                if (!$teacherName && isset($relTeacher->name)) {
                    $teacherName = $relTeacher->name;
                }

                $teacherImage = $relTeacher->profile_image
                    ?? $extTeacher?->profile_image
                    ?? null;

                return [
                    'course_id' => $course->id,
                    'course_name' => $course->course_name,
                    'course_code' => $course->course_code,
                    'department_name' => $course->department->department_name ?? 'N/A',
                    'teacher_name' => $teacherName ?: 'មិនស្គាល់គ្រូបង្រៀន',
                    'teacher_image' => $teacherImage,
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
        // ✅ បង្កើត Base Query តែម្តង
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
            $search = trim($request->search);
            $matchedStudentUserIds = Student::where('student_code', 'like', "%{$search}%")
                ->pluck('user_id')
                ->filter()
                ->all();

            $baseQuery->where(function ($q) use ($search, $matchedStudentUserIds) {
                if (!empty($matchedStudentUserIds)) {
                    $q->orWhereIn('student_id', $matchedStudentUserIds);
                }
                $q->orWhereHas('student', function ($sq) use ($search) {
                    $sq->where('first_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%")
                        ->orWhere(DB::raw("CONCAT(first_name, ' ', last_name)"), 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                })->orWhereHas('course', function ($cq) use ($search) {
                    $cq->where('course_name', 'like', "%{$search}%")
                        ->orWhere('course_code', 'like', "%{$search}%");
                });
            });
        }

        $hasMidtermCol = Schema::hasColumn('grades', 'midterm_score');
        $hasExamCol = Schema::hasColumn('grades', 'exam_score');

        $midtermAvgSelect = $hasMidtermCol ? 'AVG(midterm_score) as avg_midterm,' : '0 as avg_midterm,';
        $examAvgSelect = $hasExamCol ? 'AVG(exam_score) as avg_exam,' : '0 as avg_exam,';

        // ✅ ប្រើ Query តែម្តងសម្រាប់ Summary ទាំងអស់ (គាំទ្រទាំងនិទ្ទេស A+, B+, C+ និង Passed/Failed)
        $summaryRaw = (clone $baseQuery)->selectRaw("
            COUNT(*) as total_graded,
            AVG(assignment_score) as avg_assignment,
            AVG(quiz_score) as avg_quiz,
            {$midtermAvgSelect}
            {$examAvgSelect}
            AVG(final_score) as avg_final,
            SUM(CASE WHEN UPPER(TRIM(grade_letter)) IN ('A', 'A+') THEN 1 ELSE 0 END) as grade_a,
            SUM(CASE WHEN UPPER(TRIM(grade_letter)) IN ('B', 'B+') THEN 1 ELSE 0 END) as grade_b,
            SUM(CASE WHEN UPPER(TRIM(grade_letter)) IN ('C', 'C+') THEN 1 ELSE 0 END) as grade_c,
            SUM(CASE WHEN UPPER(TRIM(grade_letter)) = 'D' THEN 1 ELSE 0 END) as grade_d,
            SUM(CASE WHEN UPPER(TRIM(grade_letter)) = 'F' OR (grade_letter IS NULL AND final_score < 50) THEN 1 ELSE 0 END) as grade_f,
            SUM(CASE WHEN final_score >= 50 AND UPPER(TRIM(COALESCE(grade_letter, ''))) != 'F' THEN 1 ELSE 0 END) as passed_count,
            SUM(CASE WHEN final_score < 50 OR UPPER(TRIM(COALESCE(grade_letter, ''))) = 'F' THEN 1 ELSE 0 END) as failed_count
        ")->first();

        $perPage = max(1, min(200, (int) ($request->per_page ?? 50)));

        $paginated = (clone $baseQuery)
            ->with([
                'student:id,first_name,last_name,email,profile_image',
                'course:id,course_name,course_code,department_id',
                'course.department:id,department_name',
            ])
            ->orderBy('id', 'desc')
            ->paginate($perPage);

        // ✅ ទាញ Student Profiles ទាំងអស់ក្នុង Query តែម្តង (ជៀសវាង N+1)
        $studentIds = collect($paginated->items())->pluck('student_id')->unique()->filter();
        $studentProfiles = Student::whereIn('user_id', $studentIds)
            ->select('id', 'user_id', 'student_code', 'batch_year', 'study_shift', 'profile_image')
            ->get()
            ->keyBy('user_id');

        $gradeList = collect($paginated->items())->map(function ($g) use ($studentProfiles) {
            $studentUser = $g->student;
            $studentProfile = $studentProfiles->get($g->student_id);

            return [
                'id' => $g->id,
                'student_id' => $g->student_id,
                'student_name' => $studentUser
                    ? trim(($studentUser->first_name ?? '') . ' ' . ($studentUser->last_name ?? ''))
                    : 'N/A',
                'student_code' => $studentProfile->student_code ?? ('STD-' . $g->student_id),
                'student_image' => $studentProfile->profile_image ?? $studentUser->profile_image ?? null,
                'batch_year' => $studentProfile->batch_year ?? null,
                'study_shift' => $studentProfile->study_shift ?? 'Monday-Friday',
                'course_name' => $g->course->course_name ?? 'N/A',
                'course_code' => $g->course->course_code ?? 'N/A',
                'department_name' => $g->course->department->department_name ?? 'N/A',
                'assignment_score' => round((float) ($g->assignment_score ?? 0), 2),
                'quiz_score' => round((float) ($g->quiz_score ?? 0), 2),
                'midterm_score' => round((float) ($g->midterm_score ?? 0), 2),
                'exam_score' => round((float) ($g->exam_score ?? 0), 2),
                'final_score' => round((float) ($g->final_score ?? 0), 2),
                'grade_letter' => $g->grade_letter ?? 'N/A',
            ];
        });

        return response()->json([
            'summary' => [
                'total_graded' => (int) ($summaryRaw->total_graded ?? 0),
                'avg_assignment' => round((float) ($summaryRaw->avg_assignment ?? 0), 1),
                'avg_quiz' => round((float) ($summaryRaw->avg_quiz ?? 0), 1),
                'avg_midterm' => round((float) ($summaryRaw->avg_midterm ?? 0), 1),
                'avg_exam' => round((float) ($summaryRaw->avg_exam ?? 0), 1),
                'avg_final' => round((float) ($summaryRaw->avg_final ?? 0), 1),
                'passed_count' => (int) ($summaryRaw->passed_count ?? 0),
                'failed_count' => (int) ($summaryRaw->failed_count ?? 0),
                'grade_distribution' => [
                    'A' => (int) ($summaryRaw->grade_a ?? 0),
                    'B' => (int) ($summaryRaw->grade_b ?? 0),
                    'C' => (int) ($summaryRaw->grade_c ?? 0),
                    'D' => (int) ($summaryRaw->grade_d ?? 0),
                    'F' => (int) ($summaryRaw->grade_f ?? 0),
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
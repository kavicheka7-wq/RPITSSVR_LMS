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
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AdminReportController extends Controller
{
    // =========================================================================
    // 📌 Helper Functions (សម្រាប់ប្រើរួមក្នុងរបាយការណ៍ទាំង ៤)
    // =========================================================================

    /**
     * រៀបចំឈ្មោះតាមលំដាប់ «នាមត្រកូល មុន នាមខ្លួន»
     */
    private function formatFullName($entity, string $fallback = 'N/A'): string
    {
        if (!$entity) {
            return $fallback;
        }

        $full = trim(($entity->last_name ?? '') . ' ' . ($entity->first_name ?? ''));
        if ($full !== '') {
            return $full;
        }

        return !empty($entity->name) ? trim((string) $entity->name) : $fallback;
    }

    /**
     * គណនាភាគរយវត្តមានសរុប (Present + Late + 0.5 * Permission)
     */
    private function calculateAttendanceRate(int $total, int $present, int $late, int $permission): float
    {
        if ($total <= 0) {
            return 0;
        }

        $effective = $present + $late + ($permission * 0.5);

        return min(100, round(($effective / $total) * 100, 1));
    }

    /**
     * អនុវត្តតម្រងដេប៉ាតឺម៉ង់ មុខវិជ្ជា និងពាក្យស្វែងរក (ប្រើរួមសម្រាប់ Enrollments និង Grades)
     */
    private function applyCommonFilters(Builder $query, Request $request): Builder
    {
        if ($request->filled('department_id')) {
            $query->whereHas('course', function ($q) use ($request) {
                $q->where('department_id', $request->department_id);
            });
        }

        if ($request->filled('course_id')) {
            $query->where('course_id', $request->course_id);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $matchedStudentUserIds = Student::where('student_code', 'like', "%{$search}%")
                ->pluck('user_id')
                ->filter()
                ->all();

            $query->where(function ($q) use ($search, $matchedStudentUserIds) {
                if (!empty($matchedStudentUserIds)) {
                    $q->orWhereIn('student_id', $matchedStudentUserIds);
                }

                $q->orWhereHas('student', function ($sq) use ($search) {
                    $sq->where('first_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%")
                        ->orWhere(DB::raw("CONCAT(last_name, ' ', first_name)"), 'like', "%{$search}%")
                        ->orWhere(DB::raw("CONCAT(first_name, ' ', last_name)"), 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                })->orWhereHas('course', function ($cq) use ($search) {
                    $cq->where('course_name', 'like', "%{$search}%")
                        ->orWhere('course_code', 'like', "%{$search}%");
                });
            });
        }

        return $query;
    }

    /**
     * ទាញព័ត៌មានសិស្សដោយមិនទាញ profile_image និងផ្គូផ្គងទាំង user_id និង id
     */
    private function getStudentProfilesMap(array $studentIds): Collection
    {
        if (empty($studentIds)) {
            return collect();
        }

        $profiles = Student::whereIn('user_id', $studentIds)
            ->orWhereIn('id', $studentIds)
            ->select('id', 'user_id', 'student_code', 'gender', 'batch_year', 'study_shift')
            ->get();

        $map = collect();
        foreach ($profiles as $profile) {
            if ($profile->user_id) {
                $map->put($profile->user_id, $profile);
            }
            $map->put($profile->id, $profile);
        }

        return $map;
    }

    // =========================================================================
    // 📌 ១. របាយការណ៍ទិដ្ឋភាពទូទៅ (Overview Report)
    // =========================================================================

    public function getOverviewReport(Request $request)
    {
        $data = Cache::remember('admin_overview_report', 300, function () {
            $studentRoleId = Role::whereRaw('LOWER(role_name) LIKE ?', ['%student%'])->value('id') ?? 3;
            $teacherRoleId = Role::whereRaw('LOWER(role_name) LIKE ?', ['%teacher%'])->value('id') ?? 2;

            $totalStudents = Student::count() ?: User::where('role_id', $studentRoleId)->count();
            $totalTeachers = Teacher::count() ?: User::where('role_id', $teacherRoleId)->count();

            $attendanceStats = Attendance::selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN LOWER(status) = 'present' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN LOWER(status) = 'late' THEN 1 ELSE 0 END) as late,
                SUM(CASE WHEN LOWER(status) = 'permission' THEN 1 ELSE 0 END) as permission
            ")->first();

            $overallAttendanceRate = $this->calculateAttendanceRate(
                (int) ($attendanceStats->total ?? 0),
                (int) ($attendanceStats->present ?? 0),
                (int) ($attendanceStats->late ?? 0),
                (int) ($attendanceStats->permission ?? 0)
            );

            $departmentDistribution = Department::withCount(['courses', 'students', 'teachers'])
                ->get()
                ->map(fn ($dept) => [
                    'id' => $dept->id,
                    'department_name' => $dept->department_name,
                    'department_code' => $dept->department_code,
                    'students_count' => (int) ($dept->students_count ?? 0),
                    'teachers_count' => (int) ($dept->teachers_count ?? 0),
                    'courses_count' => (int) ($dept->courses_count ?? 0),
                ])
                ->values()
                ->all();

            $enrollmentTrend = Enrollment::select(
                DB::raw("DATE_FORMAT(created_at, '%Y-%m') as month"),
                DB::raw('COUNT(*) as count')
            )
                ->where('created_at', '>=', now()->subMonths(6))
                ->groupBy('month')
                ->orderBy('month', 'asc')
                ->get()
                ->map(fn ($row) => [
                    'month' => $row->month,
                    'count' => (int) $row->count,
                ])
                ->values()
                ->all();

            return [
                'stats' => [
                    'total_students' => (int) $totalStudents,
                    'total_teachers' => (int) $totalTeachers,
                    'total_courses' => Course::count(),
                    'total_departments' => Department::count(),
                    'total_enrollments' => Enrollment::count(),
                    'total_lessons' => Lesson::count(),
                    'total_assignments' => Assignment::count(),
                    'overall_attendance_rate' => $overallAttendanceRate,
                ],
                'department_distribution' => $departmentDistribution,
                'enrollment_trend' => $enrollmentTrend,
            ];
        });

        return response()->json($data);
    }

    // =========================================================================
    // 📌 ២. របាយការណ៍ការចុះឈ្មោះសិក្សា (Enrollment Report)
    // =========================================================================

    public function getEnrollmentReport(Request $request)
    {
        $baseQuery = $this->applyCommonFilters(Enrollment::query(), $request);

        if ($request->filled('status')) {
            $baseQuery->where('status', $request->status);
        }

        $summaryRow = (clone $baseQuery)->selectRaw("
            COUNT(*) as total,
            SUM(CASE WHEN status = 'active' OR status IS NULL OR status = '' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status IN ('dropped', 'inactive', 'cancelled') THEN 1 ELSE 0 END) as dropped
        ")->first();

        $perPage = max(1, min(200, (int) ($request->per_page ?? 15)));

        $paginated = $baseQuery
            ->with([
                'student:id,first_name,last_name,email,gender',
                'course:id,course_name,course_code,department_id',
                'course.department:id,department_name',
            ])
            ->orderBy('created_at', 'desc')
            ->paginate($perPage);

        $studentIds = collect($paginated->items())->pluck('student_id')->unique()->filter()->values()->all();
        $studentProfiles = $this->getStudentProfilesMap($studentIds);

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
                'student_name' => $this->formatFullName($studentUser),
                'student_code' => $studentProfile->student_code ?? ('STD-' . $enr->student_id),
                'gender' => $studentProfile->gender ?? $studentUser->gender ?? null,
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
            'summary' => [
                'total' => (int) ($summaryRow->total ?? 0),
                'active' => (int) ($summaryRow->active ?? 0),
                'completed' => (int) ($summaryRow->completed ?? 0),
                'dropped' => (int) ($summaryRow->dropped ?? 0),
            ],
            'data' => $items,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ]);
    }

    // =========================================================================
    // 📌 ៣. របាយការណ៍វត្តមានសិស្ស (Attendance Report)
    // =========================================================================

    public function getAttendanceReport(Request $request)
    {
        $baseQuery = Attendance::query()
            ->when($request->filled('department_id'), function ($q) use ($request) {
                $q->whereHas('course', fn ($cq) => $cq->where('department_id', $request->department_id));
            })
            ->when($request->filled('course_id'), fn ($q) => $q->where('course_id', $request->course_id))
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('attendance_date', '>=', $request->date_from))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('attendance_date', '<=', $request->date_to));

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

        $attendanceSubquery = Attendance::selectRaw("
            course_id,
            COUNT(*) as total,
            SUM(CASE WHEN LOWER(status) = 'present' THEN 1 ELSE 0 END) as present,
            SUM(CASE WHEN LOWER(status) = 'absent' THEN 1 ELSE 0 END) as absent,
            SUM(CASE WHEN LOWER(status) = 'late' THEN 1 ELSE 0 END) as late,
            SUM(CASE WHEN LOWER(status) = 'permission' THEN 1 ELSE 0 END) as permission
        ")
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('attendance_date', '>=', $request->date_from))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('attendance_date', '<=', $request->date_to))
            ->groupBy('course_id');

        $coursesResult = Course::with([
            'department:id,department_name',
            'teacher:id,first_name,last_name,email',
        ])
            ->when($request->filled('department_id'), fn ($q) => $q->where('department_id', $request->department_id))
            ->when($request->filled('course_id'), fn ($q) => $q->where('courses.id', $request->course_id))
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
            ->get();

        $relevantTeacherIds = $coursesResult->pluck('teacher_id')->filter()->unique()->values()->all();
        $teachersMap = collect();
        if (!empty($relevantTeacherIds)) {
            $teachers = Teacher::select('id', 'user_id', 'first_name', 'last_name')
                ->whereIn('user_id', $relevantTeacherIds)
                ->orWhereIn('id', $relevantTeacherIds)
                ->get();

            foreach ($teachers as $teacher) {
                if ($teacher->user_id) {
                    $teachersMap->put($teacher->user_id, $teacher);
                }
                $teachersMap->put($teacher->id, $teacher);
            }
        }

        $courseBreakdown = $coursesResult->map(function ($course) use ($teachersMap) {
            $cTotal = (int) $course->total;
            $cPresent = (int) $course->present;
            $cAbsent = (int) $course->absent;
            $cLate = (int) $course->late;
            $cPermission = (int) $course->permission;

            $teacherName = $this->formatFullName($course->teacher, '');
            if ($teacherName === '') {
                $teacherName = $this->formatFullName($teachersMap->get($course->teacher_id), 'មិនស្គាល់គ្រូបង្រៀន');
            }

            return [
                'course_id' => $course->id,
                'course_name' => $course->course_name,
                'course_code' => $course->course_code,
                'department_name' => $course->department->department_name ?? 'N/A',
                'teacher_name' => $teacherName,
                'total' => $cTotal,
                'present' => $cPresent,
                'absent' => $cAbsent,
                'late' => $cLate,
                'permission' => $cPermission,
                'rate' => $this->calculateAttendanceRate($cTotal, $cPresent, $cLate, $cPermission),
            ];
        });

        return response()->json([
            'summary' => [
                'total_records' => $totalRecords,
                'present' => $presentCount,
                'absent' => $absentCount,
                'late' => $lateCount,
                'permission' => $permissionCount,
                'rate' => $this->calculateAttendanceRate($totalRecords, $presentCount, $lateCount, $permissionCount),
            ],
            'course_breakdown' => $courseBreakdown,
        ]);
    }

    // =========================================================================
    // 📌 ៤. របាយការណ៍លទ្ធផលសិក្សា និងពិន្ទុ (Academic Report)
    // =========================================================================

    public function getAcademicReport(Request $request)
    {
        $baseQuery = $this->applyCommonFilters(Grade::query(), $request);

        $gradeCols = Cache::remember('lms_grades_optional_cols_v1', 86400, fn () => [
            'midterm' => Schema::hasColumn('grades', 'midterm_score'),
            'exam' => Schema::hasColumn('grades', 'exam_score'),
        ]);

        $midtermAvgSelect = !empty($gradeCols['midterm']) ? 'AVG(midterm_score) as avg_midterm,' : '0 as avg_midterm,';
        $examAvgSelect = !empty($gradeCols['exam']) ? 'AVG(exam_score) as avg_exam,' : '0 as avg_exam,';

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
                'student:id,first_name,last_name,email,gender',
                'course:id,course_name,course_code,department_id',
                'course.department:id,department_name',
            ])
            ->orderBy('id', 'desc')
            ->paginate($perPage);

        $studentIds = collect($paginated->items())->pluck('student_id')->unique()->filter()->values()->all();
        $studentProfiles = $this->getStudentProfilesMap($studentIds);

        $gradeList = collect($paginated->items())->map(function ($g) use ($studentProfiles) {
            $studentUser = $g->student;
            $studentProfile = $studentProfiles->get($g->student_id);

            return [
                'id' => $g->id,
                'student_id' => $g->student_id,
                'student_name' => $this->formatFullName($studentUser),
                'student_code' => $studentProfile->student_code ?? ('STD-' . $g->student_id),
                'gender' => $studentProfile->gender ?? $studentUser->gender ?? null,
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
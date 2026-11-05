<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Assignment;
use App\Models\AssignmentSubmission;
use App\Models\Quiz;
use App\Models\QuizAttempt;
use App\Models\Question;
use App\Models\Attendance;
use App\Models\Grade;
use App\Models\Enrollment;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;

class StudentController extends Controller
{
    /**
     * ✅ HELPER METHOD: ទាញយក Profile សិស្សឱ្យជាក់លាក់ (ឆែកទាំង user_id និង email)
     */
    private function resolveStudentProfile($user)
    {
        if (!$user) {
            return null;
        }
        $profile = Student::where('user_id', $user->id)->first();
        if (!$profile && !empty($user->email)) {
            $profile = Student::where('email', $user->email)->first();
        }
        return $profile;
    }

    /**
     * HELPER METHOD: ទាញយកបញ្ជី ID ទាំងអស់របស់សិស្សម្នាក់ (ទាំង users.id និង students.id)
     */
    private function getStudentAllIds($user)
    {
        if (!$user) {
            return [];
        }
        $studentProfile = $this->resolveStudentProfile($user);
        return array_values(array_unique(array_filter([
            (int) $user->id,
            $studentProfile ? (int) $studentProfile->id : null,
            ($studentProfile && $studentProfile->user_id) ? (int) $studentProfile->user_id : null,
        ])));
    }

    /**
     * HELPER METHOD: Check if the authenticated student is actively enrolled in a course.
     */
    private function getActiveEnrollment($studentId, $courseId)
    {
        $studentIds = is_array($studentId) ? $studentId : [$studentId];
        $studentProfile = Student::whereIn('user_id', $studentIds)->orWhereIn('id', $studentIds)->first();
        if ($studentProfile) {
            $studentIds[] = (int) $studentProfile->id;
            if ($studentProfile->user_id) {
                $studentIds[] = (int) $studentProfile->user_id;
            }
        }
        $studentIds = array_values(array_unique(array_filter($studentIds)));

        return Enrollment::whereIn('student_id', $studentIds)
            ->where('course_id', $courseId)
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', 'active')
                  ->orWhere('status', '');
            })
            ->first();
    }

    /**
     * ✅ HELPER METHOD: ស្រង់យកលេខឆ្នាំសិក្សា (1, 2, 3, 4) ពី batch_year, កូដសិស្ស, អ៊ីមែល, កូដមុខវិជ្ជា ឬឆមាស
     */
    private function parseAcademicYearNumber($text, $code = '', $semester = null)
    {
        $combined = mb_strtolower(trim((string) $text . ' ' . (string) $code));

        // ១. ពិនិត្យពាក្យបញ្ជាក់ឆ្នាំផ្ទាល់ (គាំទ្រទាំងលេខខ្មែរ អង់គ្លេស និងអ៊ីមែលដូចជា y4, year4, std4...)
        if (preg_match('/ឆ្នាំទី\s*(?:៤|4)|year\s*[-_]?\s*(?:4|៤)|(?:^|[^0-9a-z])y(?:ear)?[-_]?4(?:[^0-9a-z]|$)/u', $combined) || trim((string) $text) === '4' || trim((string) $text) === '៤') {
            return 4;
        }
        if (preg_match('/ឆ្នាំទី\s*(?:៣|3)|year\s*[-_]?\s*(?:3|៣)|(?:^|[^0-9a-z])y(?:ear)?[-_]?3(?:[^0-9a-z]|$)/u', $combined) || trim((string) $text) === '3' || trim((string) $text) === '៣') {
            return 3;
        }
        if (preg_match('/ឆ្នាំទី\s*(?:២|2)|year\s*[-_]?\s*(?:2|២)|(?:^|[^0-9a-z])y(?:ear)?[-_]?2(?:[^0-9a-z]|$)/u', $combined) || trim((string) $text) === '2' || trim((string) $text) === '២') {
            return 2;
        }
        if (preg_match('/ឆ្នាំទី\s*(?:១|1)|year\s*[-_]?\s*(?:1|១)|(?:^|[^0-9a-z])y(?:ear)?[-_]?1(?:[^0-9a-z]|$)/u', $combined) || trim((string) $text) === '1' || trim((string) $text) === '១') {
            return 1;
        }

        // ២. ពិនិត្យតាមទម្រង់កូដមុខវិជ្ជា ៣ ខ្ទង់ (ឧ. CS401 = ឆ្នាំទី 4, CS302 = ឆ្នាំទី 3)
        $cleanCode = trim((string) $code);
        if (preg_match('/[A-Za-z]+[-_\s]*([1-4])\d{2}\b/', $cleanCode, $matches)) {
            return (int) $matches[1];
        }
        if (preg_match('/y([1-4])/i', $cleanCode, $matches)) {
            return (int) $matches[1];
        }

        // ៣. ពិនិត្យករណី batch_year ដាក់ជាឆ្នាំចូលរៀន (ឧ. សិស្សចូលរៀនឆ្នាំ 2022 ឬ 2023 គិតត្រឹមឆ្នាំសិក្សា 2025-2026)
        if (preg_match('/\b(202[0-6])\b/', (string) $text, $yrMatch)) {
            $startYear = (int) $yrMatch[1];
            $currentAcademicStart = 2025;
            $diff = $currentAcademicStart - $startYear + 1;
            if ($diff >= 1 && $diff <= 4) {
                return $diff;
            }
        }

        // ៤. ពិនិត្យតាមលេខឆមាស (ឧ. ឆមាសទី 1-2 = ឆ្នាំទី1, ឆមាសទី 3-4 = ឆ្នាំទី2, ឆមាសទី 5-6 = ឆ្នាំទី3, ឆមាសទី 7-8 = ឆ្នាំទី4)
        if ($semester !== null && $semester !== '') {
            $semNum = (int) preg_replace('/[^0-9]/', '', (string) $semester);
            if ($semNum >= 7) return 4;
            if ($semNum >= 5) return 3;
            if ($semNum >= 3) return 2;
            if ($semNum >= 1) return 1;
        }

        return null;
    }

    /**
     * HELPER METHOD: រៀបចំទម្រង់ព័ត៌មានគ្រូបង្រៀនឱ្យត្រឹមត្រូវ ១០០% (គាំទ្រទាំង teacher_id = users.id និង teachers.id)
     */
    private function formatTeacherData($course)
    {
        if (!$course) {
            return null;
        }

        static $teachersById = null;
        static $teachersByUserId = null;
        static $usersById = null;

        if ($teachersById === null) {
            $allTeachers = Teacher::all();
            $teachersById = $allTeachers->keyBy('id');
            $teachersByUserId = $allTeachers->whereNotNull('user_id')->keyBy('user_id');
            $usersById = User::all()->keyBy('id');
        }

        $tid = $course->teacher_id;
        $teacherProfile = $course->teacherProfile;
        $teacherUser = $course->teacher;

        if (!$teacherProfile && $tid) {
            $teacherProfile = $teachersByUserId->get($tid) ?? $teachersById->get($tid);
        }
        if (!$teacherUser && $tid) {
            if ($teacherProfile && $teacherProfile->user_id) {
                $teacherUser = $usersById->get($teacherProfile->user_id);
            }
            if (!$teacherUser) {
                $teacherUser = $usersById->get($tid);
            }
        }

        $firstName = $teacherProfile->first_name ?? ($teacherUser->first_name ?? '');
        $lastName = $teacherProfile->last_name ?? ($teacherUser->last_name ?? '');
        $teacherName = trim($firstName . ' ' . $lastName);

        if (empty($teacherName)) {
            $teacherName = $teacherUser->name ?? ($teacherProfile->name ?? ($teacherUser->email ?? 'គ្រូបង្រៀន'));
        }

        $profileImg = null;
        if ($teacherProfile && !empty($teacherProfile->profile_image)) {
            $profileImg = $teacherProfile->profile_image;
        } elseif ($teacherUser && !empty($teacherUser->profile_image)) {
            $profileImg = $teacherUser->profile_image;
        }

        if ($profileImg && !filter_var($profileImg, FILTER_VALIDATE_URL)) {
            $cleanImg = preg_replace('/^\/?storage\//', '', ltrim($profileImg, '/'));
            $profileImg = asset('storage/' . $cleanImg);
        }

        $resolvedTeacherKey = $teacherProfile
            ? 'tch_' . $teacherProfile->id
            : ($teacherUser ? 'usr_' . $teacherUser->id : 'id_' . ($tid ?? 'default'));

        return [
            'id' => $teacherProfile->id ?? ($teacherUser->id ?? $tid),
            'user_id' => $teacherUser->id ?? ($teacherProfile->user_id ?? $tid),
            'teacher_key' => $resolvedTeacherKey,
            'name' => $teacherName,
            'full_name' => $teacherName,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $teacherProfile->email ?? ($teacherUser->email ?? ''),
            'profile_image' => $profileImg,
            'profile_image_url' => $profileImg,
            'specialization' => $teacherProfile->specialization ?? null,
        ];
    }

    /**
     * ✅ HELPER METHOD: គណនាឆ្នាំសិក្សា (1, 2, 3, 4) សម្រាប់មុខវិជ្ជានីមួយៗ
     * ការពារកុំឱ្យមុខវិជ្ជាឆ្នាំទី១ រំកិលទៅជាឆ្នាំទី២ នៅពេលសិស្សឡើងថ្នាក់ (ប្រើ MIN year នៃសិស្សដែលរៀនមុខវិជ្ជានោះ)
     */
    private function buildCourseYearsMap($deptCourses)
    {
        $courseYearsMap = [];
        $deptCourseIds = $deptCourses->keys()->toArray();
        if (empty($deptCourseIds)) {
            return $courseYearsMap;
        }

        $allStudents = Student::all(['id', 'user_id', 'batch_year', 'student_code', 'email', 'department_id']);
        $studentsById = $allStudents->keyBy('id');
        $studentsByUserId = $allStudents->whereNotNull('user_id')->keyBy('user_id');

        $enrollmentsInDept = Enrollment::whereIn('course_id', $deptCourseIds)
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', 'active')
                  ->orWhere('status', '');
            })
            ->get();

        if ($enrollmentsInDept->isEmpty()) {
            $enrollmentsInDept = Enrollment::whereIn('course_id', $deptCourseIds)->get();
        }

        $onlyMatchesStudentPK = false;
        foreach ($enrollmentsInDept as $enr) {
            $v = (int) $enr->student_id;
            if (isset($studentsById[$v]) && !isset($studentsByUserId[$v])) {
                $onlyMatchesStudentPK = true;
                break;
            }
        }

        $freqByCourse = [];
        foreach ($enrollmentsInDept as $enr) {
            $cid = (int) $enr->course_id;
            $val = (int) $enr->student_id;

            // ១. បើក្នុងតារាង enrollments មានកត់ត្រា academic_year ឬ year ផ្ទាល់ ឱ្យយកតម្លៃនោះមុនគេ
            $enrYear = $this->parseAcademicYearNumber(
                ($enr->year ?? '') . ' ' . ($enr->academic_year ?? '') . ' ' . ($enr->batch_year ?? '')
            );
            if ($enrYear) {
                $freqByCourse[$cid][$enrYear] = ($freqByCourse[$cid][$enrYear] ?? 0) + 1;
                continue;
            }

            // ២. បើគ្មានទេ ផ្គូផ្គងតាមសិស្ស (ឆែក users.id មុន students.id)
            $matchedStudent = null;
            if (!$onlyMatchesStudentPK && isset($studentsByUserId[$val])) {
                $matchedStudent = $studentsByUserId[$val];
            } elseif (isset($studentsById[$val])) {
                $matchedStudent = $studentsById[$val];
            } elseif (isset($studentsByUserId[$val])) {
                $matchedStudent = $studentsByUserId[$val];
            }

            if ($matchedStudent) {
                $y = $this->parseAcademicYearNumber(
                    $matchedStudent->batch_year ?? '',
                    ($matchedStudent->student_code ?? '') . ' ' . ($matchedStudent->email ?? '')
                );
                if ($y) {
                    $freqByCourse[$cid][$y] = ($freqByCourse[$cid][$y] ?? 0) + 1;
                }
            }
        }

        foreach ($deptCourses as $cid => $crs) {
            $intCid = (int) $cid;

            // ✅ អាទិភាពទី ១៖ បើមុខវិជ្ជាមានបញ្ជាក់ឆ្នាំក្នុងឈ្មោះ កូដមុខវិជ្ជា (ឧ. CS101, Y1) ឬឆមាស គឺយកឆ្នាំនោះជាគោលជានិច្ច
            $explicitCourseYear = $this->parseAcademicYearNumber(
                ($crs->year ?? '') . ' ' . ($crs->academic_year ?? '') . ' ' . ($crs->course_name ?? '') . ' ' . ($crs->description ?? ''),
                $crs->course_code ?? '',
                $crs->semester ?? null
            );

            if ($explicitCourseYear) {
                $courseYearsMap[$intCid] = [
                    'primary_year' => (int) $explicitCourseYear,
                    'years_list' => [(string) $explicitCourseYear],
                ];
            } elseif (!empty($freqByCourse[$intCid])) {
                // ✅ អាទិភាពទី ២៖ បើមុខវិជ្ជាមិនមានកូដឆ្នាំ យកឆ្នាំទាបបំផុត (min year) ជាឆ្នាំដើមនៃមុខវិជ្ជានោះ
                $yearsKeys = array_map('intval', array_keys($freqByCourse[$intCid]));
                $minOriginYear = min($yearsKeys);

                $allYears = array_map('strval', $yearsKeys);
                sort($allYears);

                $courseYearsMap[$intCid] = [
                    'primary_year' => (int) $minOriginYear,
                    'years_list' => array_values(array_unique($allYears)),
                ];
            } else {
                $courseYearsMap[$intCid] = [
                    'primary_year' => 1,
                    'years_list' => ['1'],
                ];
            }
        }

        return $courseYearsMap;
    }

    // Dashboard
    public function dashboard()
    {
        $student = auth()->user();
        $studentIds = $this->getStudentAllIds($student);

        $enrollments = Enrollment::whereIn('student_id', $studentIds)
            ->with(['course' => function ($query) {
                $query->with(['teacher', 'teacherProfile', 'department'])
                      ->withCount(['lessons', 'assignments', 'quizzes']);
            }])
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', 'active')
                  ->orWhere('status', '');
            })
            ->get();

        $stats = [
            'total_courses' => $enrollments->count(),
            'total_lessons' => 0,
            'total_assignments' => 0,
            'total_quizzes' => 0,
            'average_score' => 0,
        ];

        foreach ($enrollments as $enrollment) {
            if ($enrollment->course) {
                $teacherData = $this->formatTeacherData($enrollment->course);
                $enrollment->course->teacher_name = $teacherData['name'] ?? 'គ្រូបង្រៀន';
                $enrollment->course->setAttribute('teacher_profile', $teacherData);
            }
            $stats['total_lessons'] += $enrollment->course->lessons_count ?? 0;
            $stats['total_assignments'] += $enrollment->course->assignments_count ?? 0;
            $stats['total_quizzes'] += $enrollment->course->quizzes_count ?? 0;
        }

        $grades = Grade::whereIn('student_id', $studentIds)
            ->whereNotNull('final_score')
            ->get();

        if ($grades->count() > 0) {
            $stats['average_score'] = round($grades->avg('final_score'), 2);
        }

        return response()->json([
            'stats' => $stats,
            'enrollments' => $enrollments,
            'recent_activity' => $this->getRecentActivity($studentIds),
        ]);
    }

    private function getRecentActivity($studentIds)
    {
        $ids = is_array($studentIds) ? $studentIds : [$studentIds];

        $submissions = AssignmentSubmission::whereIn('student_id', $ids)
            ->with('assignment')
            ->orderBy('submitted_at', 'desc')
            ->limit(5)
            ->get();

        $attempts = QuizAttempt::whereIn('student_id', $ids)
            ->with('quiz')
            ->orderBy('submitted_at', 'desc')
            ->limit(5)
            ->get();

        return [
            'submissions' => $submissions,
            'quiz_attempts' => $attempts,
        ];
    }

    // ទាញយកបញ្ជីមុខវិជ្ជារបស់សិស្ស
    public function getCourses(Request $request)
    {
        $student = auth()->user();
        $studentIds = $this->getStudentAllIds($student);
        $studentProfile = $this->resolveStudentProfile($student);
        $perPage = max(1, min((int) $request->input('per_page', 12), 100));

        $enrolledCourseIds = Enrollment::whereIn('student_id', $studentIds)
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', 'active')
                  ->orWhere('status', '');
            })
            ->pluck('course_id')
            ->toArray();

        $deptId = $studentProfile->department_id ?? $student->department_id ?? null;

        $query = Course::with(['teacher', 'teacherProfile', 'department'])
            ->withCount(['lessons', 'assignments', 'quizzes']);

        if (!empty($enrolledCourseIds)) {
            $query->whereIn('id', $enrolledCourseIds);
        } elseif ($deptId) {
            $query->where('department_id', $deptId);
        }

        $formatCourse = function ($course) {
            $teacherData = $this->formatTeacherData($course);
            $teacherName = $teacherData['name'] ?? 'គ្រូបង្រៀន';

            return [
                'id' => $course->id,
                'course_id' => $course->id,
                'course_code' => $course->course_code,
                'course_name' => $course->course_name,
                'description' => $course->description,
                'credit' => $course->credit ?? 3,
                'semester' => $course->semester ?? null,
                'department_id' => $course->department_id,
                'department' => $course->department,
                'teacher_id' => $course->teacher_id,
                'teacher_name' => $teacherName,
                'teacher' => $teacherData,
                'teacher_profile' => $teacherData,
                'lessons_count' => (int) ($course->lessons_count ?? 0),
                'assignments_count' => (int) ($course->assignments_count ?? 0),
                'quizzes_count' => (int) ($course->quizzes_count ?? 0),
            ];
        };

        if ($request->boolean('all')) {
            $courses = $query->get()->map($formatCourse);
            return response()->json([
                'data' => $courses,
            ]);
        }

        $paginated = $query->paginate($perPage);
        $items = collect($paginated->items())->map($formatCourse);

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ]);
    }

    // View Attendance
    public function getAttendance(Request $request)
    {
        try {
            $student = auth()->user();
            $studentIds = $this->getStudentAllIds($student);
            $studentProfile = $this->resolveStudentProfile($student);
            $perPage = max(1, min((int) $request->input('per_page', 20), 100));

            $baseQuery = Attendance::whereIn('student_id', $studentIds);

            $summaryRaw = (clone $baseQuery)->selectRaw("
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent,
                SUM(CASE WHEN status = 'Permission' THEN 1 ELSE 0 END) as permission,
                SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late
            ")->first();

            $summary = [
                'present' => (int) ($summaryRaw->present ?? 0),
                'absent' => (int) ($summaryRaw->absent ?? 0),
                'permission' => (int) ($summaryRaw->permission ?? 0),
                'late' => (int) ($summaryRaw->late ?? 0),
            ];

            $paginated = (clone $baseQuery)
                ->with(['course.teacher', 'course.teacherProfile', 'student'])
                ->orderBy('attendance_date', 'desc')
                ->paginate($perPage);

            $formattedAttendance = collect($paginated->items())->map(function ($record) use ($studentProfile) {
                $teacherData = $this->formatTeacherData($record->course);

                $studentData = $record->student;
                if ($studentData && $studentProfile) {
                    $studentData->study_shift = $studentProfile->study_shift;
                    $studentData->student_code = $studentProfile->student_code;
                    $studentData->profile_image = $studentData->profile_image ?: $studentProfile->profile_image;
                }

                $courseData = $record->course;
                if ($courseData && $teacherData) {
                    $courseData->teacher_name = $teacherData['name'];
                    $courseData->setAttribute('teacher_profile', $teacherData);
                }

                return [
                    'id' => $record->id,
                    'course_id' => $record->course_id,
                    'student_id' => $record->student_id,
                    'attendance_date' => $record->attendance_date,
                    'status' => $record->status,
                    'late_time' => $record->late_time ?? null,
                    'created_at' => $record->created_at ? \Carbon\Carbon::parse($record->created_at)->format('Y-m-d H:i:s') : null,
                    'course' => $courseData,
                    'student' => $studentData
                ];
            });

            return response()->json([
                'attendance' => $formattedAttendance,
                'summary' => $summary,
                'meta' => [
                    'current_page' => $paginated->currentPage(),
                    'last_page' => $paginated->lastPage(),
                    'per_page' => $paginated->perPage(),
                    'total' => $paginated->total(),
                ]
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'error' => true,
                'message' => 'មូលហេតុដែលគាំង: ' . $e->getMessage()
            ], 500);
        }
    }

    public function getCourseAttendance($courseId)
    {
        $student = auth()->user();
        $studentIds = $this->getStudentAllIds($student);

        $attendance = Attendance::whereIn('student_id', $studentIds)
            ->where('course_id', $courseId)
            ->orderBy('attendance_date', 'desc')
            ->get();

        return response()->json($attendance);
    }

    // View Scores
    public function getScores()
    {
        $student = auth()->user();
        $studentIds = $this->getStudentAllIds($student);
        $studentProfile = $this->resolveStudentProfile($student);

        $enrolledCourseIds = Enrollment::whereIn('student_id', $studentIds)
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', 'active')
                  ->orWhere('status', '');
            })
            ->pluck('course_id');

        $coursesQuery = Course::with(['teacher', 'teacherProfile', 'department']);
        if ($enrolledCourseIds->isNotEmpty()) {
            $courses = $coursesQuery->whereIn('id', $enrolledCourseIds)->get();
        } elseif ($studentProfile && $studentProfile->department_id) {
            $courses = $coursesQuery->where('department_id', $studentProfile->department_id)->get();
        } else {
            $courses = $coursesQuery->get();
        }

        $grades = Grade::whereIn('student_id', $studentIds)->get()->keyBy('course_id');
        $courseIds = $courses->pluck('id');

        $allAssignments = Assignment::whereIn('course_id', $courseIds)->get()->groupBy('course_id');
        $allAssignmentIds = $allAssignments->flatten()->pluck('id');

        $allSubmissions = $allAssignmentIds->isNotEmpty()
            ? AssignmentSubmission::whereIn('assignment_id', $allAssignmentIds)
                ->whereIn('student_id', $studentIds)
                ->whereNotNull('score')
                ->get()
                ->groupBy('assignment_id')
            : collect();

        $allQuizzes = Quiz::whereIn('course_id', $courseIds)->get()->groupBy('course_id');
        $allQuizIds = $allQuizzes->flatten()->pluck('id');

        $allAttempts = $allQuizIds->isNotEmpty()
            ? QuizAttempt::whereIn('quiz_id', $allQuizIds)
                ->whereIn('student_id', $studentIds)
                ->whereNotNull('score')
                ->get()
                ->groupBy('quiz_id')
            : collect();

        $result = $courses->map(function ($course) use ($grades, $allAssignments, $allSubmissions, $allQuizzes, $allAttempts) {
            $grade = $grades->get($course->id);

            $assignments = $allAssignments->get($course->id, collect());
            $autoAssignmentScore = null;
            if ($assignments->isNotEmpty()) {
                $totalEarned = 0;
                $totalMax = 0;
                $hasGraded = false;

                foreach ($assignments as $assign) {
                    $submissions = $allSubmissions->get($assign->id, collect());
                    if ($submissions->isNotEmpty()) {
                        $subScore = $submissions->max('score');
                        $maxScore = $assign->total_score ?? 100;
                        if ($maxScore > 0) {
                            $totalEarned += $subScore;
                            $totalMax += $maxScore;
                            $hasGraded = true;
                        }
                    }
                }
                if ($hasGraded && $totalMax > 0) {
                    $autoAssignmentScore = round(($totalEarned / $totalMax) * 100, 2);
                }
            }

            $quizzes = $allQuizzes->get($course->id, collect());
            $autoQuizScore = null;
            if ($quizzes->isNotEmpty()) {
                $totalEarned = 0;
                $totalMax = 0;
                $hasAttempts = false;

                foreach ($quizzes as $quiz) {
                    $attempts = $allAttempts->get($quiz->id, collect());
                    if ($attempts->isNotEmpty()) {
                        $bestScore = $attempts->max('score');
                        $maxMark = $quiz->total_mark ?? 100;
                        if ($maxMark > 0) {
                            $totalEarned += $bestScore;
                            $totalMax += $maxMark;
                            $hasAttempts = true;
                        }
                    }
                }
                if ($hasAttempts && $totalMax > 0) {
                    $autoQuizScore = round(($totalEarned / $totalMax) * 100, 2);
                }
            }

            $assignScore = $grade && $grade->assignment_score !== null ? $grade->assignment_score : $autoAssignmentScore;
            $quizScore = $grade && $grade->quiz_score !== null ? $grade->quiz_score : $autoQuizScore;
            $midtermScore = $grade && $grade->midterm_score !== null ? $grade->midterm_score : null;
            $finalScore = $grade && $grade->final_score !== null ? $grade->final_score : null;

            if ($finalScore === null) {
                $a = $assignScore !== null ? (float) $assignScore : null;
                $q = $quizScore !== null ? (float) $quizScore : null;
                $m = $midtermScore !== null ? (float) $midtermScore : null;

                $weightedSum = 0;
                $weightTotal = 0;
                if ($a !== null) { $weightedSum += $a * 0.20; $weightTotal += 0.20; }
                if ($q !== null) { $weightedSum += $q * 0.20; $weightTotal += 0.20; }
                if ($m !== null) { $weightedSum += $m * 0.25; $weightTotal += 0.25; }

                if ($weightTotal > 0) {
                    $finalScore = round(($weightedSum / $weightTotal), 2);
                }
            }

            $gradeLetter = $grade && $grade->grade_letter ? $grade->grade_letter : null;
            if (!$gradeLetter && $finalScore !== null) {
                if ($finalScore >= 90) $gradeLetter = 'A';
                elseif ($finalScore >= 85) $gradeLetter = 'B+';
                elseif ($finalScore >= 80) $gradeLetter = 'B';
                elseif ($finalScore >= 70) $gradeLetter = 'C+';
                elseif ($finalScore >= 65) $gradeLetter = 'C';
                elseif ($finalScore >= 50) $gradeLetter = 'D';
                else $gradeLetter = 'F';
            }

            $teacherData = $this->formatTeacherData($course);

            return [
                'id' => $grade ? $grade->id : null,
                'course_id' => $course->id,
                'course' => [
                    'id' => $course->id,
                    'course_code' => $course->course_code,
                    'course_name' => $course->course_name,
                    'credit' => $course->credit,
                    'description' => $course->description,
                    'teacher_id' => $course->teacher_id,
                    'teacher_name' => $teacherData['name'] ?? 'គ្រូបង្រៀន',
                    'teacher' => $teacherData,
                    'teacher_profile' => $teacherData,
                    'department' => $course->department,
                ],
                'assignment_score' => $assignScore,
                'auto_assignment_score' => $autoAssignmentScore,
                'quiz_score' => $quizScore,
                'auto_quiz_score' => $autoQuizScore,
                'midterm_score' => $midtermScore,
                'final_score' => $finalScore,
                'grade_letter' => $gradeLetter,
            ];
        });

        return response()->json($result);
    }

    public function getCourseScores($courseId)
    {
        $student = auth()->user();
        $studentIds = $this->getStudentAllIds($student);

        $grade = Grade::with('course')
            ->whereIn('student_id', $studentIds)
            ->where('course_id', $courseId)
            ->first();

        return response()->json($grade);
    }

    // ✅ ទាញយកមេរៀនគ្រប់ឆ្នាំសិក្សា (ឆ្នាំទី ១-៤) ក្នុងដេប៉ាតឺម៉ង់របស់សិស្ស សម្រាប់មើលមេរៀនឆ្នាំមុនៗ (រំលឹកមេរៀន), ថ្នាក់បច្ចុប្បន្ន, និងរៀនទុកមុន
    public function getAllLessons(Request $request)
    {
        $student = auth()->user();
        $studentIds = $this->getStudentAllIds($student);
        $studentProfile = $this->resolveStudentProfile($student);

        // ១. មុខវិជ្ជាទាំងអស់ដែលសិស្សធ្លាប់បានចុះឈ្មោះរៀន (ទាំងឆ្នាំមុនៗ និងឆ្នាំបច្ចុប្បន្ន)
        $enrolledCourseIds = Enrollment::whereIn('student_id', $studentIds)
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', 'active')
                  ->orWhere('status', 'completed')
                  ->orWhere('status', '');
            })
            ->pluck('course_id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->toArray();

        // ២. កំណត់ដេប៉ាតឺម៉ង់របស់សិស្ស
        $deptId = $studentProfile->department_id ?? $student->department_id ?? null;
        if (!$deptId && !empty($enrolledCourseIds)) {
            $deptId = Course::whereIn('id', $enrolledCourseIds)
                ->whereNotNull('department_id')
                ->value('department_id');
        }

        // ៣. ទាញយកមុខវិជ្ជាទាំងអស់ក្នុងដេប៉ាតឺម៉ង់ (គ្រប់ឆ្នាំទី ១ ដល់ ទី ៤) + មុខវិជ្ជាដែលសិស្សធ្លាប់រៀនពីឆ្នាំមុនៗ
        $coursesQuery = Course::with(['teacher', 'teacherProfile', 'department']);
        if ($deptId) {
            $coursesQuery->where(function ($q) use ($deptId, $enrolledCourseIds) {
                $q->where('department_id', $deptId);
                if (!empty($enrolledCourseIds)) {
                    $q->orWhereIn('id', $enrolledCourseIds);
                }
            });
        } elseif (!empty($enrolledCourseIds)) {
            $coursesQuery->whereIn('id', $enrolledCourseIds);
        }

        $deptCourses = $coursesQuery->get()->keyBy('id');
        $deptCourseIds = $deptCourses->keys()->toArray();

        // ៤. គណនាលេខឆ្នាំសិក្សា (1, 2, 3, 4) សម្រាប់មុខវិជ្ជានីមួយៗ
        $courseYearsMap = $this->buildCourseYearsMap($deptCourses);

        // ✅ ៥. គណនាឆ្នាំសិក្សាបច្ចុប្បន្នរបស់សិស្សយ៉ាងឆ្លាតវៃ (ឆែក batch_year, student_code, email និងមុខវិជ្ជាខ្ពស់បំផុតដែលសិស្សកំពុងរៀន)
        $detectedYear = $this->parseAcademicYearNumber(
            ($studentProfile->year ?? '') . ' ' .
            ($studentProfile->academic_year ?? '') . ' ' .
            ($studentProfile->batch_year ?? '') . ' ' .
            ($student->year ?? '') . ' ' .
            ($student->batch_year ?? '') . ' ' .
            ($student->name ?? ''),
            ($studentProfile->student_code ?? '') . ' ' .
            ($student->student_code ?? '') . ' ' .
            ($student->email ?? '') . ' ' .
            ($studentProfile->email ?? '')
        );

        // បើក្នុង Profile មិនទាន់មានសរសេរឆ្នាំទី ៤ ទេ តែសិស្សនេះត្រូវបានចុះឈ្មោះរៀនក្នុងមុខវិជ្ជាឆ្នាំទី ៤ (ឬ ៣, ២) ឱ្យចាប់យកឆ្នាំខ្ពស់បំផុតដែលគាត់កំពុងរៀន!
        if (!$detectedYear && !empty($enrolledCourseIds)) {
            $enrolledYears = [];
            foreach ($enrolledCourseIds as $ecid) {
                if (!empty($courseYearsMap[$ecid]['primary_year'])) {
                    $enrolledYears[] = (int) $courseYearsMap[$ecid]['primary_year'];
                }
            }
            if (!empty($enrolledYears)) {
                $detectedYear = max($enrolledYears);
            }
        }

        $studentCurrentYear = $detectedYear ?? 1;

        // ៦. ទាញយកមេរៀនទាំងអស់ក្នុងដេប៉ាតឺម៉ង់
        $lessonsQuery = Lesson::with(['files', 'videos', 'course.teacher', 'course.teacherProfile', 'course.department'])
            ->orderBy('lesson_order', 'asc');

        if (!empty($deptCourseIds)) {
            $lessonsQuery->whereIn('course_id', $deptCourseIds);
        }

        $lessons = $lessonsQuery->get()->map(function ($lesson) use ($enrolledCourseIds, $studentProfile, $studentCurrentYear, $courseYearsMap, $deptCourses) {
            $cid = (int) $lesson->course_id;
            $course = $lesson->course ?? $deptCourses->get($cid);
            $isEnrolled = in_array($cid, $enrolledCourseIds, true);

            $yearInfo = $courseYearsMap[$cid] ?? null;
            $explicitCourseY = $this->parseAcademicYearNumber(
                ($course->course_name ?? '') . ' ' . ($course->description ?? '') . ' ' . ($lesson->title ?? ''),
                $course->course_code ?? '',
                $course->semester ?? null
            );

            $primaryYear = $explicitCourseY ?? ($yearInfo['primary_year'] ?? ($isEnrolled ? $studentCurrentYear : 1));
            $yearsList = $yearInfo['years_list'] ?? [(string) $primaryYear];

            $teacherData = $this->formatTeacherData($course);

            // កំណត់ប្រភេទមេរៀនធៀបនឹងឆ្នាំសិក្សាបច្ចុប្បន្នរបស់សិស្ស៖ 'past_review' | 'current_class' | 'learn_ahead'
            $studyStatus = 'current_class';
            if ((int) $primaryYear < (int) $studentCurrentYear) {
                $studyStatus = 'past_review';
            } elseif ((int) $primaryYear > (int) $studentCurrentYear || !$isEnrolled) {
                $studyStatus = 'learn_ahead';
            }

            return [
                'id' => $lesson->id,
                'course_id' => $cid,
                'title' => $lesson->title,
                'description' => $lesson->description,
                'lesson_order' => $lesson->lesson_order,
                'year' => (int) $primaryYear,
                'years_list' => $yearsList,
                'is_enrolled' => $isEnrolled,
                'study_status' => $studyStatus,
                'student_current_year' => (int) $studentCurrentYear,
                'student_study_shift' => $studentProfile->study_shift ?? 'Monday-Friday',
                'teacher' => $teacherData,
                'course' => $course ? [
                    'id' => $course->id,
                    'course_code' => $course->course_code,
                    'course_name' => $course->course_name,
                    'description' => $course->description,
                    'credit' => $course->credit ?? 3,
                    'semester' => $course->semester ?? null,
                    'year' => (int) $primaryYear,
                    'years_list' => $yearsList,
                    'is_enrolled' => $isEnrolled,
                    'study_status' => $studyStatus,
                    'department_id' => $course->department_id,
                    'department' => $course->department,
                    'teacher_id' => $course->teacher_id,
                    'teacher_name' => $teacherData['name'] ?? 'គ្រូបង្រៀន',
                    'teacher' => $teacherData,
                    'teacher_profile' => $teacherData,
                ] : null,
                'files' => $lesson->files ?? [],
                'videos' => $lesson->videos ?? [],
            ];
        });

        // ៧. បញ្ជូនបញ្ជីមុខវិជ្ជាទាំងអស់ក្នុងដេប៉ាតឺម៉ង់ទៅជាមួយ
        $formattedDeptCourses = $deptCourses->values()->map(function ($crs) use ($courseYearsMap, $enrolledCourseIds, $studentCurrentYear) {
            $cid = (int) $crs->id;
            $isEnrolled = in_array($cid, $enrolledCourseIds, true);
            $yearInfo = $courseYearsMap[$cid] ?? null;

            $explicitCourseY = $this->parseAcademicYearNumber(
                ($crs->course_name ?? '') . ' ' . ($crs->description ?? ''),
                $crs->course_code ?? '',
                $crs->semester ?? null
            );

            $primaryYear = (int) ($explicitCourseY ?? ($yearInfo['primary_year'] ?? ($isEnrolled ? $studentCurrentYear : 1)));
            $yearsList = $yearInfo['years_list'] ?? [(string) $primaryYear];

            $teacherData = $this->formatTeacherData($crs);

            $studyStatus = 'current_class';
            if ($primaryYear < (int) $studentCurrentYear) {
                $studyStatus = 'past_review';
            } elseif ($primaryYear > (int) $studentCurrentYear || !$isEnrolled) {
                $studyStatus = 'learn_ahead';
            }

            return [
                'id' => $cid,
                'course_id' => $cid,
                'course_code' => $crs->course_code,
                'course_name' => $crs->course_name,
                'description' => $crs->description,
                'credit' => $crs->credit ?? 3,
                'semester' => $crs->semester ?? null,
                'year' => $primaryYear,
                'years_list' => $yearsList,
                'is_enrolled' => $isEnrolled,
                'study_status' => $studyStatus,
                'department_id' => $crs->department_id,
                'department' => $crs->department,
                'teacher_id' => $crs->teacher_id,
                'teacher_name' => $teacherData['name'] ?? 'គ្រូបង្រៀន',
                'teacher' => $teacherData,
                'teacher_profile' => $teacherData,
            ];
        });

        return response()->json([
            'data' => $lessons,
            'department_courses' => $formattedDeptCourses,
            'student_current_year' => (int) $studentCurrentYear,
        ]);
    }

    // អានឯកសារមេរៀនជា Base64 សម្រាប់បើកអានផ្ទាល់ក្នុង Modal (PDF / Word / Excel / រូបភាព)
    public function readLessonFile(Request $request)
    {
        $path = ltrim((string) $request->query('path', ''), '/');
        $cleanPath = preg_replace('/^storage\//', '', $path);

        if (!$cleanPath || !Storage::disk('public')->exists($cleanPath)) {
            return response()->json(['message' => 'រកមិនឃើញឯកសារមេរៀននេះទេ'], 404);
        }

        $fileContent = Storage::disk('public')->get($cleanPath);
        $mimeType = Storage::disk('public')->mimeType($cleanPath) ?: 'application/octet-stream';

        return response()->json([
            'file_name' => basename($cleanPath),
            'mime_type' => $mimeType,
            'base64' => base64_encode($fileContent),
        ]);
    }

    // View Lessons by Course
    public function getCourseLessons($courseId)
    {
        $course = Course::with(['teacher', 'teacherProfile', 'department'])->find($courseId);
        $courseYearsMap = $course ? $this->buildCourseYearsMap(collect([$course->id => $course])) : [];
        $yearInfo = $courseYearsMap[(int) $courseId] ?? ['primary_year' => 1, 'years_list' => ['1']];

        $lessons = Lesson::with(['files', 'videos', 'course.teacher', 'course.teacherProfile', 'course.department'])
            ->where('course_id', $courseId)
            ->orderBy('lesson_order')
            ->get()
            ->map(function ($lesson) use ($yearInfo) {
                $lesson->year = (int) $yearInfo['primary_year'];
                $lesson->years_list = $yearInfo['years_list'];
                if ($lesson->course) {
                    $teacherData = $this->formatTeacherData($lesson->course);
                    $lesson->course->year = (int) $yearInfo['primary_year'];
                    $lesson->course->years_list = $yearInfo['years_list'];
                    $lesson->course->teacher_name = $teacherData['name'] ?? 'គ្រូបង្រៀន';
                    $lesson->course->setAttribute('teacher_profile', $teacherData);
                }
                return $lesson;
            });

        return response()->json($lessons);
    }

    // Upload Assignment
    public function uploadAssignment(Request $request)
    {
        $request->validate([
            'assignment_id' => 'required|exists:assignments,id',
            'file' => 'required|file|max:10240',
        ]);

        $student = auth()->user();
        $assignment = Assignment::findOrFail($request->assignment_id);

        if (now()->gt($assignment->due_date)) {
            return response()->json(['message' => 'Assignment submission deadline has passed'], 400);
        }

        $existing = AssignmentSubmission::where('assignment_id', $request->assignment_id)
            ->where('student_id', $student->id)
            ->first();

        if ($existing) {
            return response()->json(['message' => 'You have already submitted this assignment'], 400);
        }

        $file = $request->file('file');
        $filePath = $file->store('assignment_submissions', 'public');

        $submission = AssignmentSubmission::create([
            'assignment_id' => $request->assignment_id,
            'student_id' => $student->id,
            'file_path' => $filePath,
            'original_filename' => $file->getClientOriginalName(),
            'submitted_at' => now(),
        ]);

        return response()->json([
            'submission' => $submission,
            'message' => 'Assignment submitted successfully'
        ], 201);
    }

    // Upload Homework/File
    public function uploadHomework(Request $request)
    {
        $request->validate([
            'course_id' => 'required|exists:courses,id',
            'title' => 'required|string|max:255',
            'file' => 'required|file|max:10240',
            'description' => 'nullable|string',
        ]);

        $student = auth()->user();

        if (!$this->getActiveEnrollment($student->id, $request->course_id)) {
            return response()->json(['message' => 'You are not enrolled in this course'], 403);
        }

        $file = $request->file('file');
        $filePath = $file->store('homework_submissions', 'public');

        return response()->json([
            'file_path' => $filePath,
            'message' => 'Homework uploaded successfully'
        ]);
    }

    // Upload Video
    public function uploadVideo(Request $request)
    {
        $request->validate([
            'course_id' => 'required|exists:courses,id',
            'title' => 'required|string|max:255',
            'video' => 'required|file|mimes:mp4,mov,avi,wmv|max:204800',
            'description' => 'nullable|string',
        ]);

        $student = auth()->user();

        if (!$this->getActiveEnrollment($student->id, $request->course_id)) {
            return response()->json(['message' => 'You are not enrolled in this course'], 403);
        }

        $video = $request->file('video');
        $filePath = $video->store('student_videos', 'public');

        return response()->json([
            'video_path' => $filePath,
            'message' => 'Video uploaded successfully'
        ]);
    }

    // Quiz/Exam: ចាប់ផ្តើម ឬបន្តការធ្វើតេស្ត
    public function getQuiz($quizId)
    {
        $student = auth()->user();

        $quiz = Quiz::with(['course', 'questions.options'])->findOrFail($quizId);

        $attempt = QuizAttempt::where('quiz_id', $quizId)
            ->where('student_id', $student->id)
            ->first();

        if ($attempt && $attempt->submitted_at) {
            return response()->json(['message' => 'អ្នកបានបញ្ចប់ការប្រឡងកម្រងសំណួរនេះរួចរាល់ហើយ'], 400);
        }

        $durationInSeconds = max(1, (int) ($quiz->duration ?? 30)) * 60;

        if ($attempt) {
            $startedTimestamp = \Carbon\Carbon::parse($attempt->started_at)->getTimestamp();
            $elapsedSeconds = now()->getTimestamp() - $startedTimestamp;
            $timeLeft = $durationInSeconds - $elapsedSeconds;

            if ($timeLeft <= 0) {
                $attempt->update([
                    'score' => $attempt->score ?? 0,
                    'submitted_at' => now(),
                ]);
                return response()->json(['message' => 'អស់ម៉ោងប្រឡងហើយ! ប្រព័ន្ធបានបញ្ជូនចម្លើយដោយស្វ័យប្រវត្តិ។'], 400);
            }
        } else {
            if ($quiz->start_date && now()->lt(\Carbon\Carbon::parse($quiz->start_date))) {
                return response()->json(['message' => 'កម្រងសំណួរនេះមិនទាន់ដល់ម៉ោងបើកប្រឡងនៅឡើយទេ'], 400);
            }

            if ($quiz->end_date && now()->gt(\Carbon\Carbon::parse($quiz->end_date))) {
                return response()->json(['message' => 'កម្រងសំណួរនេះបានផុតកំណត់ម៉ោងប្រឡងហើយ'], 400);
            }

            $attempt = QuizAttempt::create([
                'quiz_id' => $quizId,
                'student_id' => $student->id,
                'started_at' => now(),
            ]);
            $timeLeft = $durationInSeconds;
        }

        return response()->json([
            'quiz' => $quiz,
            'attempt' => $attempt,
            'time_left' => (int) $timeLeft,
        ]);
    }

    // បញ្ជូនចម្លើយប្រឡង និងគណនាពិន្ទុដោយស្វ័យប្រវត្តិ
    public function submitQuiz(Request $request, $quizId)
    {
        $request->validate([
            'answers' => 'nullable|array',
            'answers.*.question_id' => 'required|exists:questions,id',
            'answers.*.selected_option' => 'required|integer',
        ]);

        $student = auth()->user();
        $quiz = Quiz::with('questions.options')->findOrFail($quizId);

        $attempt = QuizAttempt::where('quiz_id', $quizId)
            ->where('student_id', $student->id)
            ->whereNull('submitted_at')
            ->first();

        if (!$attempt) {
            return response()->json(['message' => 'រកមិនឃើញការប្រឡងដែលកំពុងដំណើរការទេ ឬអ្នកបានបញ្ជូនរួចហើយ'], 400);
        }

        $answers = $request->input('answers', []);
        $answersByQuestionId = collect($answers)->keyBy('question_id');

        $score = 0;
        $calculatedTotalMarks = 0;

        foreach ($quiz->questions as $question) {
            $qMark = (float) ($question->mark ?? 1);
            $calculatedTotalMarks += $qMark;

            $studentAnswer = $answersByQuestionId->get($question->id);
            if (!$studentAnswer) {
                continue;
            }

            $correctOption = $question->options->first(function ($opt) {
                return (bool) $opt->is_correct === true || (int) $opt->is_correct === 1;
            });

            if ($correctOption && (int) $correctOption->id === (int) $studentAnswer['selected_option']) {
                $score += $qMark;
            }
        }

        $finalTotalMarks = $calculatedTotalMarks > 0
            ? $calculatedTotalMarks
            : (float) ($quiz->total_mark ?? 100);

        $attempt->update([
            'score' => $score,
            'submitted_at' => now(),
        ]);

        if ($finalTotalMarks > 0 && $quiz->course_id) {
            $quizPercent = round(($score / $finalTotalMarks) * 100, 2);
            Grade::updateOrCreate(
                [
                    'student_id' => $student->id,
                    'course_id' => $quiz->course_id,
                ],
                [
                    'quiz_score' => $quizPercent,
                ]
            );
        }

        return response()->json([
            'attempt' => $attempt,
            'score' => $score,
            'total_marks' => $finalTotalMarks,
            'message' => 'បានបញ្ជូនចម្លើយប្រឡងដោយជោគជ័យ'
        ]);
    }

    // ទាញយកកិច្ចការសិស្ស
    public function getAllAssignments(Request $request)
    {
        $student = auth()->user();
        $studentIds = $this->getStudentAllIds($student);
        $studentProfile = $this->resolveStudentProfile($student);
        $perPage = max(1, min((int) $request->input('per_page', 15), 100));

        $enrolledCourseIds = Enrollment::whereIn('student_id', $studentIds)
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', 'active')
                  ->orWhere('status', '');
            })
            ->pluck('course_id')
            ->toArray();

        $deptId = $studentProfile->department_id ?? $student->department_id ?? null;

        $query = Assignment::with(['course.teacher', 'course.teacherProfile', 'course.department'])
            ->orderBy('due_date', 'asc');

        if ($request->filled('course_id') && $request->course_id !== 'all') {
            $query->where('course_id', $request->course_id);
        } elseif (!empty($enrolledCourseIds)) {
            $query->whereIn('course_id', $enrolledCourseIds);
        } elseif ($deptId) {
            $query->whereHas('course', function ($q) use ($deptId) {
                $q->where('department_id', $deptId);
            });
        }

        $paginated = $query->paginate($perPage);
        $assignmentIds = collect($paginated->items())->pluck('id');

        $submissions = AssignmentSubmission::whereIn('student_id', $studentIds)
            ->whereIn('assignment_id', $assignmentIds)
            ->get()
            ->keyBy('assignment_id');

        $items = collect($paginated->items())->map(function ($assignment) use ($submissions) {
            $submission = $submissions->get($assignment->id);
            if ($assignment->course) {
                $teacherData = $this->formatTeacherData($assignment->course);
                $assignment->course->teacher_name = $teacherData['name'] ?? 'គ្រូបង្រៀន';
                $assignment->course->setAttribute('teacher_profile', $teacherData);
            }

            return [
                'id' => $assignment->id,
                'course_id' => $assignment->course_id,
                'title' => $assignment->title,
                'description' => $assignment->description,
                'due_date' => $assignment->due_date,
                'marks' => $assignment->marks ?? $assignment->total_score ?? 100,
                'total_score' => $assignment->total_score ?? $assignment->marks ?? 100,
                'course' => $assignment->course,
                'submission' => $submission ? [
                    'id' => $submission->id,
                    'file_path' => $submission->file_path,
                    'submitted_at' => $submission->submitted_at,
                    'score' => $submission->score,
                    'feedback' => $submission->feedback,
                ] : null
            ];
        });

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ]
        ]);
    }

    // ទាញយកកម្រងសំណួរប្រឡង
    public function getAllQuizzes(Request $request)
    {
        $student = auth()->user();
        $studentIds = $this->getStudentAllIds($student);
        $studentProfile = $this->resolveStudentProfile($student);
        $perPage = max(1, min((int) $request->input('per_page', 15), 100));

        $enrolledCourseIds = Enrollment::whereIn('student_id', $studentIds)
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', 'active')
                  ->orWhere('status', '');
            })
            ->pluck('course_id')
            ->toArray();

        $deptId = $studentProfile->department_id ?? $student->department_id ?? null;

        $query = Quiz::with(['course.teacher', 'course.teacherProfile', 'course.department'])
            ->withSum('questions as questions_total_mark', 'mark')
            ->orderBy('start_date', 'asc');

        if ($request->filled('course_id') && $request->course_id !== 'all') {
            $query->where('course_id', $request->course_id);
        } elseif (!empty($enrolledCourseIds)) {
            $query->whereIn('course_id', $enrolledCourseIds);
        } elseif ($deptId) {
            $query->whereHas('course', function ($q) use ($deptId) {
                $q->where('department_id', $deptId);
            });
        }

        $paginated = $query->paginate($perPage);
        $quizIds = collect($paginated->items())->pluck('id');

        $attempts = QuizAttempt::whereIn('student_id', $studentIds)
            ->whereIn('quiz_id', $quizIds)
            ->get()
            ->keyBy('quiz_id');

        $items = collect($paginated->items())->map(function ($quiz) use ($attempts) {
            $attempt = $attempts->get($quiz->id);
            $resolvedTotalMark = $quiz->total_mark ?? $quiz->questions_total_mark ?? 100;

            if ($quiz->course) {
                $teacherData = $this->formatTeacherData($quiz->course);
                $quiz->course->teacher_name = $teacherData['name'] ?? 'គ្រូបង្រៀន';
                $quiz->course->setAttribute('teacher_profile', $teacherData);
            }

            return [
                'id' => $quiz->id,
                'course_id' => $quiz->course_id,
                'title' => $quiz->title,
                'description' => $quiz->description,
                'duration' => $quiz->duration ?? 30,
                'total_mark' => $resolvedTotalMark,
                'start_date' => $quiz->start_date,
                'end_date' => $quiz->end_date,
                'course' => $quiz->course,
                'attempt' => $attempt ? [
                    'id' => $attempt->id,
                    'score' => $attempt->score,
                    'started_at' => $attempt->started_at,
                    'submitted_at' => $attempt->submitted_at,
                ] : null
            ];
        });

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ]
        ]);
    }
}
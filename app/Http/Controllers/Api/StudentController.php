<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Assignment;
use App\Models\AssignmentSubmission;
use App\Models\Attendance;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Grade;
use App\Models\Lesson;
use App\Models\Question;
use App\Models\Quiz;
use App\Models\QuizAttempt;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class StudentController extends Controller
{
    /**
     * ✅ រក្សាទុក Profile និងបញ្ជី ID របស់សិស្សក្នុង Request Memory ដើម្បីកុំឱ្យរត់ Query ស្ទួនៗក្នុង Request តែមួយ
     */
    private ?Student $cachedStudentProfile = null;
    private bool $studentProfileResolved = false;
    private ?array $cachedStudentIds = null;

    /**
     * ✅ HELPER: សម្អាត Cache របស់ផ្ទាំងសិស្សនៅពេលសិស្សប្រគល់កិច្ចការ ឬធ្វើតេស្តចប់
     */
    private function clearStudentDashboardCache(): void
    {
        $uid = auth()->id();
        if ($uid) {
            Cache::forget("student_dashboard_v2_{$uid}");
        }
    }

    /**
     * ✅ HELPER: ជួរឈរសុវត្ថិភាពសម្រាប់តារាង lesson_files (មិនទាញជួរឈរ file_data Base64 ធំៗដាច់ខាត)
     */
    private function safeLessonFileColumns(): array
    {
        $cols = ['id', 'lesson_id', 'file_name', 'file_path', 'file_type', 'created_at', 'updated_at'];
        if (Schema::hasColumn('lesson_files', 'mime_type')) {
            $cols[] = 'mime_type';
        }
        return $cols;
    }

    /**
     * ✅ HELPER: ជួរឈរសុវត្ថិភាពសម្រាប់តារាង assignment_submissions (មិនទាញជួរឈរ file_data Base64 ធំៗដាច់ខាត)
     */
    private function safeSubmissionColumns(): array
    {
        return [
            'id',
            'assignment_id',
            'student_id',
            'file_path',
            'submitted_at',
            'score',
            'feedback',
            'created_at',
            'updated_at',
        ];
    }

    /**
     * ✅ HELPER METHOD: ទាញយក Profile សិស្សឱ្យជាក់លាក់ (តែ ១ ដងគត់ក្នុង ១ Request)
     */
    private function resolveStudentProfile($user = null): ?Student
    {
        $user = $user ?: auth()->user();
        if (!$user) {
            return null;
        }

        if ($this->studentProfileResolved) {
            return $this->cachedStudentProfile;
        }

        if ($user->relationLoaded('student') && $user->student) {
            $this->cachedStudentProfile = $user->student;
            $this->studentProfileResolved = true;
            return $this->cachedStudentProfile;
        }

        $profile = Student::where('user_id', $user->id)->first();
        if (!$profile && !empty($user->email)) {
            $profile = Student::where('email', $user->email)->first();
        }

        $this->cachedStudentProfile = $profile;
        $this->studentProfileResolved = true;

        return $this->cachedStudentProfile;
    }

    /**
     * HELPER METHOD: ទាញយកបញ្ជី ID ទាំងអស់របស់សិស្សម្នាក់ (ទាំង users.id និង students.id)
     */
    private function getStudentAllIds($user = null): array
    {
        $user = $user ?: auth()->user();
        if (!$user) {
            return [];
        }

        if ($this->cachedStudentIds !== null) {
            return $this->cachedStudentIds;
        }

        $studentProfile = $this->resolveStudentProfile($user);
        $this->cachedStudentIds = array_values(array_unique(array_filter([
            (int) $user->id,
            $studentProfile ? (int) $studentProfile->id : null,
            ($studentProfile && $studentProfile->user_id) ? (int) $studentProfile->user_id : null,
        ])));

        return $this->cachedStudentIds;
    }

    /**
     * HELPER METHOD: Check if the authenticated student is actively enrolled in a course.
     */
    private function getActiveEnrollment($studentId, $courseId)
    {
        $studentIds = is_array($studentId) ? $studentId : $this->getStudentAllIds(auth()->user());
        if (empty($studentIds) && $studentId) {
            $studentIds = [(int) $studentId];
        }

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

        $cleanCode = trim((string) $code);
        if (preg_match('/[A-Za-z]+[-_\s]*([1-4])\d{2}\b/', $cleanCode, $matches)) {
            return (int) $matches[1];
        }
        if (preg_match('/y([1-4])/i', $cleanCode, $matches)) {
            return (int) $matches[1];
        }

        if (preg_match('/\b(202[0-9])\b/', (string) $text, $yrMatch)) {
            $startYear = (int) $yrMatch[1];
            $currentYear = (int) date('Y');
            $diff = $currentYear - $startYear + 1;
            if ($diff >= 1 && $diff <= 4) {
                return $diff;
            }
        }

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
     * HELPER METHOD: រៀបចំទម្រង់ព័ត៌មានគ្រូបង្រៀនឱ្យត្រឹមត្រូវ ១០០% ដោយមិនស្ទួនទិន្នន័យរូបភាពធំៗ
     */
    private function formatTeacherData($course, bool $includeAvatar = true)
    {
        if (!$course) {
            return null;
        }

        static $teachersById = [];
        static $teachersByUserId = [];
        static $teacherUsersById = [];

        $tid = $course->teacher_id;
        $teacherProfile = $course->relationLoaded('teacherProfile') ? $course->teacherProfile : null;
        $teacherUser = $course->relationLoaded('teacher') ? $course->teacher : null;

        if (!$teacherProfile && $tid) {
            if (!array_key_exists($tid, $teachersById) && !array_key_exists($tid, $teachersByUserId)) {
                $foundTch = Teacher::where('id', $tid)->orWhere('user_id', $tid)->first();
                if ($foundTch) {
                    $teachersById[$foundTch->id] = $foundTch;
                    if ($foundTch->user_id) {
                        $teachersByUserId[$foundTch->user_id] = $foundTch;
                    }
                } else {
                    $teachersById[$tid] = null;
                }
            }
            $teacherProfile = $teachersByUserId[$tid] ?? ($teachersById[$tid] ?? null);
        }

        if (!$teacherUser && $tid) {
            $lookupUid = ($teacherProfile && $teacherProfile->user_id) ? $teacherProfile->user_id : $tid;
            if (!array_key_exists($lookupUid, $teacherUsersById)) {
                $teacherUsersById[$lookupUid] = User::select('id', 'first_name', 'last_name', 'email', 'profile_image')
                    ->find($lookupUid);
            }
            $teacherUser = $teacherUsersById[$lookupUid];
        }

        $firstName = $teacherProfile->first_name ?? ($teacherUser->first_name ?? '');
        $lastName = $teacherProfile->last_name ?? ($teacherUser->last_name ?? '');
        $teacherName = trim($firstName . ' ' . $lastName);

        if (empty($teacherName)) {
            $teacherName = $teacherUser->name ?? ($teacherProfile->name ?? ($teacherUser->email ?? 'គ្រូបង្រៀន'));
        }

        $profileImg = null;
        if ($includeAvatar) {
            if ($teacherProfile && !empty($teacherProfile->profile_image)) {
                $profileImg = trim((string) $teacherProfile->profile_image);
            } elseif ($teacherUser && !empty($teacherUser->profile_image)) {
                $profileImg = trim((string) $teacherUser->profile_image);
            }

            if (
                $profileImg &&
                !str_starts_with($profileImg, 'data:') &&
                !str_starts_with($profileImg, 'http://') &&
                !str_starts_with($profileImg, 'https://') &&
                !str_starts_with($profileImg, '//')
            ) {
                $cleanImg = preg_replace('/^\/?storage\//', '', ltrim($profileImg, '/'));
                $profileImg = asset('storage/' . $cleanImg);
            }
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
            // ✅ ដាក់តែក្នុង profile_image ១ កន្លែងគត់ (មិនដាក់ស្ទួនក្នុង profile_image_url ឱ្យទំហំរូបភាពកើនទ្វេដងទេ)
            'profile_image' => $profileImg,
            'specialization' => $teacherProfile->specialization ?? null,
        ];
    }

    /**
     * ✅ HELPER: ភ្ជាប់ព័ត៌មានគ្រូបង្រៀនទៅលើ Course Model ដោយមិនឱ្យស្ទួនរូបភាព Base64 ៣-៤ កន្លែង
     */
    private function attachCleanTeacherToCourse($course, bool $includeAvatar = true): ?array
    {
        if (!$course) {
            return null;
        }
        $teacherData = $this->formatTeacherData($course, $includeAvatar);
        $course->unsetRelation('teacher');
        $course->unsetRelation('teacherProfile');
        $course->teacher_name = $teacherData['name'] ?? 'គ្រូបង្រៀន';
        $course->setAttribute('teacher_profile', $teacherData);
        return $teacherData;
    }

    /**
     * ✅ HELPER METHOD: គណនាឆ្នាំសិក្សា (1, 2, 3, 4) សម្រាប់មុខវិជ្ជានីមួយៗ
     */
    private function buildCourseYearsMap($deptCourses)
    {
        $courseYearsMap = [];
        $deptCourseIds = $deptCourses->keys()->toArray();
        if (empty($deptCourseIds)) {
            return $courseYearsMap;
        }

        $enrollmentsInDept = Enrollment::whereIn('course_id', $deptCourseIds)
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', 'active')
                  ->orWhere('status', '');
            })
            ->get(['course_id', 'student_id']);

        if ($enrollmentsInDept->isEmpty()) {
            $enrollmentsInDept = Enrollment::whereIn('course_id', $deptCourseIds)
                ->get(['course_id', 'student_id']);
        }

        $rawStudentIds = $enrollmentsInDept->pluck('student_id')
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        // ✅ ទាញតែសិស្សណាដែលពាក់ព័ន្ធនឹងមុខវិជ្ជាក្នុងដេប៉ាតឺម៉ង់នេះប៉ុណ្ណោះ (មិនប្រើ Student::all() ទាញសិស្សទូទាំងសាលាទេ)
        $matchedStudents = !empty($rawStudentIds)
            ? Student::select('id', 'user_id', 'batch_year', 'student_code', 'email', 'department_id')
                ->whereIn('id', $rawStudentIds)
                ->orWhereIn('user_id', $rawStudentIds)
                ->get()
            : collect();

        $studentsById = $matchedStudents->keyBy('id');
        $studentsByUserId = $matchedStudents->whereNotNull('user_id')->keyBy('user_id');

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
        $userId = $student->id ?? 0;
        $cacheKey = "student_dashboard_v2_{$userId}";

        // ✅ ប្រើ Cache ៤៥ វិនាទី សម្រាប់ផ្ទាំង Student Dashboard ដើម្បីឱ្យបើកភ្លាមលឿនដូចហោះលើ Online
        $payload = Cache::remember($cacheKey, 45, function () use ($student) {
            $studentIds = $this->getStudentAllIds($student);

            $enrollments = Enrollment::whereIn('student_id', $studentIds)
                ->with(['course' => function ($query) {
                    $query->with([
                        'teacher:id,first_name,last_name,email',
                        'teacherProfile:id,user_id,first_name,last_name,email,specialization',
                        'department:id,department_name,department_code',
                    ])->withCount(['lessons', 'assignments', 'quizzes']);
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
                    // លើ Dashboard មិនបង្ហាញរូបថតគ្រូទេ ដូច្នេះដាក់ $includeAvatar = false ដើម្បីឱ្យ JSON ស្រាលបំផុត
                    $this->attachCleanTeacherToCourse($enrollment->course, false);
                }
                $stats['total_lessons'] += $enrollment->course->lessons_count ?? 0;
                $stats['total_assignments'] += $enrollment->course->assignments_count ?? 0;
                $stats['total_quizzes'] += $enrollment->course->quizzes_count ?? 0;
            }

            $avgFinal = Grade::whereIn('student_id', $studentIds)
                ->whereNotNull('final_score')
                ->avg('final_score');

            if ($avgFinal !== null) {
                $stats['average_score'] = round((float) $avgFinal, 2);
            }

            return [
                'stats' => $stats,
                'enrollments' => $enrollments,
                'recent_activity' => $this->getRecentActivity($studentIds),
            ];
        });

        return response()->json($payload);
    }

    private function getRecentActivity($studentIds)
    {
        $ids = is_array($studentIds) ? $studentIds : [$studentIds];

        // ✅ សំខាន់បំផុត៖ ប្រើ select() មិនទាញជួរឈរ file_data (Base64 រាប់មេកាបៃ) ដាច់ខាត!
        $submissions = AssignmentSubmission::select($this->safeSubmissionColumns())
            ->whereIn('student_id', $ids)
            ->with('assignment:id,course_id,title,due_date,total_score')
            ->orderBy('submitted_at', 'desc')
            ->limit(5)
            ->get();

        $attempts = QuizAttempt::select('id', 'quiz_id', 'student_id', 'score', 'started_at', 'submitted_at')
            ->whereIn('student_id', $ids)
            ->with('quiz:id,course_id,title,duration,total_mark,start_date,end_date')
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

        $query = Course::with([
            'teacher:id,first_name,last_name,email,profile_image',
            'teacherProfile:id,user_id,first_name,last_name,email,specialization,profile_image',
            'department:id,department_name,department_code',
        ])->withCount(['lessons', 'assignments', 'quizzes']);

        if (!empty($enrolledCourseIds)) {
            $query->whereIn('id', $enrolledCourseIds);
        } elseif ($deptId) {
            $query->where('department_id', $deptId);
        }

        // បើហៅពី Dropdown (?all=true) មិនបាច់ភ្ជាប់រូបថតគ្រូ Base64 ធំៗទៅជាមួយទេ
        $includeAvatar = !$request->boolean('all');

        $formatCourse = function ($course) use ($includeAvatar) {
            $teacherData = $this->formatTeacherData($course, $includeAvatar);
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
                // ✅ ដាក់តែក្នុង teacher_profile (និងដាក់ teacher ដោយមិនស្ទួនរូបភាព Base64 ២ ដង)
                'teacher_profile' => $teacherData,
                'teacher' => $teacherData ? array_merge($teacherData, ['profile_image' => null]) : null,
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
                SUM(CASE WHEN LOWER(status) = 'present' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN LOWER(status) = 'absent' THEN 1 ELSE 0 END) as absent,
                SUM(CASE WHEN LOWER(status) = 'permission' THEN 1 ELSE 0 END) as permission,
                SUM(CASE WHEN LOWER(status) = 'late' THEN 1 ELSE 0 END) as late
            ")->first();

            $summary = [
                'present' => (int) ($summaryRaw->present ?? 0),
                'absent' => (int) ($summaryRaw->absent ?? 0),
                'permission' => (int) ($summaryRaw->permission ?? 0),
                'late' => (int) ($summaryRaw->late ?? 0),
            ];

            $paginated = (clone $baseQuery)
                ->with([
                    'course.teacher:id,first_name,last_name,email,profile_image',
                    'course.teacherProfile:id,user_id,first_name,last_name,email,specialization,profile_image',
                ])
                ->orderBy('attendance_date', 'desc')
                ->paginate($perPage);

            // ✅ កត់ចំណាំមុខវិជ្ជាដែលបានបញ្ជូនរូបថតគ្រូរួចហើយ ដើម្បីកុំឱ្យដាក់រូបថត Base64 គ្រូដដែលៗស្ទួន ២០ ដងក្នុង ២០ ជួរវត្តមាន!
            $sentAvatarForCourse = [];

            $formattedAttendance = collect($paginated->items())->map(function ($record) use ($studentProfile, &$sentAvatarForCourse) {
                $cid = (int) $record->course_id;
                $includeAvatar = !isset($sentAvatarForCourse[$cid]);
                $sentAvatarForCourse[$cid] = true;

                $courseData = $record->course ? clone $record->course : null;
                if ($courseData) {
                    $this->attachCleanTeacherToCourse($courseData, $includeAvatar);
                }

                return [
                    'id' => $record->id,
                    'course_id' => $record->course_id,
                    'student_id' => $record->student_id,
                    'attendance_date' => $record->attendance_date,
                    'status' => $record->status,
                    'late_time' => $record->late_time ?? null,
                    'study_shift' => $studentProfile->study_shift ?? 'Monday-Friday',
                    'created_at' => $record->created_at ? Carbon::parse($record->created_at)->format('Y-m-d H:i:s') : null,
                    'course' => $courseData,
                    'student' => [
                        'id' => $record->student_id,
                        'study_shift' => $studentProfile->study_shift ?? 'Monday-Friday',
                        'student_code' => $studentProfile->student_code ?? null,
                    ],
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
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => true,
                'message' => 'មូលហេតុដែលគាំង: ' . $e->getMessage(),
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

    // View Scores (គាំទ្រទាំង ៤ ផ្នែក៖ កិច្ចការ 20%, សំណួរខ្លី 20%, ពាក់កណ្ដាលឆមាស 25%, និងប្រឡងបញ្ចប់ 35%)
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

        $coursesQuery = Course::with([
            'teacher:id,first_name,last_name,email,profile_image',
            'teacherProfile:id,user_id,first_name,last_name,email,specialization,profile_image',
            'department:id,department_name,department_code',
        ]);
        if ($enrolledCourseIds->isNotEmpty()) {
            $courses = $coursesQuery->whereIn('id', $enrolledCourseIds)->get();
        } elseif ($studentProfile && $studentProfile->department_id) {
            $courses = $coursesQuery->where('department_id', $studentProfile->department_id)->get();
        } else {
            $courses = $coursesQuery->get();
        }

        $grades = Grade::whereIn('student_id', $studentIds)->get()->keyBy('course_id');
        $courseIds = $courses->pluck('id');

        // ✅ ទាញតែជួរឈរ id, course_id, និងពិន្ទុប៉ុណ្ណោះ (មិនទាញ file_data Base64 ធំៗឡើយ!)
        $allAssignments = Assignment::select('id', 'course_id', 'total_score')
            ->whereIn('course_id', $courseIds)
            ->get()
            ->groupBy('course_id');
        $allAssignmentIds = $allAssignments->flatten()->pluck('id');

        $allSubmissions = $allAssignmentIds->isNotEmpty()
            ? AssignmentSubmission::select('id', 'assignment_id', 'student_id', 'score')
                ->whereIn('assignment_id', $allAssignmentIds)
                ->whereIn('student_id', $studentIds)
                ->whereNotNull('score')
                ->get()
                ->groupBy('assignment_id')
            : collect();

        $allQuizzes = Quiz::select('id', 'course_id', 'total_mark')
            ->whereIn('course_id', $courseIds)
            ->get()
            ->groupBy('course_id');
        $allQuizIds = $allQuizzes->flatten()->pluck('id');

        $allAttempts = $allQuizIds->isNotEmpty()
            ? QuizAttempt::select('id', 'quiz_id', 'student_id', 'score')
                ->whereIn('quiz_id', $allQuizIds)
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
                        $maxScore = $assign->total_score ?? 20;
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
                        $maxMark = $quiz->total_mark ?? 20;
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
            $examScore = $grade && isset($grade->exam_score) && $grade->exam_score !== null ? $grade->exam_score : null;
            $finalScore = $grade && $grade->final_score !== null ? $grade->final_score : null;

            if ($finalScore === null) {
                $a = $assignScore !== null ? (float) $assignScore : null;
                $q = $quizScore !== null ? (float) $quizScore : null;
                $m = $midtermScore !== null ? (float) $midtermScore : null;
                $e = $examScore !== null ? (float) $examScore : null;

                $weightedSum = 0;
                $weightTotal = 0;
                if ($a !== null) { $weightedSum += $a * 0.20; $weightTotal += 0.20; }
                if ($q !== null) { $weightedSum += $q * 0.20; $weightTotal += 0.20; }
                if ($m !== null) { $weightedSum += $m * 0.25; $weightTotal += 0.25; }
                if ($e !== null) { $weightedSum += $e * 0.35; $weightTotal += 0.35; }

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

            $teacherData = $this->formatTeacherData($course, true);

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
                    'teacher_profile' => $teacherData,
                    'teacher' => $teacherData ? array_merge($teacherData, ['profile_image' => null]) : null,
                    'department' => $course->department,
                ],
                'assignment_score' => $assignScore,
                'auto_assignment_score' => $autoAssignmentScore,
                'quiz_score' => $quizScore,
                'auto_quiz_score' => $autoQuizScore,
                'midterm_score' => $midtermScore,
                'exam_score' => $examScore,
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

    // ✅ ទាញយកមេរៀនគ្រប់ឆ្នាំសិក្សា (ឆ្នាំទី ១-៤) ក្នុងដេប៉ាតឺម៉ង់របស់សិស្ស
    public function getAllLessons(Request $request)
    {
        $student = auth()->user();
        $studentIds = $this->getStudentAllIds($student);
        $studentProfile = $this->resolveStudentProfile($student);

        $enrolledCourseIds = Enrollment::whereIn('student_id', $studentIds)
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', 'active')
                  ->orWhere('status', 'completed')
                  ->orWhere('status', '');
            })
            ->pluck('course_id')
            ->map(fn ($id) => (int) $id)
            ->toArray();

        $deptId = $studentProfile->department_id ?? $student->department_id ?? null;
        if (!$deptId && !empty($enrolledCourseIds)) {
            $deptId = Course::whereIn('id', $enrolledCourseIds)
                ->whereNotNull('department_id')
                ->value('department_id');
        }

        $coursesQuery = Course::with([
            'teacher:id,first_name,last_name,email,profile_image',
            'teacherProfile:id,user_id,first_name,last_name,email,specialization,profile_image',
            'department:id,department_name,department_code',
        ]);
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

        $courseYearsMap = $this->buildCourseYearsMap($deptCourses);

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

        // ✅ សំខាន់បំផុត៖ ប្រើ safeLessonFileColumns() មិនទាញជួរឈរ file_data (Base64 រាប់សិបមេកាបៃ) មកជាមួយបញ្ជីមេរៀនដាច់ខាត!
        $safeFileCols = $this->safeLessonFileColumns();
        $lessonsQuery = Lesson::with([
            'files' => function ($q) use ($safeFileCols) {
                $q->select($safeFileCols);
            },
            'videos:id,lesson_id,title,video_url,duration,created_at,updated_at',
        ])->orderBy('lesson_order', 'asc');

        if (!empty($deptCourseIds)) {
            $lessonsQuery->whereIn('course_id', $deptCourseIds);
        }

        $lessons = $lessonsQuery->get()->map(function ($lesson) use ($enrolledCourseIds, $studentProfile, $studentCurrentYear, $courseYearsMap, $deptCourses) {
            $cid = (int) $lesson->course_id;
            $course = $deptCourses->get($cid) ?? $lesson->course;
            $isEnrolled = in_array($cid, $enrolledCourseIds, true);

            $yearInfo = $courseYearsMap[$cid] ?? null;
            $explicitCourseY = $this->parseAcademicYearNumber(
                ($course->course_name ?? '') . ' ' . ($course->description ?? '') . ' ' . ($lesson->title ?? ''),
                $course->course_code ?? '',
                $course->semester ?? null
            );

            $primaryYear = $explicitCourseY ?? ($yearInfo['primary_year'] ?? ($isEnrolled ? $studentCurrentYear : 1));
            $yearsList = $yearInfo['years_list'] ?? [(string) $primaryYear];

            // នៅក្នុងមេរៀននីមួយៗ មិនបាច់ដាក់រូបថតគ្រូ Base64 ស្ទួនគ្រប់មេរៀនទេ (ព្រោះមាននៅក្នុង department_courses រួចហើយ)
            $teacherSlim = $this->formatTeacherData($course, false);

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
                'teacher' => $teacherSlim,
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
                    'teacher_name' => $teacherSlim['name'] ?? 'គ្រូបង្រៀន',
                    'teacher_profile' => $teacherSlim,
                ] : null,
                'files' => $lesson->files ?? [],
                'videos' => $lesson->videos ?? [],
            ];
        });

        // ៧. បញ្ជូនបញ្ជីមុខវិជ្ជាទាំងអស់ក្នុងដេប៉ាតឺម៉ង់ទៅជាមួយ (ភ្ជាប់រូបថតគ្រូតែ ១ ដងគត់ក្នុង ១ មុខវិជ្ជា)
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

            $teacherData = $this->formatTeacherData($crs, true);

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
                'teacher_profile' => $teacherData,
                'teacher' => $teacherData ? array_merge($teacherData, ['profile_image' => null]) : null,
            ];
        });

        return response()->json([
            'data' => $lessons,
            'department_courses' => $formattedDeptCourses,
            'student_current_year' => (int) $studentCurrentYear,
        ]);
    }

    // ✅ អានឯកសារមេរៀនជា Base64 (គាំទ្រទាំងការអានពី Disk និងការអានពី Database លើ Railway)
    public function readLessonFile(Request $request)
    {
        $path = trim((string) $request->query('path', ''));
        if (!$path) {
            return response()->json(['message' => 'រកមិនឃើញឯកសារមេរៀននេះទេ'], 404);
        }

        if (str_starts_with($path, 'data:')) {
            if (preg_match('/^data:([^;]+);base64,(.+)$/s', $path, $matches)) {
                return response()->json([
                    'file_name' => 'lesson-file',
                    'mime_type' => $matches[1] ?: 'application/octet-stream',
                    'base64' => $matches[2],
                ]);
            }
        }

        $cleanPath = preg_replace('/^storage\//', '', ltrim($path, '/'));

        if ($cleanPath && Storage::disk('public')->exists($cleanPath)) {
            $fileContent = Storage::disk('public')->get($cleanPath);
            $mimeType = Storage::disk('public')->mimeType($cleanPath) ?: 'application/octet-stream';

            return response()->json([
                'file_name' => basename($cleanPath),
                'mime_type' => $mimeType,
                'base64' => base64_encode($fileContent),
            ]);
        }

        if (Schema::hasTable('lesson_files')) {
            $dbFile = DB::table('lesson_files')
                ->where('file_path', $cleanPath)
                ->orWhere('file_path', 'storage/' . $cleanPath)
                ->orWhere('file_path', '/storage/' . $cleanPath)
                ->first();

            if ($dbFile) {
                $rawContent = $dbFile->file_data ?? $dbFile->base64_data ?? $dbFile->file_content ?? null;
                if ($rawContent) {
                    if (str_starts_with($rawContent, 'data:') && preg_match('/^data:([^;]+);base64,(.+)$/s', $rawContent, $m)) {
                        return response()->json([
                            'file_name' => $dbFile->file_name ?? basename($cleanPath),
                            'mime_type' => $m[1] ?: ($dbFile->mime_type ?? 'application/octet-stream'),
                            'base64' => $m[2],
                        ]);
                    }
                    return response()->json([
                        'file_name' => $dbFile->file_name ?? basename($cleanPath),
                        'mime_type' => $dbFile->mime_type ?? 'application/octet-stream',
                        'base64' => $rawContent,
                    ]);
                }
            }
        }

        return response()->json(['message' => 'រកមិនឃើញឯកសារមេរៀននេះទេ'], 404);
    }

    // View Lessons by Course
    public function getCourseLessons($courseId)
    {
        $course = Course::with([
            'teacher:id,first_name,last_name,email,profile_image',
            'teacherProfile:id,user_id,first_name,last_name,email,specialization,profile_image',
            'department:id,department_name,department_code',
        ])->find($courseId);
        $courseYearsMap = $course ? $this->buildCourseYearsMap(collect([$course->id => $course])) : [];
        $yearInfo = $courseYearsMap[(int) $courseId] ?? ['primary_year' => 1, 'years_list' => ['1']];

        $safeFileCols = $this->safeLessonFileColumns();

        $lessons = Lesson::with([
            'files' => function ($q) use ($safeFileCols) {
                $q->select($safeFileCols);
            },
            'videos:id,lesson_id,title,video_url,duration,created_at,updated_at',
            'course.teacher:id,first_name,last_name,email,profile_image',
            'course.teacherProfile:id,user_id,first_name,last_name,email,specialization,profile_image',
            'course.department:id,department_name,department_code',
        ])
            ->where('course_id', $courseId)
            ->orderBy('lesson_order')
            ->get()
            ->map(function ($lesson, $idx) use ($yearInfo) {
                $lesson->year = (int) $yearInfo['primary_year'];
                $lesson->years_list = $yearInfo['years_list'];
                if ($lesson->course) {
                    $this->attachCleanTeacherToCourse($lesson->course, $idx === 0);
                    $lesson->course->year = (int) $yearInfo['primary_year'];
                    $lesson->course->years_list = $yearInfo['years_list'];
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
        $studentIds = $this->getStudentAllIds($student);
        $assignment = Assignment::findOrFail($request->assignment_id);

        if ($assignment->due_date && now()->gt(Carbon::parse($assignment->due_date))) {
            return response()->json(['message' => 'ផុតកំណត់ថ្ងៃទទួលកិច្ចការនេះហើយ!'], 400);
        }

        $existing = AssignmentSubmission::select('id')
            ->where('assignment_id', $request->assignment_id)
            ->whereIn('student_id', $studentIds)
            ->first();

        if ($existing) {
            return response()->json(['message' => 'អ្នកបានប្រគល់កិច្ចការនេះរួចរាល់ហើយ!'], 400);
        }

        $file = $request->file('file');
        $filePath = $file->store('assignment_submissions', 'public');

        $submissionData = [
            'assignment_id' => $request->assignment_id,
            'student_id' => $student->id,
            'file_path' => $filePath,
            'original_filename' => $file->getClientOriginalName(),
            'submitted_at' => now(),
        ];

        if (Schema::hasColumn('assignment_submissions', 'file_data')) {
            $mime = $file->getMimeType() ?: 'application/octet-stream';
            $submissionData['file_data'] = 'data:' . $mime . ';base64,' . base64_encode(file_get_contents($file->getRealPath()));
        }

        $submission = AssignmentSubmission::create($submissionData);

        // ✅ លាក់ file_data ពេលបញ្ជូនត្រឡប់ទៅឱ្យ React វិញ ដើម្បីឱ្យការ Upload ចប់ភ្លាមៗដោយមិនទាញទិន្នន័យធំមកវិញ
        $submission->makeHidden(['file_data']);

        $this->clearStudentDashboardCache();

        return response()->json([
            'submission' => $submission,
            'file_path' => $filePath,
            'message' => 'បានប្រគល់កិច្ចការសិក្សាដោយជោគជ័យ',
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
            'message' => 'Homework uploaded successfully',
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
            'message' => 'Video uploaded successfully',
        ]);
    }

    // Quiz/Exam: ចាប់ផ្តើម ឬបន្តការធ្វើតេស្ត
    public function getQuiz($quizId)
    {
        $student = auth()->user();
        $studentIds = $this->getStudentAllIds($student);

        $quiz = Quiz::with([
            'course:id,course_code,course_name,department_id,teacher_id',
            'questions:id,quiz_id,question_text,question_type,mark',
            'questions.options:id,question_id,option_text,is_correct',
        ])->findOrFail($quizId);

        $attempt = QuizAttempt::where('quiz_id', $quizId)
            ->whereIn('student_id', $studentIds)
            ->first();

        if ($attempt && $attempt->submitted_at) {
            return response()->json(['message' => 'អ្នកបានបញ្ចប់ការប្រឡងកម្រងសំណួរនេះរួចរាល់ហើយ'], 400);
        }

        $durationInSeconds = max(1, (int) ($quiz->duration ?? 30)) * 60;

        if ($attempt) {
            $startedTimestamp = Carbon::parse($attempt->started_at)->getTimestamp();
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
            if ($quiz->start_date && now()->lt(Carbon::parse($quiz->start_date))) {
                return response()->json(['message' => 'កម្រងសំណួរនេះមិនទាន់ដល់ម៉ោងបើកប្រឡងនៅឡើយទេ'], 400);
            }

            if ($quiz->end_date && now()->gt(Carbon::parse($quiz->end_date)->endOfDay())) {
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
        $studentIds = $this->getStudentAllIds($student);
        $quiz = Quiz::with('questions.options')->findOrFail($quizId);

        $attempt = QuizAttempt::where('quiz_id', $quizId)
            ->whereIn('student_id', $studentIds)
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
            : (float) ($quiz->total_mark ?? 20);

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

        $this->clearStudentDashboardCache();

        return response()->json([
            'attempt' => $attempt,
            'score' => $score,
            'total_marks' => $finalTotalMarks,
            'message' => 'បានបញ្ជូនចម្លើយប្រឡងដោយជោគជ័យ',
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

        // នៅក្នុង StudentAssignments.jsx មិនបង្ហាញរូបថតគ្រូបង្រៀនទេ ដូច្នេះមិនបាច់ទាញ profile_image ធំៗរបស់គ្រូមកជាមួយឡើយ
        $query = Assignment::with([
            'course.teacher:id,first_name,last_name,email',
            'course.teacherProfile:id,user_id,first_name,last_name,email,specialization',
            'course.department:id,department_name,department_code',
        ])->orderBy('due_date', 'asc');

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

        // ✅ សំខាន់បំផុត៖ ប្រើ select($this->safeSubmissionColumns()) មិនទាញជួរឈរ file_data (Base64 រាប់មេកាបៃ) ដាច់ខាត!
        $submissions = $assignmentIds->isNotEmpty()
            ? AssignmentSubmission::select($this->safeSubmissionColumns())
                ->whereIn('student_id', $studentIds)
                ->whereIn('assignment_id', $assignmentIds)
                ->get()
                ->keyBy('assignment_id')
            : collect();

        $items = collect($paginated->items())->map(function ($assignment) use ($submissions) {
            $submission = $submissions->get($assignment->id);
            $courseData = $assignment->course ? clone $assignment->course : null;
            if ($courseData) {
                $this->attachCleanTeacherToCourse($courseData, false);
            }

            return [
                'id' => $assignment->id,
                'course_id' => $assignment->course_id,
                'title' => $assignment->title,
                'description' => $assignment->description,
                'due_date' => $assignment->due_date,
                'marks' => $assignment->marks ?? $assignment->total_score ?? 20,
                'total_score' => $assignment->total_score ?? $assignment->marks ?? 20,
                'course' => $courseData,
                'submission' => $submission ? [
                    'id' => $submission->id,
                    'file_path' => $submission->file_path,
                    'submitted_at' => $submission->submitted_at,
                    'score' => $submission->score,
                    'feedback' => $submission->feedback,
                ] : null,
            ];
        });

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

        // នៅក្នុង StudentQuizzes.jsx មិនបង្ហាញរូបថតគ្រូបង្រៀនទេ ដូច្នេះមិនបាច់ទាញ profile_image ធំៗរបស់គ្រូមកជាមួយឡើយ
        $query = Quiz::with([
            'course.teacher:id,first_name,last_name,email',
            'course.teacherProfile:id,user_id,first_name,last_name,email,specialization',
            'course.department:id,department_name,department_code',
        ])
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

        $attempts = $quizIds->isNotEmpty()
            ? QuizAttempt::select('id', 'quiz_id', 'student_id', 'score', 'started_at', 'submitted_at')
                ->whereIn('student_id', $studentIds)
                ->whereIn('quiz_id', $quizIds)
                ->get()
                ->keyBy('quiz_id')
            : collect();

        $items = collect($paginated->items())->map(function ($quiz) use ($attempts) {
            $attempt = $attempts->get($quiz->id);
            $resolvedTotalMark = $quiz->total_mark ?? $quiz->questions_total_mark ?? 20;

            $courseData = $quiz->course ? clone $quiz->course : null;
            if ($courseData) {
                $this->attachCleanTeacherToCourse($courseData, false);
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
                'course' => $courseData,
                'attempt' => $attempt ? [
                    'id' => $attempt->id,
                    'score' => $attempt->score,
                    'started_at' => $attempt->started_at,
                    'submitted_at' => $attempt->submitted_at,
                ] : null,
            ];
        });

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
}
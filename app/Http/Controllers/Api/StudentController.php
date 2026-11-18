<?php
// app/Http/Controllers/Api/StudentController.php

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
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class StudentController extends Controller
{
    private ?Student $cachedProfile = null;
    private bool $profileResolved = false;
    private ?array $cachedStudentIds = null;
    private array $preloadedTeachersById = [];
    private array $preloadedTeachersByUserId = [];
    private array $preloadedUsersById = [];
    private array $optimizedAvatarMemo = [];

    /**
     * ✅ កំណត់ជួរឈរសម្រាប់តារាង lesson_files ដោយប្រើ Cache (0ms) និងមិនទាញយក file_data (Base64 ធំៗ) មកក្នុង RAM
     */
    private function getSafeLessonFileColumns(): array
    {
        return Cache::remember('lms_std_safe_lesson_file_cols_v2', 86400, function () {
            $cols = ['id', 'lesson_id', 'file_name', 'file_path', 'file_type', 'created_at', 'updated_at'];
            try {
                if (Schema::hasTable('lesson_files') && Schema::hasColumn('lesson_files', 'mime_type')) {
                    $cols[] = 'mime_type';
                }
            } catch (\Throwable $e) {
            }
            return $cols;
        });
    }

    /**
     * ✅ ឆែកជួរឈរ mark ក្នុងតារាង questions ដោយប្រើ Cache (មិនរត់ Query ឆែក Schema រាល់ពេល)
     */
    private function hasQuestionsMarkColumn(): bool
    {
        return (bool) Cache::remember('lms_std_questions_has_mark_col_v1', 86400, function () {
            try {
                return Schema::hasTable('questions') && Schema::hasColumn('questions', 'mark');
            } catch (\Throwable $e) {
                return false;
            }
        });
    }

    /**
     * ✅ សម្អាត Cache របស់សិស្សម្នាក់នេះនៅពេលគាត់ប្រគល់កិច្ចការ ឬប្រឡងចប់
     */
    private function clearStudentDashboardCache(): void
    {
        $uid = auth()->id();
        if ($uid) {
            Cache::forget("student_dashboard_fast_v3_{$uid}");
            Cache::forget("student_dashboard_fast_v4_{$uid}");
            Cache::forget("student_dashboard_fast_v5_{$uid}");
        }
    }

    /**
     * ✅ ទាញយក Profile សិស្សតែ ១ ដងគត់ក្នុង ១ Request និងភ្ជាប់ user_id ដោយស្វ័យប្រវត្តិបើខ្វះ
     */
    private function resolveStudentProfile($user = null): ?Student
    {
        $user = $user ?: auth()->user();
        if (!$user) {
            return null;
        }
        if ($this->profileResolved) {
            return $this->cachedProfile;
        }

        $profile = Student::where('user_id', $user->id)->first();

        if (!$profile && !empty($user->email)) {
            $profile = Student::whereRaw('LOWER(TRIM(email)) = ?', [strtolower(trim($user->email))])->first();
        }

        if (!$profile && !empty($user->first_name) && !empty($user->last_name)) {
            $profile = Student::whereRaw('LOWER(TRIM(first_name)) = ? AND LOWER(TRIM(last_name)) = ?', [
                strtolower(trim($user->first_name)),
                strtolower(trim($user->last_name)),
            ])->first();
        }

        if ($profile && empty($profile->user_id)) {
            try {
                $profile->user_id = $user->id;
                $profile->saveQuietly();
            } catch (\Throwable $e) {
            }
        }

        $this->cachedProfile = $profile;
        $this->profileResolved = true;
        return $profile;
    }

    /**
     * ✅ ទាញយកបញ្ជី ID ទាំងអស់របស់សិស្សម្នាក់ (គាំទ្រទាំងករណី Admin ចុះឈ្មោះតាម users.id ឬ students.id)
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
     * ✅ ទាញយកបញ្ជី course_id ដែលសិស្សបានចុះឈ្មោះ
     */
    private function getEnrolledCourseIdsForStudent($user = null): array
    {
        $studentIds = $this->getStudentAllIds($user);
        if (empty($studentIds)) {
            return [];
        }

        try {
            $courseIds = Enrollment::whereIn('student_id', $studentIds)
                ->pluck('course_id')
                ->filter()
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values()
                ->toArray();

            return $courseIds;
        } catch (\Throwable $e) {
            Log::warning('Enrollment lookup error: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * ✅ ស្វែងរក department_id របស់សិស្សដោយស្វ័យប្រវត្តិ (ពី Profile, User, ឬមុខវិជ្ជាដែលធ្លាប់រៀន)
     */
    private function resolveStudentDepartmentId($user = null, array $enrolledCourseIds = []): ?int
    {
        $user = $user ?: auth()->user();
        $studentProfile = $this->resolveStudentProfile($user);

        $deptId = $studentProfile->department_id ?? $user->department_id ?? null;
        if ($deptId) {
            return (int) $deptId;
        }

        if (!empty($enrolledCourseIds)) {
            $fromEnrolled = Course::whereIn('id', $enrolledCourseIds)
                ->whereNotNull('department_id')
                ->value('department_id');
            if ($fromEnrolled) {
                return (int) $fromEnrolled;
            }
        }

        $studentIds = $this->getStudentAllIds($user);
        if (!empty($studentIds)) {
            $gradeCourseId = Grade::whereIn('student_id', $studentIds)->value('course_id')
                ?: Attendance::whereIn('student_id', $studentIds)->value('course_id');

            if ($gradeCourseId) {
                $fromCourse = Course::where('id', $gradeCourseId)->value('department_id');
                if ($fromCourse) {
                    return (int) $fromCourse;
                }
            }
        }

        return null;
    }

    private function getActiveEnrollment($studentId, $courseId)
    {
        $studentIds = is_array($studentId) ? $studentId : $this->getStudentAllIds(auth()->user());
        if (empty($studentIds) && $studentId) {
            $studentIds = [(int) $studentId];
        }

        return Enrollment::whereIn('student_id', $studentIds)
            ->where('course_id', $courseId)
            ->first();
    }

    /**
     * ✅ ទាញយកព័ត៌មានគ្រូបង្រៀនទាំងអស់ក្នុង Query តែ ១ ដង (ដោយកំណត់ select ជួរឈរចាំបាច់ មិនទាញរូបភាពស្ទួនពីតារាង users បើក្នុង teachers មានរួចហើយ)
     */
    private function preloadTeachersForCourses($courses): void
    {
        try {
            $collection = collect($courses)->filter();
            if ($collection->isEmpty()) {
                return;
            }

            $teacherIds = $collection->pluck('teacher_id')
                ->filter()
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values()
                ->all();

            if (empty($teacherIds)) {
                return;
            }

            $teachers = DB::table('teachers')
                ->select([
                    'id', 'user_id', 'teacher_code', 'first_name', 'last_name',
                    'email', 'specialization', 'profile_image',
                ])
                ->whereIn('id', $teacherIds)
                ->orWhereIn('user_id', $teacherIds)
                ->get();

            foreach ($teachers as $t) {
                $this->preloadedTeachersById[(int) $t->id] = $t;
                if (!empty($t->user_id)) {
                    $this->preloadedTeachersByUserId[(int) $t->user_id] = $t;
                }
            }

            $allUserIds = $teachers->pluck('user_id')
                ->merge($teacherIds)
                ->filter()
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values()
                ->all();

            if (!empty($allUserIds)) {
                $users = DB::table('users')
                    ->select(['id', 'first_name', 'last_name', 'email', 'profile_image'])
                    ->whereIn('id', $allUserIds)
                    ->get();

                foreach ($users as $u) {
                    $this->preloadedUsersById[(int) $u->id] = $u;
                }
            }
        } catch (\Throwable $e) {
            Log::warning('preloadTeachersForCourses error: ' . $e->getMessage());
        }
    }

    /**
     * ✅ បង្រួមរូបថតគ្រូបង្រៀនមកទំហំតូចល្មម (96x96px ~4KB Base64) និងទុកក្នុង Cache ដើម្បីឱ្យបង្ហាញលើអេក្រង់សិស្សក្នុង 0ms
     */
    private function optimizeTeacherAvatarFast(?string $rawImage, string $teacherCacheKey): ?string
    {
        if (!$rawImage) {
            return null;
        }

        $trimmed = trim($rawImage);
        if ($trimmed === '') {
            return null;
        }

        if (isset($this->optimizedAvatarMemo[$teacherCacheKey])) {
            return $this->optimizedAvatarMemo[$teacherCacheKey];
        }

        $cacheKey = 'std_fast_tch_avatar_v2_' . $teacherCacheKey . '_' . md5(substr($trimmed, 0, 120) . strlen($trimmed));

        $optimized = Cache::remember($cacheKey, 86400, function () use ($trimmed) {
            $binaryData = null;
            $mimeType = 'image/jpeg';

            if (str_starts_with($trimmed, 'data:image')) {
                if (strlen($trimmed) <= 18000) {
                    return $trimmed;
                }
                if (preg_match('/^data:([^;]+);base64,(.+)$/s', $trimmed, $m)) {
                    $mimeType = $m[1] ?: 'image/jpeg';
                    $binaryData = base64_decode(preg_replace('/\s+/', '', $m[2]));
                }
            } elseif (!str_starts_with($trimmed, 'http://') && !str_starts_with($trimmed, 'https://') && !str_starts_with($trimmed, '//')) {
                $cleanImg = preg_replace('/^\/?storage\//', '', ltrim($trimmed, '/'));
                if ($cleanImg && Storage::disk('public')->exists($cleanImg)) {
                    $binaryData = Storage::disk('public')->get($cleanImg);
                    $mimeType = Storage::disk('public')->mimeType($cleanImg) ?: 'image/jpeg';
                } else {
                    return asset('storage/' . $cleanImg);
                }
            } else {
                return $trimmed;
            }

            if (!$binaryData) {
                return $trimmed;
            }

            if (function_exists('imagecreatefromstring') && function_exists('imagesx')) {
                try {
                    $srcImg = @imagecreatefromstring($binaryData);
                    if ($srcImg !== false) {
                        $w = imagesx($srcImg);
                        $h = imagesy($srcImg);
                        $maxDim = 96;

                        if ($w > $maxDim || $h > $maxDim) {
                            if ($w > $h) {
                                $newW = $maxDim;
                                $newH = max(1, (int) round(($h * $maxDim) / $w));
                            } else {
                                $newH = $maxDim;
                                $newW = max(1, (int) round(($w * $maxDim) / $h));
                            }
                        } else {
                            $newW = $w;
                            $newH = $h;
                        }

                        $dstImg = imagecreatetruecolor($newW, $newH);
                        imagealphablending($dstImg, false);
                        imagesavealpha($dstImg, true);
                        $transparent = imagecolorallocatealpha($dstImg, 255, 255, 255, 127);
                        imagefilledrectangle($dstImg, 0, 0, $newW, $newH, $transparent);
                        imagecopyresampled($dstImg, $srcImg, 0, 0, 0, 0, $newW, $newH, $w, $h);

                        ob_start();
                        if (function_exists('imagewebp')) {
                            imagewebp($dstImg, null, 78);
                            $outMime = 'image/webp';
                        } else {
                            imagejpeg($dstImg, null, 80);
                            $outMime = 'image/jpeg';
                        }
                        $compressedBytes = ob_get_clean();

                        imagedestroy($srcImg);
                        imagedestroy($dstImg);

                        if ($compressedBytes && strlen($compressedBytes) < strlen($binaryData)) {
                            return 'data:' . $outMime . ';base64,' . base64_encode($compressedBytes);
                        }
                    }
                } catch (\Throwable $e) {
                }
            }

            return 'data:' . $mimeType . ';base64,' . base64_encode($binaryData);
        });

        $this->optimizedAvatarMemo[$teacherCacheKey] = $optimized;
        return $optimized;
    }

    /**
     * ✅ ស្រង់យកលេខឆ្នាំសិក្សា (1, 2, 3, 4)
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
     * ✅ រៀបចំទម្រង់ព័ត៌មានគ្រូបង្រៀនដោយប្រើ Preloaded Map និងរូបថតគ្រូដែលបានបង្រួមស្រាប់ (0ms Instant Avatar)
     */
    private function formatTeacherData($course, bool $includeAvatar = true)
    {
        if (!$course) {
            return null;
        }

        $tid = $course->teacher_id ? (int) $course->teacher_id : null;
        if ($tid && !isset($this->preloadedTeachersById[$tid]) && !isset($this->preloadedTeachersByUserId[$tid]) && !isset($this->preloadedUsersById[$tid])) {
            $this->preloadTeachersForCourses([$course]);
        }

        $teacherProfile = $tid ? ($this->preloadedTeachersById[$tid] ?? $this->preloadedTeachersByUserId[$tid] ?? null) : null;
        $userIdToLookup = !empty($teacherProfile?->user_id) ? (int) $teacherProfile->user_id : $tid;
        $teacherUser = $userIdToLookup ? ($this->preloadedUsersById[$userIdToLookup] ?? null) : null;

        if (!$teacherUser && $course instanceof \Illuminate\Database\Eloquent\Model && $course->relationLoaded('teacher')) {
            $teacherUser = $course->teacher;
        }

        $firstName = trim((string) ($teacherProfile->first_name ?? ($teacherUser->first_name ?? '')));
        $lastName = trim((string) ($teacherProfile->last_name ?? ($teacherUser->last_name ?? '')));
        $teacherName = trim($firstName . ' ' . $lastName);

        if (empty($teacherName)) {
            $teacherName = $teacherUser->name ?? ($teacherProfile->name ?? ($teacherProfile->email ?? ($teacherUser->email ?? 'គ្រូបង្រៀន')));
        }

        $resolvedTeacherKey = $teacherProfile
            ? 'tch_' . $teacherProfile->id
            : ($teacherUser ? 'usr_' . $teacherUser->id : 'id_' . ($tid ?? 'default'));

        $profileImg = null;
        if ($includeAvatar) {
            $rawImg = null;
            if ($teacherProfile && !empty($teacherProfile->profile_image)) {
                $rawImg = trim((string) $teacherProfile->profile_image);
            } elseif ($teacherUser && !empty($teacherUser->profile_image)) {
                $rawImg = trim((string) $teacherUser->profile_image);
            }

            if ($rawImg) {
                $profileImg = $this->optimizeTeacherAvatarFast($rawImg, $resolvedTeacherKey);
            }
        }

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
     * ✅ គណនាឆ្នាំសិក្សា (1, 2, 3, 4) សម្រាប់មុខវិជ្ជានីមួយៗ (ដោយមិនទាញរូបភាព Base64 របស់សិស្សចូល RAM ដាច់ខាត!)
     */
    private function buildCourseYearsMap($deptCourses)
    {
        $deptCourseIds = $deptCourses->keys()->map(fn ($id) => (int) $id)->sort()->values()->toArray();
        if (empty($deptCourseIds)) {
            return [];
        }

        $cacheKey = 'dept_courses_years_map_v6_' . md5(implode('_', $deptCourseIds));

        return Cache::remember($cacheKey, 180, function () use ($deptCourses, $deptCourseIds) {
            $courseYearsMap = [];

            try {
                $enrollmentsInDept = Enrollment::whereIn('course_id', $deptCourseIds)
                    ->get(['course_id', 'student_id']);

                $rawStudentIds = $enrollmentsInDept->pluck('student_id')
                    ->filter()
                    ->map(fn ($id) => (int) $id)
                    ->unique()
                    ->values()
                    ->all();

                // ✅ សំខាន់បំផុត៖ ទាញតែ 5 ជួរឈរស្រាលៗប៉ុណ្ណោះ (មិនទាញ profile_image Base64 របស់សិស្សរាប់ពាន់នាក់ចូល RAM ទេ!)
                $matchedStudents = !empty($rawStudentIds)
                    ? Student::select('id', 'user_id', 'batch_year', 'student_code', 'email')
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
            } catch (\Throwable $e) {
                $freqByCourse = [];
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
        });
    }

 // Dashboard
    public function dashboard()
    {
        try {
            $student = auth()->user();
            $studentIds = $this->getStudentAllIds($student);

            $enrollments = Enrollment::whereIn('student_id', $studentIds)
                ->with(['course' => function ($query) {
                    $query->with(['department'])
                        ->withCount(['lessons', 'assignments', 'quizzes']);
                }])
                ->get();

            if ($enrollments->isEmpty()) {
                $deptId = $this->resolveStudentDepartmentId($student);
                $deptCoursesQuery = Course::with(['department'])
                    ->withCount(['lessons', 'assignments', 'quizzes']);

                if ($deptId) {
                    $deptCoursesQuery->where('department_id', $deptId);
                }

                $deptCourses = $deptCoursesQuery->get();

                $enrollments = $deptCourses->map(function ($course) use ($student) {
                    $fakeEnrollment = new Enrollment([
                        'student_id' => $student->id,
                        'course_id' => $course->id,
                        'status' => 'active',
                    ]);
                    $fakeEnrollment->id = $course->id;
                    $fakeEnrollment->setRelation('course', $course);
                    return $fakeEnrollment;
                });
            }

            $coursesList = $enrollments->pluck('course')->filter()->values();
            $this->preloadTeachersForCourses($coursesList);

            $stats = [
                'total_courses' => $coursesList->count(),
                'total_lessons' => 0,
                'total_assignments' => 0,
                'total_quizzes' => 0,
                'average_score' => 0,
            ];

            foreach ($enrollments as $enrollment) {
                if ($enrollment->course) {
                    $teacherData = $this->formatTeacherData($enrollment->course, true);
                    $enrollment->course->teacher_name = $teacherData['name'] ?? 'គ្រូបង្រៀន';
                    $enrollment->course->setAttribute('teacher_profile', $teacherData);
                    $enrollment->course->setAttribute('teacher', $teacherData);

                    $stats['total_lessons'] += (int) ($enrollment->course->lessons_count ?? 0);
                    $stats['total_assignments'] += (int) ($enrollment->course->assignments_count ?? 0);
                    $stats['total_quizzes'] += (int) ($enrollment->course->quizzes_count ?? 0);
                }
            }

            // ✅ គណនាពិន្ទុបូកបញ្ចូលគ្នាតាមផ្នែកដែលគ្រូបានដាក់ និងរក្សាទុក (កិច្ចការ 20% + សំណួរខ្លី 20% + ពាក់កណ្ដាលឆមាស 25% + ប្រឡងឆមាស 35% = 100 ពិន្ទុ)
            $courseIds = $coursesList->pluck('id')->filter()->values();
            $grades = Grade::whereIn('student_id', $studentIds)->get()->keyBy('course_id');

            $allAssignments = $courseIds->isNotEmpty()
                ? Assignment::select('id', 'course_id', 'total_score')
                    ->whereIn('course_id', $courseIds)
                    ->get()
                    : collect();
            $allAssignIds = $allAssignments->pluck('id');

            $gradedSubmissions = $allAssignIds->isNotEmpty()
                ? AssignmentSubmission::select('id', 'assignment_id', 'student_id', 'score')
                    ->whereIn('assignment_id', $allAssignIds)
                    ->whereIn('student_id', $studentIds)
                    ->whereNotNull('score')
                    ->get()
                    ->groupBy('assignment_id')
                : collect();

            $quizQuery = $courseIds->isNotEmpty()
                ? Quiz::select('id', 'course_id', 'total_mark')->whereIn('course_id', $courseIds)
                : null;
            if ($quizQuery && $this->hasQuestionsMarkColumn()) {
                $quizQuery->withSum('questions as questions_total_mark', 'mark');
            }
            $allQuizzes = $quizQuery ? $quizQuery->get() : collect();
            $allQuizIds = $allQuizzes->pluck('id');

            $gradedAttempts = $allQuizIds->isNotEmpty()
                ? QuizAttempt::select('id', 'quiz_id', 'student_id', 'score')
                    ->whereIn('quiz_id', $allQuizIds)
                    ->whereIn('student_id', $studentIds)
                    ->whereNotNull('score')
                    ->whereNotNull('submitted_at')
                    ->get()
                    ->groupBy('quiz_id')
                : collect();

            $courseAccumulatedScores = [];

            foreach ($coursesList as $crs) {
                $g = $grades->get($crs->id);

                // ១. បូកពិន្ទុកិច្ចការនីមួយៗដែលគ្រូបានដាក់ និងរក្សាទុក (គិតជាពិន្ទុក្នុងចំណោម 20 ពិន្ទុ)
                $cAssigns = $allAssignments->where('course_id', $crs->id);
                $earnedA = 0;
                $maxA = 0;
                $hasGradedA = false;
                foreach ($cAssigns as $ca) {
                    $subs = $gradedSubmissions->get($ca->id, collect());
                    if ($subs->isNotEmpty()) {
                        $m = (float) ($ca->total_score ?? 20);
                        if ($m > 0) {
                            $earnedA += (float) $subs->max('score');
                            $maxA += $m;
                            $hasGradedA = true;
                        }
                    }
                }
                $autoAssign100 = ($hasGradedA && $maxA > 0) ? round(($earnedA / $maxA) * 100, 2) : null;
                $assign100 = ($g && $g->assignment_score !== null) ? (float) $g->assignment_score : $autoAssign100;
                $assignPts20 = $assign100 !== null ? round(($assign100 * 20) / 100, 2) : null;

                // ២. បូកពិន្ទុសំណួរខ្លីដែលមាន (គិតជាពិន្ទុក្នុងចំណោម 20 ពិន្ទុ)
                $cQuizzes = $allQuizzes->where('course_id', $crs->id);
                $earnedQ = 0;
                $maxQ = 0;
                $hasGradedQ = false;
                foreach ($cQuizzes as $cq) {
                    $atts = $gradedAttempts->get($cq->id, collect());
                    if ($atts->isNotEmpty()) {
                        $m = (float) ($cq->total_mark ?? $cq->questions_total_mark ?? 20);
                        if ($m > 0) {
                            $earnedQ += (float) $atts->max('score');
                            $maxQ += $m;
                            $hasGradedQ = true;
                        }
                    }
                }
                $autoQuiz100 = ($hasGradedQ && $maxQ > 0) ? round(($earnedQ / $maxQ) * 100, 2) : null;
                $quiz100 = ($g && $g->quiz_score !== null) ? (float) $g->quiz_score : $autoQuiz100;
                $quizPts20 = $quiz100 !== null ? round(($quiz100 * 20) / 100, 2) : null;

                // ៣. ពិន្ទុប្រឡងពាក់កណ្ដាលឆមាសលើក្រដាសក្រៅ (25 ពិន្ទុ) ពេលគ្រូបញ្ចូលហើយចុចរក្សាទុក
                $midterm100 = ($g && $g->midterm_score !== null) ? (float) $g->midterm_score : null;
                $midtermPts25 = $midterm100 !== null ? round(($midterm100 * 25) / 100, 2) : null;

                // ៤. ពិន្ទុប្រឡងឆមាស/បញ្ចប់លើក្រដាសក្រៅ (35 ពិន្ទុ) ពេលគ្រូបញ្ចូលហើយចុចរក្សាទុក
                $exam100 = ($g && isset($g->exam_score) && $g->exam_score !== null) ? (float) $g->exam_score : null;
                $examPts35 = $exam100 !== null ? round(($exam100 * 35) / 100, 2) : null;

                $parts = array_filter([$assignPts20, $quizPts20, $midtermPts25, $examPts35], fn ($v) => $v !== null);

                if (!empty($parts)) {
                    $courseAccumulatedScores[] = round(array_sum($parts), 2);
                } elseif ($g && $g->final_score !== null) {
                    $courseAccumulatedScores[] = round((float) $g->final_score, 2);
                }
            }

            if (!empty($courseAccumulatedScores)) {
                $stats['average_score'] = round(
                    array_sum($courseAccumulatedScores) / count($courseAccumulatedScores),
                    2
                );
            }

            return response()->json([
                'stats' => $stats,
                'enrollments' => $enrollments->values(),
                'recent_activity' => $this->getRecentActivity($studentIds),
            ]);
        } catch (\Throwable $e) {
            Log::error('Student dashboard error: ' . $e->getMessage());
            return response()->json([
                'stats' => [
                    'total_courses' => 0,
                    'total_lessons' => 0,
                    'total_assignments' => 0,
                    'total_quizzes' => 0,
                    'average_score' => 0,
                ],
                'enrollments' => [],
                'recent_activity' => ['submissions' => [], 'quiz_attempts' => []],
                'error_debug' => $e->getMessage(),
            ]);
        }
    }

    private function getRecentActivity($studentIds)
    {
        $ids = is_array($studentIds) ? $studentIds : [$studentIds];

        try {
            $submissions = AssignmentSubmission::select([
                'id', 'assignment_id', 'student_id', 'file_path', 'submitted_at', 'score', 'feedback', 'created_at', 'updated_at',
            ])
                ->whereIn('student_id', $ids)
                ->with('assignment:id,course_id,title,due_date,total_score')
                ->orderBy('id', 'desc')
                ->limit(5)
                ->get();
        } catch (\Throwable $e) {
            $submissions = [];
        }

        try {
            $attempts = QuizAttempt::select([
                'id', 'quiz_id', 'student_id', 'score', 'started_at', 'submitted_at', 'created_at', 'updated_at',
            ])
                ->whereIn('student_id', $ids)
                ->with('quiz:id,course_id,title,duration,total_mark')
                ->orderBy('id', 'desc')
                ->limit(5)
                ->get();
        } catch (\Throwable $e) {
            $attempts = [];
        }

        return [
            'submissions' => $submissions,
            'quiz_attempts' => $attempts,
        ];
    }

    // ទាញយកបញ្ជីមុខវិជ្ជារបស់សិស្ស
    public function getCourses(Request $request)
    {
        try {
            $student = auth()->user();
            $perPage = max(1, min((int) $request->input('per_page', 12), 100));

            $enrolledCourseIds = $this->getEnrolledCourseIdsForStudent($student);
            $deptId = $this->resolveStudentDepartmentId($student, $enrolledCourseIds);

            $query = Course::with(['department'])
                ->withCount(['lessons', 'assignments', 'quizzes']);

            if (!empty($enrolledCourseIds)) {
                $query->whereIn('id', $enrolledCourseIds);
            } elseif ($deptId) {
                $query->where('department_id', $deptId);
            }

            $formatCourse = function ($course) {
                $teacherData = $this->formatTeacherData($course, true);
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
                    'teacher_profile' => $teacherData,
                    'teacher' => $teacherData,
                    'lessons_count' => (int) ($course->lessons_count ?? 0),
                    'assignments_count' => (int) ($course->assignments_count ?? 0),
                    'quizzes_count' => (int) ($course->quizzes_count ?? 0),
                ];
            };

            if ($request->boolean('all')) {
                $rawCourses = $query->get();
                $this->preloadTeachersForCourses($rawCourses);
                $courses = $rawCourses->map($formatCourse);

                return response()->json([
                    'data' => $courses,
                ]);
            }

            $paginated = $query->paginate($perPage);
            $rawItems = collect($paginated->items());
            $this->preloadTeachersForCourses($rawItems);
            $items = $rawItems->map($formatCourse);

            return response()->json([
                'data' => $items,
                'meta' => [
                    'current_page' => $paginated->currentPage(),
                    'last_page' => $paginated->lastPage(),
                    'per_page' => $paginated->perPage(),
                    'total' => $paginated->total(),
                ],
            ]);
        } catch (\Throwable $e) {
            Log::error('Student getCourses error: ' . $e->getMessage());
            return response()->json([
                'data' => [],
                'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 12, 'total' => 0],
                'error_debug' => $e->getMessage(),
            ]);
        }
    }

    // View Attendance (គាំទ្រស្ថានភាព Permission / ច្បាប់ ១០០%)
    public function getAttendance(Request $request)
    {
        try {
            $student = auth()->user();
            $studentIds = $this->getStudentAllIds($student);
            $studentProfile = $this->resolveStudentProfile($student);
            $perPage = max(1, min((int) $request->input('per_page', 20), 100));

            $baseQuery = Attendance::whereIn('student_id', $studentIds);

            $summaryRaw = (clone $baseQuery)->selectRaw("
                SUM(CASE WHEN LOWER(TRIM(status)) = 'present' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN LOWER(TRIM(status)) = 'absent' THEN 1 ELSE 0 END) as absent,
                SUM(CASE WHEN LOWER(TRIM(status)) IN ('permission', 'excused', 'leave', 'ច្បាប់') THEN 1 ELSE 0 END) as permission,
                SUM(CASE WHEN LOWER(TRIM(status)) = 'late' THEN 1 ELSE 0 END) as late
            ")->first();

            $summary = [
                'present' => (int) ($summaryRaw->present ?? 0),
                'absent' => (int) ($summaryRaw->absent ?? 0),
                'permission' => (int) ($summaryRaw->permission ?? 0),
                'late' => (int) ($summaryRaw->late ?? 0),
            ];

            $paginated = (clone $baseQuery)
                ->with(['course.department'])
                ->orderBy('attendance_date', 'desc')
                ->paginate($perPage);

            $rawItems = collect($paginated->items());
            $this->preloadTeachersForCourses($rawItems->pluck('course')->filter());

            $formattedAttendance = $rawItems->map(function ($record) use ($studentProfile) {
                $courseData = $record->course ? clone $record->course : null;
                if ($courseData) {
                    $teacherData = $this->formatTeacherData($courseData, true);
                    $courseData->teacher_name = $teacherData['name'] ?? 'គ្រូបង្រៀន';
                    $courseData->setAttribute('teacher_profile', $teacherData);
                    $courseData->setAttribute('teacher', $teacherData);
                }

                $rawSt = strtolower(trim((string) $record->status));
                $normalizedStatus = 'Present';
                if (in_array($rawSt, ['permission', 'excused', 'leave', 'ច្បាប់'], true)) {
                    $normalizedStatus = 'Permission';
                } elseif (in_array($rawSt, ['absent', 'អវត្តមាន'], true)) {
                    $normalizedStatus = 'Absent';
                } elseif (in_array($rawSt, ['late', 'យឺត', 'មកយឺត'], true)) {
                    $normalizedStatus = 'Late';
                }

                return [
                    'id' => $record->id,
                    'course_id' => $record->course_id,
                    'student_id' => $record->student_id,
                    'attendance_date' => $record->attendance_date,
                    'status' => $normalizedStatus,
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
        } catch (\Throwable $e) {
            Log::error('Student getAttendance error: ' . $e->getMessage());
            return response()->json([
                'attendance' => [],
                'summary' => ['present' => 0, 'absent' => 0, 'permission' => 0, 'late' => 0],
                'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 20, 'total' => 0],
                'error_debug' => $e->getMessage(),
            ]);
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
        try {
            $student = auth()->user();
            $studentIds = $this->getStudentAllIds($student);

            $enrolledCourseIds = $this->getEnrolledCourseIdsForStudent($student);
            $deptId = $this->resolveStudentDepartmentId($student, $enrolledCourseIds);

            $coursesQuery = Course::with(['department']);

            if (!empty($enrolledCourseIds)) {
                $courses = $coursesQuery->whereIn('id', $enrolledCourseIds)->get();
            } elseif ($deptId) {
                $courses = $coursesQuery->where('department_id', $deptId)->get();
            } else {
                $courses = $coursesQuery->get();
            }

            $this->preloadTeachersForCourses($courses);

            $grades = Grade::whereIn('student_id', $studentIds)->get()->keyBy('course_id');
            $courseIds = $courses->pluck('id');

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

            $quizQuery = Quiz::select('id', 'course_id', 'total_mark')->whereIn('course_id', $courseIds);
            if ($this->hasQuestionsMarkColumn()) {
                $quizQuery->withSum('questions as questions_total_mark', 'mark');
            }
            $allQuizzes = $quizQuery->get()->groupBy('course_id');
            $allQuizIds = $allQuizzes->flatten()->pluck('id');

            $allAttempts = $allQuizIds->isNotEmpty()
                ? QuizAttempt::select('id', 'quiz_id', 'student_id', 'score', 'submitted_at')
                    ->whereIn('quiz_id', $allQuizIds)
                    ->whereIn('student_id', $studentIds)
                    ->whereNotNull('score')
                    ->whereNotNull('submitted_at')
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
                            $maxScore = $assign->total_score ?? $assign->marks ?? 20;
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
                            $maxMark = $quiz->total_mark ?? $quiz->questions_total_mark ?? 20;
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
                        'teacher' => $teacherData,
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
        } catch (\Throwable $e) {
            Log::error('Student getScores error: ' . $e->getMessage());
            return response()->json([]);
        }
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

    // ✅ ទាញយកមេរៀនគ្រប់ឆ្នាំសិក្សា (ឆ្នាំទី ១-៤) ក្នុងល្បឿនលឿនបំផុត (Ultra-Slim JSON សម្រាប់សិស្សរាប់ពាន់នាក់)
    public function getAllLessons(Request $request)
    {
        try {
            $student = auth()->user();
            $studentProfile = $this->resolveStudentProfile($student);

            $enrolledCourseIds = $this->getEnrolledCourseIdsForStudent($student);
            $deptId = $this->resolveStudentDepartmentId($student, $enrolledCourseIds);

            $coursesQuery = Course::with(['department']);

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

            if ($deptCourses->isEmpty()) {
                $deptCourses = Course::with(['department'])->get()->keyBy('id');
            }

            $this->preloadTeachersForCourses($deptCourses->values());
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

            $safeFileCols = $this->getSafeLessonFileColumns();
            $lessonsQuery = Lesson::with([
                'files' => function ($q) use ($safeFileCols) {
                    $q->select($safeFileCols);
                },
                'videos:id,lesson_id,title,video_url,duration,created_at,updated_at',
            ])->orderBy('lesson_order', 'asc');

            if (!empty($deptCourseIds)) {
                $lessonsQuery->whereIn('course_id', $deptCourseIds);
            }

            // ✅ រៀបចំ Teacher Data ជា ២ ប្រភេទ៖
            // 1. $fullTeacherByCourseId (មានរូបថត Avatar សម្រាប់ដាក់តែ ១ ដងក្នុង department_courses)
            // 2. $slimTeacherByCourseId (គ្មាន Base64 Avatar ស្ទួន សម្រាប់ដាក់ក្នុងមេរៀននីមួយៗ កាត់បន្ថយទំហំ JSON ៨៥%!)
            $fullTeacherByCourseId = [];
            $slimTeacherByCourseId = [];
            foreach ($deptCourses as $cid => $crs) {
                $fullTeacherByCourseId[(int) $cid] = $this->formatTeacherData($crs, true);
                $slimTeacherByCourseId[(int) $cid] = $this->formatTeacherData($crs, false);
            }

            $lessons = $lessonsQuery->get()->map(function ($lesson) use ($enrolledCourseIds, $studentProfile, $studentCurrentYear, $courseYearsMap, $deptCourses, $slimTeacherByCourseId) {
                $cid = (int) $lesson->course_id;
                $course = $deptCourses->get($cid);
                $isEnrolled = in_array($cid, $enrolledCourseIds, true);

                $yearInfo = $courseYearsMap[$cid] ?? null;
                $explicitCourseY = $this->parseAcademicYearNumber(
                    ($course->course_name ?? '') . ' ' . ($course->description ?? '') . ' ' . ($lesson->title ?? ''),
                    $course->course_code ?? '',
                    $course->semester ?? null
                );

                $primaryYear = $explicitCourseY ?? ($yearInfo['primary_year'] ?? ($isEnrolled ? $studentCurrentYear : 1));
                $yearsList = $yearInfo['years_list'] ?? [(string) $primaryYear];

                $slimTeacher = $slimTeacherByCourseId[$cid] ?? null;

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
                    'teacher' => $slimTeacher,
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
                        'teacher_name' => $slimTeacher['name'] ?? 'គ្រូបង្រៀន',
                        'teacher' => $slimTeacher,
                        'teacher_profile' => $slimTeacher,
                    ] : null,
                    'files' => $lesson->files ?? [],
                    'videos' => $lesson->videos ?? [],
                ];
            });

            $formattedDeptCourses = $deptCourses->values()->map(function ($crs) use ($courseYearsMap, $enrolledCourseIds, $studentCurrentYear, $fullTeacherByCourseId) {
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

                $teacherData = $fullTeacherByCourseId[$cid] ?? null;

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
                    'teacher' => $teacherData,
                ];
            });

            return response()->json([
                'data' => $lessons,
                'department_courses' => $formattedDeptCourses,
                'student_current_year' => (int) $studentCurrentYear,
            ]);
        } catch (\Throwable $e) {
            Log::error('Student getAllLessons error: ' . $e->getMessage());
            return response()->json([
                'data' => [],
                'department_courses' => [],
                'student_current_year' => 1,
                'error_debug' => $e->getMessage(),
            ]);
        }
    }

    // ✅ អានឯកសារមេរៀនជា Base64 (គាំទ្រទាំង Storage Disk និង Database Base64 លើ Railway)
    public function readLessonFile(Request $request)
    {
        $path = trim((string) $request->query('path', ''));
        $fileId = $request->query('id');

        if (!$path && !$fileId) {
            return response()->json(['message' => 'រកមិនឃើញឯកសារមេរៀននេះទេ'], 404);
        }

        if (str_starts_with($path, 'data:')) {
            if (preg_match('/^data:([^;]+);base64,(.+)$/s', $path, $matches)) {
                return response()->json([
                    'file_name' => 'lesson-file',
                    'mime_type' => $matches[1] ?: 'application/octet-stream',
                    'base64' => preg_replace('/\s+/', '', $matches[2]),
                ]);
            }
        }

        $cleanPath = preg_replace('/^\/?storage\//', '', ltrim(urldecode($path), '/'));
        $fileNameOnly = basename($cleanPath);

        if ($cleanPath && Storage::disk('public')->exists($cleanPath)) {
            $fileContent = Storage::disk('public')->get($cleanPath);
            $mimeType = Storage::disk('public')->mimeType($cleanPath) ?: 'application/octet-stream';

            return response()->json([
                'file_name' => $fileNameOnly,
                'mime_type' => $mimeType,
                'base64' => base64_encode($fileContent),
            ]);
        }

        if (Schema::hasTable('lesson_files')) {
            $query = DB::table('lesson_files');

            if ($fileId) {
                $dbFile = (clone $query)->where('id', $fileId)->first();
            } else {
                $dbFile = null;
            }

            if (!$dbFile && $cleanPath) {
                $dbFile = (clone $query)
                    ->where('file_path', $cleanPath)
                    ->orWhere('file_path', 'storage/' . $cleanPath)
                    ->orWhere('file_path', '/storage/' . $cleanPath)
                    ->orWhere('file_path', 'like', '%' . $fileNameOnly)
                    ->first();
            }

            if ($dbFile) {
                if (!empty($dbFile->file_path) && str_starts_with(trim($dbFile->file_path), 'data:')) {
                    if (preg_match('/^data:([^;]+);base64,(.+)$/s', trim($dbFile->file_path), $m)) {
                        return response()->json([
                            'file_name' => $dbFile->file_name ?? $fileNameOnly,
                            'mime_type' => $m[1] ?: ($dbFile->mime_type ?? 'application/octet-stream'),
                            'base64' => preg_replace('/\s+/', '', $m[2]),
                        ]);
                    }
                }

                $rawContent = $dbFile->file_data ?? $dbFile->base64_data ?? $dbFile->file_content ?? null;
                if (!empty($rawContent)) {
                    $rawContent = trim((string) $rawContent);
                    if (str_starts_with($rawContent, 'data:') && preg_match('/^data:([^;]+);base64,(.+)$/s', $rawContent, $m)) {
                        return response()->json([
                            'file_name' => $dbFile->file_name ?? $fileNameOnly,
                            'mime_type' => $m[1] ?: ($dbFile->mime_type ?? 'application/octet-stream'),
                            'base64' => preg_replace('/\s+/', '', $m[2]),
                        ]);
                    }

                    return response()->json([
                        'file_name' => $dbFile->file_name ?? $fileNameOnly,
                        'mime_type' => $dbFile->mime_type ?? 'application/octet-stream',
                        'base64' => preg_replace('/\s+/', '', $rawContent),
                    ]);
                }
            }
        }

        return response()->json([
            'message' => 'ឯកសារនេះមិនមាននៅលើ Server ទៀតទេ សូមឱ្យគ្រូបង្រៀនបង្ហោះឯកសារមេរៀននេះឡើងវិញ។',
        ], 404);
    }

    // View Lessons by Course
    public function getCourseLessons($courseId)
    {
        try {
            $course = Course::with(['department'])->find($courseId);

            if ($course) {
                $this->preloadTeachersForCourses([$course]);
            }

            $courseYearsMap = $course ? $this->buildCourseYearsMap(collect([$course->id => $course])) : [];
            $yearInfo = $courseYearsMap[(int) $courseId] ?? ['primary_year' => 1, 'years_list' => ['1']];

            $safeFileCols = $this->getSafeLessonFileColumns();
            $lessons = Lesson::with([
                'files' => function ($q) use ($safeFileCols) {
                    $q->select($safeFileCols);
                },
                'videos:id,lesson_id,title,video_url,duration,created_at,updated_at',
                'course.department',
            ])
                ->where('course_id', $courseId)
                ->orderBy('lesson_order')
                ->get()
                ->map(function ($lesson) use ($yearInfo) {
                    $lesson->year = (int) $yearInfo['primary_year'];
                    $lesson->years_list = $yearInfo['years_list'];
                    if ($lesson->course) {
                        $teacherData = $this->formatTeacherData($lesson->course, true);
                        $lesson->course->year = (int) $yearInfo['primary_year'];
                        $lesson->course->years_list = $yearInfo['years_list'];
                        $lesson->course->teacher_name = $teacherData['name'] ?? 'គ្រូបង្រៀន';
                        $lesson->course->setAttribute('teacher_profile', $teacherData);
                        $lesson->course->setAttribute('teacher', $teacherData);
                    }
                    return $lesson;
                });

            return response()->json($lessons);
        } catch (\Throwable $e) {
            Log::error('Student getCourseLessons error: ' . $e->getMessage());
            return response()->json([]);
        }
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

        try {
            if (!Schema::hasColumn('assignment_submissions', 'file_data')) {
                DB::statement('ALTER TABLE assignment_submissions ADD COLUMN file_data LONGTEXT NULL');
            }
            if (!Schema::hasColumn('assignment_submissions', 'original_filename')) {
                DB::statement('ALTER TABLE assignment_submissions ADD COLUMN original_filename VARCHAR(255) NULL');
            }
        } catch (\Throwable $e) {
        }

        $submission = AssignmentSubmission::create([
            'assignment_id' => $request->assignment_id,
            'student_id' => $student->id,
            'file_path' => $filePath,
            'submitted_at' => now(),
        ]);

        $extraColumns = [];
        if (Schema::hasColumn('assignment_submissions', 'original_filename')) {
            $extraColumns['original_filename'] = $file->getClientOriginalName();
        }
        if (Schema::hasColumn('assignment_submissions', 'file_data')) {
            $mime = $file->getMimeType() ?: 'application/octet-stream';
            $extraColumns['file_data'] = 'data:' . $mime . ';base64,' . base64_encode(file_get_contents($file->getRealPath()));
        }
        if (!empty($extraColumns)) {
            DB::table('assignment_submissions')->where('id', $submission->id)->update($extraColumns);
        }

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

    // ✅ Quiz/Exam: ចាប់ផ្តើម ឬបន្តការធ្វើតេស្ត (គាំទ្រការមើលលទ្ធផល និងចម្លើយត្រឹមត្រូវពេលប្រឡងចប់)
    public function getQuiz($quizId)
    {
        $student = auth()->user();
        $studentIds = $this->getStudentAllIds($student);

        $quiz = Quiz::with(['course', 'questions.options'])->findOrFail($quizId);

        $quiz->questions->each(function ($q) {
            $q->options->each(function ($opt) {
                $opt->makeVisible(['is_correct']);
            });
        });

        $attempt = QuizAttempt::where('quiz_id', $quizId)
            ->whereIn('student_id', $studentIds)
            ->first();

        if ($attempt && $attempt->submitted_at) {
            $savedAnswers = [];
            if (!empty($attempt->answers)) {
                $decoded = is_string($attempt->answers)
                    ? json_decode($attempt->answers, true)
                    : $attempt->answers;
                if (is_array($decoded)) {
                    $savedAnswers = collect($decoded)->keyBy('question_id')->all();
                }
            }

            $reviewItems = $quiz->questions->values()->map(function ($q, $idx) use ($savedAnswers) {
                $qType = strtolower(trim((string) ($q->question_type ?? 'MCQ')));
                $isEssay = ($qType === 'essay' || $q->options->count() <= 1);
                $ansRow = $savedAnswers[$q->id] ?? null;
                $qMark = (float) ($q->mark ?? 1);

                $correctOpt = $q->options->first(function ($opt) {
                    return (bool) $opt->is_correct === true || (int) $opt->is_correct === 1 || strtolower((string) $opt->is_correct) === 'true';
                });

                if ($isEssay) {
                    $written = trim((string) ($ansRow['answer_text'] ?? $ansRow['selected_option'] ?? ''));
                    $modelText = $correctOpt ? $correctOpt->option_text : null;
                    $isCorrect = $written !== '' && ($modelText ? mb_strtolower($written) === mb_strtolower(trim($modelText)) : true);

                    return [
                        'questionId' => $q->id,
                        'index' => $idx + 1,
                        'questionText' => $q->question_text,
                        'questionType' => 'Essay',
                        'mark' => $qMark,
                        'earnedMark' => $isCorrect ? $qMark : 0,
                        'isAnswered' => $written !== '',
                        'isCorrect' => $isCorrect,
                        'selectedOptionId' => null,
                        'selectedOptionText' => $written !== '' ? $written : null,
                        'correctOptionId' => $correctOpt?->id,
                        'correctOptionText' => $modelText,
                    ];
                }

                $selectedOptId = $ansRow['selected_option'] ?? null;
                $selectedOpt = $selectedOptId !== null
                    ? $q->options->first(fn ($o) => (int) $o->id === (int) $selectedOptId)
                    : null;
                $isCorrect = $selectedOpt && $correctOpt && (int) $selectedOpt->id === (int) $correctOpt->id;

                return [
                    'questionId' => $q->id,
                    'index' => $idx + 1,
                    'questionText' => $q->question_text,
                    'questionType' => $q->question_type ?? 'MCQ',
                    'mark' => $qMark,
                    'earnedMark' => $isCorrect ? $qMark : 0,
                    'isAnswered' => $selectedOpt !== null,
                    'isCorrect' => (bool) $isCorrect,
                    'selectedOptionId' => $selectedOpt?->id,
                    'selectedOptionText' => $selectedOpt?->option_text,
                    'correctOptionId' => $correctOpt?->id,
                    'correctOptionText' => $correctOpt?->option_text,
                ];
            });

            return response()->json([
                'quiz' => $quiz,
                'attempt' => $attempt,
                'review_items' => $reviewItems,
                'message' => 'អ្នកបានបញ្ចប់ការប្រឡងកម្រងសំណួរនេះរួចរាល់ហើយ',
            ]);
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

    // ✅ បញ្ជូនចម្លើយប្រឡង និងគណនាពិន្ទុដោយស្វ័យប្រវត្តិ (គាំទ្រទាំងសំណួរធីក MCQ/TrueFalse និងសំណួរសរសេរ Essay)
    public function submitQuiz(Request $request, $quizId)
    {
        $request->validate([
            'answers' => 'nullable|array',
            'answers.*.question_id' => 'required|exists:questions,id',
            'answers.*.selected_option' => 'nullable',
            'answers.*.answer_text' => 'nullable|string',
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
        $reviewItems = [];

        foreach ($quiz->questions->values() as $idx => $question) {
            $question->options->each(fn ($opt) => $opt->makeVisible(['is_correct']));

            $qMark = (float) ($question->mark ?? 1);
            $calculatedTotalMarks += $qMark;

            $qType = strtolower(trim((string) ($question->question_type ?? 'MCQ')));
            $isEssay = ($qType === 'essay' || $question->options->count() <= 1);

            $studentAnswer = $answersByQuestionId->get($question->id);
            $correctOption = $question->options->first(function ($opt) {
                return (bool) $opt->is_correct === true || (int) $opt->is_correct === 1 || strtolower((string) $opt->is_correct) === 'true';
            });

            if ($isEssay) {
                $writtenText = $studentAnswer
                    ? trim((string) ($studentAnswer['answer_text'] ?? $studentAnswer['selected_option'] ?? ''))
                    : '';
                $modelAnswerText = $correctOption ? trim((string) $correctOption->option_text) : null;

                $isAnswered = $writtenText !== '';
                $isCorrect = false;
                if ($isAnswered) {
                    if ($modelAnswerText !== null && $modelAnswerText !== '') {
                        $isCorrect = mb_strtolower($writtenText) === mb_strtolower($modelAnswerText);
                    } else {
                        $isCorrect = true;
                    }
                }

                if ($isCorrect) {
                    $score += $qMark;
                }

                $reviewItems[] = [
                    'questionId' => $question->id,
                    'index' => $idx + 1,
                    'questionText' => $question->question_text,
                    'questionType' => 'Essay',
                    'mark' => $qMark,
                    'earnedMark' => $isCorrect ? $qMark : 0,
                    'isAnswered' => $isAnswered,
                    'isCorrect' => $isCorrect,
                    'selectedOptionId' => null,
                    'selectedOptionText' => $isAnswered ? $writtenText : null,
                    'correctOptionId' => $correctOption?->id,
                    'correctOptionText' => $modelAnswerText,
                ];
                continue;
            }

            $selectedOptId = $studentAnswer['selected_option'] ?? null;
            $selectedOption = ($selectedOptId !== null && $selectedOptId !== '')
                ? $question->options->first(fn ($opt) => (int) $opt->id === (int) $selectedOptId)
                : null;

            $isAnswered = $selectedOption !== null;
            $isCorrect = $isAnswered && $correctOption && (int) $correctOption->id === (int) $selectedOption->id;

            if ($isCorrect) {
                $score += $qMark;
            }

            $reviewItems[] = [
                'questionId' => $question->id,
                'index' => $idx + 1,
                'questionText' => $question->question_text,
                'questionType' => $question->question_type ?? 'MCQ',
                'mark' => $qMark,
                'earnedMark' => $isCorrect ? $qMark : 0,
                'isAnswered' => $isAnswered,
                'isCorrect' => (bool) $isCorrect,
                'selectedOptionId' => $selectedOption?->id,
                'selectedOptionText' => $selectedOption?->option_text,
                'correctOptionId' => $correctOption?->id,
                'correctOptionText' => $correctOption?->option_text,
            ];
        }

        $finalTotalMarks = $calculatedTotalMarks > 0
            ? $calculatedTotalMarks
            : (float) ($quiz->total_mark ?? 20);

        try {
            if (!Schema::hasColumn('quiz_attempts', 'answers')) {
                DB::statement('ALTER TABLE quiz_attempts ADD COLUMN answers LONGTEXT NULL');
            }
        } catch (\Throwable $e) {
        }

        $attemptUpdateData = [
            'score' => $score,
            'submitted_at' => now(),
        ];

        $attempt->update($attemptUpdateData);

        if (Schema::hasColumn('quiz_attempts', 'answers')) {
            DB::table('quiz_attempts')
                ->where('id', $attempt->id)
                ->update(['answers' => json_encode(array_values($answers), JSON_UNESCAPED_UNICODE)]);
        }

        if ($finalTotalMarks > 0 && $quiz->course_id) {
            $courseQuizzesQuery = Quiz::where('course_id', $quiz->course_id);
            if ($this->hasQuestionsMarkColumn()) {
                $courseQuizzesQuery->withSum('questions as questions_total_mark', 'mark');
            }
            $courseQuizzes = $courseQuizzesQuery->get();
            $courseQuizIds = $courseQuizzes->pluck('id');

            $studentAttempts = QuizAttempt::whereIn('quiz_id', $courseQuizIds)
                ->whereIn('student_id', $studentIds)
                ->whereNotNull('score')
                ->whereNotNull('submitted_at')
                ->get()
                ->groupBy('quiz_id');

            $totalEarned = 0;
            $totalMax = 0;
            foreach ($courseQuizzes as $cq) {
                $atts = $studentAttempts->get($cq->id, collect());
                if ($atts->isNotEmpty()) {
                    $maxM = (float) ($cq->total_mark ?? $cq->questions_total_mark ?? 20);
                    if ($maxM > 0) {
                        $totalEarned += (float) $atts->max('score');
                        $totalMax += $maxM;
                    }
                }
            }

            $quizPercent = $totalMax > 0
                ? round(($totalEarned / $totalMax) * 100, 2)
                : round(($score / $finalTotalMarks) * 100, 2);

            $existingGrade = Grade::whereIn('student_id', $studentIds)
                ->where('course_id', $quiz->course_id)
                ->first();

            if ($existingGrade) {
                $existingGrade->update(['quiz_score' => $quizPercent]);
            } else {
                Grade::create([
                    'student_id' => $student->id,
                    'course_id' => $quiz->course_id,
                    'quiz_score' => $quizPercent,
                ]);
            }
        }

        $this->clearStudentDashboardCache();

        return response()->json([
            'attempt' => $attempt,
            'score' => $score,
            'total_marks' => $finalTotalMarks,
            'review_items' => $reviewItems,
            'message' => 'បានបញ្ជូនចម្លើយប្រឡងដោយជោគជ័យ',
        ]);
    }

    // ទាញយកកិច្ចការសិស្ស
    public function getAllAssignments(Request $request)
    {
        try {
            $student = auth()->user();
            $studentIds = $this->getStudentAllIds($student);
            $perPage = max(1, min((int) $request->input('per_page', 15), 100));

            $enrolledCourseIds = $this->getEnrolledCourseIdsForStudent($student);
            $deptId = $this->resolveStudentDepartmentId($student, $enrolledCourseIds);

            $query = Assignment::with(['course.department'])
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
            $rawItems = collect($paginated->items());
            $this->preloadTeachersForCourses($rawItems->pluck('course')->filter());

            $assignmentIds = $rawItems->pluck('id');

            // ✅ សំខាន់បំផុត៖ ទាញតែជួរឈរស្រាលៗ មិនទាញជួរឈរ file_data (Base64 រាប់មេកាបៃ) ដាច់ខាត!
            $submissions = $assignmentIds->isNotEmpty()
                ? AssignmentSubmission::select([
                    'id', 'assignment_id', 'student_id', 'file_path', 'submitted_at', 'score', 'feedback', 'created_at', 'updated_at',
                ])
                    ->whereIn('student_id', $studentIds)
                    ->whereIn('assignment_id', $assignmentIds)
                    ->get()
                    ->keyBy('assignment_id')
                : collect();

            $items = $rawItems->map(function ($assignment) use ($submissions) {
                $submission = $submissions->get($assignment->id);
                $courseData = $assignment->course ? clone $assignment->course : null;
                if ($courseData) {
                    $teacherData = $this->formatTeacherData($courseData, true);
                    $courseData->teacher_name = $teacherData['name'] ?? 'គ្រូបង្រៀន';
                    $courseData->setAttribute('teacher_profile', $teacherData);
                    $courseData->setAttribute('teacher', $teacherData);
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
                        'file_path' => $submission->file_path ?? null,
                        'submitted_at' => $submission->submitted_at ?? $submission->created_at ?? null,
                        'score' => $submission->score ?? null,
                        'feedback' => $submission->feedback ?? null,
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
        } catch (\Throwable $e) {
            Log::error('Student getAllAssignments error: ' . $e->getMessage());
            return response()->json([
                'data' => [],
                'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 15, 'total' => 0],
                'error_debug' => $e->getMessage(),
            ]);
        }
    }

    // ទាញយកកម្រងសំណួរប្រឡង
    public function getAllQuizzes(Request $request)
    {
        try {
            $student = auth()->user();
            $studentIds = $this->getStudentAllIds($student);
            $perPage = max(1, min((int) $request->input('per_page', 15), 100));

            $enrolledCourseIds = $this->getEnrolledCourseIdsForStudent($student);
            $deptId = $this->resolveStudentDepartmentId($student, $enrolledCourseIds);

            $query = Quiz::with(['course.department'])
                ->orderBy('start_date', 'asc');

            if ($this->hasQuestionsMarkColumn()) {
                $query->withSum('questions as questions_total_mark', 'mark');
            }

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
            $rawItems = collect($paginated->items());
            $this->preloadTeachersForCourses($rawItems->pluck('course')->filter());

            $quizIds = $rawItems->pluck('id');

            $attempts = $quizIds->isNotEmpty()
                ? QuizAttempt::select([
                    'id', 'quiz_id', 'student_id', 'score', 'started_at', 'submitted_at', 'created_at', 'updated_at',
                ])
                    ->whereIn('student_id', $studentIds)
                    ->whereIn('quiz_id', $quizIds)
                    ->get()
                    ->keyBy('quiz_id')
                : collect();

            $items = $rawItems->map(function ($quiz) use ($attempts) {
                $attempt = $attempts->get($quiz->id);
                $resolvedTotalMark = $quiz->total_mark ?? $quiz->questions_total_mark ?? 20;

                $courseData = $quiz->course ? clone $quiz->course : null;
                if ($courseData) {
                    $teacherData = $this->formatTeacherData($courseData, true);
                    $courseData->teacher_name = $teacherData['name'] ?? 'គ្រូបង្រៀន';
                    $courseData->setAttribute('teacher_profile', $teacherData);
                    $courseData->setAttribute('teacher', $teacherData);
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
        } catch (\Throwable $e) {
            Log::error('Student getAllQuizzes error: ' . $e->getMessage());
            return response()->json([
                'data' => [],
                'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 15, 'total' => 0],
                'error_debug' => $e->getMessage(),
            ]);
        }
    }
}
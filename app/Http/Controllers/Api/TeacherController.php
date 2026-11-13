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
use App\Models\LessonFile;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Quiz;
use App\Models\QuizAttempt;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\User;
use App\Models\Video;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TeacherController extends Controller
{
    /**
     * ✅ HELPER: សម្អាត Cache របស់ផ្ទាំងគ្រូបង្រៀនភ្លាមៗនៅពេលមានការផ្លាស់ប្ដូរទិន្នន័យ
     */
    private function clearTeacherDashboardCache(): void
    {
        $uid = auth()->id();
        if ($uid) {
            Cache::forget("teacher_dashboard_v2_{$uid}");
        }
    }

    // --- Dashboard ---
    public function dashboard()
    {
        $userId = auth()->id() ?? 0;
        $cacheKey = "teacher_dashboard_v2_{$userId}";

        // ✅ ប្រើ Cache ៦០ វិនាទី សម្រាប់ Teacher Dashboard ដើម្បីឱ្យលឿនដូច Admin Dashboard លើ Online
        $payload = Cache::remember($cacheKey, 60, function () {
            $teacherIds = $this->getTeacherCourseIds();

            $courses = Course::whereIn('teacher_id', $teacherIds)
                ->with(['department:id,department_name,department_code'])
                ->withCount(['enrollments as students_count', 'lessons', 'assignments', 'quizzes'])
                ->get();

            $courseIds = $courses->pluck('id')->toArray();

            if (empty($courseIds)) {
                return [
                    'stats' => [
                        'total_courses' => 0,
                        'total_students' => 0,
                        'total_lessons' => 0,
                        'total_assignments' => 0,
                        'total_quizzes' => 0,
                        'pending_assignments' => 0,
                        'pending_submissions' => 0,
                        'present_today' => 0,
                        'absent_today' => 0,
                        'avg_attendance_rate' => 100,
                        'grade_data' => [],
                    ],
                    'courses' => [],
                    'recent_activities' => [],
                ];
            }

            $totalStudents = Enrollment::whereIn('course_id', $courseIds)
                ->where(function ($q) {
                    $q->whereNull('status')
                      ->orWhere('status', 'active')
                      ->orWhere('status', '');
                })
                ->distinct('student_id')
                ->count('student_id');

            $totalLessons = (int) $courses->sum('lessons_count');
            $totalAssignments = (int) $courses->sum('assignments_count');
            $totalQuizzes = (int) $courses->sum('quizzes_count');

            $pendingAssignments = AssignmentSubmission::whereHas('assignment', function ($q) use ($courseIds) {
                $q->whereIn('course_id', $courseIds);
            })->whereNull('score')->count();

            $todayStr = now()->toDateString();

            // ✅ គណនាវត្តមានថ្ងៃនេះ និងអត្រាវត្តមានសរុបក្នុង Query តែម្ដង
            $attendanceStats = Attendance::whereIn('course_id', $courseIds)
                ->selectRaw("
                    COUNT(*) as total_records,
                    SUM(CASE WHEN LOWER(status) = 'present' THEN 1 ELSE 0 END) as total_present,
                    SUM(CASE WHEN LOWER(status) = 'late' THEN 1 ELSE 0 END) as total_late,
                    SUM(CASE WHEN LOWER(status) = 'permission' THEN 1 ELSE 0 END) as total_permission,
                    SUM(CASE WHEN DATE(attendance_date) = ? AND LOWER(status) IN ('present', 'late') THEN 1 ELSE 0 END) as present_today,
                    SUM(CASE WHEN DATE(attendance_date) = ? AND LOWER(status) = 'absent' THEN 1 ELSE 0 END) as absent_today
                ", [$todayStr, $todayStr])
                ->first();

            $totalAttRecords = (int) ($attendanceStats->total_records ?? 0);
            $effectiveAttended = (int) ($attendanceStats->total_present ?? 0)
                + (int) ($attendanceStats->total_late ?? 0)
                + ((int) ($attendanceStats->total_permission ?? 0) * 0.5);

            $avgAttendanceRate = $totalAttRecords > 0
                ? min(100, round(($effectiveAttended / $totalAttRecords) * 100, 1))
                : 100;

            // ✅ គណនាទិន្នន័យនិទ្ទេសសម្រាប់ក្រាហ្វបង្គោលក្នុង TeacherDashboard.jsx
            $gradeSummary = Grade::whereIn('course_id', $courseIds)
                ->selectRaw("
                    SUM(CASE WHEN final_score >= 50 AND UPPER(TRIM(COALESCE(grade_letter, ''))) != 'F' THEN 1 ELSE 0 END) as passed_count,
                    SUM(CASE WHEN final_score < 50 OR UPPER(TRIM(COALESCE(grade_letter, ''))) = 'F' THEN 1 ELSE 0 END) as failed_count
                ")
                ->first();

            $gradeData = [
                ['grade' => 'PASSED', 'students' => (int) ($gradeSummary->passed_count ?? 0)],
                ['grade' => 'FAILED', 'students' => (int) ($gradeSummary->failed_count ?? 0)],
            ];

            $stats = [
                'total_courses' => $courses->count(),
                'total_students' => (int) $totalStudents,
                'total_lessons' => $totalLessons,
                'total_assignments' => $totalAssignments,
                'total_quizzes' => $totalQuizzes,
                'pending_assignments' => (int) $pendingAssignments,
                'pending_submissions' => (int) $pendingAssignments,
                'present_today' => (int) ($attendanceStats->present_today ?? 0),
                'absent_today' => (int) ($attendanceStats->absent_today ?? 0),
                'avg_attendance_rate' => $avgAttendanceRate,
                'grade_data' => $gradeData,
            ];

            $rawRecent = AssignmentSubmission::whereHas('assignment', function ($q) use ($courseIds) {
                $q->whereIn('course_id', $courseIds);
            })
                ->whereNull('score')
                ->with([
                    'student:id,first_name,last_name,email,profile_image',
                    'assignment:id,title,course_id',
                    'assignment.course:id,course_name',
                ])
                ->orderBy('created_at', 'desc')
                ->take(6)
                ->get();

            // ✅ ទាញលេខកូដសិស្សក្នុង Query តែម្ដង (ការពារ N+1)
            $recentStudentIds = $rawRecent->pluck('student_id')->filter()->unique()->all();
            $studentProfiles = !empty($recentStudentIds)
                ? Student::whereIn('user_id', $recentStudentIds)
                    ->select('id', 'user_id', 'student_code', 'profile_image')
                    ->get()
                    ->keyBy('user_id')
                : collect();

            $recentSubmissions = $rawRecent->map(function ($sub) use ($studentProfiles) {
                $stuProfile = $studentProfiles->get($sub->student_id);
                $submittedDate = $sub->submitted_at ?? $sub->created_at;
                $dateStr = $submittedDate ? substr((string) $submittedDate, 0, 10) : null;

                return [
                    'id' => $sub->id,
                    'student_id' => $sub->student_id,
                    'student_name' => $sub->student
                        ? trim(($sub->student->first_name ?? '') . ' ' . ($sub->student->last_name ?? ''))
                        : 'សិស្ស',
                    'student_code' => $stuProfile?->student_code ?? null,
                    'student_image' => $stuProfile?->profile_image ?? $sub->student?->profile_image ?? null,
                    'assignment_title' => $sub->assignment?->title ?? 'កិច្ចការ',
                    'course_name' => $sub->assignment?->course?->course_name ?? null,
                    'submitted_at' => $dateStr,
                ];
            });

            return [
                'stats' => $stats,
                'courses' => $courses,
                'recent_activities' => $recentSubmissions,
            ];
        });

        return response()->json($payload);
    }

    // ============================================
    // PROFILE MANAGEMENT
    // ============================================
    public function getProfile()
    {
        $user = auth()->user();
        $teacher = Teacher::where('user_id', $user->id)
            ->with(['department', 'role'])
            ->first();

        if (!$teacher) {
            return response()->json([
                'message' => 'Teacher profile not found',
            ], 404);
        }

        if (empty($teacher->profile_image) && !empty($user->profile_image)) {
            $teacher->profile_image = $user->profile_image;
        }

        return response()->json([
            'user' => $user,
            'teacher' => $teacher,
            'profile_image' => $teacher->profile_image_url ?? $teacher->profile_image,
        ]);
    }

    public function updateProfileImage(Request $request)
    {
        $request->validate([
            'profile_image' => 'required|image|mimes:jpeg,png,jpg,gif,svg,webp|max:5120',
        ]);

        $user = auth()->user();
        $teacher = Teacher::where('user_id', $user->id)->first();

        if (!$teacher) {
            return response()->json([
                'message' => 'Teacher profile not found',
            ], 404);
        }

        try {
            if (
                $teacher->profile_image &&
                !str_starts_with($teacher->profile_image, 'data:') &&
                !str_starts_with($teacher->profile_image, 'http')
            ) {
                $oldPath = preg_replace('/^\/?storage\//', '', $teacher->profile_image);
                if ($oldPath && Storage::disk('public')->exists($oldPath)) {
                    Storage::disk('public')->delete($oldPath);
                }
            }

            $image = $request->file('profile_image');
            $mime = $image->getMimeType() ?: 'image/jpeg';
            $dataUri = 'data:' . $mime . ';base64,' . base64_encode(file_get_contents($image->getRealPath()));

            DB::transaction(function () use ($user, $teacher, $dataUri) {
                $user->update(['profile_image' => $dataUri]);
                $teacher->update(['profile_image' => $dataUri]);
            });

            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');
            Cache::forget('lms_auth_user_payload_' . $user->id);
            $this->clearTeacherDashboardCache();

            return response()->json([
                'message' => 'Profile image updated successfully',
                'profile_image' => $dataUri,
                'teacher' => $teacher->fresh(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to upload image',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function updateProfile(Request $request)
    {
        $user = auth()->user();
        $teacher = Teacher::where('user_id', $user->id)->first();

        if (!$teacher) {
            return response()->json([
                'message' => 'Teacher profile not found',
            ], 404);
        }

        $validated = $request->validate([
            'first_name' => 'sometimes|string|max:255',
            'last_name' => 'sometimes|string|max:255',
            'email' => [
                'sometimes',
                'email',
                Rule::unique('users', 'email')->ignore($user->id),
                Rule::unique('teachers', 'email')->ignore($teacher->id),
            ],
            'phone' => 'nullable|string|max:20',
            'gender' => 'nullable|in:Male,Female,Other',
            'date_of_birth' => 'nullable|date',
            'specialization' => 'nullable|string|max:255',
        ]);

        DB::transaction(function () use ($validated, $user, $teacher) {
            $user->update([
                'first_name' => isset($validated['first_name']) ? trim($validated['first_name']) : $user->first_name,
                'last_name' => isset($validated['last_name']) ? trim($validated['last_name']) : $user->last_name,
                'email' => isset($validated['email']) ? strtolower(trim($validated['email'])) : $user->email,
                'phone' => array_key_exists('phone', $validated) ? $validated['phone'] : $user->phone,
                'gender' => array_key_exists('gender', $validated) ? $validated['gender'] : $user->gender,
            ]);

            $teacher->update([
                'first_name' => isset($validated['first_name']) ? trim($validated['first_name']) : $teacher->first_name,
                'last_name' => isset($validated['last_name']) ? trim($validated['last_name']) : $teacher->last_name,
                'email' => isset($validated['email']) ? strtolower(trim($validated['email'])) : $teacher->email,
                'phone' => array_key_exists('phone', $validated) ? $validated['phone'] : $teacher->phone,
                'gender' => array_key_exists('gender', $validated) ? $validated['gender'] : $teacher->gender,
                'date_of_birth' => array_key_exists('date_of_birth', $validated) ? $validated['date_of_birth'] : $teacher->date_of_birth,
                'specialization' => array_key_exists('specialization', $validated) ? $validated['specialization'] : $teacher->specialization,
            ]);
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');
        Cache::forget('lms_auth_user_payload_' . $user->id);
        $this->clearTeacherDashboardCache();

        return response()->json([
            'message' => 'Profile updated successfully',
            'user' => $user->fresh(),
            'teacher' => $teacher->fresh(),
            'profile_image' => $teacher->profile_image_url ?? $teacher->profile_image,
        ]);
    }

    private function getTeacherId()
    {
        $user = auth()->user();
        $teacher = $user?->teacher ?? Teacher::where('user_id', $user?->id)->first();

        try {
            $relatedModel = (new Course())->teacher()->getRelated();
            if ($relatedModel instanceof User) {
                return (int) ($user?->id ?? $teacher?->user_id);
            }
            if ($relatedModel instanceof Teacher && $teacher) {
                return (int) $teacher->id;
            }
        } catch (\Throwable $e) {
            // បន្តទៅការឆែកខាងក្រោម
        }

        if ($teacher) {
            return $teacher->id;
        }
        return auth()->id();
    }

    private function getTeacherCourseIds()
    {
        $user = auth()->user();
        $teacher = $user?->teacher ?? ($user ? Teacher::where('user_id', $user->id)->first() : null);

        return array_values(array_unique(array_filter([
            $teacher ? (int) $teacher->id : null,
            $user ? (int) $user->id : null,
        ])));
    }

    private function teacherCourseQuery()
    {
        return Course::whereIn('teacher_id', $this->getTeacherCourseIds());
    }

    /**
     * ទាញយកព័ត៌មានលម្អិតរបស់សិស្សពីតារាង students តាម user_id ឬ id
     */
    private function resolveStudentProfile($userOrId)
    {
        $uid = is_object($userOrId) ? $userOrId->id : $userOrId;
        if (!$uid) {
            return null;
        }

        return Student::where('user_id', $uid)
            ->orWhere('id', $uid)
            ->first();
    }

    // --- Classroom Management ---
    public function getMyCourses()
    {
        $courses = $this->teacherCourseQuery()
            ->with(['department', 'students'])
            ->withCount(['enrollments as students_count', 'lessons', 'assignments', 'quizzes'])
            ->get();

        return response()->json($courses);
    }

    public function createCourse(Request $request)
    {
        try {
            $validated = $request->validate([
                'course_code' => 'required|string|max:50|unique:courses,course_code',
                'course_name' => 'required|string|max:255',
                'credit' => 'required|integer|min:1|max:6',
                'description' => 'nullable|string',
                'department_id' => 'required|exists:departments,id',
            ]);

            $validated['course_code'] = trim($validated['course_code']);
            $validated['course_name'] = trim($validated['course_name']);
            $validated['teacher_id'] = $this->getTeacherId();

            $course = DB::transaction(function () use ($validated) {
                return Course::create($validated);
            });

            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');
            $this->clearTeacherDashboardCache();

            return response()->json([
                'message' => 'បានបង្កើតមុខវិជ្ជាដោយជោគជ័យ',
                'data' => $course->load(['department', 'teacher']),
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Teacher Course store error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការបង្កើតមុខវិជ្ជា: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function updateCourse(Request $request, $id)
    {
        try {
            $course = $this->teacherCourseQuery()->findOrFail($id);

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
            ]);

            $validated['course_code'] = trim($validated['course_code']);
            $validated['course_name'] = trim($validated['course_name']);

            $course->update($validated);

            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');
            $this->clearTeacherDashboardCache();

            return response()->json([
                'message' => 'បានកែប្រែមុខវិជ្ជាដោយជោគជ័យ',
                'data' => $course->fresh(['department', 'teacher']),
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Teacher Course update error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការកែប្រែមុខវិជ្ជា: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function deleteCourse($id)
    {
        try {
            $course = $this->teacherCourseQuery()->findOrFail($id);

            if ($course->enrollments()->exists()) {
                return response()->json([
                    'message' => 'មិនអាចលុបមុខវិជ្ជាដែលមានសិស្សចុះឈ្មោះរៀនបានទេ',
                ], 400);
            }

            $courseName = $course->course_name;
            $course->delete();

            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');
            $this->clearTeacherDashboardCache();

            return response()->json([
                'message' => "បានលុបមុខវិជ្ជា '{$courseName}' ដោយជោគជ័យ",
            ]);
        } catch (\Exception $e) {
            Log::error('Teacher Course delete error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបមុខវិជ្ជា',
            ], 500);
        }
    }

    // --- Student Management ---
    public function getCourseStudents($courseId)
    {
        try {
            $course = $this->teacherCourseQuery()->findOrFail($courseId);

            $students = $course->students()
                ->where(function ($q) {
                    $q->whereNull('enrollments.status')
                      ->orWhere('enrollments.status', 'active')
                      ->orWhere('enrollments.status', '');
                })
                ->get();

            if ($students->isNotEmpty()) {
                $userIds = $students->pluck('id')->filter()->unique()->all();
                $profilesMap = Student::whereIn('user_id', $userIds)
                    ->orWhereIn('id', $userIds)
                    ->get()
                    ->keyBy('user_id');

                $students->each(function ($stu) use ($profilesMap) {
                    $prof = $profilesMap->get($stu->id);
                    if ($prof) {
                        $stu->student_code = $stu->student_code ?: $prof->student_code;
                        $stu->batch_year = $stu->batch_year ?: $prof->batch_year;
                        $stu->study_shift = $stu->study_shift ?: ($prof->study_shift ?? 'Monday-Friday');
                        $stu->gender = $stu->gender ?: $prof->gender;
                        $stu->phone = $stu->phone ?: $prof->phone;
                        $stu->profile_image = $stu->profile_image ?: $prof->profile_image;
                    }
                });
            }

            return response()->json($students);
        } catch (\Exception $e) {
            Log::error('Teacher getCourseStudents error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកបញ្ជីសិស្សក្នុងមុខវិជ្ជា: ' . $e->getMessage(),
            ], 500);
        }
    }

    // --- Attendance Management ---
    public function getAttendance($courseId)
    {
        $this->teacherCourseQuery()->findOrFail($courseId);

        $attendance = Attendance::with('student')
            ->where('course_id', $courseId)
            ->orderBy('attendance_date', 'desc')
            ->get();

        return response()->json($attendance);
    }

    public function markAttendance(Request $request)
    {
        $validated = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'student_id' => 'required|exists:users,id',
            'status' => 'required|in:Present,Absent,Late,Permission',
            'late_time' => 'nullable|date_format:H:i',
            'attendance_date' => 'required|date',
        ]);

        $this->teacherCourseQuery()->findOrFail($validated['course_id']);

        $attendance = Attendance::updateOrCreate(
            [
                'student_id' => $validated['student_id'],
                'course_id' => $validated['course_id'],
                'attendance_date' => $validated['attendance_date'],
            ],
            [
                'status' => $validated['status'],
                'late_time' => $validated['late_time'] ?? null,
            ]
        );

        Cache::forget('admin_overview_report');
        $this->clearTeacherDashboardCache();

        return response()->json([
            'attendance' => $attendance,
            'message' => 'Attendance marked successfully',
        ]);
    }

    public function bulkMarkAttendance(Request $request)
    {
        $validated = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'attendance_date' => 'required|date',
            'attendance' => 'required|array',
            'attendance.*.student_id' => 'required|exists:users,id',
            'attendance.*.status' => 'required|in:Present,Absent,Late,Permission',
            'attendance.*.late_time' => 'nullable|date_format:H:i',
        ]);

        $this->teacherCourseQuery()->findOrFail($validated['course_id']);

        DB::transaction(function () use ($validated) {
            foreach ($validated['attendance'] as $item) {
                Attendance::updateOrCreate(
                    [
                        'student_id' => $item['student_id'],
                        'course_id' => $validated['course_id'],
                        'attendance_date' => $validated['attendance_date'],
                    ],
                    [
                        'status' => $item['status'],
                        'late_time' => $item['late_time'] ?? null,
                    ]
                );
            }
        });

        Cache::forget('admin_overview_report');
        $this->clearTeacherDashboardCache();

        return response()->json([
            'message' => 'Attendance marked successfully',
        ]);
    }

    // --- Score Management (គាំទ្រទាំង ៤ ផ្នែក៖ កិច្ចការ 20%, សំណួរខ្លី 20%, ពាក់កណ្ដាលឆមាស 25%, និងប្រឡងបញ្ចប់ 35%) ---
    public function getScores($courseId)
    {
        try {
            $course = $this->teacherCourseQuery()->findOrFail($courseId);

            // ✅ ទាញយកតែសិស្សដែលបានចុះឈ្មោះរៀនក្នុងមុខវិជ្ជានេះពិតប្រាកដ
            $students = $course->students()
                ->where(function ($q) {
                    $q->whereNull('enrollments.status')
                      ->orWhere('enrollments.status', 'active')
                      ->orWhere('enrollments.status', '');
                })
                ->get();

            if ($students->isEmpty()) {
                $students = $course->students()->get();
            }

            $assignments = Assignment::where('course_id', $courseId)->get();
            $quizzes = Quiz::where('course_id', $courseId)->get();
            $assignmentIds = $assignments->pluck('id');
            $quizIds = $quizzes->pluck('id');

            // ប្រសិនបើតារាង enrollments ដាក់ student_id ជា students.id ជំនួសឱ្យ users.id
            if ($students->isEmpty()) {
                $rawEnrolledIds = Enrollment::where('course_id', $courseId)->pluck('student_id');
                if ($rawEnrolledIds->isNotEmpty()) {
                    $userIdsFromStudents = Student::whereIn('id', $rawEnrolledIds)
                        ->orWhereIn('user_id', $rawEnrolledIds)
                        ->pluck('user_id')
                        ->filter();
                    if ($userIdsFromStudents->isNotEmpty()) {
                        $students = User::whereIn('id', $userIdsFromStudents)->get();
                    }
                }
            }

            $grades = Grade::where('course_id', $courseId)->get()->keyBy('student_id');

            $allSubmissions = AssignmentSubmission::whereIn('assignment_id', $assignmentIds)
                ->whereNotNull('score')
                ->get()
                ->groupBy('student_id');

            $allAttempts = QuizAttempt::whereIn('quiz_id', $quizIds)
                ->whereNotNull('score')
                ->get()
                ->groupBy('student_id');

            // Preload student profiles to avoid N+1 queries
            $userIds = $students->pluck('id')->toArray();
            $studentProfilesByUserId = Student::whereIn('user_id', $userIds)->get()->keyBy('user_id');

            $result = $students->map(function ($student) use (
                $grades,
                $courseId,
                $assignments,
                $quizzes,
                $allSubmissions,
                $allAttempts,
                $studentProfilesByUserId
            ) {
                $grade = $grades->get($student->id);

                // Auto-calculate Assignment %
                $autoAssignmentScore = null;
                $studentSubmissions = $allSubmissions->get($student->id, collect());
                if ($studentSubmissions->count() > 0 && $assignments->count() > 0) {
                    $totalEarned = 0;
                    $totalMax = 0;
                    foreach ($studentSubmissions as $sub) {
                        $assign = $assignments->firstWhere('id', $sub->assignment_id);
                        $maxScore = $assign ? ($assign->total_score ?? $assign->marks ?? 20) : 20;
                        if ($maxScore > 0) {
                            $totalEarned += $sub->score;
                            $totalMax += $maxScore;
                        }
                    }
                    if ($totalMax > 0) {
                        $autoAssignmentScore = round(($totalEarned / $totalMax) * 100, 2);
                    }
                }

                // Auto-calculate Quiz %
                $autoQuizScore = null;
                $studentAttempts = $allAttempts->get($student->id, collect());
                if ($studentAttempts->count() > 0 && $quizzes->count() > 0) {
                    $totalEarned = 0;
                    $totalMax = 0;
                    foreach ($quizzes as $quiz) {
                        $attemptsForQuiz = $studentAttempts->where('quiz_id', $quiz->id);
                        if ($attemptsForQuiz->count() > 0) {
                            $bestAttemptScore = $attemptsForQuiz->max('score');
                            $maxMark = $quiz->total_mark ?? 20;
                            if ($maxMark > 0) {
                                $totalEarned += $bestAttemptScore;
                                $totalMax += $maxMark;
                            }
                        }
                    }
                    if ($totalMax > 0) {
                        $autoQuizScore = round(($totalEarned / $totalMax) * 100, 2);
                    }
                }

                $assignScore = $grade && $grade->assignment_score !== null ? $grade->assignment_score : $autoAssignmentScore;
                $quizScore = $grade && $grade->quiz_score !== null ? $grade->quiz_score : $autoQuizScore;
                $midtermScore = $grade && $grade->midterm_score !== null ? $grade->midterm_score : null;
                $examScore = $grade && isset($grade->exam_score) && $grade->exam_score !== null ? $grade->exam_score : null;
                $finalScore = $grade && $grade->final_score !== null ? $grade->final_score : null;
                $gradeLetter = $grade && $grade->grade_letter ? $grade->grade_letter : null;

                // ✅ ទាញយកព័ត៌មានពេញលេញពីតារាង students
                $studentProfile = $studentProfilesByUserId->get($student->id);
                $studentCode = $studentProfile && $studentProfile->student_code
                    ? $studentProfile->student_code
                    : ('STU' . str_pad((string) $student->id, 3, '0', STR_PAD_LEFT));

                $studentFirstName = $student->first_name ?: ($studentProfile ? $studentProfile->first_name : '');
                $studentLastName = $student->last_name ?: ($studentProfile ? $studentProfile->last_name : '');
                $studentEmail = $student->email ?: ($studentProfile ? $studentProfile->email : '');
                $profileImage = $student->profile_image ?: ($studentProfile ? $studentProfile->profile_image : null);
                $gender = $studentProfile ? $studentProfile->gender : ($student->gender ?? '');
                $batchYear = $studentProfile ? $studentProfile->batch_year : '';
                $studyShift = $studentProfile && $studentProfile->study_shift ? $studentProfile->study_shift : 'Monday-Friday';

                $fullName = trim($studentFirstName . ' ' . $studentLastName);
                if (empty($fullName)) {
                    $fullName = $studentEmail ?: ('Student #' . $student->id);
                }

                return [
                    'id' => $grade ? $grade->id : null,
                    'student_id' => $student->id,
                    'student_record_id' => $studentProfile ? $studentProfile->id : $student->id,
                    'student_code' => $studentCode,
                    'student_name' => $fullName,
                    'gender' => $gender,
                    'batch_year' => $batchYear,
                    'study_shift' => $studyShift,
                    'course_id' => (int) $courseId,
                    'student' => [
                        'id' => $student->id,
                        'user_id' => $student->id,
                        'name' => $fullName,
                        'first_name' => $studentFirstName,
                        'last_name' => $studentLastName,
                        'gender' => $gender,
                        'batch_year' => $batchYear,
                        'study_shift' => $studyShift,
                        'email' => $studentEmail,
                        'profile_image' => $profileImage,
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
        } catch (\Exception $e) {
            Log::error('Teacher getScores error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកពិន្ទុ: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function updateScores(Request $request)
    {
        try {
            $validated = $request->validate([
                'scores' => 'required|array',
                'scores.*.student_id' => 'required|exists:users,id',
                'scores.*.course_id' => 'required|exists:courses,id',
                'scores.*.assignment_score' => 'nullable|numeric|min:0|max:100',
                'scores.*.quiz_score' => 'nullable|numeric|min:0|max:100',
                'scores.*.midterm_score' => 'nullable|numeric|min:0|max:100',
                'scores.*.exam_score' => 'nullable|numeric|min:0|max:100',
                'scores.*.final_score' => 'nullable|numeric|min:0|max:100',
                'scores.*.grade_letter' => 'nullable|string|max:5',
            ]);

            $hasExamScoreColumn = Schema::hasColumn('grades', 'exam_score');

            DB::transaction(function () use ($validated, $hasExamScoreColumn) {
                foreach ($validated['scores'] as $scoreData) {
                    $this->teacherCourseQuery()->findOrFail($scoreData['course_id']);

                    $updatePayload = [
                        'assignment_score' => $scoreData['assignment_score'] ?? null,
                        'quiz_score' => $scoreData['quiz_score'] ?? null,
                        'midterm_score' => $scoreData['midterm_score'] ?? null,
                        'final_score' => $scoreData['final_score'] ?? null,
                        'grade_letter' => $scoreData['grade_letter'] ?? null,
                    ];

                    if ($hasExamScoreColumn && array_key_exists('exam_score', $scoreData)) {
                        $updatePayload['exam_score'] = $scoreData['exam_score'];
                    }

                    Grade::updateOrCreate(
                        [
                            'student_id' => $scoreData['student_id'],
                            'course_id' => $scoreData['course_id'],
                        ],
                        $updatePayload
                    );
                }
            });

            Cache::forget('admin_overview_report');
            $this->clearTeacherDashboardCache();

            return response()->json([
                'message' => 'បានរក្សាទុកពិន្ទុដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Teacher updateScores error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការរក្សាទុកពិន្ទុ: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function storeGrade(Request $request)
    {
        try {
            $validated = $request->validate([
                'student_id' => 'required|exists:users,id',
                'course_id' => 'required|exists:courses,id',
                'assignment_score' => 'nullable|numeric|min:0|max:100',
                'quiz_score' => 'nullable|numeric|min:0|max:100',
                'midterm_score' => 'nullable|numeric|min:0|max:100',
                'exam_score' => 'nullable|numeric|min:0|max:100',
                'final_score' => 'nullable|numeric|min:0|max:100',
                'grade_letter' => 'nullable|string|max:5',
            ]);

            $this->teacherCourseQuery()->findOrFail($validated['course_id']);

            $updatePayload = [
                'assignment_score' => $validated['assignment_score'] ?? null,
                'quiz_score' => $validated['quiz_score'] ?? null,
                'midterm_score' => $validated['midterm_score'] ?? null,
                'final_score' => $validated['final_score'] ?? null,
                'grade_letter' => $validated['grade_letter'] ?? null,
            ];

            if (Schema::hasColumn('grades', 'exam_score') && array_key_exists('exam_score', $validated)) {
                $updatePayload['exam_score'] = $validated['exam_score'];
            }

            $grade = Grade::updateOrCreate(
                [
                    'student_id' => $validated['student_id'],
                    'course_id' => $validated['course_id'],
                ],
                $updatePayload
            );

            Cache::forget('admin_overview_report');
            $this->clearTeacherDashboardCache();

            return response()->json([
                'grade' => $grade,
                'message' => 'បានរក្សាទុកពិន្ទុដោយជោគជ័យ',
            ], 201);
        } catch (\Exception $e) {
            Log::error('Teacher storeGrade error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការបង្កើតពិន្ទុ: ' . $e->getMessage(),
            ], 500);
        }
    }

    // --- Lesson Management ---
    public function getLessons(Request $request)
    {
        try {
            $courseIds = $this->teacherCourseQuery()->pluck('id');

            $query = Lesson::with(['course', 'files', 'videos'])
                ->where(function ($q) use ($courseIds) {
                    $q->whereIn('course_id', $courseIds)
                      ->orWhere('created_by', auth()->id());
                });

            if ($request->has('course_id') && !empty($request->course_id)) {
                $query->where('course_id', $request->course_id);
            }

            $lessons = $query->orderBy('lesson_order')->get();

            return response()->json($lessons);
        } catch (\Exception $e) {
            Log::error('Teacher getLessons error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមេរៀន: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function createLesson(Request $request)
    {
        $validated = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'lesson_order' => 'nullable|integer|min:0',
        ]);

        $this->teacherCourseQuery()->findOrFail($validated['course_id']);

        $validated['created_by'] = auth()->id();
        $validated['lesson_order'] = $validated['lesson_order'] ?? 0;

        $lesson = Lesson::create($validated);

        Cache::forget('admin_overview_report');
        $this->clearTeacherDashboardCache();

        return response()->json([
            'lesson' => $lesson->load(['course', 'files', 'videos']),
            'message' => 'Lesson created successfully',
        ], 201);
    }

    public function updateLesson(Request $request, $id)
    {
        try {
            $courseIds = $this->teacherCourseQuery()->pluck('id');
            $lesson = Lesson::where(function ($q) use ($courseIds) {
                $q->whereIn('course_id', $courseIds)
                  ->orWhere('created_by', auth()->id());
            })->findOrFail($id);

            $validated = $request->validate([
                'course_id' => 'required|exists:courses,id',
                'title' => 'required|string|max:255',
                'description' => 'nullable|string',
                'lesson_order' => 'nullable|integer|min:0',
            ]);

            $this->teacherCourseQuery()->findOrFail($validated['course_id']);

            $lesson->update($validated);
            $this->clearTeacherDashboardCache();

            return response()->json([
                'lesson' => $lesson->load(['course', 'files', 'videos']),
                'message' => 'Lesson updated successfully',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Teacher updateLesson error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការកែប្រែមេរៀន: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function deleteLesson($id)
    {
        try {
            $courseIds = $this->teacherCourseQuery()->pluck('id');
            $lesson = Lesson::where(function ($q) use ($courseIds) {
                $q->whereIn('course_id', $courseIds)
                  ->orWhere('created_by', auth()->id());
            })->findOrFail($id);

            foreach ($lesson->files as $file) {
                if (
                    $file->file_path &&
                    !str_starts_with($file->file_path, 'http') &&
                    !str_starts_with($file->file_path, 'data:')
                ) {
                    Storage::disk('public')->delete($file->file_path);
                }
                $file->delete();
            }

            foreach ($lesson->videos as $video) {
                if (
                    $video->video_url &&
                    !str_starts_with($video->video_url, 'http') &&
                    !str_starts_with($video->video_url, '//') &&
                    !str_starts_with($video->video_url, 'data:')
                ) {
                    Storage::disk('public')->delete($video->video_url);
                }
                $video->delete();
            }

            $lesson->delete();

            Cache::forget('admin_overview_report');
            $this->clearTeacherDashboardCache();

            return response()->json([
                'message' => 'បានលុបមេរៀនដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Teacher deleteLesson error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបមេរៀន: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function uploadLessonFile(Request $request)
    {
        $request->validate([
            'lesson_id' => 'required|exists:lessons,id',
            'file' => 'required|file|max:10240',
        ]);

        $courseIds = $this->teacherCourseQuery()->pluck('id');
        Lesson::where(function ($q) use ($courseIds) {
            $q->whereIn('course_id', $courseIds)
              ->orWhere('created_by', auth()->id());
        })->findOrFail($request->lesson_id);

        $file = $request->file('file');
        $filePath = $file->store('lesson_files', 'public');

        $createData = [
            'lesson_id' => $request->lesson_id,
            'file_name' => $file->getClientOriginalName(),
            'file_path' => $filePath,
            'file_type' => $file->getClientOriginalExtension(),
        ];

        if (Schema::hasColumn('lesson_files', 'file_data')) {
            $createData['file_data'] = base64_encode(file_get_contents($file->getRealPath()));
        }
        if (Schema::hasColumn('lesson_files', 'mime_type')) {
            $createData['mime_type'] = $file->getMimeType() ?: 'application/octet-stream';
        }

        $lessonFile = LessonFile::create($createData);

        return response()->json([
            'file' => $lessonFile,
            'message' => 'File uploaded successfully',
        ]);
    }

    public function deleteLessonFile($id)
    {
        try {
            $lessonFile = LessonFile::findOrFail($id);
            $courseIds = $this->teacherCourseQuery()->pluck('id');

            Lesson::where(function ($q) use ($courseIds) {
                $q->whereIn('course_id', $courseIds)
                  ->orWhere('created_by', auth()->id());
            })->findOrFail($lessonFile->lesson_id);

            if (
                $lessonFile->file_path &&
                !str_starts_with($lessonFile->file_path, 'http') &&
                !str_starts_with($lessonFile->file_path, 'data:')
            ) {
                Storage::disk('public')->delete($lessonFile->file_path);
            }
            $lessonFile->delete();

            return response()->json([
                'message' => 'បានលុបឯកសារដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Teacher deleteLessonFile error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបឯកសារ',
            ], 500);
        }
    }

    public function uploadVideo(Request $request)
    {
        $request->validate([
            'lesson_id' => 'required|exists:lessons,id',
            'title' => 'required|string|max:255',
            'video' => 'nullable|file|mimes:mp4,mov,avi,wmv|max:204800',
            'video_url' => 'nullable|string',
            'duration' => 'nullable|string',
        ]);

        $courseIds = $this->teacherCourseQuery()->pluck('id');
        Lesson::where(function ($q) use ($courseIds) {
            $q->whereIn('course_id', $courseIds)
              ->orWhere('created_by', auth()->id());
        })->findOrFail($request->lesson_id);

        $filePath = '';
        if ($request->hasFile('video')) {
            $video = $request->file('video');
            $filePath = $video->store('videos', 'public');
        } elseif (!empty($request->video_url)) {
            $filePath = trim($request->video_url);
        } else {
            return response()->json(['message' => 'សូមបញ្ចូលវីដេអូ ឬ តំណភ្ជាប់ YouTube'], 422);
        }

        $videoRecord = Video::create([
            'lesson_id' => $request->lesson_id,
            'title' => trim($request->title),
            'video_url' => $filePath,
            'duration' => $request->duration ?? null,
        ]);

        return response()->json([
            'video' => $videoRecord,
            'message' => 'Video uploaded successfully',
        ]);
    }

    public function deleteVideo($id)
    {
        try {
            $video = Video::findOrFail($id);
            $courseIds = $this->teacherCourseQuery()->pluck('id');

            Lesson::where(function ($q) use ($courseIds) {
                $q->whereIn('course_id', $courseIds)
                  ->orWhere('created_by', auth()->id());
            })->findOrFail($video->lesson_id);

            if (
                $video->video_url &&
                !str_starts_with($video->video_url, 'http') &&
                !str_starts_with($video->video_url, '//') &&
                !str_starts_with($video->video_url, 'data:')
            ) {
                Storage::disk('public')->delete($video->video_url);
            }
            $video->delete();

            return response()->json([
                'message' => 'បានលុបវីដេអូដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Teacher deleteVideo error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបវីដេអូ',
            ], 500);
        }
    }

    // --- Assignment Management ---
    public function getTeacherAssignments(Request $request)
    {
        try {
            $courseIds = $this->teacherCourseQuery()->pluck('id');

            $query = Assignment::with(['course'])
                ->withCount('submissions')
                ->where(function ($q) use ($courseIds) {
                    $q->whereIn('course_id', $courseIds)
                      ->orWhere('created_by', auth()->id());
                });

            if ($request->has('course_id') && !empty($request->course_id)) {
                $query->where('course_id', $request->course_id);
            }

            if ($request->filled('search')) {
                $search = trim($request->search);
                $query->where('title', 'like', "%{$search}%");
            }

            $query->orderBy('created_at', 'desc');

            if ($request->has('per_page') || $request->has('page')) {
                $perPage = max(1, min((int) $request->input('per_page', 15), 100));
                $paginated = $query->paginate($perPage);

                return response()->json([
                    'data' => $paginated->items(),
                    'total' => $paginated->total(),
                    'current_page' => $paginated->currentPage(),
                    'last_page' => $paginated->lastPage(),
                    'per_page' => $paginated->perPage(),
                ]);
            }

            $assignments = $query->get();

            return response()->json($assignments);
        } catch (\Exception $e) {
            Log::error('Teacher getTeacherAssignments error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកកិច្ចការ: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function createAssignment(Request $request)
    {
        $validated = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'due_date' => 'required|date',
            'total_score' => 'nullable|numeric|min:0',
        ]);

        $this->teacherCourseQuery()->findOrFail($validated['course_id']);

        $assignment = DB::transaction(function () use ($validated) {
            $validated['total_score'] = $validated['total_score'] ?? 20;
            $validated['created_by'] = auth()->id();

            return Assignment::create($validated);
        });

        Cache::forget('admin_overview_report');
        $this->clearTeacherDashboardCache();

        return response()->json([
            'assignment' => $assignment->load('course'),
            'message' => 'Assignment created successfully',
        ], 201);
    }

    public function updateAssignment(Request $request, $id)
    {
        try {
            $courseIds = $this->teacherCourseQuery()->pluck('id');
            $assignment = Assignment::where(function ($q) use ($courseIds) {
                $q->whereIn('course_id', $courseIds)
                  ->orWhere('created_by', auth()->id());
            })->findOrFail($id);

            $validated = $request->validate([
                'course_id' => 'required|exists:courses,id',
                'title' => 'required|string|max:255',
                'description' => 'required|string',
                'due_date' => 'required|date',
                'total_score' => 'required|numeric|min:0',
            ]);

            $this->teacherCourseQuery()->findOrFail($validated['course_id']);

            $assignment->update($validated);
            $this->clearTeacherDashboardCache();

            return response()->json([
                'assignment' => $assignment->load('course'),
                'message' => 'Assignment updated successfully',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Teacher updateAssignment error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការកែប្រែកិច្ចការ: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function deleteAssignment($id)
    {
        try {
            $courseIds = $this->teacherCourseQuery()->pluck('id');
            $assignment = Assignment::where(function ($q) use ($courseIds) {
                $q->whereIn('course_id', $courseIds)
                  ->orWhere('created_by', auth()->id());
            })->findOrFail($id);

            if ($assignment->submissions()->exists()) {
                return response()->json([
                    'message' => 'មិនអាចលុបកិច្ចការដែលមានសិស្សដាក់រួចហើយបានទេ',
                ], 400);
            }

            $assignment->delete();

            Cache::forget('admin_overview_report');
            $this->clearTeacherDashboardCache();

            return response()->json([
                'message' => 'បានលុបកិច្ចការដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Teacher deleteAssignment error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបកិច្ចការ',
            ], 500);
        }
    }

    public function getAssignments($courseId)
    {
        $this->teacherCourseQuery()->findOrFail($courseId);

        $assignments = Assignment::withCount('submissions')
            ->where('course_id', $courseId)
            ->get();

        return response()->json($assignments);
    }

    public function getAssignmentSubmissions($assignmentId)
    {
        try {
            $assignment = Assignment::with(['course'])->findOrFail($assignmentId);

            $teacherIds = $this->getTeacherCourseIds();
            if ($assignment->created_by !== auth()->id() && !in_array((int) ($assignment->course->teacher_id ?? 0), $teacherIds)) {
                return response()->json([
                    'message' => 'Unauthorized action',
                ], 403);
            }

            $rawSubmissions = AssignmentSubmission::with(['student:id,first_name,last_name,email,profile_image'])
                ->where('assignment_id', $assignmentId)
                ->orderBy('submitted_at', 'desc')
                ->get();

            // Preload student profiles ក្នុង Query តែម្តង (ការពារ N+1 Query)
            $studentIds = $rawSubmissions->pluck('student_id')->filter()->unique()->all();
            $profilesByUserId = Student::whereIn('user_id', $studentIds)
                ->orWhereIn('id', $studentIds)
                ->get();
            $mapByUserId = $profilesByUserId->keyBy('user_id');
            $mapById = $profilesByUserId->keyBy('id');

            $submissions = $rawSubmissions->map(function ($submission) use ($mapByUserId, $mapById) {
                $stuProfile = $mapByUserId->get($submission->student_id) ?? $mapById->get($submission->student_id);
                $studentObj = $submission->student ? $submission->student->toArray() : [];

                if ($stuProfile) {
                    $studentObj['gender'] = $stuProfile->gender ?? ($studentObj['gender'] ?? '');
                    $studentObj['study_shift'] = $stuProfile->study_shift ?? 'Monday-Friday';
                    $studentObj['batch_year'] = $stuProfile->batch_year ?? '';
                    $studentObj['student_code'] = $stuProfile->student_code ?? '';
                    if (empty($studentObj['profile_image']) && $stuProfile->profile_image) {
                        $studentObj['profile_image'] = $stuProfile->profile_image;
                    }
                }

                $fileUrl = null;
                if ($submission->file_path) {
                    if (
                        str_starts_with($submission->file_path, 'http') ||
                        str_starts_with($submission->file_path, 'data:')
                    ) {
                        $fileUrl = $submission->file_path;
                    } else {
                        $fileUrl = asset('storage/' . ltrim(preg_replace('/^\/?storage\//', '', $submission->file_path), '/'));
                    }
                }

                return [
                    'id' => $submission->id,
                    'assignment_id' => $submission->assignment_id,
                    'student_id' => $submission->student_id,
                    'study_shift' => $studentObj['study_shift'] ?? 'Monday-Friday',
                    'student' => $studentObj,
                    'file_path' => $submission->file_path,
                    'file_url' => $fileUrl,
                    'submitted_at' => $submission->submitted_at,
                    'score' => $submission->score,
                    'feedback' => $submission->feedback,
                    'created_at' => $submission->created_at,
                    'updated_at' => $submission->updated_at,
                ];
            });

            return response()->json([
                'assignment' => $assignment,
                'submissions' => $submissions,
            ]);
        } catch (\Exception $e) {
            Log::error('Teacher getAssignmentSubmissions error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកការដាក់កិច្ចការ: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function gradeSubmission(Request $request, $submissionId)
    {
        try {
            $submission = AssignmentSubmission::with('assignment.course')->findOrFail($submissionId);
            $assignment = $submission->assignment;

            $teacherIds = $this->getTeacherCourseIds();
            if ($assignment->created_by !== auth()->id() && !in_array((int) ($assignment->course->teacher_id ?? 0), $teacherIds)) {
                return response()->json([
                    'message' => 'Unauthorized action',
                ], 403);
            }

            $maxScore = $assignment->total_score ?? $assignment->marks ?? 20;
            $validated = $request->validate([
                'score' => "nullable|numeric|min:0|max:{$maxScore}",
                'feedback' => 'nullable|string',
            ]);

            $submission->update([
                'score' => $validated['score'] ?? null,
                'feedback' => $validated['feedback'] ?? null,
            ]);

            $this->clearTeacherDashboardCache();

            return response()->json([
                'submission' => $submission->fresh(['student:id,first_name,last_name,email,profile_image']),
                'message' => 'បានកែប្រែពិន្ទុ និងការផ្តល់មតិយោបល់ដោយជោគជ័យ',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Teacher gradeSubmission error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការដាក់ពិន្ទុ: ' . $e->getMessage(),
            ], 500);
        }
    }

    // --- Quiz Management ---
    public function getTeacherQuizzes(Request $request)
    {
        try {
            $teacherIds = $this->getTeacherCourseIds();
            $query = Quiz::with(['course', 'questions.options'])
                ->withCount(['questions', 'attempts'])
                ->whereHas('course', function ($query) use ($teacherIds) {
                    $query->whereIn('teacher_id', $teacherIds);
                });

            if ($request->has('course_id') && !empty($request->course_id)) {
                $query->where('course_id', $request->course_id);
            }

            if ($request->filled('search')) {
                $search = trim($request->search);
                $query->where('title', 'like', "%{$search}%");
            }

            $query->orderBy('created_at', 'desc');

            if ($request->has('per_page') || $request->has('page')) {
                $perPage = max(1, min((int) $request->input('per_page', 15), 100));
                $paginated = $query->paginate($perPage);

                return response()->json([
                    'data' => $paginated->items(),
                    'total' => $paginated->total(),
                    'current_page' => $paginated->currentPage(),
                    'last_page' => $paginated->lastPage(),
                    'per_page' => $paginated->perPage(),
                ]);
            }

            $quizzes = $query->get();

            return response()->json($quizzes);
        } catch (\Exception $e) {
            Log::error('Teacher getTeacherQuizzes error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកកម្រងសំណួរ: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function createQuiz(Request $request)
    {
        $validated = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'title' => 'required|string|max:255',
            'duration' => 'required|integer|min:1',
            'total_mark' => 'required|numeric|min:0',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after:start_date',
        ]);

        $this->teacherCourseQuery()->findOrFail($validated['course_id']);

        $quiz = DB::transaction(function () use ($validated) {
            return Quiz::create($validated);
        });

        $this->clearTeacherDashboardCache();

        return response()->json([
            'quiz' => $quiz->load('course'),
            'message' => 'Quiz created successfully',
        ], 201);
    }

    public function importQuizzes(Request $request)
    {
        try {
            $validated = $request->validate([
                'course_id' => 'nullable|exists:courses,id',
                'quizzes' => 'required|array|min:1',
                'quizzes.*.title' => 'required|string|max:255',
                'quizzes.*.course_id' => 'nullable|exists:courses,id',
                'quizzes.*.duration' => 'nullable|integer|min:1',
                'quizzes.*.total_mark' => 'nullable|numeric|min:0',
                'quizzes.*.start_date' => 'nullable|date',
                'quizzes.*.end_date' => 'nullable|date',
                'quizzes.*.questions' => 'nullable|array',
                'quizzes.*.questions.*.question_text' => 'required|string',
                'quizzes.*.questions.*.question_type' => 'nullable|in:MCQ,TrueFalse,Essay',
                'quizzes.*.questions.*.mark' => 'nullable|numeric|min:0',
                'quizzes.*.questions.*.options' => 'nullable|array',
            ]);

            $importedQuizzes = [];

            DB::transaction(function () use ($validated, &$importedQuizzes) {
                foreach ($validated['quizzes'] as $quizData) {
                    $courseId = $quizData['course_id'] ?? $validated['course_id'] ?? null;
                    if (!$courseId) {
                        throw new \Exception('គ្រប់កម្រងសំណួរត្រូវមាន course_id ត្រឹមត្រូវ');
                    }

                    $this->teacherCourseQuery()->findOrFail($courseId);

                    $now = now();
                    $startDate = !empty($quizData['start_date']) ? $quizData['start_date'] : $now;
                    $endDate = !empty($quizData['end_date']) ? $quizData['end_date'] : $now->copy()->addDays(7);

                    $quiz = Quiz::create([
                        'course_id' => $courseId,
                        'title' => $quizData['title'],
                        'duration' => $quizData['duration'] ?? 30,
                        'total_mark' => $quizData['total_mark'] ?? 20,
                        'start_date' => $startDate,
                        'end_date' => $endDate,
                    ]);

                    if (isset($quizData['questions']) && is_array($quizData['questions'])) {
                        foreach ($quizData['questions'] as $qData) {
                            $qType = $qData['question_type'] ?? 'MCQ';
                            $question = Question::create([
                                'quiz_id' => $quiz->id,
                                'question_text' => $qData['question_text'],
                                'question_type' => $qType,
                                'mark' => $qData['mark'] ?? 1,
                            ]);

                            if (isset($qData['options']) && is_array($qData['options'])) {
                                foreach ($qData['options'] as $opt) {
                                    QuestionOption::create([
                                        'question_id' => $question->id,
                                        'option_text' => $opt['option_text'] ?? '',
                                        'is_correct' => filter_var($opt['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN),
                                    ]);
                                }
                            }
                        }
                    }

                    $importedQuizzes[] = $quiz->load(['course', 'questions.options']);
                }
            });

            $this->clearTeacherDashboardCache();

            return response()->json([
                'quizzes' => $importedQuizzes,
                'message' => 'បាននាំចូលកម្រងសំណួរដោយជោគជ័យ',
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'ទម្រង់ទិន្នន័យ JSON មិនត្រឹមត្រូវ',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Teacher importQuizzes error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការនាំចូលកម្រងសំណួរ: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function updateQuiz(Request $request, $id)
    {
        try {
            $teacherIds = $this->getTeacherCourseIds();
            $quiz = Quiz::whereHas('course', function ($query) use ($teacherIds) {
                $query->whereIn('teacher_id', $teacherIds);
            })->findOrFail($id);

            $validated = $request->validate([
                'course_id' => 'required|exists:courses,id',
                'title' => 'required|string|max:255',
                'duration' => 'required|integer|min:1',
                'total_mark' => 'required|numeric|min:0',
                'start_date' => 'required|date',
                'end_date' => 'required|date|after:start_date',
            ]);

            $this->teacherCourseQuery()->findOrFail($validated['course_id']);

            $quiz->update($validated);
            $this->clearTeacherDashboardCache();

            return response()->json([
                'quiz' => $quiz->load('course'),
                'message' => 'Quiz updated successfully',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Teacher updateQuiz error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការកែប្រែកម្រងសំណួរ: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function deleteQuiz($id)
    {
        try {
            $teacherIds = $this->getTeacherCourseIds();
            $quiz = Quiz::whereHas('course', function ($query) use ($teacherIds) {
                $query->whereIn('teacher_id', $teacherIds);
            })->findOrFail($id);

            if ($quiz->attempts()->exists()) {
                return response()->json([
                    'message' => 'មិនអាចលុបកម្រងសំណួរដែលមានសិស្សចូលរួមធ្វើរួចហើយបានទេ',
                ], 400);
            }

            DB::transaction(function () use ($quiz) {
                foreach ($quiz->questions as $question) {
                    $question->options()->delete();
                    $question->delete();
                }
                $quiz->delete();
            });

            $this->clearTeacherDashboardCache();

            return response()->json([
                'message' => 'បានលុបកម្រងសំណួរដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Teacher deleteQuiz error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបកម្រងសំណួរ',
            ], 500);
        }
    }

    public function addQuestion(Request $request, $quizId)
    {
        $validated = $request->validate([
            'question_text' => 'required|string',
            'question_type' => 'required|in:MCQ,TrueFalse,Essay',
            'mark' => 'required|numeric|min:0',
            'options' => 'required_if:question_type,MCQ|array|min:2',
            'options.*.option_text' => 'required|string',
            'options.*.is_correct' => 'required|boolean',
        ]);

        $teacherIds = $this->getTeacherCourseIds();
        Quiz::whereHas('course', function ($query) use ($teacherIds) {
            $query->whereIn('teacher_id', $teacherIds);
        })->findOrFail($quizId);

        $question = DB::transaction(function () use ($validated, $quizId) {
            $q = Question::create([
                'quiz_id' => $quizId,
                'question_text' => $validated['question_text'],
                'question_type' => $validated['question_type'],
                'mark' => $validated['mark'],
            ]);

            if (isset($validated['options']) && in_array($validated['question_type'], ['MCQ', 'TrueFalse'])) {
                foreach ($validated['options'] as $option) {
                    QuestionOption::create([
                        'question_id' => $q->id,
                        'option_text' => $option['option_text'],
                        'is_correct' => $option['is_correct'],
                    ]);
                }
            }

            return $q;
        });

        return response()->json([
            'question' => $question->load('options'),
            'message' => 'Question added successfully',
        ], 201);
    }

    public function deleteQuestion($id)
    {
        try {
            $question = Question::findOrFail($id);

            $teacherIds = $this->getTeacherCourseIds();
            $quiz = Quiz::whereHas('course', function ($query) use ($teacherIds) {
                $query->whereIn('teacher_id', $teacherIds);
            })->findOrFail($question->quiz_id);

            if ($quiz->attempts()->exists()) {
                return response()->json([
                    'message' => 'មិនអាចលុបសំណួរក្នុងកម្រងសំណួរដែលសិស្សបានធ្វើរួចហើយទេ',
                ], 400);
            }

            DB::transaction(function () use ($question) {
                $question->options()->delete();
                $question->delete();
            });

            return response()->json([
                'message' => 'បានលុបសំណួរដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Teacher deleteQuestion error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបសំណួរ',
            ], 500);
        }
    }

    // --- Online Exam ---
    public function getQuizzes($courseId)
    {
        $this->teacherCourseQuery()->findOrFail($courseId);

        $quizzes = Quiz::with(['questions.options'])
            ->where('course_id', $courseId)
            ->get();

        return response()->json($quizzes);
    }

    public function getQuizResults($quizId)
    {
        try {
            $teacherIds = $this->getTeacherCourseIds();
            $quiz = Quiz::with('course')
                ->whereHas('course', function ($query) use ($teacherIds) {
                    $query->whereIn('teacher_id', $teacherIds);
                })->findOrFail($quizId);

            $rawAttempts = $quiz->attempts()
                ->with(['student:id,first_name,last_name,email,profile_image'])
                ->orderBy('submitted_at', 'desc')
                ->get();

            // Preload student profiles ក្នុង Query តែម្តង (ការពារ N+1 Query)
            $studentIds = $rawAttempts->pluck('student_id')->filter()->unique()->all();
            $profiles = Student::whereIn('user_id', $studentIds)
                ->orWhereIn('id', $studentIds)
                ->get();
            $mapByUserId = $profiles->keyBy('user_id');
            $mapById = $profiles->keyBy('id');

            $attempts = $rawAttempts->map(function ($attempt) use ($mapByUserId, $mapById) {
                $stuProfile = $mapByUserId->get($attempt->student_id) ?? $mapById->get($attempt->student_id);
                $studentObj = $attempt->student ? $attempt->student->toArray() : [];

                if ($stuProfile) {
                    $studentObj['gender'] = $stuProfile->gender ?? ($studentObj['gender'] ?? '');
                    $studentObj['study_shift'] = $stuProfile->study_shift ?? 'Monday-Friday';
                    $studentObj['batch_year'] = $stuProfile->batch_year ?? '';
                    $studentObj['student_code'] = $stuProfile->student_code ?? '';
                    if (empty($studentObj['profile_image']) && $stuProfile->profile_image) {
                        $studentObj['profile_image'] = $stuProfile->profile_image;
                    }
                }

                return [
                    'id' => $attempt->id,
                    'quiz_id' => $attempt->quiz_id,
                    'student_id' => $attempt->student_id,
                    'study_shift' => $studentObj['study_shift'] ?? 'Monday-Friday',
                    'student' => $studentObj,
                    'score' => $attempt->score,
                    'started_at' => $attempt->started_at,
                    'submitted_at' => $attempt->submitted_at,
                    'created_at' => $attempt->created_at,
                    'updated_at' => $attempt->updated_at,
                ];
            });

            return response()->json([
                'quiz' => $quiz,
                'attempts' => $attempts,
            ]);
        } catch (\Exception $e) {
            Log::error('Teacher getQuizResults error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកលទ្ធផលកម្រងសំណួរ: ' . $e->getMessage(),
            ], 500);
        }
    }
}
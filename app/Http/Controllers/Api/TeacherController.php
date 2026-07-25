<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\LessonFile;
use App\Models\Video;
use App\Models\Assignment;
use App\Models\AssignmentSubmission;
use App\Models\Quiz;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Attendance;
use App\Models\Grade;
use App\Models\User;
use App\Models\Enrollment;
use App\Models\Teacher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TeacherController extends Controller
{
    // --- Dashboard ---
    public function dashboard()
    {
        $teacher = auth()->user();
        $courses = $teacher->courses()->withCount(['students', 'lessons', 'assignments', 'quizzes'])->get();
        
        $stats = [
            'total_courses' => $courses->count(),
            'total_students' => $courses->sum('students_count'),
            'total_lessons' => $courses->sum('lessons_count'),
            'total_assignments' => $courses->sum('assignments_count'),
            'total_quizzes' => $courses->sum('quizzes_count'),
        ];

        return response()->json([
            'stats' => $stats,
            'courses' => $courses,
        ]);
    }

    // ============================================
    // PROFILE MANAGEMENT (បន្ថែមថ្មី)
    // ============================================

    // Get teacher profile
    public function getProfile()
    {
        $user = auth()->user();
        $teacher = Teacher::where('user_id', $user->id)
            ->with(['department', 'role'])
            ->first();

        if (!$teacher) {
            return response()->json([
                'message' => 'Teacher profile not found'
            ], 404);
        }

        return response()->json([
            'user' => $user,
            'teacher' => $teacher,
            'profile_image' => $teacher->profile_image_url,
        ]);
    }

    

    // Update teacher profile image
    public function updateProfileImage(Request $request)
    {
        $request->validate([
            'profile_image' => 'required|image|mimes:jpeg,png,jpg,gif,svg,webp|max:5120', // 5MB max
        ]);

        $user = auth()->user();
        $teacher = Teacher::where('user_id', $user->id)->first();

        if (!$teacher) {
            return response()->json([
                'message' => 'Teacher profile not found'
            ], 404);
        }

        try {
            // Delete old image if exists
            if ($teacher->profile_image) {
                $oldPath = str_replace('storage/', '', $teacher->profile_image);
                $oldPath = str_replace('/storage/', '', $oldPath);
                
                if (Storage::disk('public')->exists($oldPath)) {
                    Storage::disk('public')->delete($oldPath);
                }
            }

            // Store new image
            $image = $request->file('profile_image');
            $filename = 'teacher_' . $user->id . '_' . Str::random(10) . '.' . $image->getClientOriginalExtension();
            $path = $image->storeAs('teacher-profiles', $filename, 'public');
            
            // Update teacher record
            $teacher->update([
                'profile_image' => $path,
            ]);

            // Also update user if you want
            // $user->update(['profile_image' => $path]);

            return response()->json([
                'message' => 'Profile image updated successfully',
                'profile_image' => asset('storage/' . $path),
                'teacher' => $teacher->fresh(),
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to upload image',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // Update teacher profile
    public function updateProfile(Request $request)
    {
        $user = auth()->user();
        $teacher = Teacher::where('user_id', $user->id)->first();

        if (!$teacher) {
            return response()->json([
                'message' => 'Teacher profile not found'
            ], 404);
        }

        $validated = $request->validate([
            'first_name' => 'sometimes|string|max:255',
            'last_name' => 'sometimes|string|max:255',
            'email' => 'sometimes|email|unique:users,email,' . $user->id . '|unique:teachers,email,' . $teacher->id,
            'phone' => 'nullable|string|max:20',
            'gender' => 'nullable|in:Male,Female,Other',
            'date_of_birth' => 'nullable|date',
            'specialization' => 'nullable|string|max:255',
        ]);

        DB::transaction(function () use ($validated, $user, $teacher) {
            // Update user
            if (isset($validated['first_name']) || isset($validated['last_name']) || isset($validated['email'])) {
                $user->update([
                    'first_name' => $validated['first_name'] ?? $user->first_name,
                    'last_name' => $validated['last_name'] ?? $user->last_name,
                    'email' => $validated['email'] ?? $user->email,
                ]);
            }

            // Update teacher
            $teacher->update([
                'first_name' => $validated['first_name'] ?? $teacher->first_name,
                'last_name' => $validated['last_name'] ?? $teacher->last_name,
                'email' => $validated['email'] ?? $teacher->email,
                'phone' => $validated['phone'] ?? $teacher->phone,
                'gender' => $validated['gender'] ?? $teacher->gender,
                'date_of_birth' => $validated['date_of_birth'] ?? $teacher->date_of_birth,
                'specialization' => $validated['specialization'] ?? $teacher->specialization,
            ]);
        });

        return response()->json([
            'message' => 'Profile updated successfully',
            'user' => $user->fresh(),
            'teacher' => $teacher->fresh(),
            'profile_image' => $teacher->profile_image_url,
        ]);
    }

    // --- Classroom Management ---
    public function getMyCourses()
    {
        $courses = Course::with(['department', 'students'])
            ->where('teacher_id', auth()->id())
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

            $validated['teacher_id'] = auth()->id();

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
            \Log::error('Teacher Course store error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការបង្កើតមុខវិជ្ជា: ' . $e->getMessage()
            ], 500);
        }
    }

    public function updateCourse(Request $request, $id)
    {
        try {
            $course = Course::where('teacher_id', auth()->id())->findOrFail($id);

            $validated = $request->validate([
                'course_code' => [
                    'required',
                    'string',
                    'max:50',
                    \Illuminate\Validation\Rule::unique('courses', 'course_code')->ignore($course->id),
                ],
                'course_name' => 'required|string|max:255',
                'credit' => 'required|integer|min:1|max:6',
                'description' => 'nullable|string',
                'department_id' => 'required|exists:departments,id',
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
            \Log::error('Teacher Course update error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការកែប្រែមុខវិជ្ជា: ' . $e->getMessage()
            ], 500);
        }
    }

    public function deleteCourse($id)
    {
        try {
            $course = Course::where('teacher_id', auth()->id())->findOrFail($id);

            // Check if there are enrollments
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
            \Log::error('Teacher Course delete error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបមុខវិជ្ជា'
            ], 500);
        }
    }

    // --- Student Management ---
    public function getCourseStudents($courseId)
    {
        $course = Course::where('teacher_id', auth()->id())->findOrFail($courseId);

        $students = $course->students()
            ->wherePivot('status', 'active')
            ->get();

        return response()->json($students);
    }

    // --- Attendance Management ---
    public function getAttendance($courseId)
    {
        $course = Course::where('teacher_id', auth()->id())
            ->findOrFail($courseId);

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
            'status' => 'required|in:Present,Absent,Late',
            'attendance_date' => 'required|date',
        ]);

        Course::where('teacher_id', auth()->id())
            ->findOrFail($validated['course_id']);

        $attendance = Attendance::updateOrCreate(
            [
                'student_id' => $validated['student_id'],
                'course_id' => $validated['course_id'],
                'attendance_date' => $validated['attendance_date'],
            ],
            ['status' => $validated['status']]
        );

        return response()->json([
            'attendance' => $attendance,
            'message' => 'Attendance marked successfully'
        ]);
    }

    public function bulkMarkAttendance(Request $request)
    {
        $validated = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'attendance_date' => 'required|date',
            'attendance' => 'required|array',
            'attendance.*.student_id' => 'required|exists:users,id',
            'attendance.*.status' => 'required|in:Present,Absent,Late',
        ]);

        Course::where('teacher_id', auth()->id())
            ->findOrFail($validated['course_id']);

        DB::transaction(function () use ($validated) {
            foreach ($validated['attendance'] as $item) {
                Attendance::updateOrCreate(
                    [
                        'student_id' => $item['student_id'],
                        'course_id' => $validated['course_id'],
                        'attendance_date' => $validated['attendance_date'],
                    ],
                    ['status' => $item['status']]
                );
            }
        });

        return response()->json([
            'message' => 'Attendance marked successfully'
        ]);
    }

    // --- Score Management ---
    public function getScores($courseId)
    {
        $course = Course::where('teacher_id', auth()->id())->findOrFail($courseId);

        $students = $course->students()
            ->wherePivot('status', 'active')
            ->get();

        $grades = Grade::where('course_id', $courseId)->get()->keyBy('student_id');

        $result = $students->map(function ($student) use ($grades, $courseId) {
            $grade = $grades->get($student->id);
            return [
                'id' => $grade ? $grade->id : null,
                'student_id' => $student->id,
                'course_id' => (int)$courseId,
                'student' => $student,
                'assignment_score' => $grade ? $grade->assignment_score : null,
                'quiz_score' => $grade ? $grade->quiz_score : null,
                'final_score' => $grade ? $grade->final_score : null,
                'grade_letter' => $grade ? $grade->grade_letter : null,
            ];
        });

        return response()->json($result);
    }

    public function updateScores(Request $request)
    {
        $validated = $request->validate([
            'scores' => 'required|array',
            'scores.*.student_id' => 'required|exists:users,id',
            'scores.*.course_id' => 'required|exists:courses,id',
            'scores.*.assignment_score' => 'nullable|numeric|min:0|max:100',
            'scores.*.quiz_score' => 'nullable|numeric|min:0|max:100',
            'scores.*.final_score' => 'nullable|numeric|min:0|max:100',
            'scores.*.grade_letter' => 'nullable|string|max:2',
        ]);

        DB::transaction(function () use ($validated) {
            foreach ($validated['scores'] as $scoreData) {
                Course::where('teacher_id', auth()->id())
                    ->findOrFail($scoreData['course_id']);

                Grade::updateOrCreate(
                    [
                        'student_id' => $scoreData['student_id'],
                        'course_id' => $scoreData['course_id'],
                    ],
                    [
                        'assignment_score' => $scoreData['assignment_score'] ?? null,
                        'quiz_score' => $scoreData['quiz_score'] ?? null,
                        'final_score' => $scoreData['final_score'] ?? null,
                        'grade_letter' => $scoreData['grade_letter'] ?? null,
                    ]
                );
            }
        });

        return response()->json([
            'message' => 'Scores updated successfully'
        ]);
    }

    // --- Lesson Management ---
    public function getLessons(Request $request)
    {
        try {
            $query = Lesson::with(['course', 'files', 'videos'])
                ->where('created_by', auth()->id());

            if ($request->has('course_id') && !empty($request->course_id)) {
                $query->where('course_id', $request->course_id);
            }

            $lessons = $query->orderBy('lesson_order')->get();

            return response()->json($lessons);
        } catch (\Exception $e) {
            \Log::error('Teacher getLessons error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមេរៀន: ' . $e->getMessage()
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

        Course::where('teacher_id', auth()->id())
            ->findOrFail($validated['course_id']);

        $validated['created_by'] = auth()->id();
        $validated['lesson_order'] = $validated['lesson_order'] ?? 0;
        
        $lesson = Lesson::create($validated);

        return response()->json([
            'lesson' => $lesson->load(['course', 'files', 'videos']),
            'message' => 'Lesson created successfully'
        ], 201);
    }

    public function updateLesson(Request $request, $id)
    {
        try {
            $lesson = Lesson::where('created_by', auth()->id())->findOrFail($id);

            $validated = $request->validate([
                'course_id' => 'required|exists:courses,id',
                'title' => 'required|string|max:255',
                'description' => 'nullable|string',
                'lesson_order' => 'nullable|integer|min:0',
            ]);

            Course::where('teacher_id', auth()->id())
                ->findOrFail($validated['course_id']);

            $lesson->update($validated);

            return response()->json([
                'lesson' => $lesson->load(['course', 'files', 'videos']),
                'message' => 'Lesson updated successfully'
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            \Log::error('Teacher updateLesson error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការកែប្រែមេរៀន: ' . $e->getMessage()
            ], 500);
        }
    }

    public function deleteLesson($id)
    {
        try {
            $lesson = Lesson::where('created_by', auth()->id())->findOrFail($id);

            // Delete associated files from storage and DB
            foreach ($lesson->files as $file) {
                Storage::disk('public')->delete($file->file_path);
                $file->delete();
            }

            // Delete associated videos from storage and DB
            foreach ($lesson->videos as $video) {
                Storage::disk('public')->delete($video->video_url);
                $video->delete();
            }

            $lesson->delete();

            return response()->json([
                'message' => 'បានលុបមេរៀនដោយជោគជ័យ'
            ]);
        } catch (\Exception $e) {
            \Log::error('Teacher deleteLesson error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបមេរៀន: ' . $e->getMessage()
            ], 500);
        }
    }

    public function uploadLessonFile(Request $request)
    {
        $request->validate([
            'lesson_id' => 'required|exists:lessons,id',
            'file' => 'required|file|max:10240',
        ]);

        Lesson::where('created_by', auth()->id())
            ->findOrFail($request->lesson_id);

        $file = $request->file('file');
        $filePath = $file->store('lesson_files', 'public');

        $lessonFile = LessonFile::create([
            'lesson_id' => $request->lesson_id,
            'file_name' => $file->getClientOriginalName(),
            'file_path' => $filePath,
            'file_type' => $file->getClientOriginalExtension(),
        ]);

        return response()->json([
            'file' => $lessonFile,
            'message' => 'File uploaded successfully'
        ]);
    }

    public function deleteLessonFile($id)
    {
        try {
            $lessonFile = LessonFile::findOrFail($id);
            
            // Check if the lesson belongs to authenticated teacher
            Lesson::where('created_by', auth()->id())->findOrFail($lessonFile->lesson_id);
            
            // Delete file from disk
            Storage::disk('public')->delete($lessonFile->file_path);
            $lessonFile->delete();
            
            return response()->json([
                'message' => 'បានលុបឯកសារដោយជោគជ័យ'
            ]);
        } catch (\Exception $e) {
            \Log::error('Teacher deleteLessonFile error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបឯកសារ'
            ], 500);
        }
    }

    public function uploadVideo(Request $request)
    {
        $request->validate([
            'lesson_id' => 'required|exists:lessons,id',
            'title' => 'required|string|max:255',
            'video' => 'required|file|mimes:mp4,mov,avi,wmv|max:204800',
            'duration' => 'nullable|string',
        ]);

        Lesson::where('created_by', auth()->id())
            ->findOrFail($request->lesson_id);

        $video = $request->file('video');
        $filePath = $video->store('videos', 'public');

        $videoRecord = Video::create([
            'lesson_id' => $request->lesson_id,
            'title' => $request->title,
            'video_url' => $filePath,
            'duration' => $request->duration ?? null,
        ]);

        return response()->json([
            'video' => $videoRecord,
            'message' => 'Video uploaded successfully'
        ]);
    }

    public function deleteVideo($id)
    {
        try {
            $video = Video::findOrFail($id);
            
            // Check if the lesson belongs to authenticated teacher
            Lesson::where('created_by', auth()->id())->findOrFail($video->lesson_id);
            
            // Delete video from disk
            Storage::disk('public')->delete($video->video_url);
            $video->delete();
            
            return response()->json([
                'message' => 'បានលុបវីដេអូដោយជោគជ័យ'
            ]);
        } catch (\Exception $e) {
            \Log::error('Teacher deleteVideo error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបវីដេអូ'
            ], 500);
        }
    }

    // --- Assignment Management ---
    public function getTeacherAssignments(Request $request)
    {
        try {
            $query = Assignment::with(['course'])
                ->withCount('submissions')
                ->where('created_by', auth()->id());

            if ($request->has('course_id') && !empty($request->course_id)) {
                $query->where('course_id', $request->course_id);
            }

            $assignments = $query->orderBy('created_at', 'desc')->get();

            return response()->json($assignments);
        } catch (\Exception $e) {
            \Log::error('Teacher getTeacherAssignments error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកកិច្ចការ: ' . $e->getMessage()
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

        Course::where('teacher_id', auth()->id())
            ->findOrFail($validated['course_id']);

        $validated['total_score'] = $validated['total_score'] ?? 100;
        $validated['created_by'] = auth()->id();

        $assignment = Assignment::create($validated);

        return response()->json([
            'assignment' => $assignment->load('course'),
            'message' => 'Assignment created successfully'
        ], 201);
    }

    public function updateAssignment(Request $request, $id)
    {
        try {
            $assignment = Assignment::where('created_by', auth()->id())->findOrFail($id);

            $validated = $request->validate([
                'course_id' => 'required|exists:courses,id',
                'title' => 'required|string|max:255',
                'description' => 'required|string',
                'due_date' => 'required|date',
                'total_score' => 'required|numeric|min:0',
            ]);

            Course::where('teacher_id', auth()->id())
                ->findOrFail($validated['course_id']);

            $assignment->update($validated);

            return response()->json([
                'assignment' => $assignment->load('course'),
                'message' => 'Assignment updated successfully'
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            \Log::error('Teacher updateAssignment error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការកែប្រែកិច្ចការ: ' . $e->getMessage()
            ], 500);
        }
    }

    public function deleteAssignment($id)
    {
        try {
            $assignment = Assignment::where('created_by', auth()->id())->findOrFail($id);

            // Check if there are submissions
            if ($assignment->submissions()->exists()) {
                return response()->json([
                    'message' => 'មិនអាចលុបកិច្ចការដែលមានសិស្សដាក់រួចហើយបានទេ'
                ], 400);
            }

            $assignment->delete();

            return response()->json([
                'message' => 'បានលុបកិច្ចការដោយជោគជ័យ'
            ]);
        } catch (\Exception $e) {
            \Log::error('Teacher deleteAssignment error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបកិច្ចការ'
            ], 500);
        }
    }

    public function getAssignments($courseId)
    {
        Course::where('teacher_id', auth()->id())->findOrFail($courseId);

        $assignments = Assignment::withCount('submissions')
            ->where('course_id', $courseId)
            ->get();

        return response()->json($assignments);
    }

    // --- Quiz Management ---
    public function getTeacherQuizzes(Request $request)
    {
        try {
            $query = Quiz::with(['course', 'questions.options'])
                ->withCount(['questions', 'attempts'])
                ->whereHas('course', function ($query) {
                    $query->where('teacher_id', auth()->id());
                });

            if ($request->has('course_id') && !empty($request->course_id)) {
                $query->where('course_id', $request->course_id);
            }

            $quizzes = $query->orderBy('created_at', 'desc')->get();

            return response()->json($quizzes);
        } catch (\Exception $e) {
            \Log::error('Teacher getTeacherQuizzes error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកកម្រងសំណួរ: ' . $e->getMessage()
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

        Course::where('teacher_id', auth()->id())
            ->findOrFail($validated['course_id']);

        $quiz = Quiz::create($validated);

        return response()->json([
            'quiz' => $quiz->load('course'),
            'message' => 'Quiz created successfully'
        ], 201);
    }

    public function updateQuiz(Request $request, $id)
    {
        try {
            $quiz = Quiz::whereHas('course', function ($query) {
                $query->where('teacher_id', auth()->id());
            })->findOrFail($id);

            $validated = $request->validate([
                'course_id' => 'required|exists:courses,id',
                'title' => 'required|string|max:255',
                'duration' => 'required|integer|min:1',
                'total_mark' => 'required|numeric|min:0',
                'start_date' => 'required|date',
                'end_date' => 'required|date|after:start_date',
            ]);

            Course::where('teacher_id', auth()->id())
                ->findOrFail($validated['course_id']);

            $quiz->update($validated);

            return response()->json([
                'quiz' => $quiz->load('course'),
                'message' => 'Quiz updated successfully'
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            \Log::error('Teacher updateQuiz error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការកែប្រែកម្រងសំណួរ: ' . $e->getMessage()
            ], 500);
        }
    }

    public function deleteQuiz($id)
    {
        try {
            $quiz = Quiz::whereHas('course', function ($query) {
                $query->where('teacher_id', auth()->id());
            })->findOrFail($id);

            // Check if there are attempts
            if ($quiz->attempts()->exists()) {
                return response()->json([
                    'message' => 'មិនអាចលុបកម្រងសំណួរដែលមានសិស្សចូលរួមធ្វើរួចហើយបានទេ'
                ], 400);
            }

            // Delete questions and options in transaction
            DB::transaction(function () use ($quiz) {
                foreach ($quiz->questions as $question) {
                    $question->options()->delete();
                    $question->delete();
                }
                $quiz->delete();
            });

            return response()->json([
                'message' => 'បានលុបកម្រងសំណួរដោយជោគជ័យ'
            ]);
        } catch (\Exception $e) {
            \Log::error('Teacher deleteQuiz error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបកម្រងសំណួរ'
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

        $quiz = Quiz::whereHas('course', function ($query) {
            $query->where('teacher_id', auth()->id());
        })->findOrFail($quizId);

        $question = DB::transaction(function () use ($validated, $quizId) {
            $q = Question::create([
                'quiz_id' => $quizId,
                'question_text' => $validated['question_text'],
                'question_type' => $validated['question_type'],
                'mark' => $validated['mark'],
            ]);

            if (isset($validated['options']) && $validated['question_type'] === 'MCQ') {
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
            'message' => 'Question added successfully'
        ], 201);
    }

    public function deleteQuestion($id)
    {
        try {
            $question = Question::findOrFail($id);
            
            // Check if quiz belongs to teacher
            $quiz = Quiz::whereHas('course', function ($query) {
                $query->where('teacher_id', auth()->id());
            })->findOrFail($question->quiz_id);

            // Check if there are attempts on the quiz
            if ($quiz->attempts()->exists()) {
                return response()->json([
                    'message' => 'មិនអាចលុបសំណួរក្នុងកម្រងសំណួរដែលសិស្សបានធ្វើរួចហើយទេ'
                ], 400);
            }

            DB::transaction(function () use ($question) {
                $question->options()->delete();
                $question->delete();
            });

            return response()->json([
                'message' => 'បានលុបសំណួរដោយជោគជ័យ'
            ]);
        } catch (\Exception $e) {
            \Log::error('Teacher deleteQuestion error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបសំណួរ'
            ], 500);
        }
    }

    // --- Online Exam ---
    public function getQuizzes($courseId)
    {
        Course::where('teacher_id', auth()->id())->findOrFail($courseId);

        $quizzes = Quiz::with(['questions.options'])
            ->where('course_id', $courseId)
            ->get();

        return response()->json($quizzes);
    }

    public function getQuizResults($quizId)
    {
        $quiz = Quiz::whereHas('course', function ($query) {
            $query->where('teacher_id', auth()->id());
        })->findOrFail($quizId);

        $results = $quiz->attempts()
            ->with('student')
            ->get();

        return response()->json($results);
    }
}
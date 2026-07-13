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
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB; // Added for Database Transactions

class TeacherController extends Controller
{
    public function __construct()
    {
        $this->middleware(['auth:sanctum', 'role:Teacher']);
    }

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

    // --- Classroom Management ---
    public function getMyCourses()
    {
        $courses = Course::with(['department', 'students'])
            ->where('teacher_id', auth()->id())
            ->get();

        return response()->json($courses);
    }

    // --- Student Management ---
    public function getStudents($courseId)
    {
        $course = Course::where('teacher_id', auth()->id())
            ->findOrFail($courseId);

        $students = $course->students()
            ->withPivot('status', 'enrolled_date')
            ->get();

        return response()->json($students);
    }

    public function createStudent(Request $request)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|unique:users',
            'password' => 'required|min:8',
            'course_id' => 'required|exists:courses,id',
        ]);

        $course = Course::where('teacher_id', auth()->id())
            ->findOrFail($request->course_id);

        // Use DB Transaction to ensure both User and Enrollment are created together
        $user = DB::transaction(function () use ($validated, $course) {
            $user = User::create([
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'email' => $validated['email'],
                'password' => bcrypt($validated['password']),
                'role_id' => 3, // Student role
                'status' => 'active',
            ]);

            Enrollment::create([
                'student_id' => $user->id,
                'course_id' => $course->id,
                'enrolled_date' => now(),
                'status' => 'active',
            ]);

            return $user;
        });

        return response()->json([
            'student' => $user,
            'message' => 'Student created and enrolled successfully'
        ], 201);
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

        // Wrapping bulk updates in a transaction
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
        Course::where('teacher_id', auth()->id())->findOrFail($courseId);

        $scores = Grade::with('student')
            ->where('course_id', $courseId)
            ->get();

        return response()->json($scores);
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
            'lesson' => $lesson,
            'message' => 'Lesson created successfully'
        ], 201);
    }

    public function uploadLessonFile(Request $request)
    {
        $request->validate([
            'lesson_id' => 'required|exists:lessons,id',
            'file' => 'required|file|max:10240', // 10MB max
        ]);

        Lesson::where('created_by', auth()->id())
            ->findOrFail($request->lesson_id);

        $file = $request->file('file');
        
        // Use Laravel's secure store method. It generates a secure hash for the filename.
        $filePath = $file->store('lesson_files', 'public');

        $lessonFile = LessonFile::create([
            'lesson_id' => $request->lesson_id,
            'file_name' => $file->getClientOriginalName(), // Keep original name for display UI
            'file_path' => $filePath, // Secure path for storage
            'file_type' => $file->getClientOriginalExtension(),
        ]);

        return response()->json([
            'file' => $lessonFile,
            'message' => 'File uploaded successfully'
        ]);
    }

    public function uploadVideo(Request $request)
    {
        $request->validate([
            'lesson_id' => 'required|exists:lessons,id',
            'title' => 'required|string|max:255',
            'video' => 'required|file|mimes:mp4,mov,avi,wmv|max:204800', // 200MB max
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

    // --- Assignment Management ---
    public function createAssignment(Request $request)
    {
        $validated = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'due_date' => 'required|date|after:now',
            'total_score' => 'nullable|numeric|min:0',
        ]);

        Course::where('teacher_id', auth()->id())
            ->findOrFail($validated['course_id']);

        $validated['total_score'] = $validated['total_score'] ?? 100;
        $validated['created_by'] = auth()->id();

        $assignment = Assignment::create($validated);

        return response()->json([
            'assignment' => $assignment,
            'message' => 'Assignment created successfully'
        ], 201);
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
    public function createQuiz(Request $request)
    {
        $validated = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'title' => 'required|string|max:255',
            'duration' => 'required|integer|min:1',
            'total_mark' => 'required|numeric|min:0',
            'start_date' => 'required|date|after:now',
            'end_date' => 'required|date|after:start_date',
        ]);

        Course::where('teacher_id', auth()->id())
            ->findOrFail($validated['course_id']);

        $quiz = Quiz::create($validated); // Replaced $request->all()

        return response()->json([
            'quiz' => $quiz,
            'message' => 'Quiz created successfully'
        ], 201);
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

        // Transaction ensures question options aren't lost if something fails
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

    // --- Online Exam ---
    public function getQuizzes($courseId)
    {
        Course::where('teacher_id', auth()->id())->findOrFail($courseId);

        $quizzes = Quiz::withCount('questions')
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
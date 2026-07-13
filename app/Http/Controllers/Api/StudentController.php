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
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class StudentController extends Controller
{
    public function __construct()
    {
        $this->middleware(['auth:sanctum', 'role:Student']);
    }

    /**
     * HELPER METHOD: Check if the authenticated student is actively enrolled in a course.
     * Keeps the code DRY.
     */
    private function getActiveEnrollment($studentId, $courseId)
    {
        return Enrollment::where('student_id', $studentId)
            ->where('course_id', $courseId)
            ->where('status', 'active')
            ->first();
    }

    // Dashboard
    public function dashboard()
    {
        $student = auth()->user();
        
        // OPTIMIZATION: Fixed N+1 queries by loading relationships and counting them at the DB level.
        $enrollments = $student->enrollments()
            ->with(['course' => function($query) {
                $query->with('teacher')->withCount(['assignments', 'quizzes']);
            }])
            ->where('status', 'active')
            ->get();

        $stats = [
            'total_courses' => $enrollments->count(),
            'total_assignments' => 0,
            'total_quizzes' => 0,
            'average_score' => 0,
        ];

        // Utilizing the pre-counted values from the database
        foreach ($enrollments as $enrollment) {
            $stats['total_assignments'] += $enrollment->course->assignments_count ?? 0;
            $stats['total_quizzes'] += $enrollment->course->quizzes_count ?? 0;
        }

        $grades = Grade::where('student_id', $student->id)
            ->whereNotNull('final_score')
            ->get();

        if ($grades->count() > 0) {
            $stats['average_score'] = $grades->avg('final_score');
        }

        return response()->json([
            'stats' => $stats,
            'enrollments' => $enrollments,
            'recent_activity' => $this->getRecentActivity($student->id),
        ]);
    }

    private function getRecentActivity($studentId)
    {
        $submissions = AssignmentSubmission::where('student_id', $studentId)
            ->with('assignment')
            ->orderBy('submitted_at', 'desc')
            ->limit(5)
            ->get();

        $attempts = QuizAttempt::where('student_id', $studentId)
            ->with('quiz')
            ->orderBy('submitted_at', 'desc')
            ->limit(5)
            ->get();

        return [
            'submissions' => $submissions,
            'quiz_attempts' => $attempts,
        ];
    }

    // View Attendance
    public function getAttendance()
    {
        $student = auth()->user();
        
        $attendance = Attendance::with('course')
            ->where('student_id', $student->id)
            ->orderBy('attendance_date', 'desc')
            ->get();

        $summary = [
            'present' => $attendance->where('status', 'Present')->count(),
            'absent' => $attendance->where('status', 'Absent')->count(),
            'late' => $attendance->where('status', 'Late')->count(),
        ];

        return response()->json([
            'attendance' => $attendance,
            'summary' => $summary,
        ]);
    }

    public function getCourseAttendance($courseId)
    {
        $student = auth()->user();
        
        $attendance = Attendance::where('student_id', $student->id)
            ->where('course_id', $courseId)
            ->orderBy('attendance_date', 'desc')
            ->get();

        return response()->json($attendance);
    }

    // View Scores
    public function getScores()
    {
        $student = auth()->user();
        
        $grades = Grade::with('course')
            ->where('student_id', $student->id)
            ->get();

        return response()->json($grades);
    }

    public function getCourseScores($courseId)
    {
        $student = auth()->user();
        
        $grade = Grade::with('course')
            ->where('student_id', $student->id)
            ->where('course_id', $courseId)
            ->first();

        return response()->json($grade);
    }

    // View Lessons
    public function getCourseLessons($courseId)
    {
        $student = auth()->user();
        
        if (!$this->getActiveEnrollment($student->id, $courseId)) {
            return response()->json(['message' => 'You are not enrolled in this course'], 403);
        }

        $lessons = Lesson::with(['files', 'videos'])
            ->where('course_id', $courseId)
            ->orderBy('lesson_order')
            ->get();

        return response()->json($lessons);
    }

    // Upload Assignment
    public function uploadAssignment(Request $request)
    {
        $request->validate([
            'assignment_id' => 'required|exists:assignments,id',
            'file' => 'required|file|max:10240', // 10MB max
        ]);

        $student = auth()->user();
        $assignment = Assignment::findOrFail($request->assignment_id);
        
        if (!$this->getActiveEnrollment($student->id, $assignment->course_id)) {
            return response()->json(['message' => 'You are not enrolled in this course'], 403);
        }

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
        
        // SECURITY: store() automatically generates a unique, secure hash for the filename to prevent collisions.
        $filePath = $file->store('assignment_submissions', 'public');

        $submission = AssignmentSubmission::create([
            'assignment_id' => $request->assignment_id,
            'student_id' => $student->id,
            'file_path' => $filePath,
            'original_filename' => $file->getClientOriginalName(), // Optional: Store the original name in the DB to show back to the user
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
            'file' => 'required|file|max:10240', // 10MB max
            'description' => 'nullable|string',
        ]);

        $student = auth()->user();
        
        if (!$this->getActiveEnrollment($student->id, $request->course_id)) {
            return response()->json(['message' => 'You are not enrolled in this course'], 403);
        }

        $file = $request->file('file');
        $filePath = $file->store('homework_submissions', 'public');

        // LOGIC NOTE: Ensure you add the DB insertion here for Homework submissions if you have a model for it.
        // Example:
        // HomeworkSubmission::create([ ... ]);

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
            'video' => 'required|file|mimes:mp4,mov,avi,wmv|max:204800', // 200MB max
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

    // Quiz/Exam
    public function getQuiz($quizId)
    {
        $student = auth()->user();
        
        $quiz = Quiz::with(['questions.options'])->findOrFail($quizId);

        if (!$this->getActiveEnrollment($student->id, $quiz->course_id)) {
            return response()->json(['message' => 'You are not enrolled in this course'], 403);
        }

        if (now()->lt($quiz->start_date)) {
            return response()->json(['message' => 'Quiz has not started yet'], 400);
        }

        if (now()->gt($quiz->end_date)) {
            return response()->json(['message' => 'Quiz has ended'], 400);
        }

        $attempt = QuizAttempt::where('quiz_id', $quizId)
            ->where('student_id', $student->id)
            ->first();

        if ($attempt && $attempt->submitted_at) {
            return response()->json(['message' => 'You have already completed this quiz'], 400);
        }

        if ($attempt) {
            $timeLeft = $quiz->duration * 60 - now()->diffInSeconds($attempt->started_at);
            if ($timeLeft <= 0) {
                $attempt->update(['submitted_at' => now()]);
                return response()->json(['message' => 'Time is up! Quiz auto-submitted.']);
            }
        } else {
            $attempt = QuizAttempt::create([
                'quiz_id' => $quizId,
                'student_id' => $student->id,
                'started_at' => now(),
            ]);
        }

        return response()->json([
            'quiz' => $quiz,
            'attempt' => $attempt,
            'time_left' => $quiz->duration * 60 - now()->diffInSeconds($attempt->started_at),
        ]);
    }

    public function submitQuiz(Request $request, $quizId)
    {
        $request->validate([
            'answers' => 'required|array',
            'answers.*.question_id' => 'required|exists:questions,id',
            'answers.*.selected_option' => 'required|integer',
        ]);

        $student = auth()->user();
        $quiz = Quiz::findOrFail($quizId);
        
        if (!$this->getActiveEnrollment($student->id, $quiz->course_id)) {
            return response()->json(['message' => 'You are not enrolled in this course'], 403);
        }

        $attempt = QuizAttempt::where('quiz_id', $quizId)
            ->where('student_id', $student->id)
            ->whereNull('submitted_at')
            ->first();

        if (!$attempt) {
            return response()->json(['message' => 'No active quiz attempt found'], 400);
        }

        // OPTIMIZATION: Load all questions in a single query to avoid N+1 inside the loop
        $questionIds = collect($request->answers)->pluck('question_id')->toArray();
        $questions = Question::with('options')->whereIn('id', $questionIds)->get()->keyBy('id');

        $score = 0;
        $totalMarks = 0;

        foreach ($request->answers as $answer) {
            $question = $questions->get($answer['question_id']);
            
            if (!$question) continue;

            $totalMarks += $question->mark;

            // LOGIC FIX: Handled both MCQ and TrueFalse logically.
            if (in_array($question->question_type, ['MCQ', 'TrueFalse'])) {
                $correctOption = $question->options->firstWhere('is_correct', true);
                if ($correctOption && $correctOption->id == $answer['selected_option']) {
                    $score += $question->mark;
                }
            }
        }

        $attempt->update([
            'score' => $score,
            'submitted_at' => now(),
        ]);

        $grade = Grade::where('student_id', $student->id)
            ->where('course_id', $quiz->course_id)
            ->first();

        if ($grade && $totalMarks > 0) {
            $grade->update([
                'quiz_score' => ($score / $totalMarks) * 100,
            ]);
        }

        return response()->json([
            'attempt' => $attempt,
            'score' => $score,
            'total_marks' => $totalMarks,
            'message' => 'Quiz submitted successfully'
        ]);
    }

    // View Quiz Results
    public function getQuizResults($quizId)
    {
        $student = auth()->user();
        
        $attempt = QuizAttempt::with('quiz')
            ->where('quiz_id', $quizId)
            ->where('student_id', $student->id)
            ->first();

        if (!$attempt) {
            return response()->json(['message' => 'Quiz attempt not found'], 404);
        }

        return response()->json($attempt);
    }

    // Get all courses student is enrolled in
    public function getMyCourses()
    {
        $student = auth()->user();
        
        $courses = $student->enrollments()
            ->with('course.teacher')
            ->where('status', 'active')
            ->get()
            ->pluck('course');

        return response()->json($courses);
    }

    // Get course details
    public function getCourseDetails($courseId)
    {
        $student = auth()->user();
        
        if (!$this->getActiveEnrollment($student->id, $courseId)) {
            return response()->json(['message' => 'You are not enrolled in this course'], 403);
        }

        $course = Course::with(['teacher', 'department'])->findOrFail($courseId);

        $assignments = Assignment::where('course_id', $courseId)->get();
        $quizzes = Quiz::where('course_id', $courseId)->get();
        $attendance = Attendance::where('student_id', $student->id)
            ->where('course_id', $courseId)
            ->get();
        $grade = Grade::where('student_id', $student->id)
            ->where('course_id', $courseId)
            ->first();

        return response()->json([
            'course' => $course,
            'assignments' => $assignments,
            'quizzes' => $quizzes,
            'attendance' => $attendance,
            'grade' => $grade,
        ]);
    }
}
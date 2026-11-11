<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AdminReportController;
use App\Http\Controllers\Api\AdminStudentController;
use App\Http\Controllers\Api\AdminTeacherController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CourseController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\StudentController;
use App\Http\Controllers\Api\TeacherController;
use App\Http\Controllers\Api\TeacherCourseController;
use App\Http\Controllers\Api\TeacherLessonController;
use App\Http\Controllers\Api\TeacherStudentController;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

Route::get('/roles', function () {
    $roles = Role::withCount('users')->get();
    $adminRole = $roles->first(function ($r) {
        return stripos($r->role_name ?? $r->name ?? '', 'admin') !== false;
    });
    $hasAdmin = $adminRole ? ($adminRole->users_count > 0) : User::where('role_id', 1)->exists();

    return response()->json([
        'data' => $roles,
        'has_admin' => $hasAdmin,
        'admin_exists' => $hasAdmin,
    ]);
});

// Public routes
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/verify-2fa', [AuthController::class, 'verifyTwoFactor']);
Route::post('/resend-2fa', [AuthController::class, 'resendTwoFactor']);
Route::post('/forgot-password/send-otp', [AuthController::class, 'sendPasswordResetOtp']);
Route::post('/forgot-password/verify-otp', [AuthController::class, 'verifyPasswordResetOtp']);
Route::post('/forgot-password/reset', [AuthController::class, 'resetPasswordWithOtp']);
Route::post('/check-telegram-link', [AuthController::class, 'checkTelegramLink']);

// ✅ Check file existence route (Secured against Path Traversal '../' + Railway DB Base64 fallback)
Route::get('/check-file-exists', function (Request $request) {
    $path = trim((string) $request->query('path', ''));
    if (!$path || str_contains($path, '..')) {
        return response()->json(['exists' => false, 'message' => 'Invalid path parameter']);
    }

    if (str_starts_with($path, 'data:')) {
        return response()->json(['exists' => true]);
    }

    $cleanPath = preg_replace('/^(\/?storage\/|\/?public\/)+/', '', $path);
    $cleanPath = ltrim($cleanPath, '/\\');

    $exists = Storage::disk('public')->exists($cleanPath) ||
              file_exists(storage_path('app/public/' . $cleanPath)) ||
              file_exists(public_path('storage/' . $cleanPath));

    if (!$exists && Schema::hasTable('lesson_files') && Schema::hasColumn('lesson_files', 'file_data')) {
        $exists = DB::table('lesson_files')
            ->where(function ($q) use ($cleanPath) {
                $q->where('file_path', $cleanPath)
                  ->orWhere('file_path', 'storage/' . $cleanPath)
                  ->orWhere('file_path', '/storage/' . $cleanPath);
            })
            ->whereNotNull('file_data')
            ->exists();
    }

    if (!$exists && Schema::hasTable('assignment_submissions') && Schema::hasColumn('assignment_submissions', 'file_data')) {
        $exists = DB::table('assignment_submissions')
            ->where(function ($q) use ($cleanPath) {
                $q->where('file_path', $cleanPath)
                  ->orWhere('file_path', 'storage/' . $cleanPath)
                  ->orWhere('file_path', '/storage/' . $cleanPath);
            })
            ->whereNotNull('file_data')
            ->exists();
    }

    return response()->json(['exists' => (bool) $exists]);
});

// ✅ Download file route (Secured against Path Traversal '../' + Railway DB Base64 fallback)
Route::get('/download-file', function (Request $request) {
    $path = trim((string) $request->query('path', ''));
    if (!$path || str_contains($path, '..')) {
        return response()->json(['message' => 'Invalid path parameter'], 400);
    }

    $origin = $request->headers->get('Origin') ?: '*';

    $cleanPath = preg_replace('/^(\/?storage\/|\/?public\/)+/', '', $path);
    $cleanPath = ltrim($cleanPath, '/\\');

    $fullPath = null;
    if (Storage::disk('public')->exists($cleanPath)) {
        $fullPath = Storage::disk('public')->path($cleanPath);
    } elseif (file_exists(storage_path('app/public/' . $cleanPath))) {
        $fullPath = storage_path('app/public/' . $cleanPath);
    } elseif (file_exists(public_path('storage/' . $cleanPath))) {
        $fullPath = public_path('storage/' . $cleanPath);
    }

    if ($fullPath && file_exists($fullPath)) {
        $filename = basename($fullPath);
        return response()->download($fullPath, $filename, [
            'Access-Control-Allow-Origin' => $origin,
            'Access-Control-Expose-Headers' => 'Content-Disposition',
        ]);
    }

    // ✅ Fallback សម្រាប់ Railway៖ ទាញយកពីជួរឈរ file_data ក្នុងតារាង lesson_files ឬ assignment_submissions ប្រសិនបើហ្វាល់លើ Disk ត្រូវបានលុបពេល Redeploy
    $dbBase64 = null;
    $dbFileName = basename($cleanPath);
    $dbMimeType = 'application/octet-stream';

    if (Schema::hasTable('lesson_files') && Schema::hasColumn('lesson_files', 'file_data')) {
        $lessonFile = DB::table('lesson_files')
            ->where('file_path', $cleanPath)
            ->orWhere('file_path', 'storage/' . $cleanPath)
            ->orWhere('file_path', '/storage/' . $cleanPath)
            ->first();

        if ($lessonFile && !empty($lessonFile->file_data)) {
            $dbBase64 = $lessonFile->file_data;
            $dbFileName = $lessonFile->file_name ?? $dbFileName;
            $dbMimeType = $lessonFile->mime_type ?? $dbMimeType;
        }
    }

    if (!$dbBase64 && Schema::hasTable('assignment_submissions') && Schema::hasColumn('assignment_submissions', 'file_data')) {
        $subFile = DB::table('assignment_submissions')
            ->where('file_path', $cleanPath)
            ->orWhere('file_path', 'storage/' . $cleanPath)
            ->orWhere('file_path', '/storage/' . $cleanPath)
            ->first();

        if ($subFile && !empty($subFile->file_data)) {
            $dbBase64 = $subFile->file_data;
            $dbFileName = $subFile->original_filename ?? $dbFileName;
        }
    }

    if ($dbBase64) {
        if (str_starts_with($dbBase64, 'data:') && preg_match('/^data:([^;]+);base64,(.+)$/s', $dbBase64, $matches)) {
            $dbMimeType = $matches[1] ?: $dbMimeType;
            $dbBase64 = $matches[2];
        }
        $decodedBytes = base64_decode($dbBase64);
        if ($decodedBytes !== false) {
            return response($decodedBytes, 200, [
                'Content-Type' => $dbMimeType,
                'Content-Disposition' => 'attachment; filename="' . addslashes($dbFileName) . '"',
                'Access-Control-Allow-Origin' => $origin,
                'Access-Control-Expose-Headers' => 'Content-Disposition',
            ]);
        }
    }

    return response(
        "<div style='font-family:sans-serif;text-align:center;padding:60px;background:#f9fafb;min-h-screen;'>
            <div style='max-width:480px;margin:0 auto;background:#fff;padding:32px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.05);'>
                <div style='font-size:48px;margin-bottom:16px;'>⚠️</div>
                <h2 style='color:#111827;margin-bottom:8px;'>មិនរកឃើញឯកសារ (File Not Found)</h2>
                <p style='color:#6b7280;font-size:14px;line-height:1.5;'>ឯកសារនេះមិនមាននៅលើ Server ទៀតទេ ឬត្រូវបានលុបចោល។ សូមសាកល្បងផ្ទុកឡើងឯកសារជាថ្មី។</p>
                <p style='color:#9ca3af;font-size:12px;margin-top:12px;'>(The requested file is no longer available on the server. Please re-upload the file.)</p>
            </div>
        </div>",
        404
    )->header('Content-Type', 'text/html');
});

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
    Route::post('/user/profile/update-image', [ProfileController::class, 'updateImage']);
    Route::match(['put', 'post'], '/user/profile/update', [ProfileController::class, 'update']);
    Route::post('/teacher/profile/update-image', [ProfileController::class, 'updateTeacherImage']);
    Route::match(['put', 'post'], '/teacher/profile/update', [ProfileController::class, 'updateTeacher']);
    Route::post('/student/profile/update-image', [ProfileController::class, 'updateStudentImage']);
    Route::match(['put', 'post'], '/student/profile/update', [ProfileController::class, 'updateStudent']);
    Route::match(['put', 'post'], '/user/update-password', [ProfileController::class, 'updatePassword']);

    // Admin routes
    Route::prefix('admin')->middleware('role:Admin')->group(function () {
        // User management
        Route::get('/users', [AdminController::class, 'getUsers']);
        Route::post('/users', [AdminController::class, 'createUser']);
        Route::match(['put', 'post'], '/users/{id}', [AdminController::class, 'updateUser']);
        Route::delete('/users/{id}', [AdminController::class, 'deleteUser']);

        // Course management
        Route::get('/courses/stats', [CourseController::class, 'getStats']);
        Route::get('/courses/search', [CourseController::class, 'search']);
        Route::get('/courses/department/{departmentId}', [CourseController::class, 'getCoursesByDepartment']);
        Route::get('/courses/teacher/{teacherId}', [CourseController::class, 'getCoursesByTeacher']);
        Route::get('/courses', [CourseController::class, 'index']);
        Route::post('/courses', [CourseController::class, 'store']);
        Route::get('/courses/{course}', [CourseController::class, 'show']);
        Route::match(['put', 'post'], '/courses/{course}', [CourseController::class, 'update']);
        Route::delete('/courses/{course}', [CourseController::class, 'destroy']);

        // Teacher management
        Route::get('teachers/export-all', [AdminTeacherController::class, 'exportAll']);
        Route::post('teachers/import', [AdminTeacherController::class, 'import']);
        Route::get('teachers', [AdminTeacherController::class, 'index']);
        Route::post('teachers', [AdminTeacherController::class, 'store']);
        Route::get('teachers/{teacher}', [AdminTeacherController::class, 'show']);
        Route::match(['put', 'post'], 'teachers/{teacher}', [AdminTeacherController::class, 'update']);
        Route::delete('teachers/{teacher}', [AdminTeacherController::class, 'destroy']);

        // Student management
        Route::get('/students/export-all', [AdminStudentController::class, 'exportAll']);
        Route::post('/students/import', [AdminStudentController::class, 'import']);
        Route::post('/students/promote', [AdminStudentController::class, 'promoteStudents']);
        Route::get('/students', [AdminStudentController::class, 'index']);
        Route::post('/students', [AdminStudentController::class, 'store']);
        Route::match(['put', 'post'], '/students/{student}', [AdminStudentController::class, 'update']);
        Route::delete('/students/{student}', [AdminStudentController::class, 'destroy']);
        Route::get('/students/{student}/enrollments', [AdminStudentController::class, 'getEnrollments']);
        Route::post('/students/{student}/enrollments', [AdminStudentController::class, 'enrollStudent']);
        Route::delete('/students/{student}/enrollments/{courseId}', [AdminStudentController::class, 'unenrollStudent']);

        // Department management
        Route::get('/departments/stats', [DepartmentController::class, 'getStats']);
        Route::get('/departments', [DepartmentController::class, 'index']);
        Route::post('/departments', [DepartmentController::class, 'store']);
        Route::get('/departments/{department}', [DepartmentController::class, 'show']);
        Route::match(['put', 'post'], '/departments/{department}', [DepartmentController::class, 'update']);
        Route::delete('/departments/{department}', [DepartmentController::class, 'destroy']);

        // System
        Route::get('/stats', [AdminController::class, 'getStats']);
        Route::get('/settings', [AdminController::class, 'getSystemSettings']);
        Route::match(['put', 'post'], '/settings', [AdminController::class, 'updateSystemSettings']);

        // Reports
        Route::get('/reports/overview', [AdminReportController::class, 'getOverviewReport']);
        Route::get('/reports/enrollments', [AdminReportController::class, 'getEnrollmentReport']);
        Route::get('/reports/attendance', [AdminReportController::class, 'getAttendanceReport']);
        Route::get('/reports/academic', [AdminReportController::class, 'getAcademicReport']);
    });

    // Teacher routes
    Route::prefix('teacher')->middleware('role:Teacher')->group(function () {
        // Dashboard & Profile
        Route::get('/dashboard', [TeacherController::class, 'dashboard']);
        Route::get('/profile', [TeacherController::class, 'getProfile']);

        // Courses
        Route::get('/courses', [TeacherCourseController::class, 'index']);
        Route::post('/courses', [TeacherController::class, 'createCourse']);
        Route::get('/courses/stats', [TeacherCourseController::class, 'getStats']);
        Route::get('/courses/search', [TeacherCourseController::class, 'search']);
        Route::get('/courses/{courseId}', [TeacherCourseController::class, 'show']);
        Route::match(['put', 'post'], '/courses/{id}', [TeacherController::class, 'updateCourse']);
        Route::delete('/courses/{id}', [TeacherController::class, 'deleteCourse']);

        // Students
        Route::get('/students', [TeacherStudentController::class, 'index']);
        Route::get('/students/count', [TeacherStudentController::class, 'getCount']);
        Route::get('/students/search', [TeacherStudentController::class, 'search']);
        Route::get('/students/{studentId}', [TeacherStudentController::class, 'show']);

        // Attendance & Course Students
        Route::get('/courses/{courseId}/students', [TeacherController::class, 'getCourseStudents']);
        Route::get('/courses/{courseId}/attendance', [TeacherController::class, 'getAttendance']);
        Route::get('/attendance/{courseId}', [TeacherController::class, 'getAttendance']);
        Route::post('/attendance', [TeacherController::class, 'markAttendance']);
        Route::post('/attendance/bulk', [TeacherController::class, 'bulkMarkAttendance']);

        // Scores
        Route::get('/courses/{courseId}/scores', [TeacherController::class, 'getScores']);
        Route::post('/scores', [TeacherController::class, 'storeGrade']);
        Route::match(['put', 'post'], '/scores', [TeacherController::class, 'updateScores']);

        // Lessons (ដាក់ static routes មុន dynamic {lessonId})
        Route::get('/lessons', [TeacherLessonController::class, 'index']);
        Route::post('/lessons', [TeacherLessonController::class, 'store']);
        Route::post('/lessons/reorder', [TeacherLessonController::class, 'reorder']);
        Route::post('/lessons/file', [TeacherLessonController::class, 'uploadFile']);
        Route::delete('/lessons/files/{fileId}', [TeacherLessonController::class, 'deleteFile']);
        Route::post('/lessons/video', [TeacherLessonController::class, 'uploadVideo']);
        Route::delete('/lessons/videos/{videoId}', [TeacherLessonController::class, 'deleteVideo']);
        Route::get('/lessons/{lessonId}', [TeacherLessonController::class, 'show']);
        Route::match(['put', 'post'], '/lessons/{lesson}', [TeacherLessonController::class, 'update']);
        Route::delete('/lessons/{lesson}', [TeacherLessonController::class, 'destroy']);

        // Get lessons by course
        Route::get('/courses/{courseId}/lessons', [TeacherLessonController::class, 'getLessonsByCourse']);

        // Assignments
        Route::get('/assignments', [TeacherController::class, 'getTeacherAssignments']);
        Route::get('/courses/{courseId}/assignments', [TeacherController::class, 'getAssignments']);
        Route::post('/assignments', [TeacherController::class, 'createAssignment']);
        Route::match(['put', 'post'], '/assignments/{id}', [TeacherController::class, 'updateAssignment']);
        Route::delete('/assignments/{id}', [TeacherController::class, 'deleteAssignment']);
        Route::get('/assignments/{assignmentId}/submissions', [TeacherController::class, 'getAssignmentSubmissions']);
        Route::match(['put', 'post'], '/submissions/{submissionId}/grade', [TeacherController::class, 'gradeSubmission']);

        // Quizzes
        Route::get('/quizzes', [TeacherController::class, 'getTeacherQuizzes']);
        Route::get('/courses/{courseId}/quizzes', [TeacherController::class, 'getQuizzes']);
        Route::post('/quizzes', [TeacherController::class, 'createQuiz']);
        Route::post('/quizzes/import', [TeacherController::class, 'importQuizzes']);
        Route::match(['put', 'post'], '/quizzes/{id}', [TeacherController::class, 'updateQuiz']);
        Route::delete('/quizzes/{id}', [TeacherController::class, 'deleteQuiz']);
        Route::post('/quizzes/{quizId}/questions', [TeacherController::class, 'addQuestion']);
        Route::delete('/quizzes/questions/{id}', [TeacherController::class, 'deleteQuestion']);
        Route::get('/quizzes/{quizId}/results', [TeacherController::class, 'getQuizResults']);

        // Department management
        Route::get('/departments', [DepartmentController::class, 'index']);
        Route::post('/departments', [DepartmentController::class, 'store']);
        Route::match(['put', 'post'], '/departments/{department}', [DepartmentController::class, 'update']);
        Route::delete('/departments/{department}', [DepartmentController::class, 'destroy']);
    });

    // Student routes
    Route::prefix('student')->middleware('role:Student')->group(function () {
        // Dashboard
        Route::get('/dashboard', [StudentController::class, 'dashboard']);

        // Courses & Lessons (✅ កែពី getMyCourses មកជា getCourses ឱ្យត្រូវជាមួយ StudentController.php)
        Route::get('/courses', [StudentController::class, 'getCourses']);
        Route::get('/courses/{course}', [CourseController::class, 'show']);
        Route::get('/courses/{courseId}/lessons', [StudentController::class, 'getCourseLessons']);
        Route::get('/lessons/read-file', [StudentController::class, 'readLessonFile']);
        Route::get('/lessons', [StudentController::class, 'getAllLessons']);

        // Attendance
        Route::get('/attendance', [StudentController::class, 'getAttendance']);
        Route::get('/courses/{courseId}/attendance', [StudentController::class, 'getCourseAttendance']);

        // Scores / Grades
        Route::get('/scores', [StudentController::class, 'getScores']);
        Route::get('/grades', [StudentController::class, 'getScores']);
        Route::get('/courses/{courseId}/scores', [StudentController::class, 'getCourseScores']);

        // Assignments
        Route::get('/assignments', [StudentController::class, 'getAllAssignments']);
        Route::post('/assignments/submit', [StudentController::class, 'uploadAssignment']);

        // Homework/File upload
        Route::post('/homework', [StudentController::class, 'uploadHomework']);
        Route::post('/videos', [StudentController::class, 'uploadVideo']);

        // Quizzes
        Route::get('/quizzes', [StudentController::class, 'getAllQuizzes']);
        Route::get('/quizzes/{quizId}', [StudentController::class, 'getQuiz']);
        Route::post('/quizzes/{quizId}/submit', [StudentController::class, 'submitQuiz']);
        Route::get('/quizzes/{quizId}/results', [StudentController::class, 'getQuiz']);
    });
});
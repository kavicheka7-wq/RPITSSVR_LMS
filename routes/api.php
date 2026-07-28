
<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\TeacherController;
use App\Http\Controllers\Api\StudentController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AdminTeacherController;
use App\Http\Controllers\Api\AdminStudentController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\CourseController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\TeacherStudentController;
use App\Http\Controllers\Api\TeacherCourseController;
use App\Http\Controllers\Api\TeacherLessonController;
use App\Models\Role; // សូមប្រាកដថាអ្នកមាន Model នេះ
use App\Models\Department; // សូមប្រាកដថាអ្នកមាន Model នេះ
use App\Models\Teacher; // សូមប្រាកដថាអ្នកមាន Model នេះ
use App\Models\Student; // សូមប្រាកដថាអ្នកមាន Model នេះ
use App\Models\Course; // សូមប្រាកដថាអ្នកមាន Model នេះ
use App\Models\Lesson; // សូមប្រាកដថាអ្នកមាន Model នេះ
use App\Models\LessonFile; // សូមប្រាកដថាអ្នកមាន Model នេះ
use App\Models\Video; // សូមប្រាកដថាអ្នកមាន Model នេះ
Route::get('/roles', function () {
    // ជម្រើសទី១៖ ប្រសិនបើអ្នកបានបង្កើត Table roles និងមានទិន្នន័យក្នុង Database រួចរាល់
    return response()->json(Role::all());
    
    // ---------------------------------------------------------
    // ជម្រើសទី២ (💡 ណែនាំសម្រាប់ការសាកល្បង)៖ 
    // ប្រសិនបើអ្នកមិនទាន់មាន Table នៅក្នុង Database ទេ 
    // អ្នកអាច Comment ជម្រើសទី១ រួចប្រើទិន្នន័យសប្បនិម្មិត (Mock Data) នេះសិន ដើម្បីឱ្យ Frontend លោតទិន្នន័យបាន៖
    /*
    return response()->json([
        ['id' => 1, 'role_name' => 'Admin'],
        ['id' => 2, 'role_name' => 'Teacher'],
        ['id' => 3, 'role_name' => 'Student'],
    ]);
    */
});
// Public routes
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
    // Route សម្រាប់ទទួលការ Upload រូបភាពរបស់ User ទូទៅ (និង Admin)
    Route::post('/user/profile/update-image', [ProfileController::class, 'updateImage']);
    // នេះជា Route ថ្មីសម្រាប់ Update ព័ត៌មាន (ឈ្មោះ, អ៊ីមែល, លេខទូរស័ព្ទ)
    Route::put('/user/profile/update', [ProfileController::class, 'update']);
    // Route សម្រាប់ Teacher
    Route::post('/teacher/profile/update-image', [ProfileController::class, 'updateTeacherImage']);
    Route::put('/teacher/profile/update', [ProfileController::class, 'updateTeacher']);
    // Route សម្រាប់ Student
    Route::post('/student/profile/update-image', [ProfileController::class, 'updateStudentImage']);
    Route::put('/student/profile/update', [ProfileController::class, 'updateStudent']);

    // បន្ថែម Route ថ្មីនេះសម្រាប់ដូរ Password
    Route::put('/user/update-password', [ProfileController::class, 'updatePassword']);

    // Admin routes
    Route::prefix('admin')->middleware('role:Admin')->group(function () {
        // User management
        Route::get('/users', [AdminController::class, 'getUsers']);
        Route::post('/users', [AdminController::class, 'createUser']);
        Route::put('/users/{id}', [AdminController::class, 'updateUser']);
        Route::delete('/users/{id}', [AdminController::class, 'deleteUser']);

        // Course management
        Route::get('/courses', [CourseController::class, 'index']);
        Route::post('/courses', [CourseController::class, 'store']);
        Route::put('/courses/{course}', [CourseController::class, 'update']);
        Route::delete('/courses/{course}', [CourseController::class, 'destroy']);

      // Teacher management
        Route::get('teachers/', [AdminTeacherController::class, 'index']);
        Route::post('teachers/', [AdminTeacherController::class, 'store']);
        Route::put('teachers/{teacher}', [AdminTeacherController::class, 'update']);
        Route::delete('teachers/{teacher}', [AdminTeacherController::class, 'destroy']);
        

        // Student management
       
        Route::get('/students', [AdminStudentController::class, 'index']);
        Route::post('/students', [AdminStudentController::class, 'store']);
        Route::put('/students/{student}', [AdminStudentController::class, 'update']);
        Route::delete('/students/{student}', [AdminStudentController::class, 'destroy']);
        Route::get('/students/{student}/enrollments', [AdminStudentController::class, 'getEnrollments']);
        Route::post('/students/{student}/enrollments', [AdminStudentController::class, 'enrollStudent']);
        Route::delete('/students/{student}/enrollments/{courseId}', [AdminStudentController::class, 'unenrollStudent']);

  
        // Department management
        Route::get('/departments', [DepartmentController::class, 'index']);
        Route::post('/departments', [DepartmentController::class, 'store']);
        Route::put('/departments/{department}', [DepartmentController::class, 'update']);
        Route::delete('/departments/{department}', [DepartmentController::class, 'destroy']);

       

        // System
        Route::get('/stats', [AdminController::class, 'getStats']);
        Route::get('/settings', [AdminController::class, 'getSystemSettings']);
        Route::put('/settings', [AdminController::class, 'updateSystemSettings']);
    });

    // Teacher routes
    Route::prefix('teacher')->middleware('role:Teacher')->group(function () {
        // Dashboard
        Route::get('/dashboard', [TeacherController::class, 'dashboard']);
        
        // Courses
        Route::get('/courses', [TeacherCourseController::class, 'index']);
        Route::get('/courses/stats', [TeacherCourseController::class, 'getStats']);
        Route::get('/courses/search', [TeacherCourseController::class, 'search']);
        Route::get('/courses/{courseId}', [TeacherCourseController::class, 'show']);
        
        // Students
        Route::get('/students', [TeacherStudentController::class, 'index']);
        Route::get('/students/count', [TeacherStudentController::class, 'getCount']);
        Route::get('/students/search', [TeacherStudentController::class, 'search']);
        Route::get('/students/{studentId}', [TeacherStudentController::class, 'show']);

        // Attendance & Course Students
        Route::get('/courses/{courseId}/students', [TeacherController::class, 'getCourseStudents']);
        Route::get('/courses/{courseId}/attendance', [TeacherController::class, 'getAttendance']);
        Route::post('/attendance', [TeacherController::class, 'markAttendance']);
        Route::post('/attendance/bulk', [TeacherController::class, 'bulkMarkAttendance']);
        
        // Scores
        Route::get('/courses/{courseId}/scores', [TeacherController::class, 'getScores']);
        Route::put('/scores', [TeacherController::class, 'updateScores']);
        
        // Lessons
        Route::get('/lessons', [TeacherLessonController::class, 'index']);
        Route::post('/lessons', [TeacherLessonController::class, 'store']);
        Route::get('/lessons/{lessonId}', [TeacherLessonController::class, 'show']);
        Route::put('/lessons/{lesson}', [TeacherLessonController::class, 'update']);
        Route::delete('/lessons/{lesson}', [TeacherLessonController::class, 'destroy']);
        Route::post('/lessons/reorder', [TeacherLessonController::class, 'reorder']);
        
        // Lesson Files
        Route::post('/lessons/file', [TeacherLessonController::class, 'uploadFile']);
        Route::delete('/lessons/files/{fileId}', [TeacherLessonController::class, 'deleteFile']);
        
        // Lesson Videos
        Route::post('/lessons/video', [TeacherLessonController::class, 'uploadVideo']);
        Route::delete('/lessons/videos/{videoId}', [TeacherLessonController::class, 'deleteVideo']);
        
        // Get lessons by course
        Route::get('/courses/{courseId}/lessons', [TeacherLessonController::class, 'getLessonsByCourse']);
        
        // Assignments
        Route::get('/assignments', [TeacherController::class, 'getTeacherAssignments']);
        Route::get('/courses/{courseId}/assignments', [TeacherController::class, 'getAssignments']);
        Route::post('/assignments', [TeacherController::class, 'createAssignment']);
        Route::put('/assignments/{id}', [TeacherController::class, 'updateAssignment']);
        Route::delete('/assignments/{id}', [TeacherController::class, 'deleteAssignment']);
        
        // Quizzes
        Route::get('/quizzes', [TeacherController::class, 'getTeacherQuizzes']);
        Route::get('/courses/{courseId}/quizzes', [TeacherController::class, 'getQuizzes']);
        Route::post('/quizzes', [TeacherController::class, 'createQuiz']);
        Route::put('/quizzes/{id}', [TeacherController::class, 'updateQuiz']);
        Route::delete('/quizzes/{id}', [TeacherController::class, 'deleteQuiz']);
        Route::post('/quizzes/{quizId}/questions', [TeacherController::class, 'addQuestion']);
        Route::delete('/quizzes/questions/{id}', [TeacherController::class, 'deleteQuestion']);
        Route::get('/quizzes/{quizId}/results', [TeacherController::class, 'getQuizResults']);

        // Department management
        Route::get('/departments', [DepartmentController::class, 'index']);
        Route::post('/departments', [DepartmentController::class, 'store']);
        Route::put('/departments/{department}', [DepartmentController::class, 'update']);
        Route::delete('/departments/{department}', [DepartmentController::class, 'destroy']);

    });

    // Student routes
    Route::prefix('student')->middleware('role:Student')->group(function () {
        // Dashboard
        Route::get('/dashboard', [StudentController::class, 'dashboard']);
        
        // Courses
        Route::get('/courses', [StudentController::class, 'getMyCourses']);
        Route::get('/courses/{courseId}', [StudentController::class, 'getCourseDetails']);
        Route::get('/courses/{courseId}/lessons', [StudentController::class, 'getCourseLessons']);
        Route::get('/lessons', [StudentController::class, 'getAllLessons']);
        
        // Attendance
        Route::get('/attendance', [StudentController::class, 'getAttendance']);
        Route::get('/courses/{courseId}/attendance', [StudentController::class, 'getCourseAttendance']);
        
        // Scores
        Route::get('/scores', [StudentController::class, 'getScores']);
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
        Route::get('/quizzes/{quizId}/results', [StudentController::class, 'getQuizResults']);
    });
});
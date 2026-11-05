<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Helper to check if an index exists before creating
     */
    private function hasIndex(string $table, string $indexName): bool
    {
        try {
            $connection = Schema::getConnection();
            $database = $connection->getDatabaseName();
            
            $result = DB::select(
                "SELECT COUNT(*) as count 
                 FROM information_schema.statistics 
                 WHERE table_schema = ? 
                 AND table_name = ? 
                 AND index_name = ?",
                [$database, $table, $indexName]
            );
            
            return ($result[0]->count ?? 0) > 0;
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * Helper to safely create an index
     */
    private function createIndex(string $table, array|string $columns, string $indexName): void
    {
        if (!$this->hasIndex($table, $indexName)) {
            try {
                Schema::table($table, function (Blueprint $blueprint) use ($columns, $indexName) {
                    $blueprint->index($columns, $indexName);
                });
            } catch (\Exception $e) {
                \Log::warning("Failed to create index {$indexName} on {$table}: " . $e->getMessage());
            }
        }
    }

    /**
     * Helper to safely drop an index
     */
    private function dropIndexIfExists(string $table, string $indexName): void
    {
        if ($this->hasIndex($table, $indexName)) {
            try {
                Schema::table($table, function (Blueprint $blueprint) use ($indexName) {
                    $blueprint->dropIndex($indexName);
                });
            } catch (\Exception $e) {
                \Log::warning("Failed to drop index {$indexName} on {$table}: " . $e->getMessage());
            }
        }
    }

    public function up(): void
    {
        // ============================================
        // Users Indexes
        // ============================================
        $this->createIndex('users', 'role_id', 'idx_users_role');
        $this->createIndex('users', 'status', 'idx_users_status');
        $this->createIndex('users', 'first_name', 'idx_users_first_name');
        $this->createIndex('users', 'last_name', 'idx_users_last_name');

        // ============================================
        // Students Indexes (សម្រាប់ Search, Sort និង Export)
        // ============================================
        $this->createIndex('students', 'department_id', 'idx_students_department');
        $this->createIndex('students', 'user_id', 'idx_students_user');
        $this->createIndex('students', 'student_code', 'idx_students_code');
        $this->createIndex('students', 'first_name', 'idx_students_first_name');
        $this->createIndex('students', 'last_name', 'idx_students_last_name');

        // ============================================
        // Teachers Indexes (សម្រាប់ Search, Sort និង Export)
        // ============================================
        $this->createIndex('teachers', 'department_id', 'idx_teachers_department');
        $this->createIndex('teachers', 'user_id', 'idx_teachers_user');
        $this->createIndex('teachers', 'teacher_code', 'idx_teachers_code');
        $this->createIndex('teachers', 'first_name', 'idx_teachers_first_name');
        $this->createIndex('teachers', 'last_name', 'idx_teachers_last_name');

        // ============================================
        // Courses Indexes
        // ============================================
        $this->createIndex('courses', 'course_name', 'idx_courses_name');
        $this->createIndex('courses', 'course_code', 'idx_courses_code');
        $this->createIndex('courses', 'department_id', 'idx_courses_department');
        $this->createIndex('courses', 'teacher_id', 'idx_courses_teacher');

        // ============================================
        // Enrollments Indexes
        // ============================================
        $this->createIndex('enrollments', 'student_id', 'idx_enrollments_student');
        $this->createIndex('enrollments', 'course_id', 'idx_enrollments_course');
        $this->createIndex('enrollments', 'status', 'idx_enrollments_status');
        $this->createIndex('enrollments', 'created_at', 'idx_enrollments_created');
        $this->createIndex('enrollments', ['student_id', 'course_id'], 'idx_enrollments_student_course');
        // ✅ ជំនួយដល់ការ Filter តាម Status ក្នុងមុខវិជ្ជា
        $this->createIndex('enrollments', ['course_id', 'status'], 'idx_enrollments_course_status');
        // ✅ ជំនួយដល់ StudentController/TeacherController ស្វែងរកសិស្ស active
        $this->createIndex('enrollments', ['student_id', 'status'], 'idx_enrollments_student_status');

        // ============================================
        // Attendances Indexes
        // ============================================
        $this->createIndex('attendances', 'course_id', 'idx_attendances_course');
        $this->createIndex('attendances', 'student_id', 'idx_attendances_student');
        $this->createIndex('attendances', 'status', 'idx_attendances_status');
        $this->createIndex('attendances', 'attendance_date', 'idx_attendances_date');
        $this->createIndex('attendances', ['course_id', 'attendance_date'], 'idx_attendances_course_date');
        $this->createIndex('attendances', ['course_id', 'status'], 'idx_attendances_course_status');
        // ✅ ជំនួយដល់ StudentController getAttendance តាម student_id និងកាលបរិច្ឆេទ
        $this->createIndex('attendances', ['student_id', 'attendance_date'], 'idx_attendances_student_date');

        // ============================================
        // Grades Indexes
        // ============================================
        $this->createIndex('grades', 'student_id', 'idx_grades_student');
        $this->createIndex('grades', 'course_id', 'idx_grades_course');
        $this->createIndex('grades', 'grade_letter', 'idx_grades_letter');
        $this->createIndex('grades', ['course_id', 'grade_letter'], 'idx_grades_course_letter');
        // ✅ ជំនួយដល់ updateOrCreate / getScores តាម student_id និង course_id
        $this->createIndex('grades', ['student_id', 'course_id'], 'idx_grades_student_course');
    }

    public function down(): void
    {
        // Users
        $this->dropIndexIfExists('users', 'idx_users_role');
        $this->dropIndexIfExists('users', 'idx_users_status');
        $this->dropIndexIfExists('users', 'idx_users_first_name');
        $this->dropIndexIfExists('users', 'idx_users_last_name');

        // Students
        $this->dropIndexIfExists('students', 'idx_students_department');
        $this->dropIndexIfExists('students', 'idx_students_user');
        $this->dropIndexIfExists('students', 'idx_students_code');
        $this->dropIndexIfExists('students', 'idx_students_first_name');
        $this->dropIndexIfExists('students', 'idx_students_last_name');

        // Teachers
        $this->dropIndexIfExists('teachers', 'idx_teachers_department');
        $this->dropIndexIfExists('teachers', 'idx_teachers_user');
        $this->dropIndexIfExists('teachers', 'idx_teachers_code');
        $this->dropIndexIfExists('teachers', 'idx_teachers_first_name');
        $this->dropIndexIfExists('teachers', 'idx_teachers_last_name');

        // Courses
        $this->dropIndexIfExists('courses', 'idx_courses_name');
        $this->dropIndexIfExists('courses', 'idx_courses_code');
        $this->dropIndexIfExists('courses', 'idx_courses_department');
        $this->dropIndexIfExists('courses', 'idx_courses_teacher');

        // Enrollments
        $this->dropIndexIfExists('enrollments', 'idx_enrollments_student');
        $this->dropIndexIfExists('enrollments', 'idx_enrollments_course');
        $this->dropIndexIfExists('enrollments', 'idx_enrollments_status');
        $this->dropIndexIfExists('enrollments', 'idx_enrollments_created');
        $this->dropIndexIfExists('enrollments', 'idx_enrollments_student_course');
        $this->dropIndexIfExists('enrollments', 'idx_enrollments_course_status');
        $this->dropIndexIfExists('enrollments', 'idx_enrollments_student_status');

        // Attendances
        $this->dropIndexIfExists('attendances', 'idx_attendances_course');
        $this->dropIndexIfExists('attendances', 'idx_attendances_student');
        $this->dropIndexIfExists('attendances', 'idx_attendances_status');
        $this->dropIndexIfExists('attendances', 'idx_attendances_date');
        $this->dropIndexIfExists('attendances', 'idx_attendances_course_date');
        $this->dropIndexIfExists('attendances', 'idx_attendances_course_status');
        $this->dropIndexIfExists('attendances', 'idx_attendances_student_date');

        // Grades
        $this->dropIndexIfExists('grades', 'idx_grades_student');
        $this->dropIndexIfExists('grades', 'idx_grades_course');
        $this->dropIndexIfExists('grades', 'idx_grades_letter');
        $this->dropIndexIfExists('grades', 'idx_grades_course_letter');
        $this->dropIndexIfExists('grades', 'idx_grades_student_course');
    }
};
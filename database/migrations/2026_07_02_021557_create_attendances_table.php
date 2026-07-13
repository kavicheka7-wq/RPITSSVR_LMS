// database/migrations/2024_01_01_000018_create_attendance_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained('users');
            $table->foreignId('course_id')->constrained('courses');
            $table->date('attendance_date');
            $table->enum('status', ['Present', 'Absent', 'Late']);
            $table->timestamps();
            
            $table->unique(['student_id', 'course_id', 'attendance_date']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('attendance');
    }
};
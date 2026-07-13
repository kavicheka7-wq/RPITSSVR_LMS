// database/migrations/2024_01_01_000004_create_enrollments_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('enrollments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained('users');
            $table->foreignId('course_id')->constrained('courses');
            $table->date('enrolled_date');
            $table->enum('status', ['active', 'completed', 'dropped'])->default('active');
            $table->timestamps();
            
            $table->unique(['student_id', 'course_id']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('enrollments');
    }
};
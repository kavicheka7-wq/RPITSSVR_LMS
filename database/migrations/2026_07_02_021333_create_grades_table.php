// database/migrations/2024_01_01_000014_create_grades_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('grades', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained('users');
            $table->foreignId('course_id')->constrained('courses');
            $table->decimal('assignment_score', 5, 2)->nullable();
            $table->decimal('quiz_score', 5, 2)->nullable();
            $table->decimal('final_score', 5, 2)->nullable();
            $table->string('grade_letter', 2)->nullable();
            $table->timestamps();
            
            $table->unique(['student_id', 'course_id']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('grades');
    }
};
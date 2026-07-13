// database/migrations/2024_01_01_000003_create_courses_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('courses', function (Blueprint $table) {
            $table->id();
            $table->string('course_code', 50)->unique();
            $table->string('course_name', 255);
            $table->integer('credit')->default(3);
            $table->text('description')->nullable();
            $table->foreignId('department_id')->constrained('departments');
            $table->foreignId('teacher_id')->constrained('users');
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('courses');
    }
};
// database/migrations/2024_01_01_000013_create_quiz_attempts_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('quiz_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quiz_id')->constrained('quizzes');
            $table->foreignId('student_id')->constrained('users');
            $table->decimal('score', 5, 2)->nullable();
            $table->datetime('started_at');
            $table->datetime('submitted_at')->nullable();
            $table->timestamps();
            
            $table->unique(['quiz_id', 'student_id']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('quiz_attempts');
    }
};
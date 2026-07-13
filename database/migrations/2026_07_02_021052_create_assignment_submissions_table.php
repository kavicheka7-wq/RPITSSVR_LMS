// database/migrations/2024_01_01_000009_create_assignment_submissions_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('assignment_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('assignment_id')->constrained('assignments');
            $table->foreignId('student_id')->constrained('users');
            $table->string('file_path', 500);
            $table->datetime('submitted_at');
            $table->decimal('score', 5, 2)->nullable();
            $table->text('feedback')->nullable();
            $table->timestamps();
            
            $table->unique(['assignment_id', 'student_id']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('assignment_submissions');
    }
};
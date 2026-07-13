// database/migrations/2024_01_01_000010_create_quizzes_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('quizzes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->constrained('courses');
            $table->string('title', 255);
            $table->integer('duration')->comment('Duration in minutes');
            $table->decimal('total_mark', 5, 2);
            $table->datetime('start_date');
            $table->datetime('end_date');
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('quizzes');
    }
};
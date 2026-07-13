<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('students', function (Blueprint $table) {
             $table->id();
            
            // ភ្ជាប់ One-to-One ជាមួយតារាង users
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('role_id')->constrained('roles')->onDelete('cascade'); // ភ្ជាប់ជាមួយតារាង roles ដើម្បីកំណត់តួនាទីនិស្សិត
            // អត្តលេខ និងការសិក្សា
            $table->string('student_code', 50)->unique()->nullable(); // អត្តលេខនិស្សិត
            $table->foreignId('department_id')->nullable()->constrained('departments')->onDelete('set null');
            $table->string('batch_year', 50)->nullable(); // ជំនាន់ ឬឆ្នាំសិក្សា (ឧ. Batch 15 / Year 1)
            $table->string('degree_level', 100)->nullable(); // កម្រិតសិក្សា (ឧ. Associate Degree, Bachelor)
            $table->enum('study_shift', ['Monday-Friday', 'Saturday-Sunday'])->nullable(); // វេនសិក្សា
            
            // ព័ត៌មានផ្ទាល់ខ្លួន
            $table->string('first_name', 100);
            $table->string('last_name', 100);
            $table->enum('gender', ['Male', 'Female', 'Other']);
            $table->date('date_of_birth')->nullable(); // ថ្ងៃខែឆ្នាំកំណើត
            $table->string('email')->unique();
            $table->string('phone', 20)->nullable();
            $table->text('address')->nullable(); // អាសយដ្ឋានបច្ចុប្បន្ន
            $table->string('profile_image', 255)->nullable();
            
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('students');
    }
};

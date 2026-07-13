<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('teachers', function (Blueprint $table) {
            $table->id();
            
            // ភ្ជាប់ One-to-One ជាមួយតារាង users (ទិន្នន័យឈ្មោះ, អ៊ីមែល គឺទាញពីទីនោះ)
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('role_id')->constrained('roles')->onDelete('cascade'); // ភ្ជាប់ជាមួយតារាង roles ដើម្បីកំណត់តួនាទីគ្រូ
            // ព័ត៌មានការងារនៅវិទ្យាស្ថានពហុបច្ចេកទេស
            $table->string('teacher_code', 50)->unique()->nullable(); // អត្តលេខគ្រូ
            $table->string('first_name', 100); // ឈ្មោះ
            $table->string('last_name', 100); // នាមត្រកូល
            $table->enum('gender', ['Male', 'Female', 'Other'])->nullable();
            $table->date('date_of_birth')->nullable(); // ថ្ងៃខែឆ្នាំកំណើត
            $table->string('email', 255)->unique(); // អ៊ីមែល
            $table->string('phone', 20)->nullable(); // លេខទូរស័ព្ទ
            $table->foreignId('department_id')->nullable()->constrained('departments')->onDelete('set null'); // ដេប៉ាតឺម៉ង់
            
            // ព័ត៌មានវិជ្ជាជីវៈ (សំខាន់សម្រាប់ TVET)

            $table->string('specialization', 255)->nullable(); // ឯកទេស (ឧ. Network, Web Development)
            $table->enum('employment_type', ['Full-time'])->default('Full-time'); // គ្រូពេញម៉ោង ឬក្រៅម៉ោង
            
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('teachers');
    }
};
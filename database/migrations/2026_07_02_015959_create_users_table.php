// database/migrations/2024_01_01_000001_create_users_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained('roles');
            $table->string('first_name', 100);
            $table->string('last_name', 100);
            $table->enum('gender', ['Male', 'Female', 'Other'])->nullable();
            $table->string('email', 255)->unique();
            $table->string('phone', 20)->nullable();
            $table->string('password');
            $table->string('profile_image', 255)->nullable();
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->rememberToken();
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('users');
    }
};
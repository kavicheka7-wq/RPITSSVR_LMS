// database/migrations/2024_01_01_000000_create_roles_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('role_name', 50);
            $table->timestamps();
        });

        // Insert default roles
        DB::table('roles')->insert([
            ['role_name' => 'Admin'],
            ['role_name' => 'Teacher'],
            ['role_name' => 'Student'],
        ]);
    }

    public function down()
    {
        Schema::dropIfExists('roles');
    }
};
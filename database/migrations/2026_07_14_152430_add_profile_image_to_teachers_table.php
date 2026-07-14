<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('teachers', function (Blueprint $table) {
            // បន្ថែម profile_image ចូលតារាងចាស់ ដោយដាក់វានៅក្រោយ employment_type
            $table->string('profile_image')->nullable()->after('employment_type');
        });
    }

    public function down(): void
    {
        Schema::table('teachers', function (Blueprint $table) {
            // កូដសម្រាប់លុប column នេះវិញ នៅពេលដែលអ្នក run: php artisan migrate:rollback
            $table->dropColumn('profile_image');
        });
    }
};
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (!Schema::hasColumn('grades', 'midterm_score')) {
            Schema::table('grades', function (Blueprint $table) {
                $table->decimal('midterm_score', 5, 2)->nullable()->after('quiz_score');
            });
        }
    }

    public function down()
    {
        if (Schema::hasColumn('grades', 'midterm_score')) {
            Schema::table('grades', function (Blueprint $table) {
                $table->dropColumn('midterm_score');
            });
        }
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('attendances', function (Blueprint $table) {
            // បន្ថែម field late_time នៅពីក្រោយ attendance_date
            $table->time('late_time')->nullable()->after('attendance_date');
        });
    }

    public function down()
    {
        Schema::table('attendances', function (Blueprint $table) {
            // លុប field នេះវិញប្រសិនបើយើង run rollback
            $table->dropColumn('late_time');
        });
    }
};
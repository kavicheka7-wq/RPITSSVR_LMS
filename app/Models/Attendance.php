<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attendance extends Model
{
    use HasFactory;

    protected $table = 'attendances';

    protected $fillable = [
        'student_id',
        'course_id',
        'attendance_date',
        'late_time',
        'status',
    ];

    protected $casts = [
        'attendance_date' => 'date',
    ];

    /**
     * Relationship: The student whose attendance is being recorded.
     */
    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    /**
     * Relationship: The course the student is attending.
     */
    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }
}
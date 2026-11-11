<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Grade extends Model
{
    use HasFactory;

    protected $fillable = [
        'student_id',
        'course_id',
        'assignment_score',
        'quiz_score',
        'midterm_score',
        'exam_score',
        'final_score',
        'grade_letter',
    ];

    protected $casts = [
        'assignment_score' => 'float',
        'quiz_score'       => 'float',
        'midterm_score'    => 'float',
        'exam_score'       => 'float',
        'final_score'      => 'float',
    ];

    /**
     * Relationship: The student who received the grade.
     */
    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    /**
     * Relationship: The course the grade belongs to.
     */
    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }
}
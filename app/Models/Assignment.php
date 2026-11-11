<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Assignment extends Model
{
    use HasFactory;

    protected $appends = ['marks'];

    protected $fillable = [
        'course_id',
        'title',
        'description',
        'due_date',
        'total_score',
        'created_by',
    ];

    protected $casts = [
        'due_date'    => 'datetime',
        'total_score' => 'float',
    ];

    /**
     * Compatibility accessor so both $assignment->total_score and $assignment->marks work seamlessly.
     */
    public function getMarksAttribute(): float
    {
        return (float) ($this->total_score ?? 20);
    }

    /**
     * Relationship: The course this assignment belongs to.
     */
    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class, 'course_id');
    }

    /**
     * Relationship: The user who created the assignment.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Relationship: Submissions from students.
     */
    public function submissions(): HasMany
    {
        return $this->hasMany(AssignmentSubmission::class, 'assignment_id');
    }
}
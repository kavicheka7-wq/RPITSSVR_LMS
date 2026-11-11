<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AssignmentSubmission extends Model
{
    use HasFactory;

    protected $fillable = [
        'assignment_id',
        'student_id',
        'file_path',
        'original_filename',
        'file_data',
        'submitted_at',
        'score',
        'feedback',
    ];

    /**
     * លាក់ទិន្នន័យ Base64 ធំៗពេលទាញបញ្ជីកិច្ចការធម្មតា ដើម្បីឱ្យ API ដើរលឿនបំផុត
     */
    protected $hidden = [
        'file_data',
    ];

    protected $casts = [
        'submitted_at' => 'datetime',
        'score'        => 'float',
    ];

    /**
     * Relationship: The assignment this submission belongs to.
     */
    public function assignment(): BelongsTo
    {
        return $this->belongsTo(Assignment::class, 'assignment_id');
    }

    /**
     * Relationship: The student (User) who submitted the assignment.
     */
    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    /**
     * Relationship: The student profile record (matching student_id to students.user_id).
     */
    public function studentProfile(): BelongsTo
    {
        return $this->belongsTo(Student::class, 'student_id', 'user_id');
    }
}
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Lesson extends Model
{
    use HasFactory;

    protected $fillable = [
        'course_id',
        'title',
        'description',
        'lesson_order',
        'created_by',
    ];

    /**
     * Relationship: Lesson belongs to a course.
     */
    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    /**
     * Relationship: The user who created the lesson.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Relationship: Files associated with this lesson.
     */
    public function files(): HasMany
    {
        return $this->hasMany(LessonFile::class);
    }

    /**
     * Relationship: Videos associated with this lesson.
     */
    public function videos(): HasMany
    {
        return $this->hasMany(Video::class);
    }
}
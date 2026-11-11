<?php
// app/Models/Course.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Course extends Model
{
    use HasFactory;

    protected $appends = ['full_name'];

    protected $fillable = [
        'course_code',
        'course_name',
        'credit',
        'description',
        'department_id',
        'teacher_id',
        'semester',
        'year',
        'academic_year',
    ];

    protected $casts = [
        'credit' => 'integer',
    ];

    // Relationships
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'department_id');
    }

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(Teacher::class, 'teacher_id');
    }

    public function teacherProfile(): BelongsTo
    {
        return $this->belongsTo(Teacher::class, 'teacher_id', 'user_id');
    }

    public function teacherUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    public function enrollments(): HasMany
    {
        return $this->hasMany(Enrollment::class, 'course_id');
    }

    public function lessons(): HasMany
    {
        return $this->hasMany(Lesson::class, 'course_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(Assignment::class, 'course_id');
    }

    public function quizzes(): HasMany
    {
        return $this->hasMany(Quiz::class, 'course_id');
    }

    public function announcements(): HasMany
    {
        return $this->hasMany(Announcement::class, 'course_id');
    }

    public function discussionForums(): HasMany
    {
        return $this->hasMany(DiscussionForum::class, 'course_id');
    }

    public function attendance(): HasMany
    {
        return $this->hasMany(Attendance::class, 'course_id');
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class, 'course_id');
    }

    public function grades(): HasMany
    {
        return $this->hasMany(Grade::class, 'course_id');
    }

    public function students(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'enrollments', 'course_id', 'student_id')
                    ->withPivot('status', 'enrolled_date')
                    ->withTimestamps();
    }

    // Accessor
    public function getFullNameAttribute(): string
    {
        return trim(($this->course_code ?? '') . ' - ' . ($this->course_name ?? ''), ' -');
    }
}
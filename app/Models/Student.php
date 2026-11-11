<?php
// app/Models/Student.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Student extends Model
{
    use HasFactory;

    protected $appends = ['full_name', 'name', 'status', 'profile_image_url'];

    protected $fillable = [
        'user_id',
        'role_id',
        'student_code',
        'department_id',
        'batch_year',
        'degree_level',
        'study_shift',
        'first_name',
        'last_name',
        'gender',
        'date_of_birth',
        'email',
        'phone',
        'address',
        'profile_image',
    ];

    protected $casts = [
        'date_of_birth' => 'date:Y-m-d',
    ];

    // Relationships
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'department_id');
    }

    // ប្រើ user_id ជា foreign key
    public function enrollments(): HasMany
    {
        return $this->hasMany(Enrollment::class, 'student_id', 'user_id');
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class, 'student_id', 'user_id');
    }

    public function grades(): HasMany
    {
        return $this->hasMany(Grade::class, 'student_id', 'user_id');
    }

    public function assignmentSubmissions(): HasMany
    {
        return $this->hasMany(AssignmentSubmission::class, 'student_id', 'user_id');
    }

    public function quizAttempts(): HasMany
    {
        return $this->hasMany(QuizAttempt::class, 'student_id', 'user_id');
    }

    // Accessor for full name
    public function getFullNameAttribute(): string
    {
        return trim(($this->first_name ?? '') . ' ' . ($this->last_name ?? ''));
    }

    // Accessor alias for name compatibility
    public function getNameAttribute(): string
    {
        return $this->full_name;
    }

    // Accessor for status (ការពារកុំឱ្យកើត N+1 Query ពេលមិនបានហៅ with('user'))
    public function getStatusAttribute(): string
    {
        if (!empty($this->attributes['status'])) {
            return (string) $this->attributes['status'];
        }

        if ($this->relationLoaded('user')) {
            return $this->user ? ($this->user->status ?? 'active') : 'inactive';
        }

        return 'active';
    }

    // Accessor for profile image with default (គាំទ្រទាំង Base64 Data URI លើ Railway, URL ពេញ, និង Storage path)
    public function getProfileImageUrlAttribute(): string
    {
        $img = $this->profile_image;

        if (empty($img) && $this->relationLoaded('user') && $this->user) {
            $img = $this->user->profile_image;
        }

        if (!empty($img)) {
            $trimmed = trim((string) $img);

            if (
                str_starts_with($trimmed, 'data:') ||
                str_starts_with($trimmed, 'http://') ||
                str_starts_with($trimmed, 'https://') ||
                str_starts_with($trimmed, '//')
            ) {
                return $trimmed;
            }

            $cleanPath = preg_replace('/^\/?storage\//', '', ltrim($trimmed, '/'));
            return asset('storage/' . $cleanPath);
        }

        $fullName = $this->full_name ?: 'Student';
        $name = urlencode($fullName);
        return "https://ui-avatars.com/api/?name={$name}&background=4f46e5&color=fff&size=128";
    }
}
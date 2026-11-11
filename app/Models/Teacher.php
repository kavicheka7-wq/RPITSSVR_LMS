<?php
// app/Models/Teacher.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Teacher extends Model
{
    use HasFactory;

    protected $appends = ['full_name', 'name', 'status', 'profile_image_url'];

    protected $fillable = [
        'user_id',
        'role_id',        // យើងទុក role_id ក្នុងតារាង teachers
        'teacher_code',
        'first_name',
        'last_name',
        'gender',
        'date_of_birth',
        'email',
        'phone',
        'department_id',
        'specialization',
        'employment_type',
        'profile_image',  // បន្ថែម profile_image
    ];

    protected $casts = [
        'date_of_birth' => 'date:Y-m-d',
    ];

    // Relationships
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function courses(): HasMany
    {
        return $this->hasMany(Course::class, 'teacher_id');
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

        // Default avatar using UI Avatars
        $fullName = $this->full_name ?: 'Teacher';
        $name = urlencode($fullName);
        return "https://ui-avatars.com/api/?name={$name}&background=2563eb&color=fff&size=128";
    }
}
<?php
// app/Models/Teacher.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Teacher extends Model
{
    use HasFactory;

    protected $appends = ['full_name', 'status', 'profile_image_url'];

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
        'date_of_birth' => 'date',
    ];

    // Relationships
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function role()
    {
        return $this->belongsTo(Role::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function courses()
    {
        return $this->hasMany(Course::class, 'teacher_id');
    }

    // Accessor for full name
    public function getFullNameAttribute()
    {
        return $this->first_name . ' ' . $this->last_name;
    }

    // Accessor for status (from user)
    public function getStatusAttribute()
    {
        return $this->user ? $this->user->status : 'inactive';
    }

    // Accessor for profile image with default
    public function getProfileImageUrlAttribute()
    {
        if ($this->profile_image) {
            // Check if it's a full URL or local path
            if (filter_var($this->profile_image, FILTER_VALIDATE_URL)) {
                return $this->profile_image;
            }
            return asset('storage/' . $this->profile_image);
        }
        
        // Default avatar using UI Avatars
        $name = urlencode($this->first_name . ' ' . $this->last_name);
        return "https://ui-avatars.com/api/?name={$name}&background=2563eb&color=fff&size=128";
    }
}
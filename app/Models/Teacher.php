<?php
// app/Models/Teacher.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Teacher extends Model
{
    use HasFactory;

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
}
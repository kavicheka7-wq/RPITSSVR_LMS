<?php
// app/Models/Student.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Student extends Model
{
    use HasFactory;

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
        'date_of_birth' => 'date',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function role()
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    public function department()
    {
        return $this->belongsTo(Department::class, 'department_id');
    }

    // ប្រើ user_id ជា foreign key
    public function enrollments()
    {
        return $this->hasMany(Enrollment::class, 'student_id', 'user_id');
    }

    public function attendances()
    {
        return $this->hasMany(Attendance::class, 'student_id', 'user_id');
    }

    public function grades()
    {
        return $this->hasMany(Grade::class, 'student_id', 'user_id');
    }

    // Accessor
    public function getFullNameAttribute()
    {
        return $this->first_name . ' ' . $this->last_name;
    }

    public function getStatusAttribute()
    {
        return $this->user ? $this->user->status : 'inactive';
    }
}
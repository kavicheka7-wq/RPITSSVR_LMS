<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Appended attributes for JSON serialization.
     */
    protected $appends = ['full_name', 'name'];

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'role_id',
        'first_name',
        'last_name',
        'gender',
        'email',
        'phone',
        'password',
        'profile_image',
        'telegram_chat_id',
        'status',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed', // Hash password ស្វ័យប្រវត្តិ
    ];

    /**
     * Relationship: User belongs to a Role.
     */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /**
     * Relationship: Teacher's courses.
     */
    public function courses(): HasMany
    {
        return $this->hasMany(Course::class, 'teacher_id');
    }

    /**
     * Relationship: Student's enrollments.
     */
    public function enrollments(): HasMany
    {
        return $this->hasMany(Enrollment::class, 'student_id');
    }

    /**
     * Relationship: Student's grades.
     */
    public function grades(): HasMany
    {
        return $this->hasMany(Grade::class, 'student_id');
    }

    /**
     * Relationship: Student's attendances.
     */
    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class, 'student_id');
    }

    /**
     * Relationship: User has one Teacher profile.
     */
    public function teacher(): HasOne
    {
        return $this->hasOne(Teacher::class, 'user_id');
    }

    /**
     * Relationship: Teacher profile alias for eager loading compatibility.
     */
    public function teacherProfile(): HasOne
    {
        return $this->hasOne(Teacher::class, 'user_id');
    }

    /**
     * Relationship: User has one Student profile.
     */
    public function student(): HasOne
    {
        return $this->hasOne(Student::class, 'user_id');
    }

    /**
     * Relationship: Student profile alias for eager loading compatibility.
     */
    public function studentProfile(): HasOne
    {
        return $this->hasOne(Student::class, 'user_id');
    }

    /**
     * Interact with the user's full name.
     */
    protected function fullName(): Attribute
    {
        return Attribute::make(
            get: fn () => trim(($this->first_name ?? '') . ' ' . ($this->last_name ?? '')),
        );
    }

    /**
     * Interact with the user's name (compatibility alias for full name).
     */
    protected function name(): Attribute
    {
        return Attribute::make(
            get: fn () => trim(($this->first_name ?? '') . ' ' . ($this->last_name ?? '')),
        );
    }
}
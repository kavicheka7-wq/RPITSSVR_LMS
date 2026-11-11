<?php
// app/Models/Course.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Schema;

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

    /**
     * បម្លែង teacher_id ដោយស្វ័យប្រវត្តិពេលជ្រើសរើសគ្រូពីតារាង teachers
     * ដើម្បីការពារ Error 1452 Foreign Key Constraint Fails ជាមួយតារាង users
     */
    public function setTeacherIdAttribute($value): void
    {
        if ($value === null || $value === '') {
            $this->attributes['teacher_id'] = null;
            return;
        }

        $id = (int) $value;

        // 1. ចាប់យកគ្រូពីតារាង teachers តាម id ដែលបានជ្រើសរើសពី Dropdown
        $teacher = Teacher::find($id);

        if ($teacher) {
            // ប្រសិនបើគ្រូមាន user_id ហើយមានក្នុងតារាង users ប្រើ user_id ដើម្បីឱ្យត្រូវជាមួយ Foreign Key លើ Railway
            if (!empty($teacher->user_id) && User::where('id', $teacher->user_id)->exists()) {
                $this->attributes['teacher_id'] = $teacher->user_id;
                return;
            }

            // ប្រសិនបើគ្រូមិនទាន់មាន user_id ឬរកមិនឃើញក្នុងតារាង users បង្កើត/ភ្ជាប់ User ឱ្យគ្រូនោះដោយស្វ័យប្រវត្តិ
            $user = null;
            if (!empty($teacher->email)) {
                $user = User::where('email', $teacher->email)->first();
            }

            if (!$user) {
                $user = User::create([
                    'role_id'    => $teacher->role_id ?? 2,
                    'first_name' => $teacher->first_name ?? 'Teacher',
                    'last_name'  => $teacher->last_name ?? '',
                    'email'      => $teacher->email ?? ('teacher_' . $teacher->id . '@lms.local'),
                    'password'   => $teacher->password ?? bcrypt('12345678'),
                    'phone'      => $teacher->phone ?? null,
                    'status'     => 'Active',
                ]);
            }

            if ($user && Schema::hasColumn('teachers', 'user_id')) {
                $teacher->user_id = $user->id;
                $teacher->saveQuietly();
            }

            $this->attributes['teacher_id'] = $user ? $user->id : $id;
            return;
        }

        // 2. ករណីបោះមកជា user_id ស្រាប់
        if (User::where('id', $id)->exists()) {
            $this->attributes['teacher_id'] = $id;
            return;
        }

        $this->attributes['teacher_id'] = null;
    }

    // Relationships
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'department_id');
    }

    public function teacher(): BelongsTo
    {
        // ប្រសិនបើ teacher_id ត្រូវជាមួយ teachers.user_id ឱ្យទាញពីតារាង teachers តាម user_id
        return $this->belongsTo(Teacher::class, 'teacher_id', 'user_id')
                    ->withDefault(function ($teacher, $course) {
                        if (!empty($course->teacher_id)) {
                            $found = Teacher::find($course->teacher_id);
                            if ($found) {
                                $teacher->forceFill($found->getAttributes());
                            }
                        }
                    });
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
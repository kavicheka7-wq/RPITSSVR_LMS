<?php

// app/Models/Department.php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Department extends Model
{
    use HasFactory;

    protected $appends = ['name'];

    protected $fillable = [
        'department_name',
        'name',
        'description',
    ];

    /**
     * Interact with the department's name (គាំទ្រទាំង department_name និង name).
     */
    protected function name(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->department_name,
            set: fn (?string $value) => ['department_name' => $value !== null ? trim($value) : null],
        );
    }

    public function teachers(): HasMany
    {
        return $this->hasMany(Teacher::class, 'department_id');
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class, 'department_id');
    }

    public function courses(): HasMany
    {
        return $this->hasMany(Course::class, 'department_id');
    }
}
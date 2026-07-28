<?php

// app/Models/Department.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Casts\Attribute; 

class Department extends Model
{
        
    protected $fillable = [
        'department_name',
        'description',
    ];

    /**
     * Interact with the department's name.
     */
    protected function name(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->department_name,
            set: fn (string $value) => ['department_name' => $value],
        );
    }

    public function teachers()
    {
        return $this->hasMany(Teacher::class);
    }

    public function students()
    {
        return $this->hasMany(Student::class);
    }

    public function courses()
    {
        return $this->hasMany(Course::class);
    }
}
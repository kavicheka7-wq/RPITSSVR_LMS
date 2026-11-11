<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    use HasFactory;

    protected $fillable = ['role_name'];

    protected $appends = ['name'];

    /**
     * Relationship: A role can have many users.
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'role_id');
    }

    /**
     * Relationship: A role can have many teachers.
     */
    public function teachers(): HasMany
    {
        return $this->hasMany(Teacher::class, 'role_id');
    }

    /**
     * Relationship: A role can have many students.
     */
    public function students(): HasMany
    {
        return $this->hasMany(Student::class, 'role_id');
    }

    /**
     * Compatibility alias so both $role->role_name and $role->name work seamlessly.
     */
    public function getNameAttribute(): ?string
    {
        return $this->role_name;
    }
}
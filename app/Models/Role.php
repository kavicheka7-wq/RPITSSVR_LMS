<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    use HasFactory;

    protected $fillable = ['role_name'];

    /**
     * Relationship: A role can have many users.
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * Relationship: A role can have many teachers.
     */
    public function teachers(): HasMany
    {
        return $this->hasMany(Teacher::class);  
    }

    
}


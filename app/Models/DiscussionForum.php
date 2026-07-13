<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DiscussionForum extends Model
{
    use HasFactory;

    protected $fillable = [
        'course_id',
        'title',
        'created_by',
    ];

    /**
     * Relationship: The course this forum belongs to.
     */
    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    /**
     * Relationship: The user who created the forum.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Relationship: Posts within this forum.
     */
    public function posts(): HasMany
    {
        return $this->hasMany(ForumPost::class);
    }
}
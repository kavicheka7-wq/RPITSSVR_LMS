<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ForumPost extends Model
{
    use HasFactory;

    protected $fillable = [
        'forum_id',
        'user_id',
        'content',
    ];

    /**
     * Relationship: The forum this post belongs to.
     */
    public function forum(): BelongsTo
    {
        return $this->belongsTo(DiscussionForum::class);
    }

    /**
     * Relationship: The user who created this post.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
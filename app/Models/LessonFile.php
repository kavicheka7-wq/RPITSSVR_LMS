<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LessonFile extends Model
{
    use HasFactory;

    protected $fillable = [
        'lesson_id',
        'file_name',
        'file_path',
        'file_type',
        'mime_type',
        'file_data',
        'uploaded_at',
    ];

    /**
     * លាក់ទិន្នន័យ Base64 ធំៗពេលទាញបញ្ជីមេរៀនធម្មតា ដើម្បីឱ្យ API ដើរលឿនបំផុត
     */
    protected $hidden = [
        'file_data',
    ];

    protected $casts = [
        'uploaded_at' => 'datetime',
    ];

    /**
     * Relationship: A file belongs to a lesson.
     */
    public function lesson(): BelongsTo
    {
        return $this->belongsTo(Lesson::class);
    }
}
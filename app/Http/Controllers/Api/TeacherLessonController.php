<?php
// app/Http/Controllers/Api/TeacherLessonController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\LessonFile;
use App\Models\Teacher;
use App\Models\Video;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class TeacherLessonController extends Controller
{
    private static ?array $cachedFileColumns = null;
    private static bool $schemaChecked = false;
    private ?Teacher $resolvedTeacher = null;
    private bool $teacherLookedUp = false;

    /**
     * ✅ ពិនិត្យ និងបង្កើតជួរឈរ file_data / mime_type តែ ១ ដងគត់ (មិនឆែកគ្រប់ Request ឱ្យយឺតទេ)
     */
    private function ensureLessonFilesSchemaOnce(): void
    {
        if (self::$schemaChecked) {
            return;
        }

        Cache::rememberForever('lms_lesson_files_schema_ready_v2', function () {
            try {
                if (!Schema::hasColumn('lesson_files', 'file_data')) {
                    DB::statement('ALTER TABLE lesson_files ADD COLUMN file_data LONGTEXT NULL');
                }
                if (!Schema::hasColumn('lesson_files', 'mime_type')) {
                    DB::statement('ALTER TABLE lesson_files ADD COLUMN mime_type VARCHAR(120) NULL');
                }
            } catch (\Throwable $e) {
            }
            return true;
        });

        self::$schemaChecked = true;
    }

    /**
     * ✅ ទាញយកបញ្ជីជួរឈរសុវត្ថិភាពរបស់ lesson_files ពី Cache (0ms)
     */
    private function getLessonFileSelectColumns(): array
    {
        if (self::$cachedFileColumns !== null) {
            return self::$cachedFileColumns;
        }

        self::$cachedFileColumns = Cache::remember('lms_lesson_files_select_cols_v2', 86400, function () {
            $cols = ['id', 'lesson_id', 'file_name', 'file_path', 'file_type', 'created_at', 'updated_at'];
            try {
                if (Schema::hasColumn('lesson_files', 'mime_type')) {
                    $cols[] = 'mime_type';
                }
            } catch (\Throwable $e) {
            }
            return $cols;
        });

        return self::$cachedFileColumns;
    }

    /**
     * ✅ HELPER: កំណត់ទំនាក់ទំនង (Eager Load Relations) ដោយមិនទាញយកជួរឈរ file_data (Base64 ធំៗ) មកជាមួយដាច់ខាត
     */
    private function lessonRelations(): array
    {
        $cols = $this->getLessonFileSelectColumns();

        return [
            'course:id,course_code,course_name,department_id,teacher_id,credit',
            'files' => function ($q) use ($cols) {
                $q->select($cols);
            },
            'videos:id,lesson_id,title,video_url,duration,created_at,updated_at',
        ];
    }

    /**
     * ✅ HELPER: សម្អាត Cache ស្ថិតិរបស់គ្រូ និង Admin ពេលមានការបន្ថែម/កែ/លុបមេរៀន
     */
    private function clearRelatedCaches(): void
    {
        $uid = Auth::id();
        if ($uid) {
            Cache::forget("teacher_dashboard_v2_{$uid}");
        }
        Cache::forget('admin_overview_report');
        Cache::forget('admin_dashboard_stats');
    }

    /**
     * ទាញយកកំណត់ត្រាគ្រូបង្រៀន និងភ្ជាប់ user_id ដោយស្វ័យប្រវត្តិបើមិនទាន់មាន
     */
    private function getTeacherRecord(): ?Teacher
    {
        if ($this->teacherLookedUp) {
            return $this->resolvedTeacher;
        }

        $user = Auth::user();
        if (!$user) {
            $this->teacherLookedUp = true;
            return null;
        }

        $teacher = ($user->relationLoaded('teacher') && $user->teacher)
            ? $user->teacher
            : Teacher::select('id', 'user_id', 'department_id', 'email')->where('user_id', $user->id)->first();

        if (!$teacher && !empty($user->email)) {
            $teacher = Teacher::select('id', 'user_id', 'department_id', 'email')
                ->whereRaw('LOWER(TRIM(email)) = ?', [strtolower(trim($user->email))])
                ->first();

            if ($teacher && empty($teacher->user_id)) {
                try {
                    DB::table('teachers')->where('id', $teacher->id)->update(['user_id' => $user->id]);
                    $teacher->user_id = $user->id;
                } catch (\Throwable $e) {
                }
            }
        }

        $this->resolvedTeacher = $teacher;
        $this->teacherLookedUp = true;

        return $teacher;
    }

    /**
     * ទាញយកបញ្ជី ID ទាំងអស់របស់គ្រូបង្រៀន (ទាំង teachers.id និង users.id)
     */
    private function resolveTeacherIds(): array
    {
        $user = Auth::user();
        if (!$user) {
            return [];
        }

        $teacher = $this->getTeacherRecord();

        return array_values(array_unique(array_filter([
            $teacher ? (int) $teacher->id : null,
            ($teacher && $teacher->user_id) ? (int) $teacher->user_id : null,
            (int) $user->id,
        ])));
    }

    private function getTeacherCoursesQuery()
    {
        $teacherIds = $this->resolveTeacherIds();
        if (empty($teacherIds)) {
            return Course::whereRaw('1 = 0');
        }

        return Course::whereIn('teacher_id', $teacherIds);
    }

    private function checkCourseOwnership($courseId)
    {
        $course = $this->getTeacherCoursesQuery()->find($courseId);
        if ($course) {
            return $course;
        }

        // Fallback៖ បើមុខវិជ្ជាស្ថិតក្នុងដេប៉ាតឺម៉ង់របស់គ្រូ ឬគ្រូធ្លាប់បង្កើតមេរៀនក្នុងមុខវិជ្ជានេះ អនុញ្ញាតឱ្យប្រើបាន
        $teacher = $this->getTeacherRecord();
        $fallbackCourse = Course::findOrFail($courseId);
        if (
            ($teacher && $teacher->department_id && (int) $fallbackCourse->department_id === (int) $teacher->department_id) ||
            Lesson::where('course_id', $courseId)->where('created_by', Auth::id())->exists()
        ) {
            return $fallbackCourse;
        }

        throw (new ModelNotFoundException())->setModel(Course::class, [$courseId]);
    }

    private function ensureLessonAccess(Lesson $lesson): void
    {
        if ($lesson->created_by && (int) $lesson->created_by === (int) Auth::id()) {
            return;
        }

        $courseIds = $this->getTeacherCoursesQuery()->pluck('id')->map(fn ($id) => (int) $id)->all();
        $isOwnerCourse = in_array((int) $lesson->course_id, $courseIds, true);

        if (!$isOwnerCourse) {
            $teacher = $this->getTeacherRecord();
            if ($teacher && $teacher->department_id) {
                $courseDeptId = Course::where('id', $lesson->course_id)->value('department_id');
                if ((int) $courseDeptId === (int) $teacher->department_id) {
                    return;
                }
            }
            throw (new ModelNotFoundException())->setModel(Lesson::class, [$lesson->id]);
        }
    }

    /**
     * ✅ Get all lessons for the teacher's courses (ទាញយកទាំងមេរៀនតាមមុខវិជ្ជារបស់គ្រូ និងមេរៀនដែលគ្រូបានបង្កើតផ្ទាល់ដៃជានិច្ច)
     * GET /teacher/lessons
     */
    public function index(Request $request)
    {
        try {
            $userId = Auth::id();
            $courseIds = $this->getTeacherCoursesQuery()->pluck('id')->map(fn ($id) => (int) $id)->all();

            $query = Lesson::with($this->lessonRelations())
                ->where(function ($q) use ($courseIds, $userId) {
                    if (!empty($courseIds)) {
                        $q->whereIn('course_id', $courseIds);
                        if ($userId) {
                            $q->orWhere('created_by', $userId);
                        }
                    } elseif ($userId) {
                        $q->where('created_by', $userId);
                    } else {
                        $q->whereRaw('1 = 0');
                    }
                });

            // Filter by specific course if provided
            if ($request->filled('course_id') && $request->course_id !== 'all') {
                $query->where('course_id', $request->course_id);
            }

            // Search by title or description keyword
            $searchTerm = trim((string) $request->input('search', $request->input('q', '')));
            if ($searchTerm !== '') {
                $query->where(function ($q) use ($searchTerm) {
                    $q->where('title', 'like', "%{$searchTerm}%")
                      ->orWhere('description', 'like', "%{$searchTerm}%");
                });
            }

            $query->orderBy('lesson_order')->orderBy('id', 'asc');

            // Support server-side pagination if requested
            if ($request->has('per_page') || $request->has('page')) {
                $perPage = max(1, min((int) $request->input('per_page', 15), 100));
                $paginated = $query->paginate($perPage);

                return response()->json([
                    'data' => $paginated->items(),
                    'total' => $paginated->total(),
                    'current_page' => $paginated->currentPage(),
                    'last_page' => $paginated->lastPage(),
                    'per_page' => $paginated->perPage(),
                    'message' => 'បានទាញយកបញ្ជីមេរៀនដោយជោគជ័យ',
                ]);
            }

            $lessons = $query->get();

            return response()->json([
                'data' => $lessons,
                'total' => $lessons->count(),
                'message' => 'បានទាញយកបញ្ជីមេរៀនដោយជោគជ័យ',
            ]);
        } catch (\Throwable $e) {
            Log::error('Error fetching lessons: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមេរៀន',
            ], 500);
        }
    }

    /**
     * Get lessons by course
     * GET /teacher/courses/{courseId}/lessons
     */
    public function getLessonsByCourse($courseId)
    {
        try {
            $course = $this->checkCourseOwnership($courseId);

            $lessons = Lesson::with($this->lessonRelations())
                ->where('course_id', $courseId)
                ->orderBy('lesson_order')
                ->get();

            return response()->json([
                'data' => $lessons,
                'course' => [
                    'id' => $course->id,
                    'name' => $course->course_name,
                    'code' => $course->course_code,
                ],
                'total' => $lessons->count(),
                'message' => 'បានទាញយកមេរៀនដោយជោគជ័យ',
            ]);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'រកមិនឃើញមុខវិជ្ជានេះទេ ឬអ្នកមិនមានសិទ្ធិចូលមើល',
            ], 404);
        } catch (\Throwable $e) {
            Log::error('Error fetching lessons by course: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមេរៀន',
            ], 500);
        }
    }

    /**
     * Create a new lesson
     * POST /teacher/lessons
     */
    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'course_id' => 'required|exists:courses,id',
                'title' => 'required|string|max:255',
                'description' => 'nullable|string',
                'lesson_order' => 'nullable|integer|min:0',
            ]);

            $this->checkCourseOwnership($validated['course_id']);

            $validated['title'] = trim($validated['title']);
            $validated['created_by'] = Auth::id();
            $validated['lesson_order'] = $validated['lesson_order'] ?? 0;

            $lesson = Lesson::create($validated);
            $loadedLesson = $lesson->load($this->lessonRelations());

            $this->clearRelatedCaches();

            return response()->json([
                'lesson' => $loadedLesson,
                'data' => $loadedLesson,
                'message' => 'បានបង្កើតមេរៀនដោយជោគជ័យ',
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'អ្នកមិនមានសិទ្ធិបង្កើតមេរៀនក្នុងមុខវិជ្ជានេះទេ',
            ], 403);
        } catch (\Throwable $e) {
            Log::error('Lesson store error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការបង្កើតមេរៀន',
            ], 500);
        }
    }

    /**
     * Update a lesson
     * PUT /teacher/lessons/{id}
     */
    public function update(Request $request, $id)
    {
        try {
            $lesson = Lesson::findOrFail($id);
            $this->ensureLessonAccess($lesson);

            $validated = $request->validate([
                'title' => 'required|string|max:255',
                'course_id' => 'required|exists:courses,id',
                'lesson_order' => 'nullable|integer|min:0',
                'description' => 'nullable|string',
            ]);

            $this->checkCourseOwnership($validated['course_id']);

            $lesson->update([
                'title' => trim($validated['title']),
                'course_id' => $validated['course_id'],
                'lesson_order' => $validated['lesson_order'] ?? $lesson->lesson_order ?? 0,
                'description' => $validated['description'] ?? null,
            ]);

            $freshLesson = $lesson->load($this->lessonRelations());
            $this->clearRelatedCaches();

            return response()->json([
                'message' => 'បានកែប្រែមេរៀនដោយជោគជ័យ',
                'lesson' => $freshLesson,
                'data' => $freshLesson,
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'រកមិនឃើញមេរៀននេះទេ ឬអ្នកមិនមានសិទ្ធិកែប្រែ',
            ], 404);
        } catch (\Throwable $e) {
            Log::error('Lesson update error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការកែប្រែមេរៀន',
            ], 500);
        }
    }

    /**
     * Delete a lesson
     * DELETE /teacher/lessons/{id}
     */
    public function destroy($id)
    {
        try {
            $lesson = Lesson::with($this->lessonRelations())->findOrFail($id);
            $this->ensureLessonAccess($lesson);

            foreach ($lesson->files as $file) {
                if (
                    $file->file_path &&
                    !str_starts_with($file->file_path, 'http') &&
                    !str_starts_with($file->file_path, 'data:')
                ) {
                    Storage::disk('public')->delete($file->file_path);
                }
                $file->delete();
            }

            foreach ($lesson->videos as $video) {
                if (
                    $video->video_url &&
                    !str_starts_with($video->video_url, 'http') &&
                    !str_starts_with($video->video_url, '//') &&
                    !str_starts_with($video->video_url, 'data:')
                ) {
                    Storage::disk('public')->delete($video->video_url);
                }
                $video->delete();
            }

            $lessonTitle = $lesson->title;
            $lesson->delete();

            $this->clearRelatedCaches();

            return response()->json([
                'message' => "បានលុបមេរៀន '{$lessonTitle}' ដោយជោគជ័យ",
            ]);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'រកមិនឃើញមេរៀននេះទេ',
            ], 404);
        } catch (\Throwable $e) {
            Log::error('Lesson delete error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបមេរៀន',
            ], 500);
        }
    }

    /**
     * ✅ Upload lesson file (Ultra-Fast Response + Background Base64 Sync)
     * POST /teacher/lessons/file
     */
    public function uploadFile(Request $request)
    {
        try {
            $validated = $request->validate([
                'lesson_id' => 'required|integer',
                'file' => 'required|file|max:20480',
            ]);

            $lesson = Lesson::select('id', 'course_id', 'created_by')->findOrFail($validated['lesson_id']);
            $this->ensureLessonAccess($lesson);
            $this->ensureLessonFilesSchemaOnce();

            $file = $request->file('file');
            $originalName = $file->getClientOriginalName();
            $extension = strtolower($file->getClientOriginalExtension() ?: pathinfo($originalName, PATHINFO_EXTENSION));
            $mimeType = $file->getMimeType() ?: 'application/octet-stream';

            // ១. រក្សាទុកចូល Storage Disk ជាមុន
            $fileName = time() . '_' . $originalName;
            $filePath = 'lesson_files/' . $fileName;
            $realPath = $file->getRealPath() ?: $file->getPathname();
            $rawBytes = ($realPath && file_exists($realPath)) ? file_get_contents($realPath) : null;

            try {
                if ($rawBytes !== null) {
                    Storage::disk('public')->put($filePath, $rawBytes);
                } else {
                    $stored = $file->storeAs('lesson_files', $fileName, 'public');
                    if ($stored) {
                        $filePath = $stored;
                    }
                }
            } catch (\Throwable $diskErr) {
                Log::warning('Storage disk write warning on uploadFile: ' . $diskErr->getMessage());
            }

            $now = now();

            // ២. បញ្ចូលតែព័ត៌មានស្រាលៗចូលក្នុង Database មុន ដើម្បីឆ្លើយតបទៅ Frontend វិញភ្លាមៗក្នុងកម្រិតមីលីវិនាទី
            $insertId = DB::table('lesson_files')->insertGetId([
                'lesson_id' => (int) $validated['lesson_id'],
                'file_name' => $originalName,
                'file_path' => $filePath,
                'file_type' => $extension ?: 'file',
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            // ៣. រក្សាទុកទិន្នន័យ Base64 ចូល Database នៅផ្ទៃខាងក្រោយ បន្ទាប់ពីបញ្ជូន Response ទៅឱ្យគ្រូរួចរាល់
            if ($rawBytes !== null) {
                app()->terminating(function () use ($insertId, $rawBytes, $mimeType) {
                    try {
                        DB::table('lesson_files')->where('id', $insertId)->update([
                            'file_data' => base64_encode($rawBytes),
                            'mime_type' => $mimeType,
                        ]);
                    } catch (\Throwable $bgErr) {
                        Log::warning('Background base64 save warning: ' . $bgErr->getMessage());
                    }
                });
            }

            $responsePayload = [
                'id' => $insertId,
                'lesson_id' => (int) $validated['lesson_id'],
                'file_name' => $originalName,
                'file_path' => $filePath,
                'file_type' => $extension ?: 'file',
                'mime_type' => $mimeType,
                'created_at' => $now->toISOString(),
                'updated_at' => $now->toISOString(),
            ];

            $this->clearRelatedCaches();

            return response()->json([
                'message' => 'បានផ្ទុកឡើងឯកសារដោយជោគជ័យ',
                'file' => $responsePayload,
                'data' => $responsePayload,
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យឯកសារដែលបានផ្ទុកឡើង',
                'errors' => $e->errors(),
            ], 422);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'រកមិនឃើញមេរៀននេះទេ',
            ], 404);
        } catch (\Throwable $e) {
            Log::error('File upload error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការផ្ទុកឡើងឯកសារ',
            ], 500);
        }
    }

    /**
     * Delete lesson file
     * DELETE /teacher/lessons/files/{fileId}
     */
    public function deleteFile($fileId)
    {
        try {
            $file = LessonFile::select('id', 'lesson_id', 'file_name', 'file_path')->find($fileId);
            if (!$file) {
                return response()->json([
                    'message' => 'បានលុបឯកសារដោយជោគជ័យ',
                ]);
            }

            // ✅ ផ្ទៀងផ្ទាត់សិទ្ធិគ្រូមុនពេលលុបឯកសារ
            $lesson = Lesson::select('id', 'course_id', 'created_by')->find($file->lesson_id);
            if ($lesson) {
                $this->ensureLessonAccess($lesson);
            }

            if (
                !empty($file->file_path) &&
                !str_starts_with($file->file_path, 'http') &&
                !str_starts_with($file->file_path, 'data:')
            ) {
                try {
                    $cleanPath = preg_replace('/^\/?storage\//', '', ltrim($file->file_path, '/'));
                    Storage::disk('public')->delete($cleanPath);
                } catch (\Throwable $e) {
                }
            }

            DB::table('lesson_files')->where('id', $file->id)->delete();

            $this->clearRelatedCaches();

            return response()->json([
                'message' => 'បានលុបឯកសារដោយជោគជ័យ',
            ]);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'អ្នកមិនមានសិទ្ធិលុបឯកសារនេះទេ',
            ], 403);
        } catch (\Throwable $e) {
            Log::error('File delete error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបឯកសារ',
            ], 500);
        }
    }

    /**
     * Upload video
     * POST /teacher/lessons/video
     */
    public function uploadVideo(Request $request)
    {
        try {
            $validated = $request->validate([
                'lesson_id' => 'required|integer',
                'title' => 'required|string|max:255',
                'video' => 'nullable|file|max:512000|mimes:mp4,mov,avi,wmv,flv,mkv',
                'video_url' => 'nullable|string',
                'duration' => 'nullable|string',
            ]);

            $lesson = Lesson::select('id', 'course_id', 'created_by')->findOrFail($validated['lesson_id']);
            $this->ensureLessonAccess($lesson);

            $videoPath = '';

            if ($request->hasFile('video')) {
                $video = $request->file('video');
                $fileName = time() . '_' . $video->getClientOriginalName();
                $videoPath = $video->storeAs('lesson_videos', $fileName, 'public');
            } elseif (!empty($validated['video_url'])) {
                $videoPath = trim($validated['video_url']);
            } else {
                return response()->json(['message' => 'សូមបញ្ចូលវីដេអូ ឬ តំណភ្ជាប់ YouTube'], 422);
            }

            $videoRecord = Video::create([
                'lesson_id' => $validated['lesson_id'],
                'title' => trim($validated['title']),
                'video_url' => $videoPath,
                'duration' => $validated['duration'] ?? null,
            ]);

            $this->clearRelatedCaches();

            return response()->json([
                'message' => 'បានផ្ទុកឡើងវីដេអូដោយជោគជ័យ',
                'video' => $videoRecord,
                'data' => $videoRecord,
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'រកមិនឃើញមេរៀននេះទេ',
            ], 404);
        } catch (\Throwable $e) {
            Log::error('Video upload error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការផ្ទុកឡើងវីដេអូ',
            ], 500);
        }
    }

    /**
     * Delete video
     * DELETE /teacher/lessons/videos/{videoId}
     */
    public function deleteVideo($videoId)
    {
        try {
            $video = Video::find($videoId);
            if (!$video) {
                return response()->json([
                    'message' => 'បានលុបវីដេអូដោយជោគជ័យ',
                ]);
            }

            // ✅ ផ្ទៀងផ្ទាត់សិទ្ធិគ្រូមុនពេលលុបវីដេអូ
            $lesson = Lesson::select('id', 'course_id', 'created_by')->find($video->lesson_id);
            if ($lesson) {
                $this->ensureLessonAccess($lesson);
            }

            if (
                !empty($video->video_url) &&
                !str_starts_with($video->video_url, 'http') &&
                !str_starts_with($video->video_url, '//') &&
                !str_starts_with($video->video_url, 'data:')
            ) {
                try {
                    $cleanPath = preg_replace('/^\/?storage\//', '', ltrim($video->video_url, '/'));
                    Storage::disk('public')->delete($cleanPath);
                } catch (\Throwable $e) {
                }
            }

            DB::table('videos')->where('id', $video->id)->delete();

            $this->clearRelatedCaches();

            return response()->json([
                'message' => 'បានលុបវីដេអូដោយជោគជ័យ',
            ]);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'អ្នកមិនមានសិទ្ធិលុបវីដេអូនេះទេ',
            ], 403);
        } catch (\Throwable $e) {
            Log::error('Video delete error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបវីដេអូ',
            ], 500);
        }
    }

    /**
     * Get lesson details with files and videos
     * GET /teacher/lessons/{lessonId}
     */
    public function show($lessonId)
    {
        try {
            $lesson = Lesson::with($this->lessonRelations())
                ->findOrFail($lessonId);

            $this->ensureLessonAccess($lesson);

            return response()->json([
                'data' => $lesson,
                'message' => 'បានទាញយកព័ត៌មានមេរៀនដោយជោគជ័យ',
            ]);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'រកមិនឃើញមេរៀននេះទេ',
            ], 404);
        } catch (\Throwable $e) {
            Log::error('Lesson show error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមេរៀន',
            ], 500);
        }
    }

    /**
     * Reorder lessons
     * POST /teacher/lessons/reorder
     */
    public function reorder(Request $request)
    {
        try {
            $validated = $request->validate([
                'lessons' => 'required|array',
                'lessons.*.id' => 'required|exists:lessons,id',
                'lessons.*.order' => 'required|integer|min:0',
            ]);

            DB::transaction(function () use ($validated) {
                foreach ($validated['lessons'] as $item) {
                    $lesson = Lesson::findOrFail($item['id']);
                    $this->ensureLessonAccess($lesson);
                    $lesson->update(['lesson_order' => $item['order']]);
                }
            });

            return response()->json([
                'message' => 'បានរៀបចំលំដាប់មេរៀនដោយជោគជ័យ',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            Log::error('Lesson reorder error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការរៀបចំលំដាប់មេរៀន',
            ], 500);
        }
    }
}
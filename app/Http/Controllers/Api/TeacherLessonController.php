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
    /**
     * ទាញយកបញ្ជី ID ទាំងអស់របស់គ្រូបង្រៀន (ទាំង teachers.id និង users.id)
     */
    private function resolveTeacherIds(): array
    {
        $user = Auth::user();
        if (!$user) {
            return [];
        }

        $teacher = ($user->relationLoaded('teacher') && $user->teacher)
            ? $user->teacher
            : Teacher::where('user_id', $user->id)->first();

        if (!$teacher && !empty($user->email)) {
            $teacher = Teacher::where('email', $user->email)->first();
        }

        return array_values(array_unique(array_filter([
            $teacher ? (int) $teacher->id : null,
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
        return $this->getTeacherCoursesQuery()->findOrFail($courseId);
    }

    private function ensureLessonAccess(Lesson $lesson): void
    {
        $courseIds = $this->getTeacherCoursesQuery()->pluck('id')->map(fn ($id) => (int) $id)->all();
        $isOwnerCourse = in_array((int) $lesson->course_id, $courseIds, true);
        $isCreator = $lesson->created_by && (int) $lesson->created_by === (int) Auth::id();

        if (!$isOwnerCourse && !$isCreator) {
            throw (new ModelNotFoundException())->setModel(Lesson::class, [$lesson->id]);
        }
    }

    /**
     * Get all lessons for the teacher's courses
     * GET /teacher/lessons
     */
    public function index(Request $request)
    {
        try {
            $courseIds = $this->getTeacherCoursesQuery()->pluck('id');

            if ($courseIds->isEmpty()) {
                return response()->json([
                    'data' => [],
                    'total' => 0,
                    'message' => 'អ្នកមិនទាន់មានមុខវិជ្ជាបង្រៀននៅឡើយទេ',
                ]);
            }

            $query = Lesson::with(['course', 'files', 'videos'])
                ->where(function ($q) use ($courseIds) {
                    $q->whereIn('course_id', $courseIds)
                      ->orWhere('created_by', Auth::id());
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

            $query->orderBy('lesson_order');

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
        } catch (\Exception $e) {
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

            $lessons = Lesson::with(['course', 'files', 'videos'])
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
        } catch (\Exception $e) {
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
            $loadedLesson = $lesson->load(['course', 'files', 'videos']);

            Cache::forget('admin_overview_report');

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
        } catch (\Exception $e) {
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

            $freshLesson = $lesson->fresh(['course', 'files', 'videos']);

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
        } catch (\Exception $e) {
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
            $lesson = Lesson::with(['files', 'videos'])->findOrFail($id);
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

            Cache::forget('admin_overview_report');

            return response()->json([
                'message' => "បានលុបមេរៀន '{$lessonTitle}' ដោយជោគជ័យ",
            ]);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'រកមិនឃើញមេរៀននេះទេ',
            ], 404);
        } catch (\Exception $e) {
            Log::error('Lesson delete error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបមេរៀន',
            ], 500);
        }
    }

    /**
     * Upload lesson file
     * POST /teacher/lessons/file
     */
    public function uploadFile(Request $request)
    {
        try {
            $validated = $request->validate([
                'lesson_id' => 'required|exists:lessons,id',
                'file' => 'required|file|max:10240|mimes:pdf,doc,docx,ppt,pptx,xls,xlsx,csv,txt,zip,rar,jpg,jpeg,png,webp',
            ]);

            $lesson = Lesson::findOrFail($validated['lesson_id']);
            $this->ensureLessonAccess($lesson);

            $file = $request->file('file');
            $originalName = $file->getClientOriginalName();
            $fileName = time() . '_' . $originalName;
            $filePath = $file->storeAs('lesson_files', $fileName, 'public');

            $createData = [
                'lesson_id' => $validated['lesson_id'],
                'file_name' => $originalName,
                'file_path' => $filePath,
                'file_type' => $file->getClientOriginalExtension(),
            ];

            // ✅ រក្សាទុកទិន្នន័យ Base64 ចូលក្នុង Database (ប្រសិនបើមានជួរឈរ file_data) ដើម្បីការពារបាត់ឯកសារលើ Railway
            if (Schema::hasColumn('lesson_files', 'file_data')) {
                $createData['file_data'] = base64_encode(file_get_contents($file->getRealPath()));
            }
            if (Schema::hasColumn('lesson_files', 'mime_type')) {
                $createData['mime_type'] = $file->getMimeType() ?: 'application/octet-stream';
            }

            $lessonFile = LessonFile::create($createData);

            return response()->json([
                'message' => 'បានផ្ទុកឡើងឯកសារដោយជោគជ័យ',
                'file' => $lessonFile,
                'data' => $lessonFile,
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
        } catch (\Exception $e) {
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
            $file = LessonFile::findOrFail($fileId);
            $lesson = Lesson::findOrFail($file->lesson_id);
            $this->ensureLessonAccess($lesson);

            if (
                $file->file_path &&
                !str_starts_with($file->file_path, 'http') &&
                !str_starts_with($file->file_path, 'data:')
            ) {
                Storage::disk('public')->delete($file->file_path);
            }
            $file->delete();

            return response()->json([
                'message' => 'បានលុបឯកសារដោយជោគជ័យ',
            ]);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'រកមិនឃើញឯកសារនេះទេ',
            ], 404);
        } catch (\Exception $e) {
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
                'lesson_id' => 'required|exists:lessons,id',
                'title' => 'required|string|max:255',
                'video' => 'nullable|file|max:512000|mimes:mp4,mov,avi,wmv,flv,mkv',
                'video_url' => 'nullable|string',
                'duration' => 'nullable|string',
            ]);

            $lesson = Lesson::findOrFail($validated['lesson_id']);
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
        } catch (\Exception $e) {
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
            $video = Video::findOrFail($videoId);
            $lesson = Lesson::findOrFail($video->lesson_id);
            $this->ensureLessonAccess($lesson);

            if (
                $video->video_url &&
                !str_starts_with($video->video_url, 'http') &&
                !str_starts_with($video->video_url, '//') &&
                !str_starts_with($video->video_url, 'data:')
            ) {
                Storage::disk('public')->delete($video->video_url);
            }
            $video->delete();

            return response()->json([
                'message' => 'បានលុបវីដេអូដោយជោគជ័យ',
            ]);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'រកមិនឃើញវីដេអូនេះទេ',
            ], 404);
        } catch (\Exception $e) {
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
            $lesson = Lesson::with(['course', 'files', 'videos'])
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
        } catch (\Exception $e) {
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
        } catch (\Exception $e) {
            Log::error('Lesson reorder error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការរៀបចំលំដាប់មេរៀន',
            ], 500);
        }
    }
}
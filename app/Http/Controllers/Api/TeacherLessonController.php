<?php
// app/Http/Controllers/Api/TeacherLessonController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lesson;
use App\Models\Course;
use App\Models\LessonFile;
use App\Models\Video;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class TeacherLessonController extends Controller
{
    private function getTeacherCoursesQuery()
    {
        $user = Auth::user();
        $teacherId = ($user && $user->teacher) ? $user->teacher->id : null;
        $userId = Auth::id();

        return Course::where(function ($query) use ($teacherId, $userId) {
            if ($teacherId) {
                $query->where('teacher_id', $teacherId);
            }
            $query->orWhere('teacher_id', $userId);
        });
    }

    private function checkCourseOwnership($courseId)
    {
        return $this->getTeacherCoursesQuery()->findOrFail($courseId);
    }

    /**
     * Get all lessons for the teacher's courses
     * GET /teacher/lessons
     */
    public function index()
    {
        try {
            $courseIds = $this->getTeacherCoursesQuery()->pluck('id');

            if ($courseIds->isEmpty()) {
                return response()->json([
                    'data' => [],
                    'total' => 0,
                    'message' => 'អ្នកមិនទាន់មានមុខវិជ្ជាបង្រៀននៅឡើយទេ'
                ]);
            }

            $lessons = Lesson::with(['course', 'files', 'videos'])
                ->whereIn('course_id', $courseIds)
                ->orderBy('lesson_order')
                ->get();

            return response()->json([
                'data' => $lessons,
                'total' => $lessons->count(),
                'message' => 'បានទាញយកបញ្ជីមេរៀនដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error fetching lessons: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមេរៀន'
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

            $lessons = Lesson::with(['files', 'videos'])
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
                'message' => 'បានទាញយកមេរៀនដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Error fetching lessons by course: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមេរៀន'
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

            $validated['created_by'] = Auth::id(); 
            $validated['lesson_order'] = $validated['lesson_order'] ?? 0;
            
            $lesson = Lesson::create($validated);

            return response()->json([
                'lesson' => $lesson->load(['course', 'files', 'videos']),
                'message' => 'បានបង្កើតមេរៀនដោយជោគជ័យ'
            ], 201);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            \Log::error('Lesson store error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការបង្កើតមេរៀន'
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
            $this->checkCourseOwnership($lesson->course_id);

            $validated = $request->validate([
                'title' => 'required|string|max:255',
                'course_id' => 'required|exists:courses,id',
                'lesson_order' => 'required|integer|min:0',
                'description' => 'nullable|string',
            ]);

            $this->checkCourseOwnership($validated['course_id']);

            $lesson->update([
                'title' => $validated['title'],
                'course_id' => $validated['course_id'],
                'lesson_order' => $validated['lesson_order'],
                'description' => $validated['description'] ?? null,
            ]);

            return response()->json([
                'message' => 'បានកែប្រែមេរៀនដោយជោគជ័យ',
                'data' => $lesson->fresh(['course', 'files', 'videos'])
            ]);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            \Log::error('Lesson update error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការកែប្រែមេរៀន'
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
            $lesson = Lesson::findOrFail($id);
            $this->checkCourseOwnership($lesson->course_id);

            foreach ($lesson->files as $file) {
                Storage::disk('public')->delete($file->file_path);
                $file->delete();
            }

            foreach ($lesson->videos as $video) {
                Storage::disk('public')->delete($video->video_url);
                $video->delete();
            }

            $lessonTitle = $lesson->title;
            $lesson->delete();

            return response()->json([
                'message' => "បានលុបមេរៀន '{$lessonTitle}' ដោយជោគជ័យ"
            ]);

        } catch (\Exception $e) {
            \Log::error('Lesson delete error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបមេរៀន'
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
                'file' => 'required|file|max:10240|mimes:pdf,doc,docx,ppt,pptx,xls,xlsx,txt',
            ]);

            $lesson = Lesson::findOrFail($validated['lesson_id']);
            $this->checkCourseOwnership($lesson->course_id);

            $file = $request->file('file');
            $originalName = $file->getClientOriginalName();
            $fileName = time() . '_' . $originalName;
            $filePath = $file->storeAs('lesson_files', $fileName, 'public');

            $lessonFile = LessonFile::create([
                'lesson_id' => $validated['lesson_id'],
                'file_name' => $originalName,
                'file_path' => $filePath,
                'file_type' => $file->getClientOriginalExtension(),
            ]);

            return response()->json([
                'message' => 'បានផ្ទុកឡើងឯកសារដោយជោគជ័យ',
                'data' => $lessonFile
            ], 201);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យឯកសារដែលបានផ្ទុកឡើង',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            \Log::error('File upload error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការផ្ទុកឡើងឯកសារ'
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
            $this->checkCourseOwnership($lesson->course_id);

            Storage::disk('public')->delete($file->file_path);
            $file->delete();

            return response()->json([
                'message' => 'បានលុបឯកសារដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('File delete error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបឯកសារ'
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
            ]);

            $lesson = Lesson::findOrFail($validated['lesson_id']);
            $this->checkCourseOwnership($lesson->course_id);

            $videoPath = '';

            if ($request->hasFile('video')) {
                $video = $request->file('video');
                $fileName = time() . '_' . $video->getClientOriginalName();
                $videoPath = $video->storeAs('lesson_videos', $fileName, 'public');
            } 
            elseif (!empty($validated['video_url'])) {
                $videoPath = $validated['video_url'];
            } 
            else {
                return response()->json(['message' => 'សូមបញ្ចូលវីដេអូ ឬ តំណភ្ជាប់ YouTube'], 422);
            }

            $videoRecord = Video::create([
                'lesson_id' => $validated['lesson_id'],
                'title' => $validated['title'],
                'video_url' => $videoPath,
                'duration' => null,
            ]);

            return response()->json([
                'message' => 'បានផ្ទុកឡើងវីដេអូដោយជោគជ័យ',
                'data' => $videoRecord
            ], 201);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            \Log::error('Video upload error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការផ្ទុកឡើងវីដេអូ'
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
            $this->checkCourseOwnership($lesson->course_id);

            Storage::disk('public')->delete($video->video_url);
            $video->delete();

            return response()->json([
                'message' => 'បានលុបវីដេអូដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Video delete error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបវីដេអូ'
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

            $this->checkCourseOwnership($lesson->course_id);

            return response()->json([
                'data' => $lesson,
                'message' => 'បានទាញយកព័ត៌មានមេរៀនដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Lesson show error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមេរៀន'
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
                'lessons.*.order' => 'required|integer|min:1',
            ]);

            foreach ($validated['lessons'] as $item) {
                $lesson = Lesson::findOrFail($item['id']);
                $this->checkCourseOwnership($lesson->course_id);
                $lesson->update(['lesson_order' => $item['order']]);
            }

            return response()->json([
                'message' => 'បានរៀបចំលំដាប់មេរៀនដោយជោគជ័យ'
            ]);

        } catch (\Exception $e) {
            \Log::error('Lesson reorder error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការរៀបចំលំដាប់មេរៀន'
            ], 500);
        }
    }
}
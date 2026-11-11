<?php
// app/Http/Controllers/Api/CourseController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Department;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CourseController extends Controller
{
    /**
     * ផ្គូផ្គង និងបំពេញព័ត៌មានគ្រូបង្រៀន (រួមទាំង profile_image) សម្រាប់បញ្ជីមុខវិជ្ជា ដោយគ្មានបញ្ហា N+1 Query
     */
    private function attachTeacherDetailsToCollection($courses)
    {
        $collection = collect($courses);
        if ($collection->isEmpty()) {
            return $courses;
        }

        $teacherIds = $collection->pluck('teacher_id')->filter()->unique()->values()->all();
        if (empty($teacherIds)) {
            return $courses;
        }

        $teachersById = Teacher::whereIn('id', $teacherIds)
            ->orWhereIn('user_id', $teacherIds)
            ->get();

        $mapById = $teachersById->keyBy('id');
        $mapByUserId = $teachersById->keyBy('user_id');

        $userIdsToFetch = $teachersById->pluck('user_id')
            ->merge($teacherIds)
            ->filter()
            ->unique()
            ->values()
            ->all();

        $usersMap = User::whereIn('id', $userIdsToFetch)
            ->select('id', 'first_name', 'last_name', 'email', 'phone', 'profile_image')
            ->get()
            ->keyBy('id');

        foreach ($collection as $course) {
            $tid = $course->teacher_id;
            $tProfile = $mapById->get($tid) ?? $mapByUserId->get($tid);
            $uProfile = $usersMap->get($tProfile?->user_id ?? $tid);

            if ($course->teacher) {
                if (empty($course->teacher->profile_image)) {
                    $course->teacher->profile_image = $tProfile?->profile_image
                        ?? $uProfile?->profile_image
                        ?? null;
                }
            } elseif ($tProfile || $uProfile) {
                $course->setRelation('teacher', $tProfile ?? $uProfile);
            }

            if ($tProfile) {
                if (empty($tProfile->profile_image) && !empty($uProfile?->profile_image)) {
                    $tProfile->profile_image = $uProfile->profile_image;
                }
                $course->setAttribute('teacher_profile', $tProfile);
            }
        }

        return $courses;
    }

    /**
     * កំណត់យក teacher_id ដែលត្រឹមត្រូវ ទោះបីជា Frontend បញ្ជូន teachers.id ឬ users.id មកក៏ដោយ
     * និងការពារកំហុស SQLSTATE[23000] 1452 Foreign Key Constraint (courses_teacher_id_foreign -> users.id)
     */
    private function resolveValidTeacherId($rawTeacherId): ?int
    {
        if (empty($rawTeacherId)) {
            return null;
        }

        // 1. ស្វែងរកក្នុងតារាង teachers តាម id មុនគេ (ព្រោះ Dropdown បោះ teacher.id មក) ទើបរកតាម user_id
        $teacherRow = Teacher::find($rawTeacherId)
            ?? Teacher::where('user_id', $rawTeacherId)->first();

        if ($teacherRow) {
            // បើគ្រូមាន user_id ហើយមានក្នុងតារាង users ត្រូវប្រើ user_id ដើម្បីឱ្យត្រូវជាមួយ Foreign Key នៃតារាង courses
            if (!empty($teacherRow->user_id) && User::where('id', $teacherRow->user_id)->exists()) {
                return (int) $teacherRow->user_id;
            }

            // បើគ្រូក្នុងតារាង teachers មិនទាន់មាន user_id ឬរកមិនឃើញក្នុងតារាង users ទេ ភ្ជាប់ឬបង្កើត User ឱ្យគាត់ដោយស្វ័យប្រវត្តិ
            $linkedUser = null;
            if (!empty($teacherRow->email)) {
                $linkedUser = User::where('email', $teacherRow->email)->first();
            }

            if (!$linkedUser) {
                $linkedUser = User::create([
                    'role_id'    => $teacherRow->role_id ?? 2,
                    'first_name' => $teacherRow->first_name ?? 'Teacher',
                    'last_name'  => $teacherRow->last_name ?? '',
                    'email'      => $teacherRow->email ?: ('teacher_' . $teacherRow->id . '_' . time() . '@lms.local'),
                    'password'   => !empty($teacherRow->password) ? $teacherRow->password : Hash::make('12345678'),
                    'phone'      => $teacherRow->phone ?? null,
                    'gender'     => $teacherRow->gender ?? null,
                    'status'     => 'active',
                ]);
            }

            if ($linkedUser && Schema::hasColumn('teachers', 'user_id')) {
                $teacherRow->user_id = $linkedUser->id;
                $teacherRow->saveQuietly();
            }

            return $linkedUser ? (int) $linkedUser->id : (int) $teacherRow->id;
        }

        // 2. ករណីបោះមកជា users.id ផ្ទាល់
        $userRow = User::find($rawTeacherId);
        if ($userRow) {
            return (int) $userRow->id;
        }

        return null;
    }

    /**
     * Display a listing of all courses with pagination and search
     * GET /admin/courses
     */
    public function index(Request $request)
    {
        try {
            $selectCols = [
                'id',
                'course_code',
                'course_name',
                'credit',
                'description',
                'department_id',
                'teacher_id',
                'created_at',
            ];

            if (Schema::hasColumn('courses', 'year')) {
                $selectCols[] = 'year';
            }

            $query = Course::with([
                'department:id,department_name',
                'teacher',
            ])
                ->withCount('enrollments')
                ->select($selectCols);

            if ($request->filled('department_id')) {
                $query->where('department_id', $request->department_id);
            }

            if ($request->filled('teacher_id')) {
                $tid = $request->teacher_id;
                $matchedTeacher = Teacher::where('id', $tid)->orWhere('user_id', $tid)->first();
                $possibleIds = array_values(array_unique(array_filter([
                    $tid,
                    $matchedTeacher?->id,
                    $matchedTeacher?->user_id,
                ])));
                $query->whereIn('teacher_id', $possibleIds);
            }

            // ✅ បន្ថែម Search
            if ($request->filled('search')) {
                $search = trim($request->search);
                $matchedTeacherIds = Teacher::where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere(DB::raw("CONCAT(first_name, ' ', last_name)"), 'like', "%{$search}%")
                    ->get(['id', 'user_id']);

                $tIds = $matchedTeacherIds->pluck('id')
                    ->merge($matchedTeacherIds->pluck('user_id'))
                    ->filter()
                    ->unique()
                    ->values()
                    ->all();

                $query->where(function ($q) use ($search, $tIds) {
                    $q->where('course_name', 'like', "%{$search}%")
                      ->orWhere('course_code', 'like', "%{$search}%")
                      ->orWhere('description', 'like', "%{$search}%")
                      ->orWhereHas('department', function ($dq) use ($search) {
                          $dq->where('department_name', 'like', "%{$search}%");
                      })
                      ->orWhereHas('teacher', function ($tq) use ($search) {
                          $tq->where('first_name', 'like', "%{$search}%")
                             ->orWhere('last_name', 'like', "%{$search}%")
                             ->orWhere(DB::raw("CONCAT(first_name, ' ', last_name)"), 'like', "%{$search}%");
                      });

                    if (!empty($tIds)) {
                        $q->orWhereIn('teacher_id', $tIds);
                    }
                });
            }

            // ✅ Option សម្រាប់ទាញយកទាំងអស់ (សម្រាប់ Dropdown/Select)
            if ($request->boolean('all')) {
                $courses = $query->orderBy('course_name')->get();
                $this->attachTeacherDetailsToCollection($courses);

                return response()->json([
                    'data' => $courses,
                    'message' => 'បានទាញយកបញ្ជីមុខវិជ្ជាទាំងអស់ដោយជោគជ័យ',
                ]);
            }

            $perPage = max(1, min(200, (int) ($request->per_page ?? 15)));
            $courses = $query->orderBy('id', 'desc')->paginate($perPage);

            $items = $courses->items();
            $this->attachTeacherDetailsToCollection($items);

            return response()->json([
                'data' => $items,
                'meta' => [
                    'current_page' => $courses->currentPage(),
                    'last_page' => $courses->lastPage(),
                    'per_page' => $courses->perPage(),
                    'total' => $courses->total(),
                ],
                'message' => 'បានទាញយកបញ្ជីមុខវិជ្ជាដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching courses: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមុខវិជ្ជា',
            ], 500);
        }
    }

    /**
     * Store a newly created course
     * POST /admin/courses
     */
    public function store(Request $request)
    {
        try {
            $rules = [
                'course_code' => 'required|string|max:50|unique:courses,course_code',
                'course_name' => 'required|string|max:255',
                'credit' => 'required|integer|min:1|max:6',
                'description' => 'nullable|string',
                'department_id' => 'required|exists:departments,id',
                'teacher_id' => 'required',
            ];

            if (Schema::hasColumn('courses', 'year')) {
                $rules['year'] = 'nullable|string|max:20';
            }

            $validated = $request->validate($rules);

            $resolvedTeacherId = $this->resolveValidTeacherId($validated['teacher_id']);
            if (!$resolvedTeacherId) {
                throw ValidationException::withMessages([
                    'teacher_id' => ['គ្រូបង្រៀនដែលបានជ្រើសរើសមិនមានក្នុងប្រព័ន្ធទេ!'],
                ]);
            }

            $validated['course_code'] = trim($validated['course_code']);
            $validated['course_name'] = trim($validated['course_name']);
            $validated['teacher_id'] = $resolvedTeacherId;

            $course = Course::create($validated);
            $course->load(['department', 'teacher']);
            $this->attachTeacherDetailsToCollection([$course]);

            // ✅ លុប Cache ពេលបង្កើតមុខវិជ្ជាថ្មី
            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

            return response()->json([
                'message' => 'បានបង្កើតមុខវិជ្ជាដោយជោគជ័យ',
                'data' => $course,
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Course store error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការបង្កើតមុខវិជ្ជា: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Display the specified course
     * GET /admin/courses/{course}
     */
    public function show(Course $course)
    {
        try {
            $course->load(['department', 'teacher']);
            $this->attachTeacherDetailsToCollection([$course]);

            return response()->json([
                'data' => $course,
                'message' => 'បានទាញយកទិន្នន័យមុខវិជ្ជាដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching course: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យមុខវិជ្ជា',
            ], 500);
        }
    }

    /**
     * Update the specified course
     * PUT /admin/courses/{course}
     */
    public function update(Request $request, Course $course)
    {
        try {
            $rules = [
                'course_code' => [
                    'required',
                    'string',
                    'max:50',
                    Rule::unique('courses', 'course_code')->ignore($course->id),
                ],
                'course_name' => 'required|string|max:255',
                'credit' => 'required|integer|min:1|max:6',
                'description' => 'nullable|string',
                'department_id' => 'required|exists:departments,id',
                'teacher_id' => 'required',
            ];

            if (Schema::hasColumn('courses', 'year')) {
                $rules['year'] = 'nullable|string|max:20';
            }

            $validated = $request->validate($rules);

            $resolvedTeacherId = $this->resolveValidTeacherId($validated['teacher_id']);
            if (!$resolvedTeacherId) {
                throw ValidationException::withMessages([
                    'teacher_id' => ['គ្រូបង្រៀនដែលបានជ្រើសរើសមិនមានក្នុងប្រព័ន្ធទេ!'],
                ]);
            }

            $validated['course_code'] = trim($validated['course_code']);
            $validated['course_name'] = trim($validated['course_name']);
            $validated['teacher_id'] = $resolvedTeacherId;

            $course->update($validated);

            // ✅ លុប Cache ពេលកែប្រែមុខវិជ្ជា
            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

            $freshCourse = $course->fresh(['department', 'teacher']);
            $this->attachTeacherDetailsToCollection([$freshCourse]);

            return response()->json([
                'message' => 'បានកែប្រែមុខវិជ្ជាដោយជោគជ័យ',
                'data' => $freshCourse,
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Course update error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការកែប្រែមុខវិជ្ជា: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Remove the specified course
     * DELETE /admin/courses/{course}
     */
    public function destroy(Course $course)
    {
        try {
            if ($course->enrollments()->exists()) {
                return response()->json([
                    'message' => 'មិនអាចលុបមុខវិជ្ជាដែលមានសិស្សចុះឈ្មោះរៀនបានទេ',
                ], 400);
            }

            $courseName = $course->course_name;
            $course->delete();

            // ✅ លុប Cache ពេលលុបមុខវិជ្ជា
            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

            return response()->json([
                'message' => "បានលុបមុខវិជ្ជា '{$courseName}' ដោយជោគជ័យ",
            ]);
        } catch (\Exception $e) {
            Log::error('Course delete error: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបមុខវិជ្ជា',
            ], 500);
        }
    }

    /**
     * Get courses by department
     * GET /admin/courses/department/{departmentId}
     */
    public function getCoursesByDepartment($departmentId)
    {
        try {
            $department = Department::findOrFail($departmentId);

            $courses = Course::with(['teacher'])
                ->withCount('enrollments')
                ->where('department_id', $departmentId)
                ->orderBy('course_name')
                ->get();

            $this->attachTeacherDetailsToCollection($courses);

            return response()->json([
                'data' => $courses,
                'department' => $department->department_name,
                'message' => 'បានទាញយកមុខវិជ្ជាតាមជំនាញដោយជោគជ័យ',
            ]);
        } catch (ModelNotFoundException $e) {
            return response()->json([
                'message' => 'រកមិនឃើញដេប៉ាតឺម៉ង់នេះទេ',
            ], 404);
        } catch (\Exception $e) {
            Log::error('Error fetching courses by department: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យ',
            ], 500);
        }
    }

    /**
     * Get courses by teacher
     * GET /admin/courses/teacher/{teacherId}
     */
    public function getCoursesByTeacher($teacherId)
    {
        try {
            $teacher = Teacher::where('id', $teacherId)
                ->orWhere('user_id', $teacherId)
                ->first();

            $userTeacher = !$teacher ? User::find($teacherId) : null;

            if (!$teacher && !$userTeacher) {
                return response()->json([
                    'message' => 'រកមិនឃើញគ្រូបង្រៀននេះទេ',
                ], 404);
            }

            $possibleIds = array_values(array_unique(array_filter([
                $teacherId,
                $teacher?->id,
                $teacher?->user_id,
                $userTeacher?->id,
            ])));

            $courses = Course::with(['department'])
                ->withCount('enrollments')
                ->whereIn('teacher_id', $possibleIds)
                ->orderBy('course_name')
                ->get();

            $this->attachTeacherDetailsToCollection($courses);

            $teacherName = $teacher
                ? trim($teacher->first_name . ' ' . $teacher->last_name)
                : trim(($userTeacher->first_name ?? '') . ' ' . ($userTeacher->last_name ?? ''));

            return response()->json([
                'data' => $courses,
                'teacher' => $teacherName,
                'message' => 'បានទាញយកមុខវិជ្ជាតាមគ្រូបង្រៀនដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching courses by teacher: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យ',
            ], 500);
        }
    }

    /**
     * Get course statistics
     * GET /admin/courses/stats
     */
    public function getStats()
    {
        try {
            $stats = [
                'total_courses' => Course::count(),
                'total_departments' => Department::count(),
                'courses_by_department' => Department::withCount('courses')
                    ->orderBy('courses_count', 'desc')
                    ->get()
                    ->map(function ($dept) {
                        return [
                            'department_name' => $dept->department_name,
                            'total_courses' => (int) $dept->courses_count,
                        ];
                    }),
                'total_credits' => (int) Course::sum('credit'),
                'avg_credits' => round((float) (Course::avg('credit') ?? 0), 1),
            ];

            return response()->json([
                'data' => $stats,
                'message' => 'បានទាញយកស្ថិតិមុខវិជ្ជាដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching course stats: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការទាញយកស្ថិតិ',
            ], 500);
        }
    }

    /**
     * Search courses
     * GET /admin/courses/search?q=keyword
     */
    public function search(Request $request)
    {
        try {
            $keyword = trim((string) $request->query('q', ''));

            if ($keyword === '') {
                return $this->index($request);
            }

            $perPage = max(1, min(200, (int) ($request->per_page ?? 15)));

            $courses = Course::with(['department', 'teacher'])
                ->withCount('enrollments')
                ->where(function ($q) use ($keyword) {
                    $q->where('course_name', 'LIKE', "%{$keyword}%")
                      ->orWhere('course_code', 'LIKE', "%{$keyword}%")
                      ->orWhere('description', 'LIKE', "%{$keyword}%")
                      ->orWhereHas('department', function ($query) use ($keyword) {
                          $query->where('department_name', 'LIKE', "%{$keyword}%");
                      })
                      ->orWhereHas('teacher', function ($query) use ($keyword) {
                          $query->where('first_name', 'LIKE', "%{$keyword}%")
                                ->orWhere('last_name', 'LIKE', "%{$keyword}%")
                                ->orWhere(DB::raw("CONCAT(first_name, ' ', last_name)"), 'LIKE', "%{$keyword}%");
                      });
                })
                ->orderBy('course_name')
                ->paginate($perPage);

            $items = $courses->items();
            $this->attachTeacherDetailsToCollection($items);

            return response()->json([
                'data' => $items,
                'keyword' => $keyword,
                'meta' => [
                    'current_page' => $courses->currentPage(),
                    'last_page' => $courses->lastPage(),
                    'per_page' => $courses->perPage(),
                    'total' => $courses->total(),
                ],
                'message' => 'បានស្វែងរកមុខវិជ្ជាដោយជោគជ័យ',
            ]);
        } catch (\Exception $e) {
            Log::error('Error searching courses: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការស្វែងរកមុខវិជ្ជា',
            ], 500);
        }
    }
}
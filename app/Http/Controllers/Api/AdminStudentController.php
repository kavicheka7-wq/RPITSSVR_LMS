<?php
// app/Http/Controllers/Api/AdminStudentController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Enrollment;
use App\Models\Role;
use App\Models\Student;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class AdminStudentController extends Controller
{
    /**
     * បម្លែង និងបង្រួមរូបភាពដែលបានបង្ហោះ ទៅជា Base64 Data URI ស្រាលបំផុត (ការពារបាត់រូបលើ Railway និងបង្ហាញលឿន 0ms)
     */
    private function encodeUploadedImageToBase64($file): ?string
    {
        if (!$file || !$file->isValid()) {
            return null;
        }

        $realPath = $file->getRealPath();
        $contents = file_get_contents($realPath);
        if ($contents === false) {
            return null;
        }

        if (function_exists('imagecreatefromstring') && function_exists('imagejpeg')) {
            $srcImg = @imagecreatefromstring($contents);
            if ($srcImg !== false) {
                $width = imagesx($srcImg);
                $height = imagesy($srcImg);
                $maxDim = 240;

                if ($width > $maxDim || $height > $maxDim) {
                    if ($width > $height) {
                        $newWidth = $maxDim;
                        $newHeight = (int) round(($height * $maxDim) / $width);
                    } else {
                        $newHeight = $maxDim;
                        $newWidth = (int) round(($width * $maxDim) / $height);
                    }
                } else {
                    $newWidth = $width;
                    $newHeight = $height;
                }

                $dstImg = imagecreatetruecolor($newWidth, $newHeight);
                $white = imagecolorallocate($dstImg, 255, 255, 255);
                imagefilledrectangle($dstImg, 0, 0, $newWidth, $newHeight, $white);
                imagecopyresampled($dstImg, $srcImg, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);

                ob_start();
                imagejpeg($dstImg, null, 82);
                $compressedContents = ob_get_clean();

                imagedestroy($srcImg);
                imagedestroy($dstImg);

                if ($compressedContents !== false && strlen($compressedContents) < strlen($contents)) {
                    return 'data:image/jpeg;base64,' . base64_encode($compressedContents);
                }
            }
        }

        $mime = $file->getMimeType() ?: 'image/jpeg';
        return 'data:' . $mime . ';base64,' . base64_encode($contents);
    }

    /**
     * ✅ បង្រួមរូបថតសិស្សចាស់ៗក្នុង Database (> 25KB) ឱ្យមកទំហំច្បាស់ល្អ (200x200px HD) និងទុកក្នុង Cache (រំលង URL ពី R2)
     */
    private function compressExistingAvatarIfHeavy(?string $rawImage, int $studentId): ?string
    {
        if (!$rawImage) {
            return null;
        }
        $trimmed = trim($rawImage);
        if ($trimmed === '' || strlen($trimmed) <= 25000 || !str_starts_with($trimmed, 'data:image')) {
            return $trimmed ?: null;
        }

        $cacheKey = 'adm_std_avatar_v2_' . $studentId . '_' . md5(substr($trimmed, 0, 100) . strlen($trimmed));

        return Cache::remember($cacheKey, 86400, function () use ($trimmed) {
            if (!preg_match('/^data:([^;]+);base64,(.+)$/s', $trimmed, $m)) {
                return $trimmed;
            }
            $binary = base64_decode(preg_replace('/\s+/', '', $m[2]));
            if (!$binary || !function_exists('imagecreatefromstring')) {
                return $trimmed;
            }
            try {
                $src = @imagecreatefromstring($binary);
                if ($src !== false) {
                    $w = imagesx($src);
                    $h = imagesy($src);
                    $maxDim = 200;

                    if ($w > $maxDim || $h > $maxDim) {
                        $newW = $w > $h ? $maxDim : max(1, (int) round(($w * $maxDim) / $h));
                        $newH = $w > $h ? max(1, (int) round(($h * $maxDim) / $w)) : $maxDim;
                    } else {
                        $newW = $w;
                        $newH = $h;
                    }

                    $dst = imagecreatetruecolor($newW, $newH);
                    if (function_exists('imagewebp')) {
                        imagealphablending($dst, false);
                        imagesavealpha($dst, true);
                        $transparent = imagecolorallocatealpha($dst, 255, 255, 255, 127);
                        imagefilledrectangle($dst, 0, 0, $newW, $newH, $transparent);
                    } else {
                        $white = imagecolorallocate($dst, 255, 255, 255);
                        imagefilledrectangle($dst, 0, 0, $newW, $newH, $white);
                    }
                    imagecopyresampled($dst, $src, 0, 0, 0, 0, $newW, $newH, $w, $h);

                    ob_start();
                    if (function_exists('imagewebp')) {
                        imagewebp($dst, null, 88);
                        $outMime = 'image/webp';
                    } else {
                        imagejpeg($dst, null, 88);
                        $outMime = 'image/jpeg';
                    }
                    $out = ob_get_clean();
                    imagedestroy($src);
                    imagedestroy($dst);

                    if ($out && strlen($out) < strlen($binary)) {
                        return 'data:' . $outMime . ';base64,' . base64_encode($out);
                    }
                }
            } catch (\Throwable $e) {
            }
            return $trimmed;
        });
    }

    /**
     * រៀបចំទិន្នន័យសិស្សដោយភ្ជាប់រូបភាពពី user (បើខ្វះ) រួចលុបរូបភាពស្ទួនក្នុង relation user ចេញដើម្បីឱ្យ JSON ស្រាលជាងមុន 2 ដង
     */
    private function deduplicateStudentAvatar($student)
    {
        if (!$student) {
            return $student;
        }
        if (empty($student->profile_image) && !empty($student->user?->profile_image)) {
            $student->profile_image = $student->user->profile_image;
        }
        if (!empty($student->profile_image)) {
            $student->profile_image = $this->compressExistingAvatarIfHeavy($student->profile_image, (int) $student->id);
        }
        if ($student->relationLoaded('user') && $student->user) {
            unset($student->user->profile_image);
        }
        return $student;
    }

    /**
     * បម្លែងគ្រប់ទម្រង់ថ្ងៃខែឆ្នាំកំណើត (30-04-2005, 30/04/2005, លេខខ្មែរ, ឬលេខ Excel) ទៅជា YYYY-MM-DD សម្រាប់ MySQL
     */
    private function normalizeDateOfBirth($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        $str = trim((string) $value);
        if ($str === '' || $str === '-' || strtolower($str) === 'null' || strtolower($str) === 'n/a') {
            return null;
        }

        $str = str_replace(
            ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'],
            ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
            $str
        );

        if (is_numeric($str) && (float) $str > 1000 && (float) $str < 100000) {
            return gmdate('Y-m-d', ((int) round((float) $str) - 25569) * 86400);
        }

        if (preg_match('/^(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{4})$/', $str, $m)) {
            $first = (int) $m[1];
            $second = (int) $m[2];
            $year = (int) $m[3];
            $day = ($second > 12 && $first <= 12) ? $second : $first;
            $month = ($second > 12 && $first <= 12) ? $first : $second;
            if (checkdate($month, $day, $year)) {
                return sprintf('%04d-%02d-%02d', $year, $month, $day);
            }
        }

        if (preg_match('/^(\d{4})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{1,2})/', $str, $m)) {
            if (checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
                return sprintf('%04d-%02d-%02d', (int) $m[1], (int) $m[2], (int) $m[3]);
            }
        }

        try {
            return Carbon::parse(str_replace('/', '-', $str))->format('Y-m-d');
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * ✅ អនុគមន៍ល្បឿនលឿន O(1) ភ្ជាប់ឈ្មោះ និងរូបថតគ្រូបង្រៀន (profile_image) ទៅឱ្យបញ្ជី Enrollments ក្នុង Query តែ ១ ដង
     */
    private function attachTeacherToEnrollments($enrollments)
    {
        $collection = collect($enrollments);
        if ($collection->isEmpty()) {
            return $enrollments;
        }

        $teacherIds = $collection
            ->map(fn ($e) => $e->course?->teacher_id)
            ->filter()
            ->unique()
            ->values()
            ->all();

        if (empty($teacherIds)) {
            return $enrollments;
        }

        $teacherRecords = DB::table('teachers')
            ->whereIn('id', $teacherIds)
            ->orWhereIn('user_id', $teacherIds)
            ->select([
                'id',
                'user_id',
                'teacher_code',
                'first_name',
                'last_name',
                'email',
                'specialization',
                'profile_image',
            ])
            ->get();

        $byTeacherId = $teacherRecords->keyBy('id');
        $byUserId = $teacherRecords->whereNotNull('user_id')->keyBy('user_id');

        $allUserIds = $teacherRecords
            ->pluck('user_id')
            ->merge($teacherIds)
            ->filter()
            ->unique()
            ->values()
            ->all();

        $userRecords = !empty($allUserIds)
            ? DB::table('users')
                ->whereIn('id', $allUserIds)
                ->select(['id', 'first_name', 'last_name', 'email', 'profile_image'])
                ->get()
                ->keyBy('id')
            : collect();

        foreach ($collection as $enrollment) {
            $course = $enrollment->course;
            if (!$course) {
                continue;
            }

            $tid = $course->teacher_id;
            $tRec = $byTeacherId->get($tid) ?? $byUserId->get($tid);
            $uRec = $userRecords->get($tRec->user_id ?? $tid);

            if (!$tRec && !$uRec) {
                continue;
            }

            $firstName = trim((string) ($tRec->first_name ?? $uRec->first_name ?? ''));
            $lastName = trim((string) ($tRec->last_name ?? $uRec->last_name ?? ''));
            $fullName = trim($firstName . ' ' . $lastName) ?: ($tRec->email ?? $uRec->email ?? '');

            $avatar = !empty($tRec?->profile_image)
                ? $tRec->profile_image
                : ($uRec->profile_image ?? null);

            $teacherPayload = [
                'id' => $tRec->id ?? $uRec->id ?? $tid,
                'user_id' => $uRec->id ?? $tRec->user_id ?? $tid,
                'teacher_code' => $tRec->teacher_code ?? null,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'name' => $fullName,
                'full_name' => $fullName,
                'email' => $tRec->email ?? $uRec->email ?? '',
                'specialization' => $tRec->specialization ?? null,
                'profile_image' => $avatar,
                'profile_image_url' => $avatar,
            ];

            $course->setRelation('teacher', (object) $teacherPayload);
            $course->setAttribute('teacher_profile', $teacherPayload);
            $course->setAttribute('teacher_name', $fullName);
        }

        return $enrollments;
    }

    public function index(Request $request)
    {
        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $search = trim((string) $request->input('search', ''));

        // ✅ មិនទាញ profile_image ស្ទួនពីតារាង users ទេ ដើម្បីកាត់បន្ថយការប្រើប្រាស់ RAM ៥០% ពេលទាញសិស្សរាប់រយនាក់
        $query = Student::with([
            'department:id,department_name',
            'user:id,status,email',
            'role:id,role_name',
        ])->select([
            'id', 'user_id', 'role_id', 'department_id',
            'student_code', 'first_name', 'last_name', 'gender',
            'date_of_birth', 'email', 'phone', 'profile_image',
            'batch_year', 'degree_level', 'study_shift', 'address',
            'created_at',
        ]);

        if ($request->filled('department_id')) {
            $query->where('department_id', $request->input('department_id'));
        }

        if ($request->filled('study_shift')) {
            $query->where('study_shift', $request->input('study_shift'));
        }

        if ($request->filled('year')) {
            $y = trim((string) $request->input('year'));
            if (preg_match('/([1-4])/', $y, $m)) {
                $y = $m[1];
            }
            $khmerNumerals = ['1' => '១', '2' => '២', '3' => '៣', '4' => '៤'];
            $khNum = $khmerNumerals[$y] ?? $y;

            $query->where(function ($q) use ($y, $khNum) {
                $q->where('batch_year', $y)
                  ->orWhere('batch_year', $khNum)
                  ->orWhere('batch_year', 'LIKE', "%Year {$y}%")
                  ->orWhere('batch_year', 'LIKE', "%Year{$y}%")
                  ->orWhere('batch_year', 'LIKE', "%ឆ្នាំទី{$khNum}%")
                  ->orWhere('batch_year', 'LIKE', "%ឆ្នាំទី {$khNum}%")
                  ->orWhere('batch_year', 'LIKE', "%ឆ្នាំទី{$y}%")
                  ->orWhere('batch_year', 'LIKE', "%ឆ្នាំទី {$y}%");
            });
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere(DB::raw("CONCAT(first_name, ' ', last_name)"), 'like', "%{$search}%")
                  ->orWhere('student_code', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $students = $query->orderBy('id', 'desc')->paginate($perPage);

        // ទាញ profile_image ពីតារាង users តែចំពោះសិស្សណាដែលក្នុងតារាង students គ្មានរូបប៉ុណ្ណោះ
        $missingImgUserIds = collect($students->items())
            ->filter(fn ($s) => empty($s->profile_image) && !empty($s->user_id))
            ->pluck('user_id')
            ->unique()
            ->values()
            ->all();

        $fallbackAvatars = !empty($missingImgUserIds)
            ? User::whereIn('id', $missingImgUserIds)
                ->whereNotNull('profile_image')
                ->pluck('profile_image', 'id')
            : collect();

        $items = collect($students->items())->map(function ($student) use ($fallbackAvatars) {
            if (empty($student->profile_image) && isset($fallbackAvatars[$student->user_id])) {
                $student->profile_image = $fallbackAvatars[$student->user_id];
            }
            return $this->deduplicateStudentAvatar($student);
        })->all();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $students->currentPage(),
                'last_page' => $students->lastPage(),
                'per_page' => $students->perPage(),
                'total' => $students->total(),
            ],
            'message' => 'បានទាញយកបញ្ជីសិស្សដោយជោគជ័យ',
        ]);
    }

    public function store(Request $request)
    {
        if ($request->filled('date_of_birth')) {
            $request->merge(['date_of_birth' => $this->normalizeDateOfBirth($request->input('date_of_birth'))]);
        }

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'gender' => 'required|in:Male,Female,Other',
            'date_of_birth' => 'nullable|date',
            'email' => 'required|email|unique:users,email|unique:students,email',
            'phone' => 'nullable|string|max:20',
            'password' => 'required|string|min:6',
            'status' => 'nullable|in:active,inactive',
            'department_id' => 'nullable|exists:departments,id',
            'student_code' => 'nullable|string|max:50|unique:students,student_code',
            'batch_year' => 'nullable|string|max:50',
            'degree_level' => 'nullable|string|max:100',
            'study_shift' => 'nullable|in:Monday-Friday,Saturday-Sunday',
            'address' => 'nullable|string',
            'role_id' => 'required|exists:roles,id',
            'profile_image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        $student = DB::transaction(function () use ($validated, $request) {
            $profileImagePath = null;
            if ($request->hasFile('profile_image')) {
                $profileImagePath = $this->encodeUploadedImageToBase64($request->file('profile_image'));
            }

            $cleanEmail = strtolower(trim($validated['email']));
            $cleanFirst = trim($validated['first_name']);
            $cleanLast = trim($validated['last_name']);

            $user = User::create([
                'first_name' => $cleanFirst,
                'last_name' => $cleanLast,
                'email' => $cleanEmail,
                'password' => Hash::make($validated['password']),
                'phone' => $validated['phone'] ?? null,
                'gender' => $validated['gender'] ?? null,
                'status' => $validated['status'] ?? 'active',
                'role_id' => $validated['role_id'],
                'profile_image' => $profileImagePath,
            ]);

            $student = Student::create([
                'user_id' => $user->id,
                'role_id' => $validated['role_id'],
                'student_code' => !empty($validated['student_code'])
                    ? trim($validated['student_code'])
                    : $this->generateStudentCode(),
                'first_name' => $cleanFirst,
                'last_name' => $cleanLast,
                'gender' => $validated['gender'],
                'date_of_birth' => $this->normalizeDateOfBirth($validated['date_of_birth'] ?? null),
                'email' => $cleanEmail,
                'phone' => $validated['phone'] ?? null,
                'department_id' => $validated['department_id'] ?? null,
                'batch_year' => $validated['batch_year'] ?? null,
                'degree_level' => $validated['degree_level'] ?? null,
                'study_shift' => $validated['study_shift'] ?? 'Monday-Friday',
                'address' => $validated['address'] ?? null,
                'profile_image' => $profileImagePath,
            ]);

            $loaded = $student->load(['department:id,department_name', 'user:id,status,email', 'role:id,role_name']);
            return $this->deduplicateStudentAvatar($loaded);
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => 'បានបង្កើតគណនីសិស្សដោយជោគជ័យ',
            'data' => $student,
        ], 201);
    }

    public function update(Request $request, Student $student)
    {
        if ($request->filled('date_of_birth')) {
            $request->merge(['date_of_birth' => $this->normalizeDateOfBirth($request->input('date_of_birth'))]);
        }

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'gender' => 'required|in:Male,Female,Other',
            'date_of_birth' => 'nullable|date',
            'email' => [
                'required', 'email',
                Rule::unique('users', 'email')->ignore($student->user_id),
                Rule::unique('students', 'email')->ignore($student->id),
            ],
            'phone' => 'nullable|string|max:20',
            'password' => 'nullable|string|min:6',
            'status' => 'nullable|in:active,inactive',
            'department_id' => 'nullable|exists:departments,id',
            'student_code' => [
                'nullable', 'string', 'max:50',
                Rule::unique('students', 'student_code')->ignore($student->id),
            ],
            'batch_year' => 'nullable|string|max:50',
            'degree_level' => 'nullable|string|max:100',
            'study_shift' => 'nullable|in:Monday-Friday,Saturday-Sunday',
            'address' => 'nullable|string',
            'role_id' => 'required|exists:roles,id',
            'profile_image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        DB::transaction(function () use ($validated, $request, $student) {
            $profileImagePath = $student->profile_image;
            if ($request->hasFile('profile_image')) {
                if (
                    $student->profile_image &&
                    !str_starts_with($student->profile_image, 'data:') &&
                    !str_starts_with($student->profile_image, 'http')
                ) {
                    Storage::disk('public')->delete($student->profile_image);
                }
                $encoded = $this->encodeUploadedImageToBase64($request->file('profile_image'));
                if ($encoded) {
                    $profileImagePath = $encoded;
                }
            }

            $cleanEmail = strtolower(trim($validated['email']));
            $cleanFirst = trim($validated['first_name']);
            $cleanLast = trim($validated['last_name']);

            if ($student->user) {
                $userData = [
                    'first_name' => $cleanFirst,
                    'last_name' => $cleanLast,
                    'email' => $cleanEmail,
                    'phone' => $validated['phone'] ?? $student->user->phone,
                    'gender' => $validated['gender'] ?? $student->user->gender,
                    'status' => $validated['status'] ?? $student->user->status,
                    'role_id' => $validated['role_id'],
                    'profile_image' => $profileImagePath ?? $student->user->profile_image,
                ];

                if (!empty($validated['password'])) {
                    $userData['password'] = Hash::make($validated['password']);
                }

                $student->user->update($userData);
            }

            $student->update([
                'student_code' => !empty($validated['student_code'])
                    ? trim($validated['student_code'])
                    : $student->student_code,
                'first_name' => $cleanFirst,
                'last_name' => $cleanLast,
                'gender' => $validated['gender'],
                'date_of_birth' => array_key_exists('date_of_birth', $validated)
                    ? $this->normalizeDateOfBirth($validated['date_of_birth'])
                    : $student->date_of_birth,
                'email' => $cleanEmail,
                'phone' => $validated['phone'] ?? $student->phone,
                'department_id' => $validated['department_id'] ?? $student->department_id,
                'batch_year' => $validated['batch_year'] ?? $student->batch_year,
                'degree_level' => $validated['degree_level'] ?? $student->degree_level,
                'study_shift' => $validated['study_shift'] ?? $student->study_shift,
                'address' => $validated['address'] ?? $student->address,
                'role_id' => $validated['role_id'],
                'profile_image' => $profileImagePath,
            ]);
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');
        if ($student->user_id) {
            Cache::forget('lms_auth_user_payload_' . $student->user_id);
        }

        $freshStudent = $student->fresh(['department:id,department_name', 'user:id,status,email', 'role:id,role_name']);
        $this->deduplicateStudentAvatar($freshStudent);

        return response()->json([
            'message' => 'បានកែប្រែព័ត៌មានសិស្សដោយជោគជ័យ',
            'data' => $freshStudent,
        ]);
    }

    public function destroy(Student $student)
    {
        $studentName = trim($student->first_name . ' ' . $student->last_name);
        $userId = $student->user_id;

        if (
            $student->profile_image &&
            !str_starts_with($student->profile_image, 'data:') &&
            !str_starts_with($student->profile_image, 'http')
        ) {
            Storage::disk('public')->delete($student->profile_image);
        }

        DB::transaction(function () use ($student) {
            $targetUser = $student->user;
            $student->delete();
            if ($targetUser) {
                $targetUser->delete();
            }
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');
        if ($userId) {
            Cache::forget('lms_auth_user_payload_' . $userId);
        }

        return response()->json([
            'message' => "បានលុបគណនីសិស្ស '{$studentName}' ដោយជោគជ័យ",
        ]);
    }

    public function getEnrollments(Student $student)
    {
        try {
            $studentIds = array_values(array_unique(array_filter([
                $student->user_id,
                $student->id,
            ])));

            $enrollments = Enrollment::with([
                'course:id,course_code,course_name,credit,department_id,teacher_id',
                'course.department:id,department_name',
            ])
                ->whereIn('student_id', $studentIds)
                ->select(['id', 'student_id', 'course_id', 'enrolled_date', 'status'])
                ->get();

            $this->attachTeacherToEnrollments($enrollments);

            return response()->json([
                'data' => $enrollments,
                'message' => 'បានទាញយកបញ្ជីការចុះឈ្មោះដោយជោគជ័យ',
            ]);
        } catch (\Throwable $e) {
            Log::error('Error fetching student enrollments: ' . $e->getMessage());
            return response()->json([
                'data' => [],
                'message' => 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យចុះឈ្មោះ',
            ], 500);
        }
    }

    public function enrollStudent(Request $request, Student $student)
    {
        try {
            $validated = $request->validate([
                'course_ids' => 'required|array',
                'course_ids.*' => 'required|integer',
            ]);

            $studentIds = array_values(array_unique(array_filter([
                $student->user_id,
                $student->id,
            ])));
            $targetStudentId = $student->user_id ?: $student->id;
            $courseIds = array_values(array_unique(array_map('intval', $validated['course_ids'])));

            $alreadyEnrolledCourseIds = Enrollment::whereIn('student_id', $studentIds)
                ->whereIn('course_id', $courseIds)
                ->pluck('course_id')
                ->map(fn ($id) => (int) $id)
                ->all();

            $newCourseIds = array_values(array_diff($courseIds, $alreadyEnrolledCourseIds));

            if (!empty($newCourseIds)) {
                $now = now();
                $insertRows = array_map(fn ($cid) => [
                    'student_id' => $targetStudentId,
                    'course_id' => $cid,
                    'enrolled_date' => $now,
                    'status' => 'active',
                    'created_at' => $now,
                    'updated_at' => $now,
                ], $newCourseIds);

                Enrollment::insert($insertRows);
            }

            $allEnrollments = Enrollment::with([
                'course:id,course_code,course_name,credit,department_id,teacher_id',
                'course.department:id,department_name',
            ])
                ->whereIn('student_id', $studentIds)
                ->select(['id', 'student_id', 'course_id', 'enrolled_date', 'status'])
                ->get();

            $this->attachTeacherToEnrollments($allEnrollments);

            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

            return response()->json([
                'data' => $allEnrollments,
                'message' => 'បានចុះឈ្មោះមុខវិជ្ជាជូនសិស្សដោយជោគជ័យ',
            ], 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'សូមពិនិត្យទិន្នន័យដែលបានបញ្ចូល',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            Log::error('Error enrolling student: ' . $e->getMessage());
            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការចុះឈ្មោះមុខវិជ្ជាឱ្យសិស្ស: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function exportAll(Request $request)
    {
        if ($request->query('format') === 'json') {
            $students = [];
            Student::with([
                'department:id,department_name',
                'user:id,status,email',
                'role:id,role_name',
            ])
                ->select([
                    'id', 'user_id', 'role_id', 'department_id',
                    'student_code', 'first_name', 'last_name', 'gender',
                    'date_of_birth', 'email', 'phone', 'profile_image',
                    'batch_year', 'degree_level', 'study_shift', 'address',
                    'created_at',
                ])
                ->orderBy('id', 'asc')
                ->chunk(500, function ($chunk) use (&$students) {
                    $missingUserIds = $chunk
                        ->filter(fn ($s) => empty($s->profile_image) && !empty($s->user_id))
                        ->pluck('user_id')
                        ->unique()
                        ->values()
                        ->all();

                    $fallbackAvatars = !empty($missingUserIds)
                        ? User::whereIn('id', $missingUserIds)
                            ->whereNotNull('profile_image')
                            ->pluck('profile_image', 'id')
                        : collect();

                    foreach ($chunk as $student) {
                        if (empty($student->profile_image) && isset($fallbackAvatars[$student->user_id])) {
                            $student->profile_image = $fallbackAvatars[$student->user_id];
                        }
                        $students[] = $this->deduplicateStudentAvatar($student);
                    }
                });

            return response()->json([
                'data' => $students,
                'message' => 'បានទាញយកទិន្នន័យសិស្សទាំងអស់ដោយជោគជ័យ',
            ]);
        }

        $filename = 'Students_List_' . date('Y-m-d') . '.csv';
        $headers = [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
            'Pragma' => 'no-cache',
            'Cache-Control' => 'must-revalidate, post-check=0, pre-check=0',
            'Expires' => '0',
        ];

        return response()->stream(function () {
            $handle = fopen('php://output', 'w');
            fprintf($handle, chr(0xEF) . chr(0xBB) . chr(0xBF));

            fputcsv($handle, [
                'No',
                'Student Code',
                'First Name',
                'Last Name',
                'Gender',
                'Email',
                'Phone',
                'Department',
                'Batch Year',
                'Degree Level',
                'Study Shift',
                'Address',
                'Date of Birth',
                'Status',
            ]);

            $index = 1;
            Student::with([
                'department:id,department_name',
                'user:id,status,email',
                'role:id,role_name',
            ])
                ->select([
                    'id', 'user_id', 'role_id', 'department_id',
                    'student_code', 'first_name', 'last_name', 'gender',
                    'date_of_birth', 'email', 'phone',
                    'batch_year', 'degree_level', 'study_shift', 'address',
                ])
                ->orderBy('id', 'asc')
                ->chunk(500, function ($students) use ($handle, &$index) {
                    foreach ($students as $s) {
                        $gender = $s->gender === 'Male'
                            ? 'ប្រុស (Male)'
                            : ($s->gender === 'Female' ? 'ស្រី (Female)' : ($s->gender ?? ''));
                        $status = ($s->user->status ?? $s->status ?? 'active') === 'active'
                            ? 'សកម្ម (Active)'
                            : 'អសកម្ម (Inactive)';

                        fputcsv($handle, [
                            $index++,
                            $s->student_code ?? '',
                            $s->first_name ?? '',
                            $s->last_name ?? '',
                            $gender,
                            $s->email ?? '',
                            $s->phone ?? '',
                            $s->department->department_name ?? '',
                            $s->batch_year ?? '',
                            $s->degree_level ?? '',
                            $s->study_shift ?? '',
                            $s->address ?? '',
                            $s->date_of_birth ?? '',
                            $status,
                        ]);
                    }
                });

            fclose($handle);
        }, 200, $headers);
    }

    public function import(Request $request)
    {
        $request->validate([
            'students' => 'required|array|min:1',
            'students.*.first_name' => 'required|string|max:100',
            'students.*.last_name' => 'required|string|max:100',
            'students.*.email' => 'required|email',
        ]);

        $studentRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%student%'])->first()
            ?? Role::find(3);
        $studentRoleId = $studentRole?->id ?? 3;

        $importedCount = 0;
        $skipped = [];

        DB::transaction(function () use ($request, $studentRoleId, &$importedCount, &$skipped) {
            $emails = collect($request->students)
                ->pluck('email')
                ->filter()
                ->map(fn ($e) => strtolower(trim($e)))
                ->toArray();

            $existingEmailsMap = User::whereIn('email', $emails)->pluck('email')
                ->merge(Student::whereIn('email', $emails)->pluck('email'))
                ->map(fn ($e) => strtolower(trim($e)))
                ->unique()
                ->flip()
                ->all();

            // ✅ ទាញយក student_code ដែលមានស្រាប់ និង max(id) តែ ១ ដងគត់ មុនចូល Loop (O(1) Lookup)
            $existingCodesMap = Student::whereNotNull('student_code')
                ->pluck('student_code')
                ->flip()
                ->all();
            $year = date('Y');
            $nextCodeNum = (int) Student::max('id') + 1;

            foreach ($request->students as $index => $item) {
                $cleanEmail = strtolower(trim($item['email']));

                if (isset($existingEmailsMap[$cleanEmail])) {
                    $skipped[] = [
                        'row' => $index + 1,
                        'email' => $item['email'],
                        'reason' => 'អ៊ីមែលនេះមានរួចហើយ (Email already exists)',
                    ];
                    continue;
                }

                $existingEmailsMap[$cleanEmail] = true;

                $password = !empty($item['password']) ? $item['password'] : '12345678';
                $gender = in_array($item['gender'] ?? '', ['Male', 'Female', 'Other']) ? $item['gender'] : 'Male';
                $studyShift = in_array($item['study_shift'] ?? '', ['Monday-Friday', 'Saturday-Sunday'])
                    ? $item['study_shift']
                    : 'Monday-Friday';
                $status = in_array($item['status'] ?? '', ['active', 'inactive']) ? $item['status'] : 'active';

                $cleanFirst = trim($item['first_name']);
                $cleanLast = trim($item['last_name']);

                $user = User::create([
                    'first_name' => $cleanFirst,
                    'last_name' => $cleanLast,
                    'email' => $cleanEmail,
                    'password' => Hash::make($password),
                    'phone' => $item['phone'] ?? null,
                    'gender' => $gender,
                    'status' => $status,
                    'role_id' => $studentRoleId,
                ]);

                $requestedCode = !empty($item['student_code']) ? trim($item['student_code']) : null;
                if ($requestedCode && isset($existingCodesMap[$requestedCode])) {
                    $requestedCode = null;
                }

                if (!$requestedCode) {
                    do {
                        $requestedCode = 'STU-' . $year . '-' . str_pad((string) $nextCodeNum, 4, '0', STR_PAD_LEFT);
                        $nextCodeNum++;
                    } while (isset($existingCodesMap[$requestedCode]));
                }
                $existingCodesMap[$requestedCode] = true;

                Student::create([
                    'user_id' => $user->id,
                    'role_id' => $studentRoleId,
                    'student_code' => $requestedCode,
                    'first_name' => $cleanFirst,
                    'last_name' => $cleanLast,
                    'gender' => $gender,
                    'date_of_birth' => $this->normalizeDateOfBirth($item['date_of_birth'] ?? null),
                    'email' => $cleanEmail,
                    'phone' => $item['phone'] ?? null,
                    'department_id' => $item['department_id'] ?? null,
                    'batch_year' => $item['batch_year'] ?? null,
                    'degree_level' => $item['degree_level'] ?? null,
                    'study_shift' => $studyShift,
                    'address' => $item['address'] ?? null,
                ]);

                $importedCount++;
            }
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => "នាំចូលសិស្សចំនួន {$importedCount} នាក់ដោយជោគជ័យ",
            'imported_count' => $importedCount,
            'skipped' => $skipped,
        ]);
    }

    private function generateStudentCode(): string
    {
        $year = date('Y');
        $nextNum = (int) Student::max('id') + 1;
        do {
            $code = 'STU-' . $year . '-' . str_pad((string) $nextNum, 4, '0', STR_PAD_LEFT);
            $nextNum++;
        } while (Student::where('student_code', $code)->exists());

        return $code;
    }

    public function promoteStudents(Request $request)
    {
        $request->validate([
            'student_ids' => 'required|array|min:1',
            'student_ids.*' => 'integer|exists:students,id',
            'target_year' => 'required|string|max:50',
        ]);

        try {
            DB::beginTransaction();

            $promotedCount = Student::whereIn('id', $request->student_ids)
                ->update([
                    'batch_year' => $request->target_year,
                    'updated_at' => now(),
                ]);

            DB::commit();

            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

            return response()->json([
                'success' => true,
                'message' => "បានដំឡើងថ្នាក់សិស្សចំនួន {$promotedCount} នាក់ ទៅកាន់ «{$request->target_year}» ដោយជោគជ័យ។",
                'promoted_count' => $promotedCount,
            ], 200);
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('ការដំឡើងថ្នាក់សិស្សបរាជ័យ៖ ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'មានបញ្ហាក្នុងការដំឡើងថ្នាក់សិស្ស។ សូមព្យាយាមម្តងទៀត។',
            ], 500);
        }
    }

    public function unenrollStudent(Student $student, $courseId)
    {
        try {
            $studentIds = array_values(array_unique(array_filter([
                $student->user_id,
                $student->id,
            ])));

            $enrollment = Enrollment::whereIn('student_id', $studentIds)
                ->where('course_id', $courseId)
                ->first();

            if (!$enrollment) {
                return response()->json(['message' => 'រកមិនឃើញទិន្នន័យនៃការចុះឈ្មោះនេះទេ'], 404);
            }

            $enrollment->delete();

            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

            return response()->json([
                'success' => true,
                'message' => 'បានលុបមុខវិជ្ជាចេញពីសិស្សដោយជោគជ័យ',
            ]);
        } catch (\Throwable $e) {
            Log::error('Error unenrolling student course: ' . $e->getMessage());

            return response()->json([
                'message' => 'មានបញ្ហាក្នុងការលុបមុខវិជ្ជាសិស្ស។ សូមព្យាយាមម្តងទៀត។',
            ], 500);
        }
    }
}
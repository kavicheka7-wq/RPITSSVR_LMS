<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Role;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class AdminTeacherController extends Controller
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
     * ✅ បង្រួមរូបថតគ្រូចាស់ៗក្នុង Database ដែលមានទំហំធំពេក (> 20KB) ឱ្យស្រាលបំផុត និងទុកក្នុង Cache
     */
    private function compressExistingTeacherAvatarIfHeavy(?string $rawImage, int $teacherId): ?string
    {
        if (!$rawImage) {
            return null;
        }
        $trimmed = trim($rawImage);
        if ($trimmed === '' || strlen($trimmed) <= 20000 || !str_starts_with($trimmed, 'data:image')) {
            return $trimmed ?: null;
        }

        $cacheKey = 'adm_tch_avatar_v1_' . $teacherId . '_' . md5(substr($trimmed, 0, 100) . strlen($trimmed));

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
                    $maxDim = 120;
                    $newW = $w > $h ? $maxDim : max(1, (int) round(($w * $maxDim) / $h));
                    $newH = $w > $h ? max(1, (int) round(($h * $maxDim) / $w)) : $maxDim;

                    $dst = imagecreatetruecolor($newW, $newH);
                    $white = imagecolorallocate($dst, 255, 255, 255);
                    imagefilledrectangle($dst, 0, 0, $newW, $newH, $white);
                    imagecopyresampled($dst, $src, 0, 0, 0, 0, $newW, $newH, $w, $h);

                    ob_start();
                    imagejpeg($dst, null, 80);
                    $out = ob_get_clean();
                    imagedestroy($src);
                    imagedestroy($dst);

                    if ($out && strlen($out) < strlen($binary)) {
                        return 'data:image/jpeg;base64,' . base64_encode($out);
                    }
                }
            } catch (\Throwable $e) {
            }
            return $trimmed;
        });
    }

    /**
     * រៀបចំទិន្នន័យគ្រូបង្រៀនដោយភ្ជាប់រូបភាពពី user (បើខ្វះ) រួចលុបរូបភាពស្ទួនក្នុង relation user ចេញដើម្បីឱ្យ JSON ស្រាលជាងមុន 2 ដង
     */
    private function deduplicateTeacherAvatar($teacher)
    {
        if (!$teacher) {
            return $teacher;
        }
        if (empty($teacher->profile_image) && !empty($teacher->user?->profile_image)) {
            $teacher->profile_image = $teacher->user->profile_image;
        }
        if (!empty($teacher->profile_image)) {
            $teacher->profile_image = $this->compressExistingTeacherAvatarIfHeavy($teacher->profile_image, (int) $teacher->id);
        }
        if ($teacher->relationLoaded('user') && $teacher->user) {
            unset($teacher->user->profile_image);
        }
        return $teacher;
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
     * Display a listing of all teachers
     * GET /admin/teachers
     */
    public function index(Request $request)
    {
        $perPage = max(1, min(500, (int) ($request->per_page ?? 15)));

        // ✅ មិនទាញ profile_image ស្ទួនពីតារាង users ទេ ដើម្បីកាត់បន្ថយការប្រើប្រាស់ RAM ៥០%
        $query = Teacher::with([
            'department:id,department_name',
            'user:id,status,email',
            'role:id,role_name',
        ])->select([
            'id', 'user_id', 'role_id', 'department_id',
            'teacher_code', 'first_name', 'last_name', 'gender',
            'date_of_birth', 'email', 'phone', 'profile_image',
            'specialization', 'employment_type', 'created_at',
        ]);

        if ($request->filled('department_id')) {
            $query->where('department_id', $request->department_id);
        }

        if ($request->filled('employment_type')) {
            $query->where('employment_type', $request->employment_type);
        }

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere(DB::raw("CONCAT(first_name, ' ', last_name)"), 'like', "%{$search}%")
                  ->orWhere('teacher_code', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%")
                  ->orWhere('specialization', 'like', "%{$search}%");
            });
        }

        $teachers = $query->orderBy('first_name')->paginate($perPage);

        $missingImgUserIds = collect($teachers->items())
            ->filter(fn ($t) => empty($t->profile_image) && !empty($t->user_id))
            ->pluck('user_id')
            ->unique()
            ->values()
            ->all();

        $fallbackAvatars = !empty($missingImgUserIds)
            ? User::whereIn('id', $missingImgUserIds)
                ->whereNotNull('profile_image')
                ->pluck('profile_image', 'id')
            : collect();

        $items = collect($teachers->items())->map(function ($teacher) use ($fallbackAvatars) {
            if (empty($teacher->profile_image) && isset($fallbackAvatars[$teacher->user_id])) {
                $teacher->profile_image = $fallbackAvatars[$teacher->user_id];
            }
            return $this->deduplicateTeacherAvatar($teacher);
        })->all();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $teachers->currentPage(),
                'last_page' => $teachers->lastPage(),
                'per_page' => $teachers->perPage(),
                'total' => $teachers->total(),
            ],
            'message' => 'បានទាញយកបញ្ជីគ្រូបង្រៀនដោយជោគជ័យ',
        ]);
    }

    /**
     * Store a newly created teacher
     * POST /admin/teachers
     */
    public function store(Request $request)
    {
        if ($request->filled('date_of_birth')) {
            $request->merge(['date_of_birth' => $this->normalizeDateOfBirth($request->input('date_of_birth'))]);
        }

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'gender' => 'nullable|in:Male,Female,Other',
            'date_of_birth' => 'nullable|date',
            'email' => 'required|email|unique:users,email|unique:teachers,email',
            'phone' => 'nullable|string|max:20',
            'password' => 'required|string|min:6',
            'status' => 'nullable|in:active,inactive',
            'department_id' => 'nullable|exists:departments,id',
            'teacher_code' => 'nullable|string|max:50|unique:teachers,teacher_code',
            'specialization' => 'nullable|string|max:255',
            'employment_type' => 'nullable|in:Full-time,Part-time,Contract',
            'profile_image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        $teacherRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%teacher%'])->first()
            ?? Role::find(2);
        $teacherRoleId = $teacherRole?->id ?? 2;

        $teacher = DB::transaction(function () use ($validated, $request, $teacherRoleId) {
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
                'role_id' => $teacherRoleId,
                'profile_image' => $profileImagePath,
            ]);

            $teacher = Teacher::create([
                'user_id' => $user->id,
                'role_id' => $teacherRoleId,
                'teacher_code' => !empty($validated['teacher_code'])
                    ? trim($validated['teacher_code'])
                    : $this->generateTeacherCode(),
                'first_name' => $cleanFirst,
                'last_name' => $cleanLast,
                'gender' => $validated['gender'] ?? null,
                'date_of_birth' => $this->normalizeDateOfBirth($validated['date_of_birth'] ?? null),
                'email' => $cleanEmail,
                'phone' => $validated['phone'] ?? null,
                'department_id' => $validated['department_id'] ?? null,
                'specialization' => $validated['specialization'] ?? null,
                'employment_type' => $validated['employment_type'] ?? 'Full-time',
                'profile_image' => $profileImagePath,
            ]);

            $loaded = $teacher->load(['department:id,department_name', 'user:id,status,email', 'role:id,role_name']);
            return $this->deduplicateTeacherAvatar($loaded);
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => 'បានបង្កើតគណនីគ្រូបង្រៀនដោយជោគជ័យ',
            'data' => $teacher,
        ], 201);
    }

    /**
     * Display the specified teacher
     * GET /admin/teachers/{teacher}
     */
    public function show(Teacher $teacher)
    {
        $loaded = $teacher->load(['department:id,department_name', 'user:id,status,email,profile_image', 'role:id,role_name']);
        $this->deduplicateTeacherAvatar($loaded);

        return response()->json([
            'data' => $loaded,
            'message' => 'បានទាញយកទិន្នន័យគ្រូបង្រៀនដោយជោគជ័យ',
        ]);
    }

    /**
     * Update the specified teacher
     * PUT /admin/teachers/{teacher}
     */
    public function update(Request $request, Teacher $teacher)
    {
        if ($request->filled('date_of_birth')) {
            $request->merge(['date_of_birth' => $this->normalizeDateOfBirth($request->input('date_of_birth'))]);
        }

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'gender' => 'nullable|in:Male,Female,Other',
            'date_of_birth' => 'nullable|date',
            'email' => [
                'required', 'email',
                Rule::unique('users', 'email')->ignore($teacher->user_id),
                Rule::unique('teachers', 'email')->ignore($teacher->id),
            ],
            'phone' => 'nullable|string|max:20',
            'password' => 'nullable|string|min:6',
            'status' => 'nullable|in:active,inactive',
            'department_id' => 'nullable|exists:departments,id',
            'teacher_code' => [
                'nullable', 'string', 'max:50',
                Rule::unique('teachers', 'teacher_code')->ignore($teacher->id),
            ],
            'specialization' => 'nullable|string|max:255',
            'employment_type' => 'nullable|in:Full-time,Part-time,Contract',
            'profile_image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        DB::transaction(function () use ($validated, $request, $teacher) {
            $profileImagePath = $teacher->profile_image;
            if ($request->hasFile('profile_image')) {
                if (
                    $teacher->profile_image &&
                    !str_starts_with($teacher->profile_image, 'data:') &&
                    !str_starts_with($teacher->profile_image, 'http')
                ) {
                    Storage::disk('public')->delete($teacher->profile_image);
                }
                $encoded = $this->encodeUploadedImageToBase64($request->file('profile_image'));
                if ($encoded) {
                    $profileImagePath = $encoded;
                }
            }

            $cleanEmail = strtolower(trim($validated['email']));
            $cleanFirst = trim($validated['first_name']);
            $cleanLast = trim($validated['last_name']);

            if ($teacher->user) {
                $userData = [
                    'first_name' => $cleanFirst,
                    'last_name' => $cleanLast,
                    'email' => $cleanEmail,
                    'phone' => $validated['phone'] ?? $teacher->user->phone,
                    'gender' => $validated['gender'] ?? $teacher->user->gender,
                    'status' => $validated['status'] ?? $teacher->user->status,
                    'profile_image' => $profileImagePath ?? $teacher->user->profile_image,
                ];

                if (!empty($validated['password'])) {
                    $userData['password'] = Hash::make($validated['password']);
                }

                $teacher->user->update($userData);
            }

            $teacher->update([
                'teacher_code' => !empty($validated['teacher_code'])
                    ? trim($validated['teacher_code'])
                    : $teacher->teacher_code,
                'first_name' => $cleanFirst,
                'last_name' => $cleanLast,
                'gender' => $validated['gender'] ?? $teacher->gender,
                'date_of_birth' => array_key_exists('date_of_birth', $validated)
                    ? $this->normalizeDateOfBirth($validated['date_of_birth'])
                    : $teacher->date_of_birth,
                'email' => $cleanEmail,
                'phone' => $validated['phone'] ?? $teacher->phone,
                'department_id' => $validated['department_id'] ?? $teacher->department_id,
                'specialization' => $validated['specialization'] ?? $teacher->specialization,
                'employment_type' => $validated['employment_type'] ?? $teacher->employment_type,
                'profile_image' => $profileImagePath,
            ]);
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        $freshTeacher = $teacher->fresh(['department:id,department_name', 'user:id,status,email', 'role:id,role_name']);
        $this->deduplicateTeacherAvatar($freshTeacher);

        return response()->json([
            'message' => 'បានកែប្រែព័ត៌មានគ្រូបង្រៀនដោយជោគជ័យ',
            'data' => $freshTeacher,
        ]);
    }

    /**
     * Remove the specified teacher
     * DELETE /admin/teachers/{teacher}
     */
    public function destroy(Teacher $teacher)
    {
        $teacherName = trim($teacher->first_name . ' ' . $teacher->last_name);

        if (
            $teacher->profile_image &&
            !str_starts_with($teacher->profile_image, 'data:') &&
            !str_starts_with($teacher->profile_image, 'http')
        ) {
            Storage::disk('public')->delete($teacher->profile_image);
        }

        DB::transaction(function () use ($teacher) {
            $targetUser = $teacher->user;
            $teacher->delete();
            if ($targetUser) {
                $targetUser->delete();
            }
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => "បានលុបគណនីគ្រូបង្រៀន '{$teacherName}' ដោយជោគជ័យ",
        ]);
    }

    /**
     * Get all teachers for export without pagination
     * GET /admin/teachers/export-all
     */
    public function exportAll(Request $request)
    {
        if ($request->query('format') === 'json') {
            $teachers = [];
            Teacher::with([
                'department:id,department_name',
                'user:id,status,email',
                'role:id,role_name',
            ])
                ->select([
                    'id', 'user_id', 'role_id', 'department_id',
                    'teacher_code', 'first_name', 'last_name', 'gender',
                    'date_of_birth', 'email', 'phone', 'profile_image',
                    'specialization', 'employment_type', 'created_at',
                ])
                ->orderBy('first_name')
                ->chunk(500, function ($chunk) use (&$teachers) {
                    $missingUserIds = $chunk
                        ->filter(fn ($t) => empty($t->profile_image) && !empty($t->user_id))
                        ->pluck('user_id')
                        ->unique()
                        ->values()
                        ->all();

                    $fallbackAvatars = !empty($missingUserIds)
                        ? User::whereIn('id', $missingUserIds)
                            ->whereNotNull('profile_image')
                            ->pluck('profile_image', 'id')
                        : collect();

                    foreach ($chunk as $teacher) {
                        if (empty($teacher->profile_image) && isset($fallbackAvatars[$teacher->user_id])) {
                            $teacher->profile_image = $fallbackAvatars[$teacher->user_id];
                        }
                        $teachers[] = $this->deduplicateTeacherAvatar($teacher);
                    }
                });

            return response()->json([
                'data' => $teachers,
                'message' => 'បានទាញយកទិន្នន័យគ្រូបង្រៀនទាំងអស់ដោយជោគជ័យ',
            ]);
        }

        $filename = 'Teachers_List_' . date('Y-m-d') . '.csv';
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
                'Teacher Code',
                'First Name',
                'Last Name',
                'Gender',
                'Email',
                'Phone',
                'Department',
                'Specialization',
                'Employment Type',
                'Date of Birth',
                'Status',
            ]);

            $index = 1;
            Teacher::with([
                'department:id,department_name',
                'user:id,status,email',
                'role:id,role_name',
            ])
                ->select([
                    'id', 'user_id', 'role_id', 'department_id',
                    'teacher_code', 'first_name', 'last_name', 'gender',
                    'date_of_birth', 'email', 'phone',
                    'specialization', 'employment_type',
                ])
                ->orderBy('first_name')
                ->chunk(500, function ($teachers) use ($handle, &$index) {
                    foreach ($teachers as $t) {
                        $gender = $t->gender === 'Male'
                            ? 'ប្រុស (Male)'
                            : ($t->gender === 'Female' ? 'ស្រី (Female)' : ($t->gender ?? ''));
                        $status = ($t->user->status ?? $t->status ?? 'active') === 'active'
                            ? 'សកម្ម (Active)'
                            : 'អសកម្ម (Inactive)';

                        fputcsv($handle, [
                            $index++,
                            $t->teacher_code ?? '',
                            $t->first_name ?? '',
                            $t->last_name ?? '',
                            $gender,
                            $t->email ?? '',
                            $t->phone ?? '',
                            $t->department->department_name ?? '',
                            $t->specialization ?? '',
                            $t->employment_type ?? '',
                            $t->date_of_birth ?? '',
                            $status,
                        ]);
                    }
                });

            fclose($handle);
        }, 200, $headers);
    }

    /**
     * Import multiple teachers
     * POST /admin/teachers/import
     */
    public function import(Request $request)
    {
        $request->validate([
            'teachers' => 'required|array|min:1',
            'teachers.*.first_name' => 'required|string|max:100',
            'teachers.*.last_name' => 'required|string|max:100',
            'teachers.*.email' => 'required|email',
        ]);

        $teacherRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%teacher%'])->first()
            ?? Role::find(2);
        $teacherRoleId = $teacherRole?->id ?? 2;

        $importedCount = 0;
        $skipped = [];

        DB::transaction(function () use ($request, $teacherRoleId, &$importedCount, &$skipped) {
            $emails = collect($request->teachers)
                ->pluck('email')
                ->filter()
                ->map(fn ($e) => strtolower(trim($e)))
                ->toArray();

            $existingEmails = User::whereIn('email', $emails)->pluck('email')
                ->merge(Teacher::whereIn('email', $emails)->pluck('email'))
                ->map(fn ($e) => strtolower(trim($e)))
                ->unique()
                ->toArray();

            foreach ($request->teachers as $index => $item) {
                $cleanEmail = strtolower(trim($item['email']));

                if (in_array($cleanEmail, $existingEmails, true)) {
                    $skipped[] = [
                        'row' => $index + 1,
                        'email' => $item['email'],
                        'reason' => 'អ៊ីមែលនេះមានរួចហើយ (Email already exists)',
                    ];
                    continue;
                }

                $existingEmails[] = $cleanEmail;

                $password = !empty($item['password']) ? $item['password'] : '12345678';
                $gender = in_array($item['gender'] ?? '', ['Male', 'Female', 'Other']) ? $item['gender'] : null;
                $employmentType = in_array($item['employment_type'] ?? '', ['Full-time', 'Part-time,Contract', 'Part-time', 'Contract'])
                    ? $item['employment_type']
                    : 'Full-time';
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
                    'role_id' => $teacherRoleId,
                ]);

                $requestedCode = !empty($item['teacher_code']) ? trim($item['teacher_code']) : null;
                if ($requestedCode && Teacher::where('teacher_code', $requestedCode)->exists()) {
                    $requestedCode = null;
                }

                Teacher::create([
                    'user_id' => $user->id,
                    'role_id' => $teacherRoleId,
                    'teacher_code' => $requestedCode ?: $this->generateTeacherCode(),
                    'first_name' => $cleanFirst,
                    'last_name' => $cleanLast,
                    'gender' => $gender,
                    'date_of_birth' => $this->normalizeDateOfBirth($item['date_of_birth'] ?? null),
                    'email' => $cleanEmail,
                    'phone' => $item['phone'] ?? null,
                    'department_id' => $item['department_id'] ?? null,
                    'specialization' => $item['specialization'] ?? null,
                    'employment_type' => $employmentType,
                ]);

                $importedCount++;
            }
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => "នាំចូលគ្រូបង្រៀនចំនួន {$importedCount} នាក់ដោយជោគជ័យ",
            'imported_count' => $importedCount,
            'skipped' => $skipped,
        ]);
    }

    private function generateTeacherCode(): string
    {
        $year = date('Y');
        $nextNum = (int) Teacher::max('id') + 1;
        do {
            $code = 'TCH-' . $year . '-' . str_pad((string) $nextNum, 4, '0', STR_PAD_LEFT);
            $nextNum++;
        } while (Teacher::where('teacher_code', $code)->exists());

        return $code;
    }
}
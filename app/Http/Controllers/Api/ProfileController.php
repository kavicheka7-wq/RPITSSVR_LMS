<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\Teacher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ProfileController extends Controller
{
    /**
     * ✅ HELPER: ឆែកជួរឈរ profile_image ក្នុងតារាង teachers/students ដោយប្រើ Cache (24 ម៉ោង)
     */
    private function hasProfileImageColumn(string $table): bool
    {
        return (bool) Cache::remember("lms_{$table}_has_profile_img_col_v1", 86400, function () use ($table) {
            try {
                return Schema::hasColumn($table, 'profile_image');
            } catch (\Throwable $e) {
                return false;
            }
        });
    }

    /**
     * ✅ HELPER: ស្រង់យកទិន្នន័យរូបភាព (Binary + Extension + Mime) ដោយមិនទាន់បំប្លែង Base64
     */
    private function extractImagePayload(Request $request): ?array
    {
        if ($request->hasFile('profile_image')) {
            $file = $request->file('profile_image');
            if ($file && $file->isValid()) {
                $mime = $file->getMimeType() ?: 'image/webp';
                $ext = strtolower($file->getClientOriginalExtension() ?: match ($mime) {
                    'image/png' => 'png',
                    'image/gif' => 'gif',
                    'image/webp' => 'webp',
                    default => 'jpg',
                });
                $binary = file_get_contents($file->getRealPath());
                return [
                    'binary' => $binary,
                    'mime' => $mime,
                    'ext' => $ext === 'jpeg' ? 'jpg' : $ext,
                    'data_uri' => null, // មិនទាន់បំប្លែង Base64 ដើម្បីសន្សំ RAM/CPU
                ];
            }
        }

        $rawBase64 = $request->input('profile_image_base64') ?: $request->input('profile_image');
        if (is_string($rawBase64)) {
            $trimmed = trim($rawBase64);
            if (
                strlen($trimmed) <= 2800000 &&
                preg_match('/^data:image\/(jpeg|jpg|png|gif|webp);base64,([A-Za-z0-9+\/=\r\n]+)$/i', $trimmed, $matches)
            ) {
                $type = strtolower($matches[1]);
                $binary = base64_decode($matches[2], true);
                if ($binary !== false) {
                    return [
                        'binary' => $binary,
                        'mime' => 'image/' . ($type === 'jpg' ? 'jpeg' : $type),
                        'ext' => $type === 'jpeg' ? 'jpg' : $type,
                        'data_uri' => $trimmed,
                    ];
                }
            }
        }

        return null;
    }

    /**
     * ✅ HELPER: បង្ហោះរូបភាពទៅ Cloudflare R2 និងលុបរូបចាស់ចេញ
     */
    private function uploadToR2(array $payload, int $userId, ?string $oldImageUrl = null): ?string
    {
        $bucket = config('filesystems.disks.r2.bucket');
        $key = config('filesystems.disks.r2.key');
        $publicUrl = rtrim((string) config('filesystems.disks.r2.url'), '/');

        if (!$bucket || !$key || !$publicUrl) {
            return null;
        }

        try {
            $filename = 'avatars/u' . $userId . '_' . time() . '_' . Str::random(6) . '.' . $payload['ext'];

            $uploaded = Storage::disk('r2')->put($filename, $payload['binary'], [
                'visibility' => 'public',
                'ContentType' => $payload['mime'],
            ]);

            if (!$uploaded) {
                return null;
            }

            // លុបរូបចាស់ចេញពី R2 បើមាន
            if ($oldImageUrl && str_starts_with($oldImageUrl, $publicUrl . '/')) {
                $oldPath = ltrim(substr($oldImageUrl, strlen($publicUrl)), '/');
                if ($oldPath) {
                    try {
                        Storage::disk('r2')->delete($oldPath);
                    } catch (\Throwable $e) {
                        Log::warning('R2 delete old avatar failed: ' . $e->getMessage());
                    }
                }
            }

            return $publicUrl . '/' . $filename;
        } catch (\Throwable $e) {
            Log::error('R2 upload failed, falling back to Base64: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * HELPER: កែប្រែប្រភេទជួរឈរ profile_image ទៅជា LONGTEXT តែ ១ ដងគត់
     */
    private function ensureLongTextColumns(): void
    {
        if (Cache::has('lms_profile_image_longtext_migrated_v1')) {
            return;
        }

        try {
            DB::statement('ALTER TABLE users MODIFY profile_image LONGTEXT NULL');
            if ($this->hasProfileImageColumn('teachers')) {
                DB::statement('ALTER TABLE teachers MODIFY profile_image LONGTEXT NULL');
            }
            if ($this->hasProfileImageColumn('students')) {
                DB::statement('ALTER TABLE students MODIFY profile_image LONGTEXT NULL');
            }
            Cache::forever('lms_profile_image_longtext_migrated_v1', true);
        } catch (\Exception $e) {
            Log::warning('Could not alter profile_image column to LONGTEXT: ' . $e->getMessage());
        }
    }

    /**
     * HELPER: រក្សាទុករូបភាពប្រវត្តិរូបចូល R2 (ឬ Fallback Base64) និង Sync គ្រប់តារាង
     */
    private function handleSharedImageUpdate(Request $request)
    {
        if ($request->hasFile('profile_image')) {
            $request->validate([
                'profile_image' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
            ]);
        }

        $user = $request->user() ?? Auth::user();
        if (!$user) {
            return response()->json(['message' => 'សូមចូលប្រព័ន្ធជាមុនសិន'], 401);
        }

        $payload = $this->extractImagePayload($request);

        if ($payload) {
            // ព្យាយាមបាញ់ចូល Cloudflare R2 មុន បើមិនបានទើបបំប្លែងជា Base64
            $r2Url = $this->uploadToR2($payload, (int) $user->id, $user->profile_image);

            if ($r2Url) {
                $finalImageValue = $r2Url;
            } else {
                $this->ensureLongTextColumns();
                $finalImageValue = $payload['data_uri']
                    ?: "data:{$payload['mime']};base64," . base64_encode($payload['binary']);
            }

            $hasTeacherImg = $this->hasProfileImageColumn('teachers');
            $hasStudentImg = $this->hasProfileImageColumn('students');

            DB::transaction(function () use ($user, $finalImageValue, $hasTeacherImg, $hasStudentImg) {
                $user->profile_image = $finalImageValue;
                $user->save();

                if ($hasTeacherImg) {
                    Teacher::where('user_id', $user->id)->update(['profile_image' => $finalImageValue]);
                }
                if ($hasStudentImg) {
                    Student::where('user_id', $user->id)->update(['profile_image' => $finalImageValue]);
                }
            });

            return response()->json([
                'success' => true,
                'message' => 'បានផ្លាស់ប្ដូររូបភាពដោយជោគជ័យ',
                'profile_image' => $user->profile_image,
            ]);
        }

        return response()->json(['message' => 'រកមិនឃើញរូបភាព ប្រភេទរូបភាពមិនត្រឹមត្រូវ ឬទំហំរូបភាពធំពេក'], 400);
    }

    /**
     * HELPER: កែប្រែព័ត៌មានប្រវត្តិរូប (ឈ្មោះ, អ៊ីមែល, លេខទូរស័ព្ទ) ឱ្យស៊ីគ្នាគ្រប់តារាងទាំងអស់
     */
    private function handleSharedProfileUpdate(Request $request)
    {
        $user = $request->user() ?? Auth::user();
        if (!$user) {
            return response()->json(['message' => 'សូមចូលប្រព័ន្ធជាមុនសិន'], 401);
        }

        $teacher = Teacher::where('user_id', $user->id)->first();
        $student = Student::where('user_id', $user->id)->first();

        $emailRules = [
            'required',
            'string',
            'email',
            'max:255',
            Rule::unique('users', 'email')->ignore($user->id),
        ];

        if ($teacher) {
            $emailRules[] = Rule::unique('teachers', 'email')->ignore($teacher->id);
        }
        if ($student) {
            $emailRules[] = Rule::unique('students', 'email')->ignore($student->id);
        }

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => $emailRules,
            'phone' => 'nullable|string|max:20',
        ]);

        $cleanFirst = trim($validated['first_name']);
        $cleanLast = trim($validated['last_name']);
        $cleanEmail = strtolower(trim($validated['email']));
        $cleanPhone = isset($validated['phone']) ? trim($validated['phone']) : null;

        DB::transaction(function () use ($user, $teacher, $student, $cleanFirst, $cleanLast, $cleanEmail, $cleanPhone) {
            $user->first_name = $cleanFirst;
            $user->last_name = $cleanLast;
            $user->email = $cleanEmail;
            $user->phone = $cleanPhone;
            $user->save();

            if ($teacher) {
                $teacher->first_name = $cleanFirst;
                $teacher->last_name = $cleanLast;
                $teacher->email = $cleanEmail;
                $teacher->phone = $cleanPhone;
                $teacher->save();
            }

            if ($student) {
                $student->first_name = $cleanFirst;
                $student->last_name = $cleanLast;
                $student->email = $cleanEmail;
                $student->phone = $cleanPhone;
                $student->save();
            }
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        $user->load('role:id,role_name');
        if ($teacher) {
            $user->setAttribute('teacher', $teacher->fresh(['department:id,department_name', 'role:id,role_name']));
            $user->setAttribute('teacher_first_name', $cleanFirst);
            $user->setAttribute('teacher_last_name', $cleanLast);
            $user->setAttribute('teacher_email', $cleanEmail);
            $user->setAttribute('teacher_phone', $cleanPhone);
        }
        if ($student) {
            $user->setAttribute('student', $student->fresh(['department:id,department_name', 'role:id,role_name']));
        }

        return response()->json($user);
    }

    // --- មុខងារសម្រាប់គណនីទូទៅ / Admin ---

    public function updateImage(Request $request)
    {
        return $this->handleSharedImageUpdate($request);
    }

    public function update(Request $request)
    {
        return $this->handleSharedProfileUpdate($request);
    }

    // --- មុខងារសម្រាប់គណនីគ្រូបង្រៀន (Teacher) ---

    public function updateTeacherImage(Request $request)
    {
        return $this->handleSharedImageUpdate($request);
    }

    public function updateTeacher(Request $request)
    {
        return $this->handleSharedProfileUpdate($request);
    }

    // --- មុខងារសម្រាប់គណនីសិស្ស (Student) ---

    public function updateStudentImage(Request $request)
    {
        return $this->handleSharedImageUpdate($request);
    }

    public function updateStudent(Request $request)
    {
        return $this->handleSharedProfileUpdate($request);
    }

    // --- មុខងារសម្រាប់ផ្លាស់ប្ដូរពាក្យសម្ងាត់ (Change Password) ---

    public function updatePassword(Request $request)
    {
        $rules = [
            'current_password' => 'required|string',
            'new_password' => 'required|string|min:6',
        ];

        if ($request->has('new_password_confirmation')) {
            $rules['new_password'] = 'required|string|min:6|confirmed';
        }

        $request->validate($rules);

        $user = $request->user() ?? Auth::user();
        if (!$user) {
            return response()->json(['message' => 'សូមចូលប្រព័ន្ធជាមុនសិន'], 401);
        }

        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json([
                'message' => 'ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវទេ!',
            ], 400);
        }

        $user->update([
            'password' => Hash::make($request->new_password),
        ]);

        return response()->json([
            'message' => 'បានផ្លាស់ប្ដូរពាក្យសម្ងាត់ដោយជោគជ័យ',
        ]);
    }
}
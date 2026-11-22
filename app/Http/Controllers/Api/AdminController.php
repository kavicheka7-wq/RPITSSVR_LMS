<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Department;
use App\Models\Enrollment;
use App\Models\Role;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    private const SETTINGS_FILE_PATH = 'lms_system_settings.json';
    private const SETTINGS_CACHE_KEY = 'lms_system_settings';

    /**
     * ✅ បង្រួមរូបថត Base64 ធំៗ (> 25KB) ឱ្យមកទំហំច្បាស់ល្អ (200x200px HD) និងទុកក្នុង Cache (រំលង URL ពី Cloudflare R2)
     */
    private function compressAvatarIfHeavy(?string $rawImage, int $userId): ?string
    {
        if (!$rawImage) {
            return null;
        }
        $trimmed = trim($rawImage);
        if ($trimmed === '' || strlen($trimmed) <= 25000 || !str_starts_with($trimmed, 'data:image')) {
            return $trimmed ?: null;
        }

        $cacheKey = 'adm_usr_avatar_v2_' . $userId . '_' . md5(substr($trimmed, 0, 100) . strlen($trimmed));

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

    // --- User Management ---

    public function getUsers(Request $request)
    {
        $query = User::with(['role:id,role_name'])
            ->select([
                'id',
                'first_name',
                'last_name',
                'email',
                'phone',
                'gender',
                'profile_image',
                'status',
                'role_id',
                'created_at',
            ]);

        if ($request->filled('role_id')) {
            $query->where('role_id', $request->role_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere(DB::raw("CONCAT(first_name, ' ', last_name)"), 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $perPage = max(1, min(200, (int) ($request->per_page ?? 15)));
        $users = $query->orderBy('id', 'desc')->paginate($perPage);

        $users->getCollection()->transform(function ($u) {
            if (!empty($u->profile_image)) {
                $u->profile_image = $this->compressAvatarIfHeavy($u->profile_image, (int) $u->id);
            }
            return $u;
        });

        return response()->json($users);
    }

    public function createUser(Request $request)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8',
            'role_id' => 'required|exists:roles,id',
            'gender' => 'nullable|in:Male,Female,Other',
            'phone' => 'nullable|string|max:20',
            'status' => 'nullable|in:active,inactive',
        ]);

        $validated['first_name'] = trim($validated['first_name']);
        $validated['last_name'] = trim($validated['last_name']);
        $validated['email'] = strtolower(trim($validated['email']));
        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = $validated['status'] ?? 'active';

        $user = User::create($validated);
        $user->load('role:id,role_name');

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'user' => $user,
            'message' => 'User created successfully',
        ], 201);
    }

    public function updateUser(Request $request, $id)
    {
        $user = User::findOrFail($id);

        $validated = $request->validate([
            'first_name' => 'sometimes|string|max:100',
            'last_name' => 'sometimes|string|max:100',
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => 'nullable|string|min:8',
            'role_id' => 'sometimes|exists:roles,id',
            'gender' => 'nullable|in:Male,Female,Other',
            'phone' => 'nullable|string|max:20',
            'status' => 'nullable|in:active,inactive',
        ]);

        if (isset($validated['first_name'])) {
            $validated['first_name'] = trim($validated['first_name']);
        }
        if (isset($validated['last_name'])) {
            $validated['last_name'] = trim($validated['last_name']);
        }
        if (isset($validated['email'])) {
            $validated['email'] = strtolower(trim($validated['email']));
        }

        if (!empty($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $user->update($validated);
        $user->load('role:id,role_name');

        if ($user->teacher) {
            $user->teacher->update(array_filter([
                'first_name' => $validated['first_name'] ?? null,
                'last_name' => $validated['last_name'] ?? null,
                'email' => $validated['email'] ?? null,
                'phone' => $validated['phone'] ?? null,
                'gender' => $validated['gender'] ?? null,
            ], fn ($v) => !is_null($v)));
        }

        if ($user->student) {
            $user->student->update(array_filter([
                'first_name' => $validated['first_name'] ?? null,
                'last_name' => $validated['last_name'] ?? null,
                'email' => $validated['email'] ?? null,
                'phone' => $validated['phone'] ?? null,
                'gender' => $validated['gender'] ?? null,
            ], fn ($v) => !is_null($v)));
        }

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');
        Cache::forget('lms_auth_user_payload_' . $user->id);

        return response()->json([
            'user' => $user,
            'message' => 'User updated successfully',
        ]);
    }

    public function deleteUser(Request $request, $id)
    {
        $user = User::with('role')->findOrFail($id);

        $currentAuthId = $request->user()?->id ?? auth()->id();
        if ($currentAuthId && (int) $currentAuthId === (int) $user->id) {
            return response()->json([
                'message' => 'អ្នកមិនអាចលុបគណនីរបស់ខ្លួនឯងដែលកំពុងប្រើប្រាស់បានទេ!',
            ], 422);
        }

        $isUserAdmin = (int) $user->role_id === 1 ||
            stripos((string) ($user->role?->role_name ?? ''), 'admin') !== false;

        if ($isUserAdmin) {
            $adminCount = User::where('role_id', $user->role_id)->count();
            if ($adminCount <= 1) {
                return response()->json([
                    'message' => 'មិនអាចលុបគណនីអ្នកគ្រប់គ្រង (Admin) ចុងក្រោយគេក្នុងប្រព័ន្ធបានទេ!',
                ], 422);
            }
        }

        $deletedUserId = $user->id;

        DB::transaction(function () use ($user) {
            Teacher::where('user_id', $user->id)->delete();
            Student::where('user_id', $user->id)->delete();
            $user->delete();
        });

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');
        Cache::forget('lms_auth_user_payload_' . $deletedUserId);

        return response()->json([
            'message' => 'User deleted successfully',
        ]);
    }

    // --- System Statistics ---

    public function getStats()
    {
        $stats = Cache::remember('admin_dashboard_stats', 300, function () {
            $adminRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%admin%'])->first();
            $teacherRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%teacher%'])->first();
            $studentRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%student%'])->first();

            $adminRoleId = $adminRole?->id ?? 1;
            $teacherRoleId = $teacherRole?->id ?? 2;
            $studentRoleId = $studentRole?->id ?? 3;

            $totalStudents = Student::count();
            if ($totalStudents === 0) {
                $totalStudents = User::where('role_id', $studentRoleId)->count();
            }

            $totalTeachers = Teacher::count();
            if ($totalTeachers === 0) {
                $totalTeachers = User::where('role_id', $teacherRoleId)->count();
            }

            return [
                'total_users' => User::count(),
                'total_students' => $totalStudents,
                'total_teachers' => $totalTeachers,
                'total_admins' => User::where('role_id', $adminRoleId)->count(),
                'total_courses' => Course::count(),
                'total_departments' => Department::count(),
                'total_enrollments' => Enrollment::count(),
            ];
        });

        return response()->json($stats);
    }

    // --- System Settings ---

    public function getSystemSettings()
    {
        $defaults = [
            'site_name' => 'LMS RPITSSVR',
            'timezone' => config('app.timezone', 'Asia/Phnom_Penh'),
            'date_format' => 'Y-m-d',
            'time_format' => 'H:i',
        ];

        $saved = Cache::rememberForever(self::SETTINGS_CACHE_KEY, function () {
            try {
                if (Storage::disk('local')->exists(self::SETTINGS_FILE_PATH)) {
                    $decoded = json_decode((string) Storage::disk('local')->get(self::SETTINGS_FILE_PATH), true);
                    if (is_array($decoded)) {
                        return $decoded;
                    }
                }
            } catch (\Throwable $e) {
            }
            return [];
        });

        return response()->json(array_merge($defaults, is_array($saved) ? $saved : []));
    }

    public function updateSystemSettings(Request $request)
    {
        $validated = $request->validate([
            'site_name' => 'sometimes|string|max:150',
            'timezone' => 'sometimes|string|max:64',
            'date_format' => 'sometimes|string|max:32',
            'time_format' => 'sometimes|string|max:32',
        ]);

        $current = Cache::get(self::SETTINGS_CACHE_KEY, []);
        if (!is_array($current) || empty($current)) {
            try {
                if (Storage::disk('local')->exists(self::SETTINGS_FILE_PATH)) {
                    $decoded = json_decode((string) Storage::disk('local')->get(self::SETTINGS_FILE_PATH), true);
                    if (is_array($decoded)) {
                        $current = $decoded;
                    }
                }
            } catch (\Throwable $e) {
                $current = [];
            }
        }

        $updated = array_merge($current, $validated);
        Cache::forever(self::SETTINGS_CACHE_KEY, $updated);

        try {
            Storage::disk('local')->put(
                self::SETTINGS_FILE_PATH,
                json_encode($updated, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
            );
        } catch (\Throwable $e) {
        }

        return response()->json([
            'settings' => $updated,
            'message' => 'Settings updated successfully',
        ]);
    }
}
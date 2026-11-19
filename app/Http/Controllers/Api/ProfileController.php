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
     * HELPER: បំប្លែងរូបភាពទៅជា Base64 Data URI
     */
    private function convertImageToBase64($file): string
    {
        $mimeType = $file->getMimeType() ?: 'image/jpeg';
        $base64Data = base64_encode(file_get_contents($file->getRealPath()));
        return "data:{$mimeType};base64,{$base64Data}";
    }

    /**
     * ✅ HELPER: ស្រង់យក និងផ្ទៀងផ្ទាត់សុវត្ថិភាពរូបភាព Base64 Data URI (ការពារ SVG XSS និងទំហំធំពេក)
     */
    private function extractImageDataUri(Request $request): ?string
    {
        $rawBase64 = $request->input('profile_image_base64') ?: $request->input('profile_image');
        if (is_string($rawBase64)) {
            $trimmed = trim($rawBase64);
            // អនុញ្ញាតតែ jpeg, jpg, png, gif, webp និងទំហំ Base64 មិនលើសពី ~2.8MB (~2MB file)
            if (
                strlen($trimmed) <= 2800000 &&
                preg_match('/^data:image\/(jpeg|jpg|png|gif|webp);base64,[A-Za-z0-9+\/=\r\n]+$/i', $trimmed)
            ) {
                return $trimmed;
            }
        }

        if ($request->hasFile('profile_image')) {
            $file = $request->file('profile_image');
            if ($file && $file->isValid()) {
                return $this->convertImageToBase64($file);
            }
        }

        return null;
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
     * HELPER: រក្សាទុករូបភាពប្រវត្តិរូបចូលគ្រប់តារាងដែលពាក់ព័ន្ធ (users, teachers, students)
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

        $dataUri = $this->extractImageDataUri($request);

        if ($dataUri) {
            $this->ensureLongTextColumns();

            $hasTeacherImg = $this->hasProfileImageColumn('teachers');
            $hasStudentImg = $this->hasProfileImageColumn('students');

            DB::transaction(function () use ($user, $dataUri, $hasTeacherImg, $hasStudentImg) {
                $user->profile_image = $dataUri;
                $user->save();

                if ($hasTeacherImg) {
                    Teacher::where('user_id', $user->id)->update(['profile_image' => $dataUri]);
                }
                if ($hasStudentImg) {
                    Student::where('user_id', $user->id)->update(['profile_image' => $dataUri]);
                }
            });

            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

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
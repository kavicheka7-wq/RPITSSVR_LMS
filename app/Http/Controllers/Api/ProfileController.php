<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Log;

class ProfileController extends Controller
{
    /**
     * HELPER: បំប្លែងរូបភាពទៅជា Base64 Data URI និងធានាថាជួរឈរក្នុង Database ជា LONGTEXT
     */
    private function convertImageToBase64($file): string
    {
        $mimeType = $file->getMimeType();
        $base64Data = base64_encode(file_get_contents($file->getRealPath()));
        return "data:{$mimeType};base64,{$base64Data}";
    }

    private function ensureLongTextColumns(): void
    {
        try {
            DB::statement('ALTER TABLE users MODIFY profile_image LONGTEXT NULL');
            if (Schema::hasColumn('teachers', 'profile_image')) {
                DB::statement('ALTER TABLE teachers MODIFY profile_image LONGTEXT NULL');
            }
            if (Schema::hasColumn('students', 'profile_image')) {
                DB::statement('ALTER TABLE students MODIFY profile_image LONGTEXT NULL');
            }
        } catch (\Exception $e) {
            Log::warning('Could not alter profile_image column to LONGTEXT: ' . $e->getMessage());
        }
    }

    public function updateImage(Request $request)
    {
        // ត្រួតពិនិត្យឯកសារដែលផ្ញើមក
        $request->validate([
            'profile_image' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        $user = Auth::user();

        if ($request->hasFile('profile_image')) {
            $file = $request->file('profile_image');

            // ធានាថាជួរឈរ profile_image អាចផ្ទុកអក្សរ Base64 វែងបាន
            $this->ensureLongTextColumns();

            // បំប្លែងរូបភាពទៅជា Base64 Data URI (ជាប់ជានិច្ចលើ Railway មិនបាត់ពេល Redeploy)
            $dataUri = $this->convertImageToBase64($file);

            // Update ទីតាំងរូបភាពទៅក្នុងតារាង users
            $user->profile_image = $dataUri;
            $user->save();

            // ប្រសិនបើគណនីនោះជាគ្រូ ឬសិស្ស ធ្វើបច្ចុប្បន្នភាពឱ្យស៊ីគ្នាផងដែរ
            if ($user->role?->role_name === 'Teacher' && Schema::hasColumn('teachers', 'profile_image')) {
                \App\Models\Teacher::where('user_id', $user->id)->update(['profile_image' => $dataUri]);
            } elseif ($user->role?->role_name === 'Student' && Schema::hasColumn('students', 'profile_image')) {
                \App\Models\Student::where('user_id', $user->id)->update(['profile_image' => $dataUri]);
            }

            // Clear cached reports & dashboard stats
            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

            return response()->json([
                'message' => 'បានផ្លាស់ប្ដូររូបភាពដោយជោគជ័យ',
                'profile_image' => $user->profile_image
            ]);
        }

        return response()->json(['message' => 'រកមិនឃើញរូបភាព'], 400);
    }

    public function update(Request $request)
    {
        $user = Auth::user();

        // ត្រួតពិនិត្យទិន្នន័យដែលបញ្ជូនមក
        $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            // អនុញ្ញាតឲ្យប្រើ email ដដែល តែមិនឲ្យជាន់ email អ្នកផ្សេង
            'email' => 'required|string|email|max:255|unique:users,email,' . $user->id,
            'phone' => 'nullable|string|max:20',
        ]);

        // ធ្វើការ Update ទិន្នន័យចូល Database
        $user->first_name = $request->first_name;
        $user->last_name = $request->last_name;
        $user->email = $request->email;
        $user->phone = $request->phone;
        $user->save();

        // Clear cached reports & dashboard stats
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        // ផ្ញើទិន្នន័យដែលកែប្រែរួចត្រឡប់ទៅ React វិញ
        return response()->json($user);
    }

    // ១. សម្រាប់ផ្លាស់ប្ដូររូបភាព Teacher
    public function updateTeacherImage(Request $request)
    {
        $request->validate([
            'profile_image' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        $user = Auth::user();
        // ស្វែងរកទិន្នន័យគ្រូនៅក្នុងតារាង teachers ដោយផ្អែកលើ user_id
        $teacher = \App\Models\Teacher::where('user_id', $user->id)->first();

        if ($request->hasFile('profile_image')) {
            $file = $request->file('profile_image');

            $this->ensureLongTextColumns();
            $imageUrl = $this->convertImageToBase64($file);

            // Update ចូលតារាង users 
            $user->profile_image = $imageUrl;
            $user->save();

            // Update ចូលតារាង teachers ផងដែរ ដើម្បីឲ្យទិន្នន័យស៊ីគ្នា
            if ($teacher && Schema::hasColumn('teachers', 'profile_image')) {
                $teacher->profile_image = $imageUrl;
                $teacher->save();
            }

            // Clear cached reports & dashboard stats
            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

            return response()->json([
                'message' => 'បានផ្លាស់ប្ដូររូបភាពដោយជោគជ័យ',
                'profile_image' => $imageUrl
            ]);
        }

        return response()->json(['message' => 'រកមិនឃើញរូបភាព'], 400);
    }

    // ២. សម្រាប់កែប្រែព័ត៌មាន (ឈ្មោះ, អ៊ីមែល, លេខទូរស័ព្ទ) Teacher
    public function updateTeacher(Request $request)
    {
        $user = Auth::user();
        $teacher = \App\Models\Teacher::where('user_id', $user->id)->first();

        $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|string|email|max:255|unique:users,email,' . $user->id,
            'phone' => 'nullable|string|max:20',
        ]);

        // Update តារាង users
        $user->first_name = $request->first_name;
        $user->last_name = $request->last_name;
        $user->email = $request->email;
        $user->phone = $request->phone;
        $user->save();

        // Update តារាង teachers ឲ្យស៊ីគ្នាជាមួយតារាង users 
        if ($teacher) {
            $teacher->first_name = $request->first_name;
            $teacher->last_name = $request->last_name;
            $teacher->email = $request->email;
            $teacher->phone = $request->phone;
            $teacher->save();
        }

        // Clear cached reports & dashboard stats
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json($user);
    }

    // ១. សម្រាប់ផ្លាស់ប្ដូររូបភាព Student
    public function updateStudentImage(Request $request)
    {
        $request->validate([
            'profile_image' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        $user = Auth::user();
        // ស្វែងរកទិន្នន័យសិស្សនៅក្នុងតារាង students ដោយផ្អែកលើ user_id
        $student = \App\Models\Student::where('user_id', $user->id)->first();

        if ($request->hasFile('profile_image')) {
            $file = $request->file('profile_image');

            $this->ensureLongTextColumns();
            $imageUrl = $this->convertImageToBase64($file);

            // Update ចូលតារាង users 
            $user->profile_image = $imageUrl;
            $user->save();

            // Update ចូលតារាង students ផងដែរ ដើម្បីឲ្យទិន្នន័យស៊ីគ្នា
            if ($student && Schema::hasColumn('students', 'profile_image')) {
                $student->profile_image = $imageUrl;
                $student->save();
            }

            // Clear cached reports & dashboard stats
            Cache::forget('admin_dashboard_stats');
            Cache::forget('admin_overview_report');

            return response()->json([
                'message' => 'បានផ្លាស់ប្ដូររូបភាពដោយជោគជ័យ',
                'profile_image' => $imageUrl
            ]);
        }

        return response()->json(['message' => 'រកមិនឃើញរូបភាព'], 400);
    }

    // ២. សម្រាប់កែប្រែព័ត៌មាន (ឈ្មោះ, អ៊ីមែល, លេខទូរស័ព្ទ) Student
    public function updateStudent(Request $request)
    {
        $user = Auth::user();
        $student = \App\Models\Student::where('user_id', $user->id)->first();

        $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|string|email|max:255|unique:users,email,' . $user->id,
            'phone' => 'nullable|string|max:20',
        ]);

        // Update តារាង users
        $user->first_name = $request->first_name;
        $user->last_name = $request->last_name;
        $user->email = $request->email;
        $user->phone = $request->phone;
        $user->save();

        // Update តារាង students ឲ្យស៊ីគ្នាជាមួយតារាង users 
        if ($student) {
            $student->first_name = $request->first_name;
            $student->last_name = $request->last_name;
            $student->email = $request->email;
            $student->phone = $request->phone;
            $student->save();
        }

        // Clear cached reports & dashboard stats
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json($user);
    }

    // ៣. សម្រាប់ផ្លាស់ប្ដូរ Password
    public function updatePassword(Request $request)
    {
        // 1. Validate ទិន្នន័យដែលផ្ញើមកពី Frontend
        $request->validate([
            'current_password' => 'required',
            'new_password' => 'required|min:6',
        ]);

        $user = $request->user();

        // 2. ផ្ទៀងផ្ទាត់ពាក្យសម្ងាត់ចាស់ ថាតើត្រឹមត្រូវឬទេ
        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json([
                'message' => 'ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវទេ!'
            ], 400);
        }

        // 3. កែប្រែពាក្យសម្ងាត់ថ្មីចូល Database
        $user->update([
            'password' => Hash::make($request->new_password)
        ]);

        return response()->json([
            'message' => 'បានផ្លាស់ប្ដូរពាក្យសម្ងាត់ដោយជោគជ័យ'
        ]);
    }
}
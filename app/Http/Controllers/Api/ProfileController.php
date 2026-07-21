<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    public function updateImage(Request $request)
    {
        // ត្រួតពិនិត្យឯកសារដែលផ្ញើមក
        $request->validate([
            'profile_image' => 'required|image|mimes:jpeg,png,jpg,gif|max:5120',
        ]);

        $user = Auth::user(); 

        if ($request->hasFile('profile_image')) {
            $file = $request->file('profile_image');
            
            // លុបរូបភាពចាស់ចេញពី Storage (បើមាន)
            if ($user->profile_image) {
                $oldImagePath = str_replace(url('storage') . '/', '', $user->profile_image);
                Storage::disk('public')->delete($oldImagePath);
            }

            // បង្កើតឈ្មោះថ្មី និងរក្សាទុកក្នុង Folder profile_images
            $filename = time() . '_' . $file->getClientOriginalName();
            $path = $file->storeAs('profile_images', $filename, 'public');

            // Update ទីតាំងរូបភាពទៅក្នុងតារាង users
            $user->profile_image = url('storage/' . $path);
            $user->save();

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

        // ផ្ញើទិន្នន័យដែលកែប្រែរួចត្រឡប់ទៅ React វិញ
        return response()->json($user);
    }

    // ១. សម្រាប់ផ្លាស់ប្ដូររូបភាព Teacher
    public function updateTeacherImage(Request $request)
    {
        $request->validate([
            'profile_image' => 'required|image|mimes:jpeg,png,jpg,gif|max:5120',
        ]);

        $user = Auth::user();
        // ស្វែងរកទិន្នន័យគ្រូនៅក្នុងតារាង teachers ដោយផ្អែកលើ user_id
        $teacher = \App\Models\Teacher::where('user_id', $user->id)->first();

        if ($request->hasFile('profile_image')) {
            $file = $request->file('profile_image');
            
            // លុបរូបចាស់ចេញ
            if ($teacher && $teacher->profile_image) {
                $oldImagePath = str_replace(url('storage') . '/', '', $teacher->profile_image);
                Storage::disk('public')->delete($oldImagePath);
            }

            $filename = time() . '_teacher_' . $file->getClientOriginalName();
            $path = $file->storeAs('profile_images', $filename, 'public');
            $imageUrl = url('storage/' . $path);

            // Update ចូលតារាង users 
            $user->profile_image = $imageUrl;
            $user->save();

            // Update ចូលតារាង teachers ផងដែរ ដើម្បីឲ្យទិន្នន័យស៊ីគ្នា
            if ($teacher) {
                $teacher->profile_image = $imageUrl;
                $teacher->save();
            }

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

        return response()->json($user);
    }

    // ១. សម្រាប់ផ្លាស់ប្ដូររូបភាព Student
    public function updateStudentImage(Request $request)
    {
        $request->validate([
            'profile_image' => 'required|image|mimes:jpeg,png,jpg,gif|max:5120',
        ]);

        $user = Auth::user();
        // ស្វែងរកទិន្នន័យសិស្សនៅក្នុងតារាង students ដោយផ្អែកលើ user_id
        $student = \App\Models\Student::where('user_id', $user->id)->first();

        if ($request->hasFile('profile_image')) {
            $file = $request->file('profile_image');
            
            // លុបរូបចាស់ចេញ
            if ($student && $student->profile_image) {
                $oldImagePath = str_replace(url('storage') . '/', '', $student->profile_image);
                Storage::disk('public')->delete($oldImagePath);
            }

            $filename = time() . '_student_' . $file->getClientOriginalName();
            $path = $file->storeAs('profile_images', $filename, 'public');
            $imageUrl = url('storage/' . $path);

            // Update ចូលតារាង users 
            $user->profile_image = $imageUrl;
            $user->save();

            // Update ចូលតារាង students ផងដែរ ដើម្បីឲ្យទិន្នន័យស៊ីគ្នា
            if ($student) {
                $student->profile_image = $imageUrl;
                $student->save();
            }

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

        return response()->json($user);
    }
}
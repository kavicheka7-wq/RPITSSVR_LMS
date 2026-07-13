<?php
// app/Http/Controllers/Api/AuthController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Teacher;
use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
            'role_id' => 'required|exists:roles,id',
        ]);

        $user = User::create([
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role_id' => $request->role_id,
            'status' => 'active',
        ]);

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
            'message' => 'Registration successful'
        ], 201);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        // ស្វែងរកអ្នកប្រើប្រាស់តាម Email
        $user = User::with('role')->where('email', $request->email)->first();

        if (!$user) {
            throw ValidationException::withMessages([
                'email' => ['អ៊ីមែលនេះមិនមានក្នុងប្រព័ន្ធ'],
            ]);
        }

        // ផ្ទៀងផ្ទាត់ពាក្យសម្ងាត់
        if (!Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'password' => ['ពាក្យសម្ងាត់មិនត្រឹមត្រូវ'],
            ]);
        }

        if ($user->status !== 'active') {
            throw ValidationException::withMessages([
                'email' => ['គណនីរបស់អ្នកត្រូវបានបិទ'],
            ]);
        }

        // បង្កើត Token
        $token = $user->createToken('auth_token')->plainTextToken;

        // ==============================================
        // រៀបចំទិន្នន័យអ្នកប្រើប្រាស់
        // ==============================================
        $userData = [
            'id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone' => $user->phone,
            'gender' => $user->gender,
            'status' => $user->status,
            'role_id' => $user->role_id,
            'role' => $user->role,
            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
        ];

        // ==============================================
        // ប្រសិនបើជា Teacher ទាញទិន្នន័យពីតារាង teachers
        // ==============================================
        if ($user->role->role_name === 'Teacher') {
            $teacher = Teacher::with(['department', 'role'])
                ->where('user_id', $user->id)
                ->first();

            if ($teacher) {
                // បន្ថែមទិន្នន័យពីតារាង teachers
                $userData['teacher_id'] = $teacher->id;
                $userData['teacher_code'] = $teacher->teacher_code;
                $userData['specialization'] = $teacher->specialization;
                $userData['department_id'] = $teacher->department_id;
                $userData['department_name'] = $teacher->department?->department_name;
                $userData['employment_type'] = $teacher->employment_type;
                $userData['date_of_birth'] = $teacher->date_of_birth;
                $userData['teacher_first_name'] = $teacher->first_name;
                $userData['teacher_last_name'] = $teacher->last_name;
                $userData['teacher_email'] = $teacher->email;
                $userData['teacher_phone'] = $teacher->phone;
                $userData['teacher_gender'] = $teacher->gender;
                $userData['teacher_role'] = $teacher->role;
                $userData['is_teacher'] = true;
                
                // រក្សាទុក teacher object ដាច់ដោយឡែក
                $teacherData = $teacher;
            } else {
                $userData['is_teacher'] = false;
                $teacherData = null;
            }
        } else {
            $userData['is_teacher'] = false;
            $teacherData = null;
        }

        // ==============================================
        // ប្រសិនបើជា Student (បើមានតារាង students)
        // ==============================================
        if ($user->role->role_name === 'Student') {
            // $student = Student::where('user_id', $user->id)->first();
            // if ($student) {
            //     $userData['student_id'] = $student->id;
            //     $userData['student_code'] = $student->student_code;
            //     // ... បន្ថែមទិន្នន័យផ្សេងទៀត
            // }
        }

        return response()->json([
            'user' => $userData,
            'token' => $token,
            'teacher' => $teacherData ?? null,
            'message' => 'ចូលប្រព័ន្ធដោយជោគជ័យ'
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'បានចាកចេញពីប្រព័ន្ធដោយជោគជ័យ'
        ]);
    }

    public function user(Request $request)
    {
        $user = $request->user()->load('role');
        
        $userData = [
            'id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone' => $user->phone,
            'gender' => $user->gender,
            'status' => $user->status,
            'role_id' => $user->role_id,
            'role' => $user->role,
            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
        ];

        $teacherData = null;

        // ប្រសិនបើជា Teacher ទាញទិន្នន័យពីតារាង teachers
        if ($user->role->role_name === 'Teacher') {
            $teacher = Teacher::with(['department', 'role'])
                ->where('user_id', $user->id)
                ->first();

            if ($teacher) {
                $userData['teacher_id'] = $teacher->id;
                $userData['teacher_code'] = $teacher->teacher_code;
                $userData['specialization'] = $teacher->specialization;
                $userData['department_id'] = $teacher->department_id;
                $userData['department_name'] = $teacher->department?->department_name;
                $userData['employment_type'] = $teacher->employment_type;
                $userData['date_of_birth'] = $teacher->date_of_birth;
                $userData['teacher_first_name'] = $teacher->first_name;
                $userData['teacher_last_name'] = $teacher->last_name;
                $userData['teacher_email'] = $teacher->email;
                $userData['teacher_phone'] = $teacher->phone;
                $userData['teacher_gender'] = $teacher->gender;
                $userData['teacher_role'] = $teacher->role;
                $userData['is_teacher'] = true;
                
                $teacherData = $teacher;
            } else {
                $userData['is_teacher'] = false;
            }
        } else {
            $userData['is_teacher'] = false;
        }

        return response()->json([
            'user' => $userData,
            'teacher' => $teacherData
        ]);
    }
}
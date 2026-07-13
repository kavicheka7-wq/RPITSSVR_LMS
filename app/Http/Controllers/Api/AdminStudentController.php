<?php


namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\Student;
use App\Models\User;
use App\Models\Department;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Storage;

class AdminStudentController extends Controller
{
    public function index()
    {
        $students = Student::with(['department', 'user', 'role'])
            ->orderBy('first_name')
            ->get();

        return response()->json([
            'data' => $students,
            'message' => 'បានទាញយកបញ្ជីសិស្សដោយជោគជ័យ'
        ]);
    }

    public function store(Request $request)
    {
        // ពិនិត្យមើលទិន្នន័យដែលបានផ្ញើ
        \Log::info('Student Store Request:', $request->all());
        
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
            'profile_image' => 'nullable|image|mimes:jpeg,png,jpg,gif|max:2048',
        ]);

        $student = DB::transaction(function () use ($validated, $request) {
            // 1. Create user account
            $user = User::create([
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'phone' => $validated['phone'] ?? null,
                'gender' => $validated['gender'] ?? null,
                'status' => $validated['status'] ?? 'active',
                'role_id' => $validated['role_id'],
            ]);

            // 2. Handle profile image upload
            $profileImagePath = null;
            if ($request->hasFile('profile_image')) {
                $file = $request->file('profile_image');
                $filename = time() . '_' . $file->getClientOriginalName();
                $profileImagePath = $file->storeAs('student_profiles', $filename, 'public');
                \Log::info('Profile image uploaded:', ['path' => $profileImagePath]);
            }

            // 3. Create student profile
            $student = Student::create([
                'user_id' => $user->id,
                'role_id' => $validated['role_id'],
                'student_code' => $validated['student_code'] ?? $this->generateStudentCode(),
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'gender' => $validated['gender'],
                'date_of_birth' => $validated['date_of_birth'] ?? null,
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? null,
                'department_id' => $validated['department_id'] ?? null,
                'batch_year' => $validated['batch_year'] ?? null,
                'degree_level' => $validated['degree_level'] ?? null,
                'study_shift' => $validated['study_shift'] ?? 'Monday-Friday',
                'address' => $validated['address'] ?? null,
                'profile_image' => $profileImagePath,
            ]);

            \Log::info('Student created:', ['student' => $student]);

            return $student->load(['department', 'user', 'role']);
        });

        return response()->json([
            'message' => 'បានបង្កើតគណនីសិស្សដោយជោគជ័យ',
            'data' => $student
        ], 201);
    }

    public function update(Request $request, Student $student)
    {
        \Log::info('Student Update Request:', $request->all());
        
        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'gender' => 'required|in:Male,Female,Other',
            'date_of_birth' => 'nullable|date',
            'email' => [
                'required',
                'email',
                Rule::unique('users', 'email')->ignore($student->user_id),
                Rule::unique('students', 'email')->ignore($student->id),
            ],
            'phone' => 'nullable|string|max:20',
            'password' => 'nullable|string|min:6',
            'status' => 'nullable|in:active,inactive',
            'department_id' => 'nullable|exists:departments,id',
            'student_code' => [
                'nullable',
                'string',
                'max:50',
                Rule::unique('students', 'student_code')->ignore($student->id),
            ],
            'batch_year' => 'nullable|string|max:50',
            'degree_level' => 'nullable|string|max:100',
            'study_shift' => 'nullable|in:Monday-Friday,Saturday-Sunday',
            'address' => 'nullable|string',
            'role_id' => 'required|exists:roles,id',
            'profile_image' => 'nullable|image|mimes:jpeg,png,jpg,gif|max:2048',
        ]);

        DB::transaction(function () use ($validated, $request, $student) {
            // Update User
            $userData = [
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? $student->user->phone,
                'gender' => $validated['gender'] ?? $student->user->gender,
                'status' => $validated['status'] ?? $student->user->status,
                'role_id' => $validated['role_id'],
            ];

            if (!empty($validated['password'])) {
                $userData['password'] = Hash::make($validated['password']);
            }

            $student->user->update($userData);

            // Handle profile image upload
            $profileImagePath = $student->profile_image;
            if ($request->hasFile('profile_image')) {
                // Delete old image if exists
                if ($student->profile_image) {
                    Storage::disk('public')->delete($student->profile_image);
                }
                $file = $request->file('profile_image');
                $filename = time() . '_' . $file->getClientOriginalName();
                $profileImagePath = $file->storeAs('student_profiles', $filename, 'public');
                \Log::info('Profile image updated:', ['path' => $profileImagePath]);
            }

            // Update Student
            $student->update([
                'student_code' => $validated['student_code'] ?? $student->student_code,
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'gender' => $validated['gender'],
                'date_of_birth' => $validated['date_of_birth'] ?? $student->date_of_birth,
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? $student->phone,
                'department_id' => $validated['department_id'] ?? $student->department_id,
                'batch_year' => $validated['batch_year'] ?? $student->batch_year,
                'degree_level' => $validated['degree_level'] ?? $student->degree_level,
                'study_shift' => $validated['study_shift'] ?? $student->study_shift,
                'address' => $validated['address'] ?? $student->address,
                'role_id' => $validated['role_id'],
                'profile_image' => $profileImagePath,
            ]);

            \Log::info('Student updated:', ['student' => $student]);
        });

        return response()->json([
            'message' => 'បានកែប្រែព័ត៌មានសិស្សដោយជោគជ័យ',
            'data' => $student->fresh(['department', 'user', 'role'])
        ]);
    }

    public function destroy(Student $student)
    {
        $studentName = $student->first_name . ' ' . $student->last_name;
        
        if ($student->profile_image) {
            Storage::disk('public')->delete($student->profile_image);
        }
        
        $student->user->delete();

        return response()->json([
            'message' => "បានលុបគណនីសិស្ស '{$studentName}' ដោយជោគជ័យ"
        ]);
    }

    private function generateStudentCode()
    {
        $year = date('Y');
        $count = Student::count() + 1;
        return 'STU-' . $year . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
    }
}
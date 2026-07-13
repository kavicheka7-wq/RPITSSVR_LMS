<?php
// app/Http/Controllers/Api/DepartmentController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Student;
use App\Models\Course;
use App\Models\Teacher;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DepartmentController extends Controller
{
    /**
     * Display a listing of all departments with counts
     * GET /admin/departments
     */
    public function index()
    {
        $departments = Department::select(
                'id', 
                'department_name',
                'description',
                'created_at',
                'updated_at'
            )
            ->orderBy('department_name')
            ->get()
            ->map(function ($department) {
                // រាប់ចំនួនគ្រូ សិស្ស និងមុខវិជ្ជាក្នុងដេប៉ាតឺម៉ង់
                $teacherCount = Teacher::where('department_id', $department->id)->count();
                $studentCount = Student::where('department_id', $department->id)->count();
                $courseCount = Course::where('department_id', $department->id)->count();
                
                return [
                    'id' => $department->id,
                    'name' => $department->department_name,
                    'department_name' => $department->department_name,
                    'description' => $department->description,
                    'teachers_count' => $teacherCount,
                    'students_count' => $studentCount,
                    'courses_count' => $courseCount,
                    'users_count' => $teacherCount + $studentCount,
                    'created_at' => $department->created_at,
                    'updated_at' => $department->updated_at,
                ];
            });

        return response()->json(['data' => $departments]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:departments,department_name',
            'description' => 'nullable|string',
        ]);

        $department = Department::create([
            'department_name' => $validated['name'],
            'description' => $validated['description'] ?? null,
        ]);

        return response()->json([
            'message' => 'Department created successfully',
            'data' => [
                'id' => $department->id,
                'name' => $department->department_name,
                'department_name' => $department->department_name,
                'description' => $department->description,
                'teachers_count' => 0,
                'students_count' => 0,
                'courses_count' => 0,
                'users_count' => 0,
            ]
        ], 201);
    }

    public function update(Request $request, Department $department)
    {
        $validated = $request->validate([
            'name' => [
                'required', 
                'string', 
                'max:255', 
                Rule::unique('departments', 'department_name')->ignore($department->id)
            ],
            'description' => 'nullable|string',
        ]);

        $department->update([
            'department_name' => $validated['name'],
            'description' => $validated['description'] ?? null,
        ]);

        // ទាញយកចំនួនថ្មី
        $teacherCount = Teacher::where('department_id', $department->id)->count();
        $studentCount = Student::where('department_id', $department->id)->count();
        $courseCount = Course::where('department_id', $department->id)->count();

        return response()->json([
            'message' => 'Department updated successfully',
            'data' => [
                'id' => $department->id,
                'name' => $department->department_name,
                'department_name' => $department->department_name,
                'description' => $department->description,
                'teachers_count' => $teacherCount,
                'students_count' => $studentCount,
                'courses_count' => $courseCount,
                'users_count' => $teacherCount + $studentCount,
            ]
        ]);
    }

    public function destroy(Department $department)
    {
        // ពិនិត្យមើលថាតើមានគ្រូ សិស្ស ឬមុខវិជ្ជាក្នុងដេប៉ាតឺម៉ង់នេះដែរឬទេ
        $teacherCount = Teacher::where('department_id', $department->id)->count();
        $studentCount = Student::where('department_id', $department->id)->count();
        $courseCount = Course::where('department_id', $department->id)->count();
        
        if ($teacherCount > 0 || $studentCount > 0 || $courseCount > 0) {
            return response()->json([
                'message' => 'មិនអាចលុបដេប៉ាតឺម៉ង់ដែលមានគ្រូ សិស្ស ឬមុខវិជ្ជាបានទេ'
            ], 400);
        }

        $department->delete();

        return response()->json([
            'message' => 'Department deleted successfully'
        ]);
    }

    /**
     * Get department statistics
     * GET /admin/departments/stats
     */
    public function getStats()
    {
        $stats = [
            'total_departments' => Department::count(),
            'total_teachers' => Teacher::count(),
            'total_students' => Student::count(),
            'total_courses' => Course::count(),
            'departments_with_most_teachers' => Department::withCount('teachers')
                ->orderBy('teachers_count', 'desc')
                ->limit(5)
                ->get()
                ->map(function ($dept) {
                    return [
                        'name' => $dept->department_name,
                        'count' => $dept->teachers_count,
                    ];
                }),
            'departments_with_most_students' => Department::withCount('students')
                ->orderBy('students_count', 'desc')
                ->limit(5)
                ->get()
                ->map(function ($dept) {
                    return [
                        'name' => $dept->department_name,
                        'count' => $dept->students_count,
                    ];
                }),
        ];

        return response()->json(['data' => $stats]);
    }
}
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
use Illuminate\Support\Facades\Cache;

class DepartmentController extends Controller
{
    /**
     * Display a listing of all departments with counts
     * GET /admin/departments
     */
    public function index()
    {
        $departments = Department::select([
                'id', 
                'department_name',
                'description',
                'created_at',
                'updated_at'
            ])
            ->withCount(['teachers', 'students', 'courses'])
            ->orderBy('department_name')
            ->get()
            ->map(function ($department) {
                $teachersCount = (int) $department->teachers_count;
                $studentsCount = (int) $department->students_count;
                $coursesCount = (int) $department->courses_count;

                return [
                    'id' => $department->id,
                    'name' => $department->department_name,
                    'department_name' => $department->department_name,
                    'description' => $department->description,
                    'teachers_count' => $teachersCount,
                    'students_count' => $studentsCount,
                    'courses_count' => $coursesCount,
                    'users_count' => $teachersCount + $studentsCount,
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

        // ✅ Clear cached reports & dashboard stats
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

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

        // ✅ Clear cached reports & dashboard stats
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        // ទាញយកចំនួនថ្មីតាមរយៈ loadCount
        $department->loadCount(['teachers', 'students', 'courses']);
        $teacherCount = (int) $department->teachers_count;
        $studentCount = (int) $department->students_count;
        $courseCount = (int) $department->courses_count;

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
        $department->loadCount(['teachers', 'students', 'courses']);
        
        if ($department->teachers_count > 0 || $department->students_count > 0 || $department->courses_count > 0) {
            return response()->json([
                'message' => 'មិនអាចលុបដេប៉ាតឺម៉ង់ដែលមានគ្រូ សិស្ស ឬមុខវិជ្ជាបានទេ'
            ], 400);
        }

        $department->delete();

        // ✅ Clear cached reports & dashboard stats
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

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
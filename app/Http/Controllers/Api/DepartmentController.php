<?php
// app/Http/Controllers/Api/DepartmentController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Department;
use App\Models\Student;
use App\Models\Teacher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class DepartmentController extends Controller
{
    /**
     * រៀបចំទម្រង់ទិន្នន័យ Department ឱ្យស៊ីគ្នាគ្រប់ទំព័រទាំងអស់
     */
    private function formatDepartmentPayload(Department $department, bool $hasCodeCol = false): array
    {
        $teachersCount = (int) ($department->teachers_count ?? 0);
        $studentsCount = (int) ($department->students_count ?? 0);
        $coursesCount = (int) ($department->courses_count ?? 0);

        $payload = [
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

        if ($hasCodeCol) {
            $payload['department_code'] = $department->department_code;
        }

        return $payload;
    }

    /**
     * Display a listing of all departments with counts
     * GET /admin/departments
     */
    public function index(Request $request)
    {
        $hasCodeCol = Schema::hasColumn('departments', 'department_code');

        $selectCols = [
            'id',
            'department_name',
            'description',
            'created_at',
            'updated_at',
        ];

        if ($hasCodeCol) {
            $selectCols[] = 'department_code';
        }

        $query = Department::select($selectCols)
            ->withCount(['teachers', 'students', 'courses']);

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search, $hasCodeCol) {
                $q->where('department_name', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
                if ($hasCodeCol) {
                    $q->orWhere('department_code', 'like', "%{$search}%");
                }
            });
        }

        $departments = $query
            ->orderBy('department_name')
            ->get()
            ->map(fn ($dept) => $this->formatDepartmentPayload($dept, $hasCodeCol));

        return response()->json(['data' => $departments]);
    }

    /**
     * Display a single department
     * GET /admin/departments/{department}
     */
    public function show(Department $department)
    {
        $hasCodeCol = Schema::hasColumn('departments', 'department_code');
        $department->loadCount(['teachers', 'students', 'courses']);

        return response()->json([
            'data' => $this->formatDepartmentPayload($department, $hasCodeCol),
        ]);
    }

    public function store(Request $request)
    {
        // គាំទ្រទាំងករណី Frontend បញ្ជូនមកជា 'name' ឬ 'department_name'
        $resolvedName = trim((string) ($request->input('name') ?? $request->input('department_name') ?? ''));
        $request->merge(['name' => $resolvedName]);

        $hasCodeCol = Schema::hasColumn('departments', 'department_code');

        $rules = [
            'name' => 'required|string|max:255|unique:departments,department_name',
            'description' => 'nullable|string',
        ];

        if ($hasCodeCol) {
            $rules['department_code'] = 'nullable|string|max:50';
        }

        $validated = $request->validate($rules);

        $createData = [
            'department_name' => $validated['name'],
            'description' => $validated['description'] ?? null,
        ];

        if ($hasCodeCol && array_key_exists('department_code', $validated)) {
            $createData['department_code'] = $validated['department_code']
                ? trim($validated['department_code'])
                : null;
        }

        $department = Department::create($createData);

        // ✅ Clear cached reports & dashboard stats
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => 'Department created successfully',
            'data' => $this->formatDepartmentPayload($department, $hasCodeCol),
        ], 201);
    }

    public function update(Request $request, Department $department)
    {
        // គាំទ្រទាំងករណី Frontend បញ្ជូនមកជា 'name' ឬ 'department_name'
        $resolvedName = trim((string) ($request->input('name') ?? $request->input('department_name') ?? ''));
        $request->merge(['name' => $resolvedName]);

        $hasCodeCol = Schema::hasColumn('departments', 'department_code');

        $rules = [
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('departments', 'department_name')->ignore($department->id),
            ],
            'description' => 'nullable|string',
        ];

        if ($hasCodeCol) {
            $rules['department_code'] = 'nullable|string|max:50';
        }

        $validated = $request->validate($rules);

        $updateData = [
            'department_name' => $validated['name'],
            'description' => $validated['description'] ?? null,
        ];

        if ($hasCodeCol && array_key_exists('department_code', $validated)) {
            $updateData['department_code'] = $validated['department_code']
                ? trim($validated['department_code'])
                : null;
        }

        $department->update($updateData);

        // ✅ Clear cached reports & dashboard stats
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        // ទាញយកចំនួនថ្មីតាមរយៈ loadCount
        $department->loadCount(['teachers', 'students', 'courses']);

        return response()->json([
            'message' => 'Department updated successfully',
            'data' => $this->formatDepartmentPayload($department, $hasCodeCol),
        ]);
    }

    public function destroy(Department $department)
    {
        // ពិនិត្យមើលថាតើមានគ្រូ សិស្ស ឬមុខវិជ្ជាក្នុងដេប៉ាតឺម៉ង់នេះដែរឬទេ
        $department->loadCount(['teachers', 'students', 'courses']);

        if (
            $department->teachers_count > 0 ||
            $department->students_count > 0 ||
            $department->courses_count > 0
        ) {
            return response()->json([
                'message' => 'មិនអាចលុបដេប៉ាតឺម៉ង់ដែលមានគ្រូ សិស្ស ឬមុខវិជ្ជាបានទេ',
            ], 400);
        }

        $department->delete();

        // ✅ Clear cached reports & dashboard stats
        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        return response()->json([
            'message' => 'Department deleted successfully',
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
                        'count' => (int) $dept->teachers_count,
                    ];
                }),
            'departments_with_most_students' => Department::withCount('students')
                ->orderBy('students_count', 'desc')
                ->limit(5)
                ->get()
                ->map(function ($dept) {
                    return [
                        'name' => $dept->department_name,
                        'count' => (int) $dept->students_count,
                    ];
                }),
        ];

        return response()->json(['data' => $stats]);
    }
}
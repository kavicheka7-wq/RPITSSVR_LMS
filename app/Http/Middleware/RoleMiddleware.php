<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class RoleMiddleware
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @param  mixed  ...$roles
     * @return mixed
     */
    public function handle(Request $request, Closure $next, ...$roles)
    {
        $user = $request->user();

        // 1. Check if the user is authenticated at all
        if (!$user) {
            return response()->json([
                'message' => 'Unauthorized',
            ], 401);
        }

        // 2. Check if the user account has been deactivated by Admin
        if (isset($user->status) && strtolower((string) $user->status) === 'inactive') {
            return response()->json([
                'message' => 'គណនីរបស់អ្នកត្រូវបានផ្អាកដំណើរការដោយអ្នកគ្រប់គ្រងប្រព័ន្ធ!',
            ], 403);
        }

        // 3. Safely retrieve and normalize the user's role (supports both role relationship and role_id fallback)
        $rawRoleName = $user->role?->role_name ?? $user->role?->name ?? '';
        $normalizedUserRole = strtolower(trim((string) $rawRoleName));

        if ($normalizedUserRole === '') {
            $roleId = (int) ($user->role_id ?? 0);
            $normalizedUserRole = match ($roleId) {
                1 => 'admin',
                2 => 'teacher',
                3 => 'student',
                default => '',
            };
        }

        // 4. Normalize allowed roles (supports both comma and pipe separators, case-insensitive)
        $allowedRoles = [];
        foreach ($roles as $roleGroup) {
            foreach (preg_split('/[|,]/', (string) $roleGroup) as $r) {
                $clean = strtolower(trim($r));
                if ($clean !== '') {
                    $allowedRoles[] = $clean;
                }
            }
        }

        // 5. Check if the role is missing OR doesn't match the required roles
        if ($normalizedUserRole === '' || (!empty($allowedRoles) && !in_array($normalizedUserRole, $allowedRoles, true))) {
            return response()->json([
                'message' => 'Forbidden - Insufficient permissions',
            ], 403);
        }

        // 6. Everything checks out, proceed with the request
        return $next($request);
    }
}
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
        // 1. Check if the user is authenticated at all
        if (!$request->user()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 401);
        }

        // 2. Safely retrieve the user's role name using the null-safe operator (?->)
        // This prevents the application from crashing if the user exists but has no role assigned.
        $userRole = $request->user()->role?->role_name;
        
        // 3. Check if the role is completely missing OR if it doesn't match the required roles
        if (!$userRole || !in_array($userRole, $roles)) {
            return response()->json([
                'message' => 'Forbidden - Insufficient permissions'
            ], 403);
        }

        // 4. Everything checks out, proceed with the request
        return $next($request);
        // អនុញ្ញាតឲ្យឆ្លងកាត់ជាបណ្តោះអាសន្ន ដើម្បីកុំឲ្យ Error 500
        return $next($request);
    }
    
}
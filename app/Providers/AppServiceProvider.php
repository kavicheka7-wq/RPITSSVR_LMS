<?php

namespace App\Providers;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
     public function boot()
    {
        // Register middleware aliases
        Route::aliasMiddleware('role', \App\Http\Middleware\RoleMiddleware::class);
    }
}

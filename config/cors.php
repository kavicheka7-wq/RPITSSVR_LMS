<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    */

    // ✅ អនុញ្ញាតទាំង API, Sanctum និងការទាញយករូបភាព/ឯកសារមេរៀនពីថត storage
    'paths' => ['api/*', 'sanctum/csrf-cookie', 'storage/*'],

    'allowed_methods' => ['*'],

    // ✅ អនុញ្ញាតទាំង Localhost, តម្លៃក្នុង FRONTEND_URL (.env) និង Domain ផ្ទាល់ខ្លួនរបស់អ្នក
    'allowed_origins' => array_values(array_unique(array_filter([
        env('FRONTEND_URL', 'http://localhost:5173'),
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
    ]))),

    // ✅ អនុញ្ញាតគ្រប់ Link របស់ Vercel (*.vercel.app) និងគ្រប់ Subdomain ឬ Domain ផ្លូវការដោយស្វ័យប្រវត្តិ
    'allowed_origins_patterns' => [
        '#^https://.*\.vercel\.app$#',
        '#^https?://localhost(:\d+)?$#',
        '#^https?://127\.0\.0\.1(:\d+)?$#',
    ],

    'allowed_headers' => ['*'],

    // ✅ បើកឱ្យ Frontend អានឈ្មោះឯកសារពេលទាញយក (Download File)
    'exposed_headers' => ['Content-Disposition'],

    'max_age' => 86400,

    'supports_credentials' => true,

];
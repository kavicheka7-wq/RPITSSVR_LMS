<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie', 'storage/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_unique(array_filter([
        env('FRONTEND_URL', 'http://localhost:5173'),
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
    ]))),

    'allowed_origins_patterns' => [
        '#^https://.*\.vercel\.app$#',
        '#^https?://localhost(:\d+)?$#',
        '#^https?://127\.0\.0\.1(:\d+)?$#',
        '#^https://(.*\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$#', // ✅ បន្ថែមបន្ទាត់នេះ ដើម្បីអនុញ្ញាតគ្រប់ Custom Domain ទាំងអស់ដោយស្វ័យប្រវត្តិ
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => ['Content-Disposition'],

    'max_age' => 86400,

    'supports_credentials' => true,

];
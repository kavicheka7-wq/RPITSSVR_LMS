<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie', 'storage/*', 'download-file*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_unique(array_filter([
        rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/'),
        'https://lmsrpitssvr.site',
        'https://www.lmsrpitssvr.site',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
    ]))),

    'allowed_origins_patterns' => [
        '#^https://([a-zA-Z0-9-]+\.)?lmsrpitssvr\.site$#',
        '#^https://.*\.vercel\.app$#',
        '#^https://.*\.up\.railway\.app$#',
        '#^https?://localhost(:\d+)?$#',
        '#^https?://127\.0\.0\.1(:\d+)?$#',
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => ['Content-Disposition'],

    'max_age' => 86400,

    'supports_credentials' => true,

];
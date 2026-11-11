FROM php:8.4-cli

# 1. ដំឡើង System Dependencies (បន្ថែម libzip-dev សម្រាប់គាំទ្រ Excel/Word/Zip)
RUN apt-get update && apt-get install -y \
    git curl libpng-dev libonig-dev libxml2-dev libzip-dev zip unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2. ដំឡើង PHP Extensions (បន្ថែម zip)
RUN docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd zip

# 2.1 បង្កើនទំហំអនុញ្ញាតឱ្យ Upload ឯកសារ (ពី 2MB ទៅ 64MB) និង Memory Limit សម្រាប់ PDF/Excel/Base64
RUN echo "upload_max_filesize=64M\npost_max_size=64M\nmemory_limit=512M\nmax_execution_time=300" > /usr/local/etc/php/conf.d/uploads.ini

# 3. ទាញយក Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# 4. កំណត់ Working Directory
WORKDIR /app

# 5. Copy កូដចូលក្នុង Server (កុំភ្លេចប្រាកដថាមាន .gitignore មិនឱ្យជាប់ហ្វាល់ .env មកជាមួយ)
COPY . /app
RUN rm -f .env

# 6. ដំឡើង Composer Packages
RUN composer install --no-interaction --prefer-dist --optimize-autoloader

# 7. បង្កើតថតចាំបាច់ និងកំណត់សិទ្ធិលើថត Storage និង Cache
RUN mkdir -p storage/app/public/profiles storage/app/public/lessons storage/app/public/assignments \
    storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chmod -R 777 storage bootstrap/cache

# 8. លុប Cache ចាស់ ភ្ជាប់ Storage Link រត់ Migration ដោយស្វ័យប្រវត្តិ រួចបញ្ឆេះ Server
CMD sh -c "php artisan config:clear ; php artisan route:clear ; php artisan storage:link --force ; php artisan migrate --force ; php artisan serve --host=0.0.0.0 --port=${PORT:-8080}"
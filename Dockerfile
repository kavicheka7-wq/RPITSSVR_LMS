FROM php:8.4-cli

# 1. ដំឡើង System Dependencies
RUN apt-get update && apt-get install -y \
    git curl libpng-dev libonig-dev libxml2-dev zip unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2. ដំឡើង PHP Extensions
RUN docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd

# 3. ទាញយក Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# 4. កំណត់ Working Directory
WORKDIR /app

# 5. Copy កូដចូលក្នុង Server (កុំភ្លេចប្រាកដថាមាន .gitignore មិនឱ្យជាប់ហ្វាល់ .env មកជាមួយ)
COPY . /app
RUN rm -f .env

# 6. ដំឡើង Composer Packages
RUN composer install --optimize-autoloader

# 7. កំណត់សិទ្ធិលើថត Storage និង Cache
RUN chmod -R 777 storage bootstrap/cache

# 8. លុប Cache ចាស់ រត់ Migration និង Seed ដោយស្វ័យប្រវត្តិ រួចបញ្ឆេះ Server
CMD sh -c "rm -f .env ; php artisan config:clear ; php artisan migrate --force ; php artisan db:seed --force ; php artisan serve --host=0.0.0.0 --port=${PORT:-8080}"
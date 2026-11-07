FROM php:8.4-apache

# 1. ដំឡើង System Dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    zip \
    unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2. ដំឡើង PHP Extensions សម្រាប់ Laravel
RUN docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd

# 3. ទាញយក Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# 4. កំណត់ Working Directory
WORKDIR /var/www/html

# 5. Copy កូដពីម៉ាស៊ីនចូលទៅក្នុង Container
COPY . /var/www/html

# 6. កំណត់ DocumentRoot របស់ Apache ទៅកាន់ថត public
ENV APACHE_DOCUMENT_ROOT /var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

# 7. ដោះស្រាយបញ្ហា MPM Conflict និងបើក Rewrite Module
RUN a2dismod mpm_event mpm_worker || true
RUN a2enmod mpm_prefork rewrite

# 8. កំណត់ Port ឱ្យត្រូវនឹង Railway ($PORT)
RUN sed -i "s/80/\${PORT}/g" /etc/apache2/ports.conf /etc/apache2/sites-available/000-default.conf

# 9. ដំឡើង Composer Packages (Backend)
RUN composer install --no-dev --optimize-autoloader

# 10. កំណត់សិទ្ធិលើថត Storage និង Cache
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

# 11. បើក Port និងបញ្ឆេះ Server
EXPOSE 80
CMD ["apache2-foreground"]
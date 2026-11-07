FROM php:8.4-apache

# ติดตั้ง System dependencies និង PHP extensions ចាំបាច់សម្រាប់ Laravel
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    zip \
    unzip

RUN apt-get clean && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd

# Copy Composer ពី Official Image
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# កំណត់ Working directory
WORKDIR /var/www/html

# Copy កូដទាំងអស់ចូលក្នុង Server
COPY . /var/www/html

# កំណត់ Apache DocumentRoot ឱ្យចង្អុលទៅថត public របស់ Laravel
ENV APACHE_DOCUMENT_ROOT /var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

# เปิดใช้งาน Apache Rewrite Module
RUN a2enmod rewrite

# កំណត់ Port ឱ្យស្របតាម Railway ($PORT)
RUN sed -i "s/80/\${PORT}/g" /etc/apache2/ports.conf /etc/apache2/sites-available/000-default.conf

# ติดตั้ง Composer packages សម្រាប់ Production
RUN composer install --no-dev --optimize-autoloader

# កំណត់សិទ្ធិ (Permissions) លើ Storage និង Bootstrap cache
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

EXPOSE 80
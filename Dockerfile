FROM php:8.4-apache

# 1. ដំឡើង System Dependencies
RUN apt-get update && apt-get install -y \
    git curl libpng-dev libonig-dev libxml2-dev zip unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2. ដំឡើង PHP Extensions
RUN docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd

# 3. ទាញយក Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# 4. កំណត់ Working Directory
WORKDIR /var/www/html

# 5. Copy កូដចូល
COPY . /var/www/html

# 6. កំណត់ DocumentRoot និងបើក Rewrite Module
ENV APACHE_DOCUMENT_ROOT /var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf
RUN a2enmod rewrite

# 7. វិធានការដាច់ខាត៖ លុបម៉ូឌុល MPM ដែលជាន់គ្នាចោល ហើយបើកតែ prefork
RUN rm -f /etc/apache2/mods-enabled/mpm_worker.* \
    && rm -f /etc/apache2/mods-enabled/mpm_event.* \
    && a2enmod mpm_prefork

# 8. កំណត់ Port ($PORT របស់ Railway)
RUN sed -i 's/80/${PORT}/g' /etc/apache2/sites-available/000-default.conf /etc/apache2/ports.conf

# 9. Install Composer Packages
RUN composer install --no-dev --optimize-autoloader

# 10. កំណត់សិទ្ធិ
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

# 11. បញ្ឆេះ Server
CMD ["apache2-foreground"]
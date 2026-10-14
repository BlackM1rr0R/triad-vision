-- Runs once when the MySQL volume is first created (docker-entrypoint-initdb.d).
-- The app user also needs: the e2e test database and Prisma's temporary shadow database (migrate dev).
CREATE DATABASE IF NOT EXISTS triad_vision_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON `triad_vision_test`.* TO 'triad'@'%';
GRANT ALL PRIVILEGES ON `prisma\_migrate\_shadow\_db%`.* TO 'triad'@'%';
GRANT CREATE, DROP ON *.* TO 'triad'@'%';
FLUSH PRIVILEGES;

-- CreateTable
CREATE TABLE `VacancyDistribution` (
    `vacancyId` VARCHAR(191) NOT NULL,
    `channels` JSON NOT NULL,
    `language` VARCHAR(5) NOT NULL DEFAULT 'de',
    `hideEmployer` BOOLEAN NOT NULL DEFAULT true,
    `employerLabel` VARCHAR(160) NULL,
    `applyUrl` VARCHAR(500) NULL,
    `occupationCode` VARCHAR(10) NULL,
    `baTitleCode` VARCHAR(12) NULL,
    `postalCode` VARCHAR(10) NULL,
    `weeklyHours` INTEGER NULL,
    `limited` BOOLEAN NOT NULL DEFAULT false,
    `limitedUntil` DATETIME(3) NULL,
    `startDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`vacancyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VacancyChannelState` (
    `id` VARCHAR(191) NOT NULL,
    `vacancyId` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(20) NOT NULL,
    `status` ENUM('PENDING', 'PUBLISHED', 'ERROR', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `lastExportAt` DATETIME(3) NULL,
    `error` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VacancyChannelState_channel_status_idx`(`channel`, `status`),
    UNIQUE INDEX `VacancyChannelState_vacancyId_channel_key`(`vacancyId`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobFeedConfig` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `tokenSealed` TEXT NOT NULL,
    `tokenRotatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `baSupplierId` VARCHAR(40) NULL,
    `baPartnerId` VARCHAR(40) NULL,
    `baCertSealed` MEDIUMTEXT NULL,
    `baPassSealed` TEXT NULL,
    `baUploadUrl` VARCHAR(500) NULL,
    `baUploadEnabled` BOOLEAN NOT NULL DEFAULT false,
    `baLastUploadAt` DATETIME(3) NULL,
    `baLastError` TEXT NULL,
    `feedStats` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VacancyDistribution` ADD CONSTRAINT `VacancyDistribution_vacancyId_fkey` FOREIGN KEY (`vacancyId`) REFERENCES `Vacancy`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VacancyChannelState` ADD CONSTRAINT `VacancyChannelState_vacancyId_fkey` FOREIGN KEY (`vacancyId`) REFERENCES `Vacancy`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

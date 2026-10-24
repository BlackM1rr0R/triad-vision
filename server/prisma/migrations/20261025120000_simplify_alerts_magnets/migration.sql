-- AlterTable
ALTER TABLE `StaffPreferences` ADD COLUMN `desk` VARCHAR(20) NULL,
    ADD COLUMN `navPins` JSON NULL,
    ADD COLUMN `navRecent` JSON NULL;

-- AlterTable
ALTER TABLE `Testimonial` ADD COLUMN `city` VARCHAR(80) NULL,
    ADD COLUMN `country` VARCHAR(40) NULL,
    ADD COLUMN `posterUrl` TEXT NULL,
    ADD COLUMN `profession` VARCHAR(120) NULL,
    ADD COLUMN `videoUrl` TEXT NULL,
    ADD COLUMN `visaType` VARCHAR(30) NULL;

-- CreateTable
CREATE TABLE `AdminPageVisit` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `navId` VARCHAR(60) NOT NULL,
    `day` DATE NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,

    INDEX `AdminPageVisit_navId_day_idx`(`navId`, `day`),
    INDEX `AdminPageVisit_day_idx`(`day`),
    UNIQUE INDEX `AdminPageVisit_userId_navId_day_key`(`userId`, `navId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobAlert` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `userId` VARCHAR(40) NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'az',
    `professions` JSON NOT NULL,
    `germanLevel` VARCHAR(4) NULL,
    `visaTypes` JSON NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `confirmedAt` DATETIME(3) NULL,
    `lastSentAt` DATETIME(3) NULL,
    `sentCount` INTEGER NOT NULL DEFAULT 0,
    `unsubscribedAt` DATETIME(3) NULL,
    `visitorId` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `JobAlert_tokenHash_key`(`tokenHash`),
    INDEX `JobAlert_email_idx`(`email`),
    INDEX `JobAlert_confirmedAt_idx`(`confirmedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadMagnet` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `title` JSON NOT NULL,
    `description` JSON NULL,
    `coverUrl` TEXT NULL,
    `files` JSON NOT NULL,
    `published` BOOLEAN NOT NULL DEFAULT true,
    `downloads` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LeadMagnet_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


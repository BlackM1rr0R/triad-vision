-- AlterTable
ALTER TABLE `Inquiry` ADD COLUMN `source` VARCHAR(80) NULL;

-- CreateTable
CREATE TABLE `PlacementMapEntry` (
    `id` VARCHAR(191) NOT NULL,
    `cityKey` VARCHAR(80) NOT NULL,
    `city` VARCHAR(80) NOT NULL,
    `mode` VARCHAR(12) NOT NULL DEFAULT 'OVERRIDE',
    `workers` INTEGER NOT NULL DEFAULT 0,
    `professions` JSON NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `note` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

UNIQUE INDEX `PlacementMapEntry_cityKey_key`(`cityKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InfoEvent` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `title` JSON NOT NULL,
    `description` JSON NOT NULL,
    `mode` ENUM('ONLINE', 'OFFLINE') NOT NULL DEFAULT 'ONLINE',
    `meetingUrl` TEXT NULL,
    `address` TEXT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `capacity` INTEGER NULL,
    `language` VARCHAR(8) NOT NULL DEFAULT 'az',
    `status` ENUM('DRAFT', 'PUBLISHED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `followUpNote` JSON NULL,
    `followUpSentAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

UNIQUE INDEX `InfoEvent_slug_key`(`slug`),
    INDEX `InfoEvent_status_startsAt_idx`(`status`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InfoEventRegistration` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(200) NOT NULL,
    `phone` VARCHAR(40) NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'az',
    `attendance` ENUM('REGISTERED', 'CHECKED_IN', 'NO_SHOW') NOT NULL DEFAULT 'REGISTERED',
    `checkedInAt` DATETIME(3) NULL,
    `markedById` VARCHAR(191) NULL,
    `inquiryId` VARCHAR(191) NULL,
    `consentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `followUpSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

INDEX `InfoEventRegistration_eventId_attendance_idx`(`eventId`, `attendance`),
    UNIQUE INDEX `InfoEventRegistration_eventId_email_key`(`eventId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientReferralCode` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

UNIQUE INDEX `ClientReferralCode_userId_key`(`userId`),
    UNIQUE INDEX `ClientReferralCode_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientReferral` (
    `id` VARCHAR(191) NOT NULL,
    `referrerId` VARCHAR(191) NOT NULL,
    `referredId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `stage` ENUM('REGISTERED', 'CASE_OPENED', 'VISA_APPROVED', 'BLOCKED') NOT NULL DEFAULT 'REGISTERED',
    `blockedReason` VARCHAR(40) NULL,
    `caseOpenedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

UNIQUE INDEX `ClientReferral_referredId_key`(`referredId`),
    INDEX `ClientReferral_referrerId_idx`(`referrerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReferralReward` (
    `id` VARCHAR(191) NOT NULL,
    `referralId` VARCHAR(191) NOT NULL,
    `referrerId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(12) NOT NULL DEFAULT 'DISCOUNT',
    `trigger` VARCHAR(16) NOT NULL DEFAULT 'VISA_APPROVED',
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'AZN',
    `status` ENUM('PENDING', 'EARNED', 'PAID', 'USED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `earnedAt` DATETIME(3) NULL,
    `settledAt` DATETIME(3) NULL,
    `settledById` VARCHAR(191) NULL,
    `note` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

UNIQUE INDEX `ReferralReward_referralId_key`(`referralId`),
    INDEX `ReferralReward_referrerId_status_idx`(`referrerId`, `status`),
    INDEX `ReferralReward_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InfoEventRegistration` ADD CONSTRAINT `InfoEventRegistration_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `InfoEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientReferralCode` ADD CONSTRAINT `ClientReferralCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientReferral` ADD CONSTRAINT `ClientReferral_referrerId_fkey` FOREIGN KEY (`referrerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientReferral` ADD CONSTRAINT `ClientReferral_referredId_fkey` FOREIGN KEY (`referredId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralReward` ADD CONSTRAINT `ReferralReward_referralId_fkey` FOREIGN KEY (`referralId`) REFERENCES `ClientReferral`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

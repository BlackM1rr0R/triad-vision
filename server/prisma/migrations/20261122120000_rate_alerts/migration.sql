-- EUR → AZN rate alerts (lib/rateAlerts): double opt-in (visitors) or account alerts, one e-mail when the CBAR rate
-- crosses the target, then paused until re-armed; 6-month expiry. Plain user id (no foreign key), like job alerts.

-- CreateTable
CREATE TABLE `RateAlert` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `userId` VARCHAR(40) NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'az',
    `direction` VARCHAR(4) NOT NULL,
    `target` DOUBLE NOT NULL,
    `consentVersion` VARCHAR(20) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `pausedAt` DATETIME(3) NULL,
    `lastSentAt` DATETIME(3) NULL,
    `lastRate` DOUBLE NULL,
    `lastRateDate` VARCHAR(10) NULL,
    `sentCount` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,
    `expiredAt` DATETIME(3) NULL,
    `unsubscribedAt` DATETIME(3) NULL,
    `visitorId` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RateAlert_email_idx`(`email`),
    INDEX `RateAlert_userId_idx`(`userId`),
    INDEX `RateAlert_confirmedAt_unsubscribedAt_idx`(`confirmedAt`, `unsubscribedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

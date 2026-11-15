-- Germany job search (/jobs/germany): saved ("heart") listings of signed-in clients (small snapshot only) and
-- "notify me about new jobs like this" alerts (double opt-in, daily / weekly) with the listing ids already sent.
CREATE TABLE `SavedGermanyJob` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `listingId` VARCHAR(160) NOT NULL,
    `source` VARCHAR(20) NOT NULL,
    `title` VARCHAR(300) NOT NULL,
    `company` VARCHAR(200) NULL,
    `location` VARCHAR(200) NULL,
    `url` VARCHAR(1000) NOT NULL,
    `jobType` VARCHAR(12) NOT NULL DEFAULT 'job',
    `postedAt` DATETIME(3) NULL,
    `goneAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SavedGermanyJob_userId_createdAt_idx`(`userId`, `createdAt`),
    UNIQUE INDEX `SavedGermanyJob_userId_listingId_key`(`userId`, `listingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GermanyJobAlert` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `userId` VARCHAR(40) NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'az',
    `q` VARCHAR(100) NOT NULL DEFAULT '',
    `place` VARCHAR(100) NOT NULL DEFAULT '',
    `radius` INTEGER NOT NULL DEFAULT 25,
    `jobType` VARCHAR(12) NOT NULL DEFAULT 'job',
    `workTime` VARCHAR(8) NOT NULL DEFAULT 'any',
    `remote` BOOLEAN NOT NULL DEFAULT false,
    `visa` BOOLEAN NOT NULL DEFAULT false,
    `frequency` VARCHAR(8) NOT NULL DEFAULT 'daily',
    `tokenHash` CHAR(64) NOT NULL,
    `consentVersion` VARCHAR(20) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `lastRunAt` DATETIME(3) NULL,
    `lastSentAt` DATETIME(3) NULL,
    `sentCount` INTEGER NOT NULL DEFAULT 0,
    `unsubscribedAt` DATETIME(3) NULL,
    `visitorId` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GermanyJobAlert_tokenHash_key`(`tokenHash`),
    INDEX `GermanyJobAlert_email_idx`(`email`),
    INDEX `GermanyJobAlert_userId_idx`(`userId`),
    INDEX `GermanyJobAlert_confirmedAt_unsubscribedAt_idx`(`confirmedAt`, `unsubscribedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GermanyJobAlertSent` (
    `alertId` VARCHAR(191) NOT NULL,
    `listingId` VARCHAR(160) NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GermanyJobAlertSent_sentAt_idx`(`sentAt`),
    PRIMARY KEY (`alertId`, `listingId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GermanyJobAlertSent` ADD CONSTRAINT `GermanyJobAlertSent_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `GermanyJobAlert`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

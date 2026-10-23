-- AlterTable
ALTER TABLE `User` ADD COLUMN `marketingOptIn` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `marketingOptInAt` DATETIME(3) NULL,
    ADD COLUMN `marketingOptInSource` VARCHAR(40) NULL;

-- CreateTable
CREATE TABLE `CampaignSegment` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `definition` JSON NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Campaign` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `kind` ENUM('SERVICE', 'MARKETING') NOT NULL DEFAULT 'SERVICE',
    `status` ENUM('DRAFT', 'SCHEDULED', 'SENDING', 'PAUSED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `segmentId` VARCHAR(191) NULL,
    `segmentSnapshot` JSON NULL,
    `channels` JSON NOT NULL,
    `content` JSON NOT NULL,
    `links` JSON NULL,
    `scheduledAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `pausedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `emailsPerMinute` INTEGER NOT NULL DEFAULT 30,
    `smsPerMinute` INTEGER NOT NULL DEFAULT 10,
    `quietHours` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Campaign_status_scheduledAt_idx`(`status`, `scheduledAt`),
    INDEX `Campaign_segmentId_idx`(`segmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CampaignRecipient` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `channel` ENUM('EMAIL', 'SMS', 'IN_APP') NOT NULL,
    `locale` ENUM('az', 'de', 'en', 'ru') NOT NULL,
    `status` ENUM('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED', 'BOUNCED') NOT NULL DEFAULT 'QUEUED',
    `skipReason` VARCHAR(40) NULL,
    `token` VARCHAR(64) NOT NULL,
    `address` VARCHAR(200) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NULL,
    `lastAttemptAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `openedAt` DATETIME(3) NULL,
    `clickedAt` DATETIME(3) NULL,
    `clicks` INTEGER NOT NULL DEFAULT 0,
    `unsubscribedAt` DATETIME(3) NULL,
    `notificationId` VARCHAR(191) NULL,
    `outboundId` VARCHAR(191) NULL,
    `providerId` VARCHAR(120) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CampaignRecipient_token_key`(`token`),
    INDEX `CampaignRecipient_campaignId_status_idx`(`campaignId`, `status`),
    INDEX `CampaignRecipient_campaignId_channel_status_idx`(`campaignId`, `channel`, `status`),
    INDEX `CampaignRecipient_channel_lastAttemptAt_idx`(`channel`, `lastAttemptAt`),
    INDEX `CampaignRecipient_userId_idx`(`userId`),
    INDEX `CampaignRecipient_providerId_idx`(`providerId`),
    INDEX `CampaignRecipient_status_lastAttemptAt_idx`(`status`, `lastAttemptAt`),
    UNIQUE INDEX `CampaignRecipient_campaignId_userId_channel_key`(`campaignId`, `userId`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CampaignSegment` ADD CONSTRAINT `CampaignSegment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_segmentId_fkey` FOREIGN KEY (`segmentId`) REFERENCES `CampaignSegment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignRecipient` ADD CONSTRAINT `CampaignRecipient_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignRecipient` ADD CONSTRAINT `CampaignRecipient_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: users who already agreed to (or withdrew) marketing e-mail in the privacy centre keep that state.
UPDATE `User` u
JOIN (
    SELECT c.userId, c.granted, c.createdAt, c.source
    FROM `ConsentRecord` c
    JOIN (
        SELECT userId, MAX(createdAt) AS lastAt
        FROM `ConsentRecord`
        WHERE type = 'MARKETING_EMAIL' AND userId IS NOT NULL
        GROUP BY userId
    ) l ON l.userId = c.userId AND l.lastAt = c.createdAt
    WHERE c.type = 'MARKETING_EMAIL'
) x ON x.userId = u.id
SET u.marketingOptIn = x.granted, u.marketingOptInAt = x.createdAt, u.marketingOptInSource = LEFT(x.source, 40);

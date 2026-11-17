-- Automatic Google review requests (lib/googleReview): one row per trigger event (rating-first flow, reminder, stats).

-- CreateTable
CREATE TABLE `GoogleReviewInvite` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `caseId` VARCHAR(40) NULL,
    `trigger` VARCHAR(12) NOT NULL,
    `dedupeKey` VARCHAR(80) NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `locale` VARCHAR(5) NOT NULL,
    `holdUntil` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `remindedAt` DATETIME(3) NULL,
    `openedAt` DATETIME(3) NULL,
    `rating` INTEGER NULL,
    `ratedAt` DATETIME(3) NULL,
    `feedback` TEXT NULL,
    `feedbackAt` DATETIME(3) NULL,
    `googleClickedAt` DATETIME(3) NULL,
    `googleClicks` INTEGER NOT NULL DEFAULT 0,
    `staffTaskId` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GoogleReviewInvite_dedupeKey_key`(`dedupeKey`),
    INDEX `GoogleReviewInvite_userId_sentAt_idx`(`userId`, `sentAt`),
    INDEX `GoogleReviewInvite_status_holdUntil_idx`(`status`, `holdUntil`),
    INDEX `GoogleReviewInvite_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

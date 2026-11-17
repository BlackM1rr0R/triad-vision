-- Access Center › Audit: quarterly access reviews, record-access counter (anomaly alerts)

-- CreateTable
CREATE TABLE `AccessReview` (
    `id` VARCHAR(191) NOT NULL,
    `quarter` VARCHAR(10) NOT NULL,
    `summary` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `completedById` VARCHAR(40) NULL,

    UNIQUE INDEX `AccessReview_quarter_key`(`quarter`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccessReviewItem` (
    `id` VARCHAR(191) NOT NULL,
    `reviewId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `reasons` JSON NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    `note` VARCHAR(500) NULL,
    `decidedById` VARCHAR(40) NULL,
    `decidedAt` DATETIME(3) NULL,

    INDEX `AccessReviewItem_reviewId_idx`(`reviewId`),
    INDEX `AccessReviewItem_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffRecordAccess` (
    `userId` VARCHAR(40) NOT NULL,
    `record` VARCHAR(80) NOT NULL,
    `hour` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,

    INDEX `StaffRecordAccess_hour_idx`(`hour`),
    PRIMARY KEY (`userId`, `record`, `hour`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AccessReviewItem` ADD CONSTRAINT `AccessReviewItem_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `AccessReview`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

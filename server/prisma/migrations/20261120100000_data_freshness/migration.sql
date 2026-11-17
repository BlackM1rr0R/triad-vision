-- Data freshness registry (lib/dataFreshness): "mark reviewed" history per registry item.

-- CreateTable
CREATE TABLE `DataFreshnessReview` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(80) NOT NULL,
    `reviewedById` VARCHAR(40) NULL,
    `reviewerName` VARCHAR(200) NOT NULL,
    `note` VARCHAR(1000) NULL,
    `settledDue` VARCHAR(10) NULL,
    `nextDue` VARCHAR(10) NULL,
    `reviewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DataFreshnessReview_itemId_reviewedAt_idx`(`itemId`, `reviewedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

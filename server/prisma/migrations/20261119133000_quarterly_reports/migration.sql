-- Quarterly labour mobility report (lib/quarterlyReport): intro texts, publish state and the frozen aggregates.

-- CreateTable
CREATE TABLE `QuarterlyReport` (
    `id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `quarter` INTEGER NOT NULL,
    `intro` JSON NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NULL,
    `snapshot` JSON NULL,
    `generatedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(40) NULL,
    `updatedById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `QuarterlyReport_year_quarter_key`(`year`, `quarter`),
    INDEX `QuarterlyReport_published_year_idx`(`published`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

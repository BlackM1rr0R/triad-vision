-- CreateTable
CREATE TABLE `ManagementReport` (
    `id` VARCHAR(191) NOT NULL,
    `weekStart` DATETIME(3) NOT NULL,
    `data` JSON NOT NULL,
    `narrative` JSON NULL,
    `model` VARCHAR(120) NULL,
    `costMicros` INTEGER NOT NULL DEFAULT 0,
    `sentTo` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ManagementReport_weekStart_key`(`weekStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecurityAlert` (
    `id` VARCHAR(191) NOT NULL,
    `rule` VARCHAR(40) NOT NULL,
    `severity` VARCHAR(8) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    `fingerprint` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `ip` VARCHAR(64) NULL,
    `facts` JSON NOT NULL,
    `eventIds` JSON NOT NULL,
    `hits` INTEGER NOT NULL DEFAULT 1,
    `explanation` JSON NULL,
    `actions` JSON NULL,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SecurityAlert_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `SecurityAlert_fingerprint_lastSeenAt_idx`(`fingerprint`, `lastSeenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

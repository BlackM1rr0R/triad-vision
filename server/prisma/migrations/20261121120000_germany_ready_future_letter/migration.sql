-- Germany Ready (practice results, certificate, weekly challenge) and the letter to my future self (plain ids, no foreign keys).
-- CreateTable
CREATE TABLE `ReadyActivityResult` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `activityId` VARCHAR(40) NOT NULL,
    `item` VARCHAR(40) NOT NULL DEFAULT '',
    `score` INTEGER NOT NULL,
    `max` INTEGER NOT NULL,
    `percent` INTEGER NOT NULL,
    `completedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ReadyActivityResult_userId_activityId_item_completedAt_key`(`userId`, `activityId`, `item`, `completedAt`),
    INDEX `ReadyActivityResult_userId_completedAt_idx`(`userId`, `completedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReadyCertificate` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `level` VARCHAR(10) NOT NULL,
    `points` INTEGER NOT NULL,
    `activities` INTEGER NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `levelAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(40) NULL,
    `revokeReason` VARCHAR(300) NULL,

    UNIQUE INDEX `ReadyCertificate_userId_key`(`userId`),
    UNIQUE INDEX `ReadyCertificate_number_key`(`number`),
    UNIQUE INDEX `ReadyCertificate_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReadyChallengeCompletion` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `week` VARCHAR(8) NOT NULL,
    `challengeKey` VARCHAR(40) NOT NULL,
    `completedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ReadyChallengeCompletion_userId_week_key`(`userId`, `week`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FutureLetter` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `sealed` TEXT NOT NULL,
    `deliverOn` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `deliveredVia` VARCHAR(10) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FutureLetter_userId_key`(`userId`),
    INDEX `FutureLetter_deliveredAt_deliverOn_idx`(`deliveredAt`, `deliverOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- CreateTable
CREATE TABLE `WebPushSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `endpointHash` CHAR(64) NOT NULL,
    `endpoint` TEXT NOT NULL,
    `p256dh` VARCHAR(200) NOT NULL,
    `auth` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userAgent` VARCHAR(300) NULL,
    `lastError` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WebPushSubscription_endpointHash_key`(`endpointHash`),
    INDEX `WebPushSubscription_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CasePublicStatus` (
    `caseId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `tokenHash` CHAR(64) NULL,
    `tokenCreatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CasePublicStatus_tokenHash_key`(`tokenHash`),
    PRIMARY KEY (`caseId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublicStatusAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `caseNumber` VARCHAR(40) NOT NULL,
    `ipHash` CHAR(64) NOT NULL,
    `success` BOOLEAN NOT NULL,
    `via` VARCHAR(10) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PublicStatusAttempt_caseNumber_createdAt_idx`(`caseNumber`, `createdAt`),
    INDEX `PublicStatusAttempt_ipHash_createdAt_idx`(`ipHash`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProblemReport` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('NEW', 'IN_PROGRESS', 'DONE', 'WONT_FIX') NOT NULL DEFAULT 'NEW',
    `message` TEXT NOT NULL,
    `pageUrl` VARCHAR(500) NOT NULL,
    `appVersion` VARCHAR(40) NULL,
    `userAgent` VARCHAR(400) NULL,
    `platform` VARCHAR(100) NULL,
    `screen` VARCHAR(40) NULL,
    `language` VARCHAR(10) NULL,
    `consoleErrors` JSON NULL,
    `lastApiError` JSON NULL,
    `userId` VARCHAR(191) NULL,
    `userRole` VARCHAR(20) NULL,
    `contactEmail` VARCHAR(200) NULL,
    `ipHash` CHAR(64) NOT NULL,
    `imageFile` VARCHAR(120) NULL,
    `imageMime` VARCHAR(40) NULL,
    `taskId` VARCHAR(191) NULL,
    `replies` JSON NULL,
    `internalNote` TEXT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProblemReport_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `ProblemReport_userId_idx`(`userId`),
    INDEX `ProblemReport_ipHash_createdAt_idx`(`ipHash`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

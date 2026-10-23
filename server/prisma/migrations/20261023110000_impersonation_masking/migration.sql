-- CreateTable
CREATE TABLE `ImpersonationSession` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `adminSessionId` VARCHAR(191) NOT NULL,
    `targetUserId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(24) NOT NULL,
    `note` VARCHAR(500) NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `returnTo` VARCHAR(300) NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(300) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `endReason` VARCHAR(16) NULL,
    `requestCount` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `ImpersonationSession_tokenHash_key`(`tokenHash`),
    INDEX `ImpersonationSession_targetUserId_startedAt_idx`(`targetUserId`, `startedAt`),
    INDEX `ImpersonationSession_adminId_startedAt_idx`(`adminId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImpersonationLog` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `windowStart` DATETIME(3) NOT NULL,
    `paths` JSON NOT NULL,
    `hits` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ImpersonationLog_sessionId_windowStart_idx`(`sessionId`, `windowStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Office TV mode: revocable read-only display tokens for the wall TV dashboard (lib/tvDisplay).
-- CreateTable
CREATE TABLE `TvDisplayToken` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `tokenPrefix` VARCHAR(16) NOT NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NULL,
    `lastSeenIp` VARCHAR(64) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(40) NULL,

    UNIQUE INDEX `TvDisplayToken_tokenHash_key`(`tokenHash`),
    INDEX `TvDisplayToken_revokedAt_idx`(`revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

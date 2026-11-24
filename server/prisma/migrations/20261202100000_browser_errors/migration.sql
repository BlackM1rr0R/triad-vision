-- Browser error log (lib/browserErrors): client errors grouped by fingerprint, count + first / last seen, handled in admin
-- "Brauzer xətaları". Rows not seen for 30 days are deleted by the daily job.

-- CreateTable
CREATE TABLE `BrowserErrorGroup` (
    `id` VARCHAR(191) NOT NULL,
    `fingerprint` CHAR(40) NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `topFrame` VARCHAR(300) NOT NULL DEFAULT '',
    `sampleStack` TEXT NULL,
    `route` VARCHAR(300) NOT NULL,
    `release` VARCHAR(40) NULL,
    `role` VARCHAR(20) NULL,
    `userId` VARCHAR(40) NULL,
    `userAgent` VARCHAR(300) NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(12) NOT NULL DEFAULT 'NEW',
    `statusAt` DATETIME(3) NULL,
    `statusById` VARCHAR(40) NULL,
    `digestedAt` DATETIME(3) NULL,
    `firstSeenAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BrowserErrorGroup_fingerprint_key`(`fingerprint`),
    INDEX `BrowserErrorGroup_status_lastSeenAt_idx`(`status`, `lastSeenAt`),
    INDEX `BrowserErrorGroup_lastSeenAt_idx`(`lastSeenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

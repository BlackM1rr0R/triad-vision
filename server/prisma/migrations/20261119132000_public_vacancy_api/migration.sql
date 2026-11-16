-- Public vacancy API for referral partners (/api/public/v1): read-only keys per partner, daily usage per key and
-- the attribution of applications made through a partner's apply link (plain ids, no foreign keys).

-- CreateTable
CREATE TABLE `PublicApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `referralPartnerId` VARCHAR(40) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `prefix` VARCHAR(16) NOT NULL,
    `keyHash` VARCHAR(64) NOT NULL,
    `rateLimitPerMinute` INTEGER NOT NULL DEFAULT 60,
    `revokedAt` DATETIME(3) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PublicApiKey_prefix_key`(`prefix`),
    UNIQUE INDEX `PublicApiKey_keyHash_key`(`keyHash`),
    INDEX `PublicApiKey_referralPartnerId_idx`(`referralPartnerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublicApiKeyUsage` (
    `id` VARCHAR(191) NOT NULL,
    `keyId` VARCHAR(40) NOT NULL,
    `day` DATE NOT NULL,
    `requests` INTEGER NOT NULL DEFAULT 0,
    `rateLimited` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `PublicApiKeyUsage_keyId_day_key`(`keyId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublicApiAttribution` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(40) NOT NULL,
    `vacancyId` VARCHAR(40) NOT NULL,
    `keyId` VARCHAR(40) NOT NULL,
    `partnerId` VARCHAR(40) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PublicApiAttribution_applicationId_key`(`applicationId`),
    INDEX `PublicApiAttribution_keyId_idx`(`keyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

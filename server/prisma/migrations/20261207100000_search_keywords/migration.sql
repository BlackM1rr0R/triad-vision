-- Search Console keyword tracker (lib/searchConsoleTracker).
CREATE TABLE `SearchKeyword` (
    `id` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(200) NOT NULL,
    `country` VARCHAR(3) NOT NULL DEFAULT '',
    `createdById` VARCHAR(40) NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SearchKeyword_keyword_country_key`(`keyword`, `country`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SearchKeywordDay` (
    `id` VARCHAR(191) NOT NULL,
    `keywordId` VARCHAR(40) NOT NULL,
    `day` DATE NOT NULL,
    `clicks` INTEGER NOT NULL DEFAULT 0,
    `impressions` INTEGER NOT NULL DEFAULT 0,
    `position` DOUBLE NOT NULL DEFAULT 0,

    UNIQUE INDEX `SearchKeywordDay_keywordId_day_key`(`keywordId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

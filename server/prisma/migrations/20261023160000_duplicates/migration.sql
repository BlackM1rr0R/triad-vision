-- AlterTable
ALTER TABLE `User` ADD COLUMN `mergedAt` DATETIME(3) NULL,
    ADD COLUMN `mergedIntoId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `DuplicatePair` (
    `id` VARCHAR(191) NOT NULL,
    `userAId` VARCHAR(191) NOT NULL,
    `userBId` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `reasons` JSON NOT NULL,
    `status` ENUM('OPEN', 'MERGED', 'NOT_DUPLICATE') NOT NULL DEFAULT 'OPEN',
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DuplicatePair_status_score_idx`(`status`, `score`),
    INDEX `DuplicatePair_userBId_idx`(`userBId`),
    UNIQUE INDEX `DuplicatePair_userAId_userBId_key`(`userAId`, `userBId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserMerge` (
    `id` VARCHAR(191) NOT NULL,
    `primaryId` VARCHAR(40) NOT NULL,
    `secondaryId` VARCHAR(40) NOT NULL,
    `actorId` VARCHAR(40) NULL,
    `pairId` VARCHAR(40) NULL,
    `fields` JSON NOT NULL,
    `counts` JSON NOT NULL,
    `snapshot` JSON NOT NULL,
    `secondary` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserMerge_primaryId_idx`(`primaryId`),
    INDEX `UserMerge_secondaryId_idx`(`secondaryId`),
    INDEX `UserMerge_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `User_mergedIntoId_idx` ON `User`(`mergedIntoId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_mergedIntoId_fkey` FOREIGN KEY (`mergedIntoId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DuplicatePair` ADD CONSTRAINT `DuplicatePair_userAId_fkey` FOREIGN KEY (`userAId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DuplicatePair` ADD CONSTRAINT `DuplicatePair_userBId_fkey` FOREIGN KEY (`userBId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

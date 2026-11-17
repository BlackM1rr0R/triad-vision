-- CreateTable
CREATE TABLE `CaseReadyDocsSend` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(40) NULL,
    `fileCount` INTEGER NOT NULL DEFAULT 0,
    `newCount` INTEGER NOT NULL DEFAULT 0,
    `resend` BOOLEAN NOT NULL DEFAULT false,
    `files` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CaseReadyDocsSend_caseId_createdAt_idx`(`caseId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CaseReadyDocsSend` ADD CONSTRAINT `CaseReadyDocsSend_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

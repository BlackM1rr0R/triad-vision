-- AlterTable
ALTER TABLE `Case` ADD COLUMN `processingAssigneeId` VARCHAR(40) NULL,
    ADD COLUMN `processingStage` VARCHAR(16) NULL,
    ADD COLUMN `processingStageAt` DATETIME(3) NULL,
    ADD COLUMN `processingStageById` VARCHAR(40) NULL;

-- CreateTable
CREATE TABLE `CaseProcessingMove` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `fromStage` VARCHAR(16) NULL,
    `toStage` VARCHAR(16) NOT NULL,
    `actorId` VARCHAR(40) NULL,
    `assigneeId` VARCHAR(40) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CaseProcessingMove_caseId_createdAt_idx`(`caseId`, `createdAt`),
    INDEX `CaseProcessingMove_assigneeId_idx`(`assigneeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Case_processingStage_idx` ON `Case`(`processingStage`);

-- CreateIndex
CREATE INDEX `Case_processingAssigneeId_idx` ON `Case`(`processingAssigneeId`);

-- AddForeignKey
ALTER TABLE `CaseProcessingMove` ADD CONSTRAINT `CaseProcessingMove_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


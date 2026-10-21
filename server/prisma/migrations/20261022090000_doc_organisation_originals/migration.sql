-- AlterTable
ALTER TABLE `DriveNode` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `contentHash` CHAR(64) NULL,
    ADD COLUMN `finalAt` DATETIME(3) NULL,
    ADD COLUMN `finalById` VARCHAR(191) NULL,
    ADD COLUMN `workflowAt` DATETIME(3) NULL,
    ADD COLUMN `workflowStage` ENUM('INCOMING', 'REVIEW', 'TRANSLATION', 'APOSTILLE', 'READY', 'SENT_TO_EMBASSY') NULL;

-- CreateTable
CREATE TABLE `DriveTag` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `color` VARCHAR(20) NOT NULL DEFAULT 'amber',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DriveTag_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DriveNodeTag` (
    `nodeId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DriveNodeTag_tagId_idx`(`tagId`),
    PRIMARY KEY (`nodeId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DriveSmartFolder` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `shared` BOOLEAN NOT NULL DEFAULT false,
    `icon` VARCHAR(30) NULL,
    `query` JSON NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DriveSmartFolder_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DriveFolderTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `visaType` ENUM('WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST') NULL,
    `visaCategoryId` VARCHAR(191) NULL,
    `folders` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OriginalDocument` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `status` ENUM('IN_OFFICE', 'GIVEN_OUT', 'AT_APOSTILLE', 'IN_TRANSIT', 'DELIVERED', 'RETURNED_TO_CLIENT') NOT NULL DEFAULT 'IN_OFFICE',
    `location` VARCHAR(120) NULL,
    `holder` VARCHAR(160) NULL,
    `carrier` VARCHAR(60) NULL,
    `trackingNo` VARCHAR(80) NULL,
    `note` TEXT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OriginalDocument_caseId_idx`(`caseId`),
    INDEX `OriginalDocument_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OriginalEvent` (
    `id` VARCHAR(191) NOT NULL,
    `originalId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `status` ENUM('IN_OFFICE', 'GIVEN_OUT', 'AT_APOSTILLE', 'IN_TRANSIT', 'DELIVERED', 'RETURNED_TO_CLIENT') NOT NULL,
    `location` VARCHAR(120) NULL,
    `holder` VARCHAR(160) NULL,
    `carrier` VARCHAR(60) NULL,
    `trackingNo` VARCHAR(80) NULL,
    `note` TEXT NULL,
    `actNodeId` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OriginalEvent_originalId_at_idx`(`originalId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `DriveNode_contentHash_idx` ON `DriveNode`(`contentHash`);

-- CreateIndex
CREATE INDEX `DriveNode_workflowStage_idx` ON `DriveNode`(`workflowStage`);

-- AddForeignKey
ALTER TABLE `DriveNodeTag` ADD CONSTRAINT `DriveNodeTag_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `DriveNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriveNodeTag` ADD CONSTRAINT `DriveNodeTag_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `DriveTag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OriginalDocument` ADD CONSTRAINT `OriginalDocument_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OriginalEvent` ADD CONSTRAINT `OriginalEvent_originalId_fkey` FOREIGN KEY (`originalId`) REFERENCES `OriginalDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


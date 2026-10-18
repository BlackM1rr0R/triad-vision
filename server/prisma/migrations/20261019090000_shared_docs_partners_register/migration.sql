-- AlterTable
ALTER TABLE `Case` ADD COLUMN `driveFolderId` VARCHAR(191) NULL,
    ADD COLUMN `partnerId` VARCHAR(191) NULL,
    ADD COLUMN `registerData` JSON NULL;

-- AlterTable
ALTER TABLE `DriveNode` ADD COLUMN `documentId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ReferralPartner` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(40) NULL,
    `email` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ReferralPartner_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientRegisterColumn` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `type` ENUM('TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX') NOT NULL DEFAULT 'TEXT',
    `options` JSON NULL,
    `width` INTEGER NOT NULL DEFAULT 160,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Case_driveFolderId_key` ON `Case`(`driveFolderId`);

-- CreateIndex
CREATE INDEX `Case_partnerId_idx` ON `Case`(`partnerId`);

-- CreateIndex
CREATE UNIQUE INDEX `DriveNode_documentId_key` ON `DriveNode`(`documentId`);

-- AddForeignKey
ALTER TABLE `Case` ADD CONSTRAINT `Case_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `ReferralPartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


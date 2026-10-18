-- AlterTable
ALTER TABLE `Document` ADD COLUMN `expiresAt` DATETIME(3) NULL,
    ADD COLUMN `expiryRemindedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `DriveNode` ADD COLUMN `lockedAt` DATETIME(3) NULL,
    ADD COLUMN `lockedById` VARCHAR(191) NULL,
    ADD COLUMN `textContent` LONGTEXT NULL,
    ADD COLUMN `textIndexedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `ReferralPartner` ADD COLUMN `commissionCents` INTEGER NULL,
    ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    ADD COLUMN `userId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `DriveComment` (
    `id` VARCHAR(191) NOT NULL,
    `nodeId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NULL,
    `parentId` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `mentions` JSON NULL,
    `taskId` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DriveComment_nodeId_createdAt_idx`(`nodeId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DriveShareLink` (
    `id` VARCHAR(191) NOT NULL,
    `nodeId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `passwordHash` VARCHAR(191) NULL,
    `label` VARCHAR(160) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `maxDownloads` INTEGER NULL,
    `downloads` INTEGER NOT NULL DEFAULT 0,
    `allowUpload` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DriveShareLink_tokenHash_key`(`tokenHash`),
    INDEX `DriveShareLink_nodeId_idx`(`nodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DriveShareAccess` (
    `id` VARCHAR(191) NOT NULL,
    `linkId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(20) NOT NULL,
    `fileName` VARCHAR(255) NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DriveShareAccess_linkId_createdAt_idx`(`linkId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DriveActivity` (
    `id` VARCHAR(191) NOT NULL,
    `nodeId` VARCHAR(191) NULL,
    `folderId` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(40) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DriveActivity_folderId_createdAt_idx`(`folderId`, `createdAt`),
    INDEX `DriveActivity_nodeId_createdAt_idx`(`nodeId`, `createdAt`),
    INDEX `DriveActivity_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerCommission` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NULL,
    `amountCents` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `status` ENUM('PENDING', 'APPROVED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `note` VARCHAR(500) NULL,
    `dueAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PartnerCommission_partnerId_status_idx`(`partnerId`, `status`),
    INDEX `PartnerCommission_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `PartnerCommission_partnerId_caseId_key`(`partnerId`, `caseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `ReferralPartner_userId_key` ON `ReferralPartner`(`userId`);

-- AddForeignKey
ALTER TABLE `DriveNode` ADD CONSTRAINT `DriveNode_lockedById_fkey` FOREIGN KEY (`lockedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralPartner` ADD CONSTRAINT `ReferralPartner_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriveComment` ADD CONSTRAINT `DriveComment_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `DriveNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriveComment` ADD CONSTRAINT `DriveComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriveShareLink` ADD CONSTRAINT `DriveShareLink_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `DriveNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriveShareLink` ADD CONSTRAINT `DriveShareLink_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriveShareAccess` ADD CONSTRAINT `DriveShareAccess_linkId_fkey` FOREIGN KEY (`linkId`) REFERENCES `DriveShareLink`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriveActivity` ADD CONSTRAINT `DriveActivity_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerCommission` ADD CONSTRAINT `PartnerCommission_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `ReferralPartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


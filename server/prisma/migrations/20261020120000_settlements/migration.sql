-- AlterTable
ALTER TABLE `PartnerCommission` ADD COLUMN `settlementEntryId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `SettlementEntry` (
    `id` VARCHAR(191) NOT NULL,
    `project` VARCHAR(80) NOT NULL DEFAULT 'Ümumi',
    `caseId` VARCHAR(191) NULL,
    `partnerId` VARCHAR(191) NULL,
    `clientName` VARCHAR(160) NOT NULL,
    `licence` VARCHAR(20) NULL,
    `employer` VARCHAR(160) NULL,
    `tlsDate` DATETIME(3) NULL,
    `visaDate` DATETIME(3) NULL,
    `stage` ENUM('NEW', 'IN_PROGRESS', 'VISA', 'REFUSED', 'CANCELLED') NOT NULL DEFAULT 'NEW',
    `stageAuto` BOOLEAN NOT NULL DEFAULT true,
    `amountCents` INTEGER NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'AZN',
    `payAfterVisa` BOOLEAN NOT NULL DEFAULT false,
    `paidCents` INTEGER NOT NULL DEFAULT 0,
    `partnerShareCents` INTEGER NULL,
    `partnerShareCurrency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `expensesCents` INTEGER NULL,
    `shares` JSON NULL,
    `note` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SettlementEntry_project_sortOrder_idx`(`project`, `sortOrder`),
    INDEX `SettlementEntry_partnerId_idx`(`partnerId`),
    INDEX `SettlementEntry_caseId_idx`(`caseId`),
    INDEX `SettlementEntry_stage_idx`(`stage`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SettlementBeneficiary` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `rule` ENUM('THIRD_OF_NET', 'PERCENT_OF_NET', 'FIXED', 'REMAINDER') NOT NULL DEFAULT 'REMAINDER',
    `value` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(3) NULL,
    `userId` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SettlementBeneficiary_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `PartnerCommission_settlementEntryId_key` ON `PartnerCommission`(`settlementEntryId`);

-- AddForeignKey
ALTER TABLE `SettlementEntry` ADD CONSTRAINT `SettlementEntry_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SettlementEntry` ADD CONSTRAINT `SettlementEntry_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `ReferralPartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

